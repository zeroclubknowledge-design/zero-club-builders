import { hasShareSheet, openShareSheet } from "@/components/ShareSheet";
import { AnimatedProfileImage } from "@/components/AnimatedProfileImage";
import { plain } from "@/lib/og/core/text";
import { useGoBack } from "@/hooks/useGoBack";
import { AffiliationBadge, AmbassadorChip, AvatarAffiliation } from "@/components/AffiliationBadge";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  BadgeCheck,
  MoreHorizontal,
  Heart,
  Loader2,
  Share2,
  Copy,
  Flag,
  X,
  BellRing,
  Play,
  CheckCircle2,
  Pen,
  ArrowLeft,
  Plus,
  Rocket,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { enrichPosts } from "@/api";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkifiedText } from "@/components/LinkifiedText";
import { getFirstName, displayName, getLevelFromXp, getLevelProgress } from "@/lib/utils";
import { useFollow } from "@/hooks/useFollow";

export const Route = createFileRoute("/app/profile/$id")({
  loader: async ({ params: { id } }) => {
    // SECURITY/ROUTING FIX: If the ID is 'profile', it means the router mismatched the index route.
    // Redirect back to the correct index route.
    if (id === "profile") {
      throw redirect({ to: "/app/profile" });
    }

    // Fetch only profile for SEO/Head, leave heavy data for component to load instantly
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const query = supabase.from("profiles").select("*");

    /*
     * Never throws.
     *
     * This used to `throw error` on any failure and `throw new Error` when the
     * row came back empty. A loader that throws takes the whole navigation
     * down, so one slow or momentarily unauthenticated request meant the
     * profile simply would not open — and trying again a few times eventually
     * caught a good attempt. That is the "reload the app many times" symptom.
     *
     * None of those conditions are permanent. One retry covers the common
     * transient case, and returning null lets the page render and fetch the
     * profile itself on the client, where react-query retries properly.
     */
    const fetchProfile = async () =>
      (isUuid
        ? supabase.from("profiles").select("*").eq("id", id)
        : supabase.from("profiles").select("*").ilike("username", id)
      ).maybeSingle();

    try {
      let { data: profile, error } = await fetchProfile();

      // A single immediate retry: the usual cause is the auth token not being
      // attached yet on a cold start, which resolves within milliseconds.
      if (error || !profile) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        ({ data: profile } = await fetchProfile());
      }

      return { profile: profile ?? null };
    } catch {
      return { profile: null };
    }
  },
  head: ({ loaderData }) => {
    const profile = loaderData?.profile;
    const title = profile
      ? `${profile.full_name || profile.username} (${getFirstName(profile)}) on Zero Club`
      : "Profile | Zero Club";
    const description =
      plain(profile?.bio) || "Zero Club builder on the rise. Check out my builds!";
    /* Preview images must be ABSOLUTE urls. "/logo.png" is relative, so every
       profile without an avatar previewed with a broken image — crawlers do
       not resolve relative paths against the page they are reading. */
    const image = profile?.id
      ? `https://www.zeroclubs.xyz/api/og/profile/${profile.id}`
      : "https://www.zeroclubs.xyz/api/og/default/brand";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:image:secure_url", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:alt", content: `${displayName(profile)} on Zero Club` },
        { property: "og:type", content: "profile" },
        // summary_large_image when there is a real photo to show, so it is not
        // reduced to a thumbnail in the preview card.
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: ProfileDetail,
});

const tabs = ["Posts", "Ships", "Media", "Likes"] as const;

const isVideoUrl = (url: string) => {
  const videoExtensions = [".mp4", ".mov", ".webm", ".ogg", ".m4v"];
  return videoExtensions.some((ext) => url.toLowerCase().includes(ext)) || url.includes("video");
};

function ProfileDetail() {
  const goBackSmart = useGoBack("/app");
  const navigate = useNavigate();
  const { profile: loaderProfile } = Route.useLoaderData();

  const { id } = Route.useParams();

  /*
   * The client-side safety net.
   *
   * When the loader came back empty — a slow first request, a session that was
   * not ready — this fetches the profile again with proper retries instead of
   * leaving the page broken until somebody reloads the app.
   */
  const { data: fetchedProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile-detail", id],
    enabled: !loaderProfile,
    retry: 3,
    retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 3000),
    queryFn: async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const { data, error } = await (
        isUuid
          ? supabase.from("profiles").select("*").eq("id", id)
          : supabase.from("profiles").select("*").ilike("username", id)
      ).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profile = loaderProfile ?? fetchedProfile ?? null;
  const queryClient = useQueryClient();

  const { data: networkStats } = useQuery({
    queryKey: ["networkStats", profile.id],
    queryFn: async () => {
      const [followersRes, followingRes] = await Promise.all([
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", profile.id),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", profile.id),
      ]);
      return { followers: followersRes.count || 0, following: followingRes.count || 0 };
    },
  });

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ["profilePosts", profile.id],
    queryFn: async () => {
      const { data: postsRes } = await supabase
        .from("posts")
        .select(
          "*, bootcamps(*), profiles(*), quoted_posts:quoted_post_id(*, bootcamps(*), profiles(*))",
        )
        .eq("author_id", profile.id)
        .order("created_at", { ascending: false });
      const posts = postsRes || [];
      const mappedPosts = posts.map((p) => ({ ...p, profiles: profile }));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const enriched = await enrichPosts(posts, session.user.id);
        return enriched.map((p) => ({
          ...p,
          profiles: profile,
        }));
      }
      return mappedPosts;
    },
    initialData: () => {
      const feedPosts = queryClient.getQueryData<any[]>(["feed_posts"]);
      const userFeedPosts = feedPosts?.filter((p) => p.author_id === profile.id);
      if (userFeedPosts && userFeedPosts.length > 0) {
        return userFeedPosts.map((p) => ({
          ...p,
          profiles: profile,
        }));
      }
      return undefined;
    },
    staleTime: 0,
  });

  const { data: likedPostsData, isLoading: likedPostsLoading } = useQuery({
    queryKey: ["profileLikedPosts", profile.id],
    queryFn: async () => {
      const { data: likesRes } = await supabase
        .from("likes")
        .select("post_id, posts(*, profiles(*))")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false });

      if (!likesRes) return [];

      const {
        data: { session },
      } = await supabase.auth.getSession();
      let bookmarkedIds = new Set<string>();
      let likedIds = new Set<string>();
      let repostedIds = new Set<string>();

      if (session) {
        const [bookmarksRes, currentLikesRes, repostsRes] = await Promise.all([
          supabase.from("bookmarks").select("post_id").eq("profile_id", session.user.id),
          supabase.from("likes").select("post_id").eq("profile_id", session.user.id),
          supabase.from("reposts").select("post_id").eq("profile_id", session.user.id),
        ]);
        bookmarkedIds = new Set(bookmarksRes.data?.map((b) => b.post_id) || []);
        likedIds = new Set(currentLikesRes.data?.map((l) => l.post_id) || []);
        repostedIds = new Set(repostsRes.data?.map((r) => r.post_id) || []);
      }

      return likesRes
        .map((l) => l.posts)
        .filter(Boolean)
        .map((p: any) => ({
          ...p,
          isBookmarked: bookmarkedIds.has(p.id),
          isLiked: likedIds.has(p.id),
          hasReposted: repostedIds.has(p.id),
        }));
    },
  });

  const { data: profileClubsData, isLoading: clubsLoading } = useQuery({
    queryKey: ["profile_clubs", profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("club_members")
        .select("clubs(*)")
        .eq("profile_id", profile.id);

      if (!data) return [];

      const clubs = data.map((d) => d.clubs).filter(Boolean);
      const clubIds = clubs.map((c: any) => c.id);

      if (clubIds.length > 0) {
        const { data: memberRows } = await supabase
          .from("club_members")
          .select("club_id")
          .in("club_id", clubIds);

        const membersCountMap: Record<string, number> = {};
        if (memberRows) {
          memberRows.forEach((row) => {
            membersCountMap[row.club_id] = (membersCountMap[row.club_id] || 0) + 1;
          });
        }

        clubs.forEach((c: any) => {
          c.members_count = membersCountMap[c.id] || 0;
        });
      }

      return clubs;
    },
  });

  const posts = postsData || [];
  const profileClubs = profileClubsData || [];
  const followersCount = networkStats?.followers || 0;
  const followingCount = networkStats?.following || 0;

  const [tab, setTab] = useState<(typeof tabs)[number]>("Posts");
  const [followLoading, setFollowLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isFollowingMe, setIsFollowingMe] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [commentPost, setCommentPost] = useState<any>(null);
  const [isNotified, setIsNotified] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target;
      const scrollTop =
        target === document
          ? window.scrollY
          : (target as HTMLElement)?.scrollTop || window.scrollY || 0;
      setScrolled(scrollTop > 40);
    };
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, []);

  // Shared follow state — the same source the feed and post pages read from,
  // so following here updates the button everywhere in the app.
  const { isFollowing, toggleFollow } = useFollow(profile?.id);

  /* Whether this person's posts should interrupt me. Read through a function
     rather than by selecting the row, because the subscription table is
     readable only by its owner — deliberately, so subscribing to someone does
     not hand them a list of who is watching. */
  const [postAlertsOn, setPostAlertsOn] = useState(false);
  const [alertsPending, setAlertsPending] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      // Not migrated yet? The bell simply reads as off rather than throwing.
      const { data } = await supabase.rpc("is_subscribed_to_posts", { p_author_id: profile.id });
      if (!cancelled) setPostAlertsOn(Boolean(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const togglePostAlerts = async () => {
    if (!profile?.id) return;
    setAlertsPending(true);
    // Flipped straight away, then corrected if the server disagrees. A bell
    // that waits on the network before changing feels broken.
    const optimistic = !postAlertsOn;
    setPostAlertsOn(optimistic);
    try {
      const { data, error } = await supabase.rpc("toggle_post_notifications", {
        p_author_id: profile.id,
      });
      if (error) throw error;
      const subscribed = Boolean((data as any)?.subscribed);
      setPostAlertsOn(subscribed);
      toast.success(
        subscribed ? `You will be told when ${shownName} posts` : "Post notifications off",
      );
    } catch (error: any) {
      setPostAlertsOn(!optimistic);
      toast.error(error?.message || "Could not change that");
    } finally {
      setAlertsPending(false);
    }
  };

  useEffect(() => {
    // Check local storage for notification preference
    const notified = localStorage.getItem(`notify_${profile.id}`) === "true";
    setIsNotified(notified);
    checkFollowStatus();
  }, [profile.id]);

  async function checkFollowStatus() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      setCurrentUser(profileData || session.user);
      if (session.user.id === profile.id) return; // Own profile

      const { data: followedByRes } = await supabase
        .from("follows")
        .select("*")
        .eq("follower_id", profile.id)
        .eq("following_id", session.user.id)
        .maybeSingle();

      setIsFollowingMe(!!followedByRes);
    }
  }

  async function handleFollow() {
    if (!currentUser) {
      toast.error("Please sign in to follow");
      return;
    }
    setFollowLoading(true);
    try {
      const nowFollowing = await toggleFollow();
      if (nowFollowing === null) return;

      if (!nowFollowing) {
        toast.success(`Unfollowed ${getFirstName(profile)}`);
      } else {
        // Referral ZP is paid automatically when someone joins with an invite link.
        toast.success(`Following ${getFirstName(profile)}!`);
      }

      // Refresh everything
      queryClient.invalidateQueries({ queryKey: ["networkStats", profile.id] });
      queryClient.invalidateQueries({ queryKey: ["followStatus", profile.id] });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setFollowLoading(false);
    }
  }

  function handleNotificationToggle() {
    if (!currentUser) {
      toast.error("Please sign in to enable notifications");
      return;
    }
    const newState = !isNotified;
    setIsNotified(newState);
    localStorage.setItem(`notify_${profile.id}`, newState.toString());

    if (newState) {
      toast.success(`You'll now get notified when ${getFirstName(profile)} builds!`);
    } else {
      toast.info(`Notifications turned off for ${getFirstName(profile)}`);
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/app/profile/${profile.id}?ref=${profile.referral_code}`;
    const text = `Check out ${profile.full_name || profile.username}'s builder profile on Zero Club! 🚀`;

    if (hasShareSheet()) {
      try {
        await openShareSheet({
          heading: `Share ${profile.full_name || profile.username}'s profile`,
          title: `${profile.full_name || profile.username} on Zero Club`,
          text: text,
          url: url,
        });
      } catch (err) {
        console.log("Error sharing:", err);
      }
    } else {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      toast.success("Profile link copied!");
    }
  };

  const normalPosts = posts.filter((p: any) => !p.is_build_post);
  const shipPosts = posts.filter((p: any) => p.is_build_post);

  const filteredPosts = normalPosts.filter((p: any) =>
    (p.content || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const filteredShips = shipPosts.filter((p: any) =>
    (p.content || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const isOwnProfile = currentUser?.id === profile.id;
  const canMessageProfile = Boolean(currentUser?.id && profile?.id && !isOwnProfile);
  const initials = (profile?.full_name || profile?.username || "U").substring(0, 1).toUpperCase();
  const tier =
    (profile?.tier || "Basic").charAt(0).toUpperCase() + (profile?.tier || "Basic").slice(1);
  const shownName = displayName(profile);
  const profileHandle = profile?.username ? `@${profile.username}` : "@builder";

  const level = getLevelFromXp(Number(profile?.xp || 0));
  const levelProgress = getLevelProgress(Number(profile?.xp || 0));
  const role =
    profile?.account_type === "Institution"
      ? "Institution"
      : profile?.account_type === "Tutor"
        ? "Tutor"
        : "Builder";
  const verifiedShips = shipPosts.filter((p: any) => p.is_verified_build).length;
  const networkId = profile?.username || profile?.id || "unknown";
  const shipTitle = (post: any) => {
    const firstLine = String(post.content || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\*\*Project:\*\*|##\s*🚀\s*/g, "")
      .replace(/[*#_`>]/g, "")
      .split("\n")
      .map((line: string) => line.trim())
      .find(Boolean);
    return firstLine || "Untitled ship";
  };
  const openTab = (next: (typeof tabs)[number]) => {
    setTab(next);
    document
      .getElementById("profile-activity")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const emptyState = (Icon: any, title: string, copy: string) => (
    <div className="mt-2 flex flex-col items-center bg-card px-8 py-14 text-center md:rounded-xl md:border md:border-border">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05]">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mb-1 font-display text-[17px] font-semibold text-foreground">{title}</h3>
      <p className="max-w-[260px] text-[14px] leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="fixed left-1/2 top-0 z-50 flex h-[calc(3.5rem+env(safe-area-inset-top))] w-full max-w-none -translate-x-1/2 items-center gap-1 bg-card px-2 pt-[env(safe-area-inset-top)] md:sticky md:left-0 md:max-w-none md:translate-x-0">
        <button
          onClick={goBackSmart}
          aria-label="Back"
          className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
        >
          <ArrowLeft className="h-[22px] w-[22px]" />
        </button>
        <div
          className={`min-w-0 flex-1 transition-opacity duration-200 ${scrolled ? "opacity-100" : "opacity-0"}`}
        >
          <p className="truncate text-[16px] font-semibold text-foreground">{shownName}</p>
        </div>
        {/* Profile actions */}
        <Drawer>
          <DrawerTrigger asChild>
            <button
              aria-label="Profile actions"
              className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
            >
              <MoreHorizontal className="h-[22px] w-[22px]" />
            </button>
          </DrawerTrigger>
          <DrawerContent className="border-none bg-background px-4 pb-4 pt-1 sm:p-6">
            <DrawerHeader className="gap-0 p-0 pb-2 pt-1 text-left sm:gap-0 sm:p-0 sm:pb-2 sm:pt-1">
              <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">
                Profile actions
              </DrawerTitle>
            </DrawerHeader>
            <div className="-mx-4 flex flex-col sm:-mx-6">
              <button
                onClick={handleShare}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[16px] font-medium text-foreground tap hover:bg-foreground/[0.04] sm:px-6"
              >
                <Share2 className="h-[22px] w-[22px] shrink-0" /> Share profile link
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/app/profile/${profile.id}?ref=${profile.referral_code}`,
                  );
                  toast.success("Profile link copied!");
                }}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[16px] font-medium text-foreground tap hover:bg-foreground/[0.04] sm:px-6"
              >
                <Copy className="h-[22px] w-[22px] shrink-0" /> Copy URL
              </button>
              {!isOwnProfile && (
                <button
                  onClick={() => toast.success("Report submitted. Thank you!")}
                  className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[16px] font-medium text-[#e0245e] tap hover:bg-[#e0245e]/[0.06] sm:px-6"
                >
                  <Flag className="h-[22px] w-[22px] shrink-0" /> Report profile
                </button>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </header>

      <div className="zc-page-width mx-auto w-full max-w-[680px] pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-2">
        {/* ── Who this is ── */}
        <section className="bg-card pb-4 md:overflow-hidden md:rounded-xl md:border md:border-border">
          <div className={`relative w-full overflow-hidden bg-[#221d22] ${profile?.banner_url ? "" : "flex aspect-[16/7] items-center justify-center"}`}>
            {profile?.banner_url ? (
              // The banner shows whole, at its own shape: no frame, no bars.
              <img src={profile.banner_url} alt="Profile banner" className="block h-auto w-full" loading="lazy" decoding="async" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(204,32,143,0.35),transparent_60%)]" />
            )}
          </div>

          <div className="relative px-4">
            {/* A slow brand-pink light circling the photo. */}
            <span
              aria-hidden
              className="zc-avatar-ring pointer-events-none absolute -top-[60px] left-[8px] h-[120px] w-[120px] rounded-full"
            />
            <button
              onClick={() => setIsAvatarOpen(true)}
              aria-label="View profile photo"
              className="absolute -top-14 left-3 grid h-28 w-28 place-items-center overflow-hidden rounded-full border-4 border-card bg-card font-display text-[32px] font-semibold text-accent"
            >
              {/* The tint sits on a solid card-coloured base. On its own it was
                  see-through, so the dark cover showed through the top half of
                  the circle and the avatar looked cut in two. */}
              <AnimatedProfileImage
                profile={profile}
                alt={`${displayName(profile)}'s profile photo`}
                fallback={
                  <span className="grid h-full w-full place-items-center bg-accent/10">
                    {initials}
                  </span>
                }
              />
            </button>
            {/* The ambassador mark sits on the photo's corner, outside the
                clipped circle so it is never cut off. */}
            <span className="pointer-events-none absolute -top-14 left-3 h-28 w-28">
              <AvatarAffiliation profile={profile} size={30} />
            </span>

            <div className="flex h-16 items-center justify-end">
              <span
                className="flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-semibold text-foreground"
                title={`${levelProgress.currentXP} of ${levelProgress.maxXP} XP to the next level`}
              >
                <svg viewBox="0 0 36 36" className="h-3.5 w-3.5 -rotate-90" aria-hidden="true">
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    strokeWidth="5"
                    className="stroke-foreground/10"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className="stroke-accent"
                    strokeDasharray={`${(levelProgress.percent / 100) * 94.2} 94.2`}
                  />
                </svg>
                Level {level} {role.toLowerCase()}
              </span>
            </div>

            <div className="mt-1 flex items-center gap-1.5">
              <h1 className="truncate font-display text-[24px] font-semibold tracking-[-0.02em] text-foreground">
                {shownName}
              </h1>
              {(profile?.tier === "Premium" || profile?.tier === "Premium+") && (
                <BadgeCheck
                  aria-label={profile.tier}
                  className={`h-5 w-5 shrink-0 fill-current ${profile.tier === "Premium+" ? "text-[#e0a800]" : "text-accent"}`}
                />
              )}
              <AffiliationBadge profile={profile} size={19} />
            </div>
            <AmbassadorChip profile={profile} />
            {profile?.bio ? (
              <div className="mt-1 text-[15px] leading-[1.45] text-foreground">
                <LinkifiedText text={profile.bio} />
              </div>
            ) : isOwnProfile ? (
              <Link
                to="/app/profile/edit"
                className="mt-1 inline-block text-[15px] font-semibold text-accent"
              >
                Add a line about what you build
              </Link>
            ) : null}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
              {profile?.username && <span>@{profile.username}</span>}
              {profile?.website && (
                <>
                  <span aria-hidden>·</span>
                  <a
                    href={
                      profile.website.startsWith("http")
                        ? profile.website
                        : `https://${profile.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-foreground hover:underline"
                  >
                    {profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                </>
              )}
            </p>
            <Link
              to="/app/profile/$id/network"
              params={{ id: networkId }}
              className="mt-1.5 inline-block text-[13px] font-semibold text-accent hover:underline"
            >
              {followersCount.toLocaleString()} {followersCount === 1 ? "follower" : "followers"} ·{" "}
              {followingCount.toLocaleString()} following · {profileClubs.length}{" "}
              {profileClubs.length === 1 ? "club" : "clubs"}
            </Link>
            <p className="mt-2 text-[13px] text-muted-foreground">
              <b className="font-semibold text-foreground tabular-nums">{shipPosts.length}</b>{" "}
              {shipPosts.length === 1 ? "ship" : "ships"}
              <span className="mx-1.5" aria-hidden>
                ·
              </span>
              <b className="font-semibold text-foreground tabular-nums">{verifiedShips}</b> verified
              <span className="mx-1.5" aria-hidden>
                ·
              </span>
              <b className="font-semibold text-foreground tabular-nums">
                {Number(profile?.xp || 0).toLocaleString()}
              </b>{" "}
              XP
            </p>

            <div className="mt-4 flex gap-2">
              {isOwnProfile ? (
                <>
                  <Link
                    to="/app/profile/edit"
                    className="flex h-10 flex-1 items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background tap hover:opacity-90"
                  >
                    Edit profile
                  </Link>
                  <button
                    onClick={handleShare}
                    className="flex h-10 flex-1 items-center justify-center rounded-full border-[1.5px] border-foreground text-[15px] font-semibold text-foreground tap hover:bg-foreground/[0.04]"
                  >
                    Share profile
                  </button>
                </>
              ) : canMessageProfile ? (
                <>
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[15px] font-semibold tap disabled:opacity-60 ${
                      isFollowing
                        ? "border-[1.5px] border-foreground/30 text-foreground hover:bg-foreground/[0.04]"
                        : "bg-foreground text-background hover:opacity-90"
                    }`}
                  >
                    {followLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      !isFollowing && <Plus className="h-[18px] w-[18px]" />
                    )}
                    {isFollowing ? "Following" : isFollowingMe ? "Follow back" : "Follow"}
                  </button>
                  <Link
                    to="/app/chat/$id"
                    params={{ id: profile.id }}
                    className="flex h-10 flex-1 items-center justify-center rounded-full border-[1.5px] border-foreground text-[15px] font-semibold text-foreground tap hover:bg-foreground/[0.04]"
                  >
                    Message
                  </Link>
                  {/* Following says "put this in my feed"; the bell says
                      "interrupt me". Two different appetites, so two controls. */}
                  <button
                    onClick={togglePostAlerts}
                    disabled={alertsPending}
                    aria-pressed={postAlertsOn}
                    title={
                      postAlertsOn
                        ? "Stop notifying me about their posts"
                        : "Notify me when they post"
                    }
                    aria-label={
                      postAlertsOn
                        ? "Stop notifying me about their posts"
                        : "Notify me when they post"
                    }
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full tap disabled:opacity-50 ${
                      postAlertsOn
                        ? "bg-accent text-accent-foreground"
                        : "border-[1.5px] border-foreground/30 text-foreground hover:bg-foreground/[0.04]"
                    }`}
                  >
                    {alertsPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BellRing
                        className={`h-[18px] w-[18px] ${postAlertsOn ? "fill-current" : ""}`}
                      />
                    )}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Featured ships ── */}
        {shipPosts.length > 0 && (
          <section className="mt-2 bg-card py-4 md:rounded-xl md:border md:border-border">
            <div className="flex items-center justify-between px-4">
              <h2 className="font-display text-[18px] font-semibold text-foreground">
                Featured ships
              </h2>
              {shipPosts.length > 2 && (
                <button
                  onClick={() => openTab("Ships")}
                  className="text-[14px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  See all {shipPosts.length}
                </button>
              )}
            </div>
            <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-4">
              {shipPosts.slice(0, 6).map((post: any) => (
                <Link
                  key={post.id}
                  to="/app/post/$id"
                  params={{ id: post.id }}
                  className="w-[232px] shrink-0 overflow-hidden rounded-xl border border-border tap hover:bg-foreground/[0.02]"
                >
                  <div className="h-28 bg-foreground/[0.05]">
                    {post.media_urls?.[0] && !isVideoUrl(post.media_urls[0]) && (
                      <img
                        src={post.media_urls[0]}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="truncate text-[14px] font-semibold text-foreground">
                      {shipTitle(post)}
                    </p>
                    {post.is_verified_build ? (
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5 fill-current" /> Verified proof
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        Shipped{" "}
                        {new Date(post.created_at).toLocaleDateString([], {
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Activity ── */}
        <section
          id="profile-activity"
          className="mt-2 scroll-mt-16 bg-card px-4 pb-3 pt-4 md:rounded-xl md:border md:border-border"
        >
          <h2 className="font-display text-[18px] font-semibold text-foreground">Activity</h2>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-semibold tap ${
                  tab === t
                    ? "bg-foreground text-background"
                    : "border border-foreground/30 text-foreground/75 hover:bg-foreground/[0.04]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {tab === "Posts" &&
          (postsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPosts.length > 0 ? (
            filteredPosts.map((post: any) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                onCommentClick={setCommentPost}
              />
            ))
          ) : (
            emptyState(
              Pen,
              "No posts yet",
              isOwnProfile
                ? "Share what you're building with the Zero Club community."
                : `${getFirstName(profile)} hasn't posted anything yet.`,
            )
          ))}

        {tab === "Ships" &&
          (postsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredShips.length > 0 ? (
            filteredShips.map((post: any) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                onCommentClick={setCommentPost}
              />
            ))
          ) : (
            emptyState(
              Rocket,
              "No ships yet",
              isOwnProfile
                ? "Ship your first project and show what you're building."
                : `${getFirstName(profile)} hasn't shared any shipped projects yet.`,
            )
          ))}

        {tab === "Media" &&
          (posts.filter((p: any) => p.media_urls?.[0]).length > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-0.5 bg-card md:overflow-hidden md:rounded-xl">
              {posts
                .filter((p: any) => p.media_urls?.[0])
                .map((post: any) => {
                  const url = post.media_urls[0];
                  return (
                    <Link
                      key={post.id}
                      to="/app/post/$id"
                      params={{ id: post.id }}
                      className="group relative aspect-square overflow-hidden bg-foreground/[0.05]"
                    >
                      {isVideoUrl(url) ? (
                        <>
                          <video
                            src={url}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                          />
                          <span className="absolute inset-0 grid place-items-center bg-black/20">
                            <Play className="h-6 w-6 fill-white text-white" />
                          </span>
                        </>
                      ) : (
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </Link>
                  );
                })}
            </div>
          ) : (
            emptyState(
              Play,
              "No media yet",
              `Photos and videos from ${isOwnProfile ? "your" : `${getFirstName(profile)}'s`} posts will appear here.`,
            )
          ))}

        {tab === "Likes" &&
          (likedPostsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : likedPostsData && likedPostsData.length > 0 ? (
            likedPostsData.map((post: any) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                onCommentClick={setCommentPost}
              />
            ))
          ) : (
            emptyState(
              Heart,
              "No likes yet",
              isOwnProfile
                ? "Posts you like will appear here."
                : `${getFirstName(profile)} hasn't liked any posts yet.`,
            )
          ))}
      </div>

      {commentPost && (
        <CommentDrawer
          post={commentPost}
          isOpen={!!commentPost}
          onOpenChange={(open) => !open && setCommentPost(null)}
          onCommentAdded={() => {
            queryClient.invalidateQueries({ queryKey: ["profilePosts", profile.id] });
          }}
        />
      )}

      {isAvatarOpen && profile?.avatar_url && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setIsAvatarOpen(false)}
        >
          <button
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-black/20 p-2 text-white/70 transition-all hover:bg-black/40 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setIsAvatarOpen(false);
            }}
          >
            <X className="h-6 w-6" />
          </button>
          <span
            className="block aspect-square w-[min(92vw,92vh,640px)] overflow-hidden rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AnimatedProfileImage
              profile={profile}
              alt="Profile photo"
              className="h-full w-full object-cover"
            />
          </span>
        </div>
      )}
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
}
