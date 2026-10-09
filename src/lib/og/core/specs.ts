import { one, rpc } from "./db";
import { initial, naira, plain, plural } from "./text";
import type { PreviewSpec } from "./card";
import { ZERO_GAMES, isZeroGameKey, type ZeroGameKey } from "../../../features/games/v2/catalog";

/**
 * What each kind of shared link shows in its preview. Only facts live here;
 * ./card decides how every card looks.
 */

export const DEFAULT_SPEC: PreviewSpec = {
  kicker: "Social learning",
  title: "Build skills. Build proof. Build opportunities.",
  subtitle: "Learn in live bootcamps, ship work in public and join serious communities on Zero Club.",
  chips: ["Bootcamps", "Clubs", "Zero Games"],
  cta: "Join Zero Club",
};

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function prizeLine(p: { reward_type?: string; prizes?: any[] }) {
  if (!p.reward_type || p.reward_type === "none" || !p.prizes?.length) return "Play for the top spot";
  const first = p.prizes.find((x) => x.place === 1) || p.prizes[0];
  if (p.reward_type === "funds") return `Win ${naira(first.amount)}`;
  if (p.reward_type === "zp") return `Win ${Number(first.zp || 0).toLocaleString("en-NG")} ZP`;
  return `Win ${first.label || "a reward"}`;
}

export async function buildPreviewSpec(kind: string, id: string, url: URL): Promise<PreviewSpec> {
  switch (kind) {
    case "club":
    case "live": {
      if (!isUuid(id)) return DEFAULT_SPEC;
      const club = await rpc("get_club_public", { club_id: id });
      if (!club?.found) return DEFAULT_SPEC;
      if (kind === "live") {
        return {
          kicker: "Live class",
          badge: "LIVE NOW",
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
        subtitle: plain(club.description) || "A focused community on Zero Club.",
        chips: [plural(Number(club.member_count) || 0, "member"), club.is_private ? "Request to join" : "Open to join"],
        cta: "Join this club",
        image: club.logo_url || club.banner_url,
        monogram: initial(club.name),
      };
    }

    case "game": {
      const preview = isUuid(id) ? await rpc("zero_tournament_preview", { p_id: id, p_code: url.searchParams.get("code") || null }) : null;
      const gameKey: ZeroGameKey = preview?.found && isZeroGameKey(preview.game_type) ? preview.game_type : "space";
      const game = ZERO_GAMES[gameKey];
      const open = preview?.found && !preview.locked ? preview : null;
      if (!open) {
        return {
          kicker: "Zero Games",
          title: preview?.found ? `A private ${game.name} tournament` : game.name,
          subtitle: game.tagline,
          chips: ["Invite only"],
          cta: "Open Zero Games",
          monogram: gameKey === "sudoku" ? "9" : gameKey === "words" ? "W" : "Z",
          accent: game.accent,
          accent2: game.to,
        };
      }
      const days = Math.ceil((new Date(open.ends_at).getTime() - Date.now()) / 86400000);
      const timing = open.status === "ended" ? "Ended" : open.status === "upcoming" ? "Starting soon" : days > 1 ? `${days} days left` : "Ends today";
      return {
        kicker: `Zero Games · ${game.name}`,
        badge: open.sponsored ? "Sponsored by Zero Club" : null,
        title: open.title,
        subtitle: `${game.tagline} Highest Game Points wins.`,
        chips: [prizeLine(open), timing, plural(Number(open.players) || 0, "player")],
        cta: open.status === "ended" ? "See the winners" : "Join the tournament",
        monogram: gameKey === "sudoku" ? "9" : gameKey === "words" ? "W" : "Z",
        accent: game.accent,
        accent2: game.to,
      };
    }

    case "post": {
      if (!isUuid(id)) return DEFAULT_SPEC;
      const post = await one("posts", "content,media_urls,is_build_post,profiles:author_id(full_name,username,avatar_url)", { id: `eq.${id}` });
      if (!post) return DEFAULT_SPEC;
      const author = post.profiles || {};
      const name = author.full_name || author.username || "A builder";
      const media = (post.media_urls || []).find((u: string) => typeof u === "string" && !/\.(mp4|mov|webm|m4v|ogg)|video/i.test(u));
      const text = plain(post.content) || "Shared on Zero Club";
      return {
        kicker: post.is_build_post ? "Project" : "Post",
        title: text,
        subtitle: `${name}${author.username ? ` · @${author.username}` : ""}`,
        chips: post.is_build_post ? ["Shipped work", "Proof of work"] : [],
        cta: post.is_build_post ? "See the project" : "Read the post",
        image: media || author.avatar_url,
        imageShape: media ? "card" : "circle",
        // A post with a picture shows that picture, large.
        variant: media ? "photo" : "default",
        monogram: initial(name),
      };
    }

    case "profile": {
      const profile = await one("profiles", "full_name,username,avatar_url,bio,account_type,xp", isUuid(id) ? { id: `eq.${id}` } : { username: `ilike.${id}` });
      if (!profile) return DEFAULT_SPEC;
      const name = profile.full_name || profile.username || "A builder";
      return {
        kicker: profile.account_type || "Builder",
        title: name,
        subtitle: plain(profile.bio) || (profile.username ? `@${profile.username} on Zero Club` : "Building on Zero Club"),
        chips: [profile.username ? `@${profile.username}` : null, profile.xp ? `${Number(profile.xp).toLocaleString("en-NG")} XP` : null],
        cta: "View profile",
        image: profile.avatar_url,
        imageShape: "circle",
        monogram: initial(name),
      };
    }

    case "portfolio": {
      // Only published portfolios come back to an anonymous caller.
      const data = await rpc("get_public_portfolio", { p_username: id });
      if (!data?.found) return DEFAULT_SPEC;
      const profile = data.profile || {};
      const portfolio = data.portfolio || {};
      const stats = data.stats || {};
      const name = profile.full_name || profile.username || "A builder";
      const accents: Record<string, [string, string]> = {
        pink: ["#e0329f", "#7a1e66"],
        violet: ["#8b5cf6", "#3b1f7a"],
        emerald: ["#10b981", "#065f46"],
        amber: ["#f59e0b", "#7c2d12"],
        sky: ["#38bdf8", "#1e3a8a"],
        mono: ["#cc208f", "#7a1e66"],
      };
      const [accent, accent2] = accents[portfolio.accent] || accents.pink;
      const ships = Number(stats.ships) || 0;
      const verified = Number(stats.verified) || 0;
      return {
        variant: "portfolio",
        kicker: "Portfolio",
        title: name,
        subtitle: plain(portfolio.headline) || plain(profile.bio) || "Projects and proof of work, built on Zero Club.",
        chips: [
          ships ? plural(ships, "project") + " shipped" : null,
          verified ? `${verified} tutor-verified` : null,
          profile.username ? `@${profile.username}` : null,
        ],
        cta: "View portfolio",
        image: profile.avatar_url,
        imageShape: "circle",
        monogram: initial(name),
        accent,
        accent2,
      };
    }

    case "note": {
      const note = await one("notes", "title,cover_url,blocks,profiles(full_name,username,avatar_url)", {
        [isUuid(id) ? "id" : "slug"]: `eq.${id}`,
        is_published: "eq.true",
      });
      if (!note) return { kicker: "ZeroNote", title: "A ZeroNote for bootcamp learners", subtitle: "Sign in to read it on Zero Club.", cta: "Read on Zero Club", monogram: "N" };
      const author = note.profiles || {};
      const by = author.full_name || author.username || "a builder";
      const firstText = (note.blocks || []).find((b: any) => b?.type === "text" || b?.type === "heading");
      return {
        kicker: "ZeroNote",
        title: note.title || "A ZeroNote",
        subtitle: plain(firstText?.content) || `By ${by}`,
        chips: [`By ${by}`],
        cta: "Read the note",
        image: note.cover_url || author.avatar_url,
        imageShape: note.cover_url ? "card" : "circle",
        monogram: "N",
      };
    }

    case "product": {
      if (!isUuid(id)) return DEFAULT_SPEC;
      const product = await one("store_items", "name,description,category,cover_url,price,price_type,discount_percent", { id: `eq.${id}` });
      if (!product) return DEFAULT_SPEC;
      const price = Number(product.price) || 0;
      const discount = Number(product.discount_percent) || 0;
      const final = discount ? Math.round((price * (100 - discount)) / 100) : price;
      return {
        kicker: "Zero Store",
        title: product.name,
        subtitle: plain(product.description),
        chips: [product.price_type === "free" || !price ? "Free" : product.price_type === "Coins" ? `${final.toLocaleString("en-NG")} coins` : naira(final), discount ? `${discount}% off` : null, product.category],
        cta: "Get it on Zero Store",
        image: product.cover_url,
        monogram: initial(product.name),
      };
    }

    case "form": {
      const data = await rpc("get_zero_form_public", { form_slug: id });
      if (!data?.found) return DEFAULT_SPEC;
      const title = data.bootcamp?.title || data.form?.title || "Registration";
      return {
        kicker: "Registration",
        title,
        subtitle: plain(data.bootcamp?.description || data.form?.description) || "Register on Zero Club.",
        chips: ["Bootcamp", "Register now"],
        cta: "Register now",
        image: data.form?.banner_url || data.bootcamp?.banner_url,
        monogram: initial(title),
      };
    }

    case "fund": {
      const fund = await rpc("get_fund_link_public", { p_slug: id });
      if (!fund?.found) return DEFAULT_SPEC;
      return {
        kicker: "Fund link",
        title: `Send money to ${fund.owner_name || "a builder"}`,
        subtitle: plain(fund.note) || "Pay securely through Zero Club.",
        chips: [fund.amount ? naira(fund.amount) : "Any amount", "Secure payment"],
        cta: "Send money",
        image: fund.owner_avatar,
        imageShape: "circle",
        monogram: initial(fund.owner_name),
      };
    }

    case "gift": {
      const gift = await rpc("get_gift_card_public", { gift_code: id });
      if (!gift?.found) return { kicker: "Zero Card", title: "You've received a Zero Card", cta: "Open your Zero Card", monogram: "₦" };
      const claimed = gift.status !== "active";
      return {
        kicker: "Zero Card",
        badge: claimed ? "Claimed" : null,
        title: claimed ? `This ${naira(gift.amount)} Zero Card was claimed` : `You've received ${naira(gift.amount)}`,
        subtitle: plain(gift.custom_purpose || gift.message) || "A Zero Card to spend on Zero Club.",
        chips: [naira(gift.amount), "Zero Card"],
        cta: claimed ? "See Zero Cards" : "Claim your gift",
        monogram: "₦",
      };
    }

    default:
      return DEFAULT_SPEC;
  }
}
