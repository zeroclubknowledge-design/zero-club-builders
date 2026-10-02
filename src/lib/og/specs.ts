import { supabase } from "@/lib/supabase";
import { toPlainText } from "@/lib/contentPreview";
import type { PreviewSpec } from "@/lib/og/previewCard";
import { ZERO_GAMES, isZeroGameKey } from "@/features/games/v2/catalog";
import { previewPrizeLine, tournamentPreview } from "@/features/games/v2/api";

/**
 * What each kind of shared link shows in its preview. Only facts live here —
 * lib/og/previewCard decides how every card looks.
 */

const naira = (n: number) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;
const plural = (n: number, word: string) => `${n.toLocaleString("en-NG")} ${word}${n === 1 ? "" : "s"}`;
const initial = (s?: string | null) => (s || "Z").trim().charAt(0).toUpperCase() || "Z";

export const DEFAULT_SPEC: PreviewSpec = {
  kicker: "Social learning",
  title: "Build skills. Build proof. Build opportunities.",
  subtitle: "Learn in live bootcamps, ship work in public and join serious communities on Zero Club.",
  chips: ["Bootcamps", "Clubs", "Zero Games"],
  cta: "Join Zero Club",
};

export async function buildPreviewSpec(kind: string, id: string, url: URL): Promise<PreviewSpec> {
  switch (kind) {
    case "club":
    case "live": {
      const { data } = await supabase.rpc("get_club_public", { club_id: id });
      const club = data as any;
      if (!club?.found) return DEFAULT_SPEC;
      if (kind === "live") {
        return {
          kicker: "Live now",
          badge: "● LIVE",
          title: `${club.name} is live`,
          subtitle: "Join the room to watch, ask questions and take part.",
          chips: [plural(Number(club.member_count) || 0, "member")],
          cta: "Join the live class",
          image: club.logo_url || club.banner_url,
          monogram: initial(club.name),
          accent: "#e0245e",
        };
      }
      return {
        kicker: club.is_private ? "Private club" : "Club",
        title: club.name,
        subtitle: toPlainText(club.description) || "A focused community on Zero Club.",
        chips: [plural(Number(club.member_count) || 0, "member"), club.is_private ? "Request to join" : "Open to join"],
        cta: "Join this club",
        image: club.logo_url || club.banner_url,
        monogram: initial(club.name),
      };
    }

    case "game": {
      const preview = await tournamentPreview(id, url.searchParams.get("code") || undefined).catch(() => null);
      const gameKey = preview && preview.found && isZeroGameKey(preview.game_type) ? preview.game_type : "space";
      const game = ZERO_GAMES[gameKey];
      const open = preview && preview.found && !preview.locked ? preview : null;
      if (!open) {
        return { kicker: "Zero Games", title: preview && preview.found ? `A private ${game.name} tournament` : game.name, subtitle: game.tagline, chips: ["Invite only"], cta: "Open Zero Games", monogram: "🎮", accent: game.accent, accent2: game.to };
      }
      const days = Math.ceil((new Date(open.ends_at).getTime() - Date.now()) / 86400000);
      const timing = open.status === "ended" ? "Ended" : open.status === "upcoming" ? "Starting soon" : days > 1 ? `${days} days left` : "Ends today";
      return {
        kicker: `Zero Games · ${game.name}`,
        badge: open.sponsored ? "Sponsored by Zero Club" : null,
        title: open.title,
        subtitle: `${game.tagline} Highest Game Points wins.`,
        chips: [previewPrizeLine(open).replace(/^Win /, "Win "), timing, plural(open.players, "player")],
        cta: open.status === "ended" ? "See the winners" : "Join the tournament",
        monogram: gameKey === "space" ? "🚀" : gameKey === "sudoku" ? "9" : "W",
        accent: game.accent,
        accent2: game.to,
      };
    }

    case "post": {
      const { data: post } = await supabase
        .from("posts")
        .select("content, media_urls, is_build_post, profiles:author_id(full_name, username, avatar_url)")
        .eq("id", id)
        .maybeSingle();
      if (!post) return DEFAULT_SPEC;
      const author = (post as any).profiles || {};
      const name = author.full_name || author.username || "A builder";
      const media = ((post as any).media_urls || []).find((u: string) => !/\.(mp4|mov|webm|m4v|ogg)|video/i.test(u));
      const text = toPlainText((post as any).content) || "Shared on Zero Club";
      return {
        kicker: (post as any).is_build_post ? "Project" : "Post",
        title: text.length > 80 ? `${text.slice(0, 78).trimEnd()}…` : text,
        subtitle: `${name}${author.username ? ` · @${author.username}` : ""}`,
        chips: (post as any).is_build_post ? ["Shipped work", "Proof of work"] : [],
        cta: (post as any).is_build_post ? "See the project" : "Read the post",
        image: media || author.avatar_url,
        imageShape: media ? "card" : "circle",
        monogram: initial(name),
      };
    }

    case "profile": {
      const isUuid = /^[0-9a-f-]{36}$/i.test(id);
      const query = supabase.from("profiles").select("full_name, username, avatar_url, bio, account_type, xp");
      const { data: p } = await (isUuid ? query.eq("id", id) : query.ilike("username", id)).maybeSingle();
      if (!p) return DEFAULT_SPEC;
      const profile = p as any;
      const name = profile.full_name || profile.username || "A builder";
      return {
        kicker: profile.account_type || "Builder",
        title: name,
        subtitle: toPlainText(profile.bio) || `@${profile.username} on Zero Club`,
        chips: [profile.username ? `@${profile.username}` : null, profile.xp ? `${Number(profile.xp).toLocaleString("en-NG")} XP` : null],
        cta: "View profile",
        image: profile.avatar_url,
        imageShape: "circle",
        monogram: initial(name),
      };
    }

    case "note": {
      const { data: n } = await supabase
        .from("notes")
        .select("title, cover_url, blocks, profiles(full_name, username, avatar_url)")
        .eq("slug", id)
        .eq("is_published", true)
        .maybeSingle();
      if (!n) return { kicker: "ZeroNote", title: "A ZeroNote for bootcamp learners", subtitle: "Sign in to read it on Zero Club.", cta: "Read on Zero Club", monogram: "📘" };
      const note = n as any;
      const author = note.profiles || {};
      const firstText = (note.blocks || []).find((b: any) => b?.type === "text" || b?.type === "heading");
      return {
        kicker: "ZeroNote",
        title: note.title || "A ZeroNote",
        subtitle: toPlainText(firstText?.content) || `By ${author.full_name || author.username || "a builder"}`,
        chips: [`By ${author.full_name || author.username || "a builder"}`],
        cta: "Read the note",
        image: note.cover_url || author.avatar_url,
        imageShape: note.cover_url ? "card" : "circle",
        monogram: "📘",
      };
    }

    case "product": {
      const { data: item } = await supabase
        .from("store_items")
        .select("name, description, category, cover_url, price, price_type, discount_percent")
        .eq("id", id)
        .maybeSingle();
      if (!item) return DEFAULT_SPEC;
      const product = item as any;
      const price = Number(product.price) || 0;
      const discount = Number(product.discount_percent) || 0;
      const final = discount ? Math.round(price * (100 - discount) / 100) : price;
      return {
        kicker: "Zero Store",
        title: product.name,
        subtitle: toPlainText(product.description),
        chips: [product.price_type === "free" || !price ? "Free" : naira(final), discount ? `${discount}% off` : null, product.category],
        cta: "Get it on Zero Store",
        image: product.cover_url,
        monogram: initial(product.name),
      };
    }

    case "form": {
      const { data } = await supabase.rpc("get_zero_form_public", { form_slug: id });
      const form = data as any;
      if (!form?.found) return DEFAULT_SPEC;
      return {
        kicker: "Registration",
        title: form.title,
        subtitle: toPlainText(form.description) || "Register on Zero Club.",
        chips: [],
        cta: "Register now",
        image: form.image,
        monogram: "✍️",
      };
    }

    case "fund": {
      const { data } = await supabase.rpc("get_fund_link_public", { p_slug: id });
      const fund = data as any;
      if (!fund) return DEFAULT_SPEC;
      return {
        kicker: "Fund link",
        title: `Send money to ${fund.owner_name || "a builder"}`,
        subtitle: fund.note || "Pay securely through Zero Club.",
        chips: [fund.amount ? naira(fund.amount) : "Any amount", "Secure payment"],
        cta: "Send money",
        image: fund.owner_avatar,
        imageShape: "circle",
        monogram: initial(fund.owner_name),
      };
    }

    case "gift": {
      const { data } = await supabase.rpc("get_gift_card_public", { gift_code: id });
      const gift = data as any;
      if (!gift?.found) return { kicker: "Zero Card", title: "You've received a Zero Card", cta: "Open your Zero Card", monogram: "🎁" };
      const claimed = gift.status !== "active";
      return {
        kicker: "Zero Card",
        badge: claimed ? "Claimed" : null,
        title: claimed ? `This ${naira(gift.amount)} Zero Card was claimed` : `You've received ${naira(gift.amount)}`,
        subtitle: gift.custom_purpose || gift.message || "A Zero Card to spend on Zero Club.",
        chips: [naira(gift.amount), "Zero Card"],
        cta: claimed ? "See Zero Cards" : "Claim your gift",
        monogram: "🎁",
      };
    }

    default:
      return DEFAULT_SPEC;
  }
}

