import { 
  useLoaderData, 
  createFileRoute, 
  Outlet, 
  Link, 
  useNavigate, 
  useLocation,
  useRouter 
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { 
  Compass, Sparkles, CircleUser, UsersRound, 
  Plus, BellRing, BookmarkCheck, Clapperboard, 
  MoreHorizontal, SlidersHorizontal, LifeBuoy, UserPlus, Crown, Rocket, Zap,
  Palette, Check, Sun, MessageCircle, GraduationCap, Globe, Feather
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";


export const Route = createFileRoute("/app")({
  loader: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { isAuthenticated: false };
    return { isAuthenticated: true, userId: session.user.id };
  },
  component: AppLayout,
});

const WalletIcon = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div 
    className={className}
    style={{
      backgroundColor: "currentColor",
      WebkitMaskImage: "url('/wallet_icon.png')",
      WebkitMaskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskImage: "url('/wallet_icon.png')",
      maskSize: "contain",
      maskRepeat: "no-repeat",
      maskPosition: "center",
      ...props.style
    }}
    {...props}
  />
);

const ZeroNotesIcon = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div 
    className={className}
    style={{
      backgroundColor: "currentColor",
      WebkitMaskImage: "url('/zeronotes_icon.png')",
      WebkitMaskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskImage: "url('/zeronotes_icon.png')",
      maskSize: "contain",
      maskRepeat: "no-repeat",
      maskPosition: "center",
      ...props.style
    }}
    {...props}
  />
);

const tabs = [
  { to: "/app/", label: "Feed", icon: Compass, exact: true },
  { to: "/app/bootcamps", label: "Learn", icon: GraduationCap },
  { to: "/app/clubs", label: "Clubs", icon: UsersRound },
  { to: "/app/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/app/chat", label: "Messages", icon: MessageCircle },
];

const PAGE_TITLES: Record<string, string> = {
  "/app": "Feed",
  "/app/bootcamps": "Bootcamps",
  "/app/clubs": "Clubs",
  "/app/wallet": "Wallet",
  "/app/chat": "Messages",
  "/app/premium": "Premium",
  "/app/bookmarks": "Bookmarks",
  "/app/tutor-studio": "Tutor Studio",
  "/app/notifications": "Notifications",
  "/app/quests": "Quests",
  "/app/notes": "ZeroNotes",
};

const SidebarContent = React.memo(({ profile, onOpenTheme, onClose }: { profile: any; onOpenTheme: () => void; onClose?: () => void }) => (
  <div className="flex h-full flex-col p-5" onClick={(e) => {
    // Close sidebar if user clicked a link (navigation)
    const target = e.target as HTMLElement;
    if (target.closest('a')) {
      onClose?.();
    }
  }}>
  <div className="flex items-start justify-between shrink-0">
      <Link to="/app/profile/" className="group block transition active:opacity-70">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.username} className="h-9 w-9 rounded-full object-cover border border-white/10" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-white">
            {profile?.username?.substring(0, 1).toUpperCase() || "U"}
          </div>
        )}
        <div className="mt-3">
          <div className="h-5 w-32 bg-white/5 rounded animate-pulse mb-1" style={{ display: profile?.username ? 'none' : 'block' }} />
          <h2 className="font-display text-base font-bold group-hover:text-primary transition-colors" style={{ display: profile?.username ? 'block' : 'none' }}>
            {profile?.full_name || profile?.username || "Builder"}
          </h2>
          <div className="flex items-center gap-2">
            <p className="text-[13px] text-muted-foreground">
              {profile?.username ? `${getFirstName(profile)}` : "Fetching identity..."}
            </p>
            {profile?.xp !== undefined && (
              <span className="flex items-center gap-0.5 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-black text-primary border border-primary/20 animate-in fade-in duration-500">
                <Zap className="h-2.5 w-2.5 fill-current" /> {profile.xp} XP
              </span>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] min-w-0 w-full">
          <div className="flex gap-1 items-center shrink-0 min-w-0">
            <span className="font-bold text-foreground">{profile?.following_count || 0}</span>
            <span className="text-muted-foreground">Following</span>
          </div>
          <div className="flex gap-1 items-center shrink-0 min-w-0">
            <span className="font-bold text-foreground">{profile?.followers_count || 0}</span>
            <span className="text-muted-foreground">Followers</span>
          </div>
        </div>
      </Link>
      <Drawer>
        <DrawerTrigger asChild>
          <button className="grid h-8 w-8 place-items-center rounded-full border border-border transition active:scale-95 mt-1">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="z-[100] border-t-border bg-background/95 backdrop-blur-xl p-6 border-none focus:ring-0">
          <div className="text-left mb-6">
            <h2 className="text-2xl font-bold text-foreground">Accounts</h2>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-muted">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground">
                      {profile?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm">{profile?.full_name || profile?.username || 'Zero Builder'}</span>
                  <span className="text-xs text-muted-foreground">{getFirstName(profile)}</span>
                </div>
              </div>
              <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center text-white">
                <Check className="h-3 w-3 text-white" />
              </div>
            </div>

            <button 
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/signup';
              }}
              className="w-full py-4 rounded-full border border-border bg-transparent text-sm font-bold text-foreground hover:bg-accent/30 transition mt-2">
              Create a new account
            </button>
            <button 
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/signin';
              }}
              className="w-full py-4 rounded-full border border-border bg-transparent text-sm font-bold text-foreground hover:bg-accent/30 transition">
              Add an existing account
            </button>
            
            <button 
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/signin';
              }}
              className="w-full py-4 rounded-full bg-destructive/10 text-destructive text-sm font-bold hover:bg-destructive/20 transition mt-2">
              Log out
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>

    <div className="overflow-y-auto pr-2 -mr-2 mt-6 flex-1 no-scrollbar flex flex-col">
      <nav className="flex flex-col gap-1.5 flex-1">
        {[
          { icon: CircleUser, label: "Profile", to: "/app/profile/" },
          { icon: Crown, label: "Membership", to: "/app/premium" },
          { icon: UsersRound, label: "Clubs", to: "/app/clubs" },
          { icon: BookmarkCheck, label: "Bookmarks", to: "/app/bookmarks" },
          { icon: Feather, label: "ZeroNotes", to: "/app/notes" },
          { icon: Rocket, label: "ZeroHub", to: "/app/zerohub" },
          { icon: GraduationCap, label: "Bootcamps", to: "/app/bootcamps" },
          { icon: Clapperboard, label: "Tutor Studio", to: "/app/tutor-studio" },
        ].map((item) => (
          <Link 
            key={item.label} 
            to={item.to}
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-[16px] font-bold transition hover:bg-accent/30 active:bg-accent/50"
          >
            <item.icon className="h-[24px] w-[24px] opacity-80" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto pb-2 pt-2">
        <Accordion type="single" collapsible className="w-full border-none">
          <AccordionItem value="settings" className="border-none">
            <AccordionTrigger className="px-2.5 py-3 text-[13px] font-bold hover:no-underline text-muted-foreground">
              Settings & Support
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-1 pb-2">
              <Link to="/app/settings" className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition active:bg-accent/50">
                <SlidersHorizontal className="h-[18px] w-[18px] opacity-80" />
                <span>Settings and privacy</span>
              </Link>
              <button className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition active:bg-accent/50">
                <LifeBuoy className="h-[18px] w-[18px] opacity-80" />
                <span>Help Center</span>
              </button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        
        <button 
          onClick={onOpenTheme}
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-[13px] font-bold text-muted-foreground transition active:bg-accent/50"
        >
          <Palette className="h-[18px] w-[18px] opacity-80" />
          <span>Display Settings</span>
        </button>
      </div>
    </div>
  </div>
));


const BottomNav = React.memo(({ pathname, visible, isChat, isDetail, unreadCount }: { pathname: string, visible: boolean, isChat: boolean, isDetail: boolean, unreadCount: number }) => (
  <nav 
    className={`fixed bottom-4 left-1/2 z-50 w-[95%] max-w-sm -translate-x-1/2 transition-all duration-300 md:hidden ${
      visible && !isDetail && !pathname.includes("/app/live") && !pathname.includes("/app/notes") && (!isChat || pathname === "/app/chat" || pathname === "/app/chat/") ? "translate-y-0 opacity-100" : "translate-y-[150%] opacity-0 pointer-events-none"
    }`}
  >
    <div className="flex items-center justify-between rounded-full bg-card border border-border/50 p-2 shadow-2xl dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)">
      {tabs.map((t) => {
        const normalize = (p: string) => p.replace(/\/$/, "");
        const active = t.exact 
          ? normalize(pathname) === normalize(t.to) 
          : pathname.startsWith(t.to);
        const Icon = t.icon;
        
        if (active) {
          return (
            <Link key={t.to} to={t.to} className="relative flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 transition active:scale-95">
              <Icon className="h-4 w-4 text-primary-foreground" />
              <span className="text-xs font-bold text-primary-foreground">{t.label}</span>
              {t.label === "Messages" && unreadCount > 0 && (
                <span className="ml-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-foreground text-primary px-1 text-[9px] font-black shadow-sm">
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        }

        return (
          <Link key={t.to} to={t.to} className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-accent/50 active:scale-95">
            <Icon className="h-5 w-5 text-muted-foreground" />
            {t.label === "Messages" && unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white shadow-sm border border-card">
                {unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  </nav>
));

function AppLayout() {
  const { pathname } = useLocation();
  const location = useLocation();
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const [visible, setVisible] = useState(true);
  const [session, setSession] = useState<any>(loaderData.isAuthenticated ? { user: { id: loaderData.userId } } : null);
  const [loading, setLoading] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarClosing, setIsSidebarClosing] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  
  const handleCloseSidebar = () => {
    setIsSidebarClosing(true);
    setTimeout(() => {
      setIsSidebarOpen(false);
      setIsSidebarClosing(false);
    }, 450);
  };
  
  useEffect(() => {
    const handleOpenSidebar = () => setIsSidebarOpen(true);
    window.addEventListener('open-sidebar', handleOpenSidebar);
    return () => window.removeEventListener('open-sidebar', handleOpenSidebar);
  }, []);
  
  const { data: profile, isLoading: profileLoading } = useUser();

  useEffect(() => {
    // Basic presence update - redirected from here to chat if club param exists
  }, [location.pathname, navigate]);

  useEffect(() => {
    let unreadBadgeCount = 0;

    const updatePresenceAndBadges = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // 1. Update presence
        await supabase
          .from('profiles')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', session.user.id);

        // Self-heal: Mark any already accepted/declined club requests as read in the DB
        try {
          await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('receiver_id', session.user.id)
            .eq('is_read', false)
            .like('content', 'CLUB_REQUEST:%accepted');

          await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('receiver_id', session.user.id)
            .eq('is_read', false)
            .like('content', 'CLUB_REQUEST:%declined');
        } catch (e) {
          console.error("Database self-heal error:", e);
        }

        // 2. Get unread private messages
        const { count: pmCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', session.user.id)
          .eq('is_read', false)
          .not('content', 'like', 'CLUB_REQUEST:%');

        let totalUnread = pmCount || 0;

        // 3. Get unread club messages
        try {
          // Get joined clubs
          const { data: joinedClubs } = await supabase
            .from('club_members')
            .select('club_id')
            .eq('profile_id', session.user.id);

          if (joinedClubs && joinedClubs.length > 0) {
            const clubIds = joinedClubs.map(c => c.club_id);
            // Get messages in last 24h
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentClubMsgs } = await supabase
              .from('club_messages')
              .select('club_id, created_at, profile_id')
              .in('club_id', clubIds)
              .gte('created_at', yesterday);

            if (recentClubMsgs) {
              const unreadClubCount = recentClubMsgs.filter(msg => {
                if (msg.profile_id === session.user.id) return false;
                const lastReadStr = typeof window !== 'undefined' ? localStorage.getItem(`last_club_read_${msg.club_id}`) : null;
                const lastRead = lastReadStr ? new Date(lastReadStr).getTime() : 0;
                return new Date(msg.created_at).getTime() > lastRead;
              }).length;
              totalUnread += unreadClubCount;
            }
          }
        } catch (e) {
          console.error("Error fetching club unread", e);
        }

        setUnreadMessagesCount(pmCount || 0);

        // 4. Update App Badge
        if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
          if (totalUnread > 0) {
            (navigator as any).setAppBadge(totalUnread).catch(console.error);
          } else {
            (navigator as any).clearAppBadge().catch(console.error);
          }
        }
      }
    };

    updatePresenceAndBadges();
    const interval = setInterval(updatePresenceAndBadges, 30000); // Check every 30 seconds
    
    // Subscribe to realtime messages to instantly trigger badge update
    let pmSub: any, clubSub: any;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        pmSub = supabase.channel('badge_pms')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
            if (payload.new && (payload.new.receiver_id === session.user.id || payload.new.sender_id === session.user.id)) {
              updatePresenceAndBadges();

              // Trigger a high-fidelity toast notification for new incoming unseen DMs
              if (
                payload.eventType === 'INSERT' && 
                payload.new.receiver_id === session.user.id && 
                !window.location.pathname.includes(`/app/chat/${payload.new.sender_id}`)
              ) {
                try {
                  const { data: sender } = await supabase
                    .from('profiles')
                    .select('username, full_name, avatar_url')
                    .eq('id', payload.new.sender_id)
                    .single();

                  const senderName = sender?.full_name || sender?.username || "Someone";
                  const avatarUrl = sender?.avatar_url;
                  const isRequest = payload.new.content.startsWith('CLUB_REQUEST:');
                  
                  let displayContent = payload.new.content;
                  if (isRequest) {
                    const parts = payload.new.content.split(':');
                    const clubName = parts[2] || 'Club';
                    displayContent = `🔒 Requested to join your club: ${clubName}`;
                  } else if (payload.new.content.includes('$$MEDIA$$')) {
                    const textPart = payload.new.content.split('$$MEDIA$$')[0].trim();
                    if (textPart) {
                      displayContent = textPart;
                    } else {
                      const urls = payload.new.content.split('$$MEDIA$$')[1] || '';
                      const firstUrl = urls.split(',')[0]?.toLowerCase() || '';
                      if (firstUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp)/i) || firstUrl.includes('image')) displayContent = "📷 Sent you a picture";
                      else if (firstUrl.match(/\.(mp4|webm|ogg|mov)/i) || firstUrl.includes('video')) displayContent = "🎥 Sent you a video";
                      else if (firstUrl.match(/\.(mp3|wav|m4a|aac)/i) || firstUrl.includes('audio')) displayContent = "🎵 Sent you a voice note";
                      else displayContent = "📎 Sent you an attachment";
                    }
                  }

                  const preview = displayContent.length > 60 ? displayContent.slice(0, 60) + '...' : displayContent;

                  toast(senderName, {
                    description: preview,
                    icon: avatarUrl ? (
                      <img src={avatarUrl} alt={senderName} className="h-8 w-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
                        {senderName.substring(0, 1)}
                      </div>
                    ),
                    action: {
                      label: "Reply",
                      onClick: () => router.navigate({ to: '/app/chat/$id', params: { id: payload.new.sender_id } })
                    }
                  });
                } catch (e) {
                  console.error("Error showing new message notification", e);
                }
              }
            }
          })
          .subscribe();
        
        clubSub = supabase.channel('badge_club_msgs')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'club_messages' }, payload => {
            if (payload.new.profile_id !== session.user.id) updatePresenceAndBadges();
          })
          .subscribe();
      }
    });

    return () => {
      clearInterval(interval);
      if (pmSub) supabase.removeChannel(pmSub);
      if (clubSub) supabase.removeChannel(clubSub);
    };
  }, []);
  const router = useRouter();

  // Theme State
  const [darkMode, setDarkMode] = useState<'on' | 'off' | 'system' | 'premium'>('on');
  const [darkTheme, setDarkTheme] = useState<'dim' | 'lights-out'>('lights-out');
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedDarkMode = localStorage.getItem('darkMode') as 'on' | 'off' | 'system' | 'premium';
      const storedDarkTheme = localStorage.getItem('darkTheme') as 'dim' | 'lights-out';
      
      if (storedDarkMode) setDarkMode(storedDarkMode);
      if (storedDarkTheme) setDarkTheme(storedDarkTheme);
      setThemeLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    
    const root = window.document.documentElement;
    
    const applyTheme = () => {
      root.classList.remove('dark', 'dim', 'lights-out', 'premium');

      if (darkMode === 'premium') {
        root.classList.add('premium');
      } else {
        const isDark = darkMode === 'on' || (darkMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (isDark) {
          root.classList.add('dark');
          root.classList.add(darkTheme);
        }
      }
    };

    applyTheme();

    if (darkMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    
    localStorage.setItem('darkMode', darkMode);
    localStorage.setItem('darkTheme', darkTheme);
  }, [darkMode, darkTheme, themeLoaded]);

  // 1. Manage Session and Loading state
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      
      if (!session) {
        const search = new URLSearchParams(window.location.search);
        router.navigate({ 
          to: "/signup", 
          search: { 
            ref: search.get('ref') || "",
            club: search.get('club') || ""
          } 
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        const search = new URLSearchParams(window.location.search);
        router.navigate({ 
          to: "/signup", 
          search: { 
            ref: search.get('ref') || "",
            club: search.get('club') || ""
          } 
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // 2. Handle Club Invites from URL
  useEffect(() => {
    if (!session) return;
    const search = new URLSearchParams(location.search);
    const clubId = search.get('club');
    if (clubId) {
      // Check if already a member
      supabase
        .from('club_members')
        .select('id')
        .eq('club_id', clubId)
        .eq('profile_id', session.user.id)
        .single()
        .then(({ data: member }) => {
          if (!member) {
            // Join the club
            return supabase
              .from('club_members')
              .insert({
                club_id: clubId,
                profile_id: session.user.id,
                role: 'Member'
              });
          }
        })
        .then(() => {
          // Redirect to club chat with rules flag
          router.navigate({ 
            to: "/app/clubs/chat", 
            search: { showRules: "true", clubId: clubId } 
          });
        });
    }
  }, [session, location.search, router]);

  // Redundant profile query removed, now using useUser hook at top

  const getPageTitle = React.useMemo(() => {
    const path = pathname.toLowerCase();
    const match = Object.entries(PAGE_TITLES).find(([route]) => path.startsWith(route));
    return match ? match[1] : "Zero Club";
  }, [pathname]);

  const isFeed = pathname === "/app" || pathname === "/app/";
  const isChat = pathname.includes("/chat");
  const isChatInbox = pathname === "/app/chat" || pathname === "/app/chat/";
  const isPostDetail = pathname.startsWith("/app/post/");
  const isDetail = pathname.includes("/detail") || isPostDetail;
  const hideHeader = !isFeed;

  useEffect(() => {
    let lastScrollY = window.scrollY;
    
    const handleScroll = () => {
      const currentScrollPos = window.scrollY;
      const diff = currentScrollPos - lastScrollY;

      if (Math.abs(diff) > 10) {
        if (currentScrollPos > 80 && diff > 0) {
          setVisible((v) => (v ? false : v));
        } else {
          setVisible((v) => (v ? v : true));
        }
        lastScrollY = currentScrollPos;
      }
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;



  return (
    <div className="mx-auto min-h-screen w-full bg-background md:flex md:justify-center">
      {/* Desktop Sidebar (Left Column) */}
      <div className="hidden md:flex flex-col w-[280px] shrink-0 sticky top-0 h-screen border-r border-border/40 bg-background z-40 overflow-y-auto no-scrollbar">
        <SidebarContent profile={profile} onOpenTheme={() => setIsThemeOpen(true)} />
      </div>

      {/* Main Center Column */}
      <div className="w-full max-w-md mx-auto md:mx-0 md:max-w-[600px] flex-1 flex flex-col relative min-h-screen md:border-r border-border/10">
        {!hideHeader && (
          <header className={`fixed top-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 md:sticky md:left-0 md:translate-x-0 md:max-w-full flex items-center justify-between bg-background/95 backdrop-blur-xl border-b border-border px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] transition-all duration-200 ${
            visible ?"translate-y-0 opacity-100" : "-translate-y-full opacity-0"
          }`}>
            <div className="flex w-10 items-center md:hidden">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="h-9 w-9 overflow-hidden rounded-full border border-border transition active:scale-95"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-primary flex items-center justify-center text-[10px] font-bold text-white uppercase">
                  {profile?.username?.substring(0, 1) || "U"}
                </div>
              )}
            </button>
          </div>
          
          <div className="flex-1 flex justify-center">
            {isFeed ? (
              <img src="/logo.png" alt="Zero Club" className="h-8 w-auto object-contain" />
            ) : (
              <h1 className="font-display text-lg font-bold">{getPageTitle}</h1>
            )}
          </div>

          <div className="flex w-10 items-center justify-end">
            <Link to="/app/notifications" className="grid h-10 w-10 place-items-center rounded-full bg-white/5 border border-white/10 transition active:scale-95 text-foreground relative">
              <BellRing className="h-5 w-5" />
              <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-primary border border-background" />
            </Link>
          </div>
        </header>
      )}

      {/* Custom Floating Capsule Sidebar */}
      {(isSidebarOpen || isSidebarClosing) && (
        <>
          {/* Blurred overlay - closes sidebar on click */}
          <div 
            className={`fixed inset-0 z-[70] bg-black/50 backdrop-blur-md ${isSidebarClosing ?'animate-out fade-out duration-500 ease-in-out fill-mode-forwards' : 'animate-in fade-in duration-500 ease-out'}`}
            onClick={handleCloseSidebar}
          />
          {/* Floating sidebar panel */}
          <div 
            className={`fixed left-3 top-4 z-[80] w-[280px] h-[calc(100dvh-110px)] flex flex-col rounded-[32px] border border-border/40 bg-card/95 backdrop-blur-xl shadow-[0_8px_60px_rgba(0,0,0,0.4)] overflow-hidden ${isSidebarClosing ?'animate-out fade-out slide-out-to-left-full duration-500 ease-in-out fill-mode-forwards' : 'animate-in fade-in slide-in-from-left-full duration-500 ease-out'}`}
          >
            <SidebarContent profile={profile} onClose={handleCloseSidebar} onOpenTheme={() => { setIsSidebarOpen(false); setIsSidebarClosing(false); setIsThemeOpen(true); }} />
          </div>
        </>
      )}

      {/* Theme Selection Sheet */}
      <Drawer open={isThemeOpen} onOpenChange={setIsThemeOpen}>
        <DrawerContent className="border-none bg-background p-6 focus:ring-0">
          <h2 className="text-xl font-bold mb-6">Display Settings</h2>
          
          <div className="space-y-4">
            <button 
              onClick={() => { setDarkMode('off'); }}
              className="flex w-full items-center justify-between"
            >
              <span className="font-bold">Light</span>
              <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition ${darkMode ==='off' ? "border-primary" : "border-muted"}`}>
                {darkMode === 'off' && <div className="h-3 w-3 rounded-full bg-primary" />}
              </div>
            </button>
            
            <button 
              onClick={() => { setDarkMode('on'); setDarkTheme('lights-out'); }}
              className="flex w-full items-center justify-between"
            >
              <span className="font-bold">Dark</span>
              <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition ${darkMode ==='on' && darkTheme === 'lights-out' ? "border-primary" : "border-muted"}`}>
                {darkMode === 'on' && darkTheme === 'lights-out' && <div className="h-3 w-3 rounded-full bg-primary" />}
              </div>
            </button>

            <button 
              onClick={() => { setDarkMode('on'); setDarkTheme('dim'); }}
              className="flex w-full items-center justify-between"
            >
              <span className="font-bold">Dim</span>
              <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition ${darkMode ==='on' && darkTheme === 'dim' ? "border-primary" : "border-muted"}`}>
                {darkMode === 'on' && darkTheme === 'dim' && <div className="h-3 w-3 rounded-full bg-primary" />}
              </div>
            </button>

            <div className="border-t border-border/40 pt-4 mt-2">
              <button 
                onClick={() => { setDarkMode('premium'); }}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-bold">Premium</span>
                  <span className="text-[10px] bg-gradient-primary text-white px-2 py-0.5 rounded-full">Free 60 days</span>
                </div>
                <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition ${darkMode ==='premium' ? "border-primary" : "border-muted"}`}>
                  {darkMode === 'premium' && <div className="h-3 w-3 rounded-full bg-primary" />}
                </div>
              </button>
              <p className="text-[11px] text-muted-foreground mt-1.5 ml-0.5">A warm ivory tone designed for premium members.</p>
            </div>
          </div>

          <button 
            onClick={() => setIsThemeOpen(false)}
            className="mt-10 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground transition active:scale-95"
          >
            Done
          </button>
        </DrawerContent>
      </Drawer>


      <div className={`${!hideHeader ?"pt-[calc(72px+env(safe-area-inset-top))] md:pt-0" : "pt-[env(safe-area-inset-top)]"} ${(!isChat || isChatInbox) && !isDetail && !pathname.includes("/app/notes") ? "pb-24 md:pb-0" : "pb-0"}`}>
        <Outlet />
      </div>

      <BottomNav pathname={pathname} visible={visible} isChat={isChat} isDetail={isDetail} unreadCount={unreadMessagesCount} />
      </div>
    </div>
  );
}
