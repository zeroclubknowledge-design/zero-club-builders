import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowUpRight, Check, Heart, Loader2, MessageCircle, Rocket, UserPlus } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { toPlainText } from "@/lib/contentPreview";
import { claimBoostReward, recordBoostClick, recordBoostView, type SponsoredPost } from "./api";

/*
 * A boosted post, shown as Sponsored in the feed and in clubs.
 *
 * Every sponsored post asks for one thing — a like or comment, a follow, or a
 * visit — and pays the person who does it 20 ZP + 10 XP from the booster's
 * budget. The button does the action and claims the reward in one tap; the
 * database checks it really happened and pays once per person.
 */
export function SponsoredPostCard({ item, compact = false, preview = false }: { item: SponsoredPost; compact?: boolean; preview?: boolean }) {
  const { data: me } = useUser();
  const ref = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [earned, setEarned] = useState(false);
  const [visited, setVisited] = useState(item.viewer.clicked);
  const [liked, setLiked] = useState(item.viewer.liked);
  const [following, setFollowing] = useState(item.viewer.following);

  // Count one view when at least half of the card has been on screen.
  useEffect(() => {
    const el = ref.current;
    if (preview || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { recordBoostView(item.boost_id); observer.disconnect(); }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.boost_id, preview]);

  const name = item.author.full_name || item.author.username || "A builder";
  const text = toPlainText(item.post.content || "");
  const image = (item.post.media_urls || []).find((url) => url && !/\.(mp4|mov|webm|m4v|ogg)|video/i.test(url));
  const reward = `+${item.reward_zp} ZP`;

  const claim = async () => {
    const result = await claimBoostReward(item.boost_id);
    setEarned(true);
    toast.success(`You earned ${result.zp} ZP and ${result.xp} XP`, { description: `Thanks for supporting ${name}.` });
  };

  const run = async () => {
    if (preview || !me?.id || busy || earned) return;
    setBusy(true);
    try {
      if (item.goal === "engage") {
        if (!liked && !item.viewer.commented) {
          const { error } = await supabase.from("likes").insert({ profile_id: me.id, post_id: item.post.id });
          if (error && !/duplicate/i.test(error.message)) throw error;
          setLiked(true);
        }
        await claim();
      } else if (item.goal === "follow") {
        if (!following) {
          const { error } = await supabase.from("follows").insert({ follower_id: me.id, following_id: item.author.id });
          if (error && !/duplicate/i.test(error.message)) throw error;
          setFollowing(true);
        }
        await claim();
      } else {
        if (!visited) {
          await recordBoostClick(item.boost_id);
          if (item.target_url) window.open(item.target_url, "_blank", "noopener,noreferrer");
          setVisited(true);
          toast("Take a look, then come back to claim your ZP", { description: "Your reward unlocks after a few seconds." });
        } else {
          await claim();
        }
      }
    } catch (error: any) {
      toast.error(error?.message || "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const label = earned
    ? "Earned"
    : item.goal === "engage"
      ? (liked || item.viewer.commented ? `Claim ${reward}` : `Like · ${reward}`)
      : item.goal === "follow"
        ? (following ? `Claim ${reward}` : `Follow · ${reward}`)
        : (visited ? `Claim ${reward}` : `Visit · ${reward}`);
  const ActionIcon = earned ? Check : item.goal === "engage" ? Heart : item.goal === "follow" ? UserPlus : ArrowUpRight;
  const ask = item.goal === "engage" ? "Like or comment on this post" : item.goal === "follow" ? `Follow ${name}` : "Open the link";

  return (
    <article
      ref={ref as any}
      aria-label={`Sponsored post by ${name}`}
      className={`relative overflow-hidden bg-card ${compact ? "rounded-2xl border border-border" : "border-b border-border/60 md:rounded-xl md:border md:my-2"}`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#cc208f]/10 blur-2xl" />
      <div className="relative px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2.5">
          <Link to="/app/profile/$id" params={{ id: item.author.username || item.author.id }} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]">
            {item.author.avatar_url
              ? <img src={item.author.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              : <span className="grid h-full w-full place-items-center text-[14px] font-semibold text-muted-foreground">{name[0]?.toUpperCase()}</span>}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-foreground">{name}</p>
            <p className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
              <Rocket className="h-3 w-3 text-[#cc208f]" /> Sponsored{item.author.username ? ` · @${item.author.username}` : ""}
            </p>
          </div>
        </div>

        <Link to="/app/post/$id" params={{ id: item.post.id }} className="mt-2.5 block">
          {text && <p className={`whitespace-pre-wrap text-[15px] leading-[1.45] text-foreground ${compact ? "line-clamp-3" : "line-clamp-5"}`}>{text}</p>}
          {image && (
            <div className="mt-2.5 overflow-hidden rounded-xl border border-border/60 bg-foreground/[0.03]">
              <img src={image} alt="" className={`w-full object-cover ${compact ? "max-h-[180px]" : "max-h-[340px]"}`} loading="lazy" decoding="async" />
            </div>
          )}
        </Link>

        {/* The ask and the reward, in one bar. */}
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#cc208f]/20 bg-gradient-to-r from-[#cc208f]/[0.08] to-[#ff7ac8]/[0.04] p-2.5 pl-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{earned ? "Reward collected" : ask}</p>
            <p className="text-[12px] text-muted-foreground">{earned ? "Thanks for supporting this builder" : `Earn ${item.reward_zp} ZP + ${item.reward_xp} XP`}</p>
          </div>
          {item.goal === "engage" && !earned && (
            <Link to="/app/post/$id" params={{ id: item.post.id }} className="hidden h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground sm:flex">
              <MessageCircle className="h-3.5 w-3.5" /> Comment
            </Link>
          )}
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || earned || (!preview && !me?.id)}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition active:scale-95 disabled:opacity-80 ${earned ? "bg-emerald-500/15 text-emerald-600" : "bg-[#cc208f] text-white shadow-[0_8px_18px_-10px_rgba(204,32,143,0.9)] hover:brightness-110"}`}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ActionIcon className="h-3.5 w-3.5" />}
            {label}
          </button>
        </div>
      </div>
    </article>
  );
}
