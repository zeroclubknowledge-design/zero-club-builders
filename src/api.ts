import { createServerFn } from '@tanstack/react-start';
import { supabase } from '@/lib/supabase';
import { getCachedSession } from '@/lib/auth';

// Fetch all active bootcamps
export const getBootcamps = async () => {
  const { data, error } = await supabase
    .from('bootcamps')
    .select('*, profiles(username, full_name, avatar_url, account_type)')
    .ilike('status', 'active');
  if (error) return [];
  return data ?? [];
};

// Fetch bootcamps created by current user
export const getTutorBootcamps = async () => {
  const { data: { session } } = await getCachedSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('bootcamps')
    .select('*, profiles(username, full_name, avatar_url, account_type), enrollments(count)')
    .or(`creator_id.eq.${session.user.id},assigned_tutor_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false });
  
  if (error) return [];
  return data ?? [];
};

  // Fetch tutors linked to this institution
  export const getInstitutionBootcamps = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];
  
    const { data: linkedTutors } = await supabase
      .from('institution_tutors')
      .select('tutor_id')
      .eq('institution_id', session.user.id);
  
    if (!linkedTutors || linkedTutors.length === 0) return [];
  
    const tutorIds = linkedTutors.map(t => t.tutor_id);
  
    const { data, error } = await supabase
      .from('bootcamps')
      .select('*, profiles(username, full_name, avatar_url), club:clubs(id)')
      .in('creator_id', tutorIds)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error(error);
      return [];
    }
    return data ?? [];
  };

// Create a new bootcamp (for tutors)
export const createBootcampAction = createServerFn({ method: 'POST' }).handler(async ({ data: payload }: { data: any }) => {
  const { data, error } = await supabase
    .from('bootcamps')
    .insert([payload])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
});

// Delete a bootcamp
export const deleteBootcampAction = createServerFn({ method: 'POST' }).handler(async ({ data: { bootcampId } }: { data: { bootcampId: string } }) => {
  const { error } = await supabase
    .from('bootcamps')
    .delete()
    .eq('id', bootcampId);
  if (error) throw new Error(error.message);
  return { success: true };
});

// Fetch a single bootcamp with its curriculum (modules and lessons)
export const getBootcampWithCurriculum = async ({ data: { bootcampId } }: { data: { bootcampId: string } }) => {
  const { data: bootcamp, error: bootcampError } = await supabase
    .from('bootcamps')
    .select('*, profiles(username, full_name, avatar_url, account_type)')
    .eq('id', bootcampId)
    .single();
    
  if (bootcampError) throw new Error(bootcampError.message);

  const { data: modules, error: modulesError } = await supabase
    .from('modules')
    .select('*, lessons(*)')
    .eq('bootcamp_id', bootcampId)
    .order('order_index', { ascending: true });

  if (modulesError) throw new Error(modulesError.message);

  // Sort lessons within modules
  const sortedModules = modules.map(m => ({
    ...m,
    lessons: (m.lessons || []).sort((a: any, b: any) => a.order_index - b.order_index)
  }));

  return { bootcamp, modules: sortedModules };
};

// Fetch all posts for the feed (including reposts)
export const getPosts = async () => {
  try {
    // 1. & 2. Fetch original posts and reposts in parallel
    const [{ data: posts, error: postsError }, { data: reposts, error: repostsError }] = await Promise.all([
      supabase
        .from('posts')
        .select('*, profiles(username, full_name, avatar_url), quoted_posts:quoted_post_id(*, profiles(username, full_name, avatar_url))')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('reposts')
        .select('*, posts(*, profiles(username, full_name, avatar_url)), profiles(username, full_name)')
        .order('created_at', { ascending: false })
        .limit(50)
    ]);

    if (postsError) {
      console.error("Error fetching posts:", postsError);
      return [];
    }

    let repostedPosts: any[] = [];
    const dynamicRepostCounts: Record<string, number> = {};
    const dynamicQuotesCounts: Record<string, number> = {};

    if (posts) {
      posts.forEach(p => {
        if (p.quoted_post_id) {
          dynamicQuotesCounts[p.quoted_post_id] = (dynamicQuotesCounts[p.quoted_post_id] || 0) + 1;
        }
      });
    }

    if (!repostsError && reposts) {
      reposts.forEach(r => {
        dynamicRepostCounts[r.post_id] = (dynamicRepostCounts[r.post_id] || 0) + 1;
      });

      repostedPosts = reposts.map(r => ({
        ...r.posts,
        id: `repost-${r.id}`, 
        original_id: r.post_id,
        created_at: r.created_at, 
        type: 'repost',
        reposter_id: r.profile_id,
        reposted_by: r.profiles?.full_name || r.profiles?.username,
        computed_reposts_count: dynamicRepostCounts[r.post_id] || 0,
        computed_quotes_count: dynamicQuotesCounts[r.post_id] || 0
      })).filter(rp => rp.original_id);
    }

    // 3. Fetch user interactions in parallel if authenticated
    let myBookmarks: string[] = [];
    let myLikes: string[] = [];
    let myReposts: string[] = [];
    let myQuotes: string[] = [];
    
    const { data: { session } } = await getCachedSession();
    
    if (session && (posts || reposts)) {
      const allPostIds = [
        ...(posts?.map(p => p.id) || []),
        ...(repostedPosts.map(p => p.original_id) || [])
      ].filter(Boolean);

      if (allPostIds.length > 0) {
        const [bmsRes, lksRes, repRes, quotesRes] = await Promise.all([
          supabase.from('bookmarks').select('post_id').eq('profile_id', session.user.id).in('post_id', allPostIds),
          supabase.from('likes').select('post_id').eq('profile_id', session.user.id).in('post_id', allPostIds),
          supabase.from('reposts').select('post_id').eq('profile_id', session.user.id).in('post_id', allPostIds),
          supabase.from('posts').select('quoted_post_id').eq('author_id', session.user.id).in('quoted_post_id', allPostIds)
        ]);
        myBookmarks = bmsRes.data?.map(b => b.post_id) || [];
        myLikes = lksRes.data?.map(l => l.post_id) || [];
        myReposts = repRes.data?.map(r => r.post_id) || [];
        myQuotes = quotesRes.data?.map(q => q.quoted_post_id).filter(Boolean) as string[] || [];
      }
    }
    
    // 4. Merge, flag bookmarks/likes, and sort
    const originalPosts = (posts || []).map(p => ({ 
      ...p, 
      type: 'original',
      computed_reposts_count: dynamicRepostCounts[p.id] || 0,
      computed_quotes_count: dynamicQuotesCounts[p.id] || 0
    }));
    
    return [...originalPosts, ...repostedPosts]
      .map(p => ({
        ...p,
        isBookmarked: myBookmarks.includes(p.original_id || p.id),
        isLiked: myLikes.includes(p.original_id || p.id),
        hasReposted: myReposts.includes(p.original_id || p.id),
        hasQuoted: myQuotes.includes(p.original_id || p.id)
      }))
      .sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  } catch (err) {
    console.error("Critical error in getPosts:", err);
    return [];
  }
};

// Helper to enrich a list of posts with computed counts and user specific flags
export const enrichPosts = async (posts: any[], currentUserId?: string) => {
  if (!posts || posts.length === 0) return [];

  // We need to fetch reposts and quotes for these specific posts
  const postIds = posts.map(p => p.id);
  
  const [repostsRes, quotesRes] = await Promise.all([
    supabase.from('reposts').select('post_id').in('post_id', postIds),
    supabase.from('posts').select('quoted_post_id').in('quoted_post_id', postIds)
  ]);

  const dynamicRepostCounts: Record<string, number> = {};
  const dynamicQuotesCounts: Record<string, number> = {};
  
  repostsRes.data?.forEach(r => {
    dynamicRepostCounts[r.post_id] = (dynamicRepostCounts[r.post_id] || 0) + 1;
  });
  
  quotesRes.data?.forEach(q => {
    if (q.quoted_post_id) {
      dynamicQuotesCounts[q.quoted_post_id] = (dynamicQuotesCounts[q.quoted_post_id] || 0) + 1;
    }
  });

  let myBookmarks: string[] = [];
  let myLikes: string[] = [];
  let myReposts: string[] = [];
  let myQuotes: string[] = [];

  if (currentUserId) {
    const [bmsRes, lksRes, repRes, quotesRes2] = await Promise.all([
      supabase.from('bookmarks').select('post_id').eq('profile_id', currentUserId).in('post_id', postIds),
      supabase.from('likes').select('post_id').eq('profile_id', currentUserId).in('post_id', postIds),
      supabase.from('reposts').select('post_id').eq('profile_id', currentUserId).in('post_id', postIds),
      supabase.from('posts').select('quoted_post_id').eq('author_id', currentUserId).in('quoted_post_id', postIds)
    ]);
    myBookmarks = bmsRes.data?.map(b => b.post_id) || [];
    myLikes = lksRes.data?.map(l => l.post_id) || [];
    myReposts = repRes.data?.map(r => r.post_id) || [];
    myQuotes = quotesRes2.data?.map(q => q.quoted_post_id).filter(Boolean) as string[] || [];
  }

  return posts.map(p => ({
    ...p,
    computed_reposts_count: dynamicRepostCounts[p.id] || 0,
    computed_quotes_count: dynamicQuotesCounts[p.id] || 0,
    isBookmarked: myBookmarks.includes(p.id),
    isLiked: myLikes.includes(p.id),
    hasReposted: myReposts.includes(p.id),
    hasQuoted: myQuotes.includes(p.id)
  }));
};

// Bookmark a post
export const bookmarkPostAction = createServerFn({ method: 'POST' }).handler(async ({ data: { profileId, postId } }: { data: { profileId: string; postId: string } }) => {
  const { error } = await supabase
    .from('bookmarks')
    .insert([{ profile_id: profileId, post_id: postId }]);
  if (error) throw new Error(error.message);
  return { success: true };
});

// Unbookmark a post
export const unbookmarkPostAction = createServerFn({ method: 'POST' }).handler(async ({ data: { profileId, postId } }: { data: { profileId: string; postId: string } }) => {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('profile_id', profileId)
    .eq('post_id', postId);
  if (error) throw new Error(error.message);
  return { success: true };
});

// Like a post
export const likePostAction = async ({ data: { profileId, postId } }: { data: { profileId: string; postId: string } }) => {
  const { error } = await supabase
    .from('likes')
    .insert([{ profile_id: profileId, post_id: postId }]);
  if (error && error.code !== '23505') throw new Error(error.message);
  return { success: true };
};

// Unlike a post
export const unlikePostAction = async ({ data: { profileId, postId } }: { data: { profileId: string; postId: string } }) => {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('profile_id', profileId)
    .eq('post_id', postId);
  if (error) throw new Error(error.message);
  return { success: true };
};

// Fetch a single profile
export const getProfile = createServerFn({ method: 'GET' }).handler(async ({ data: username }: { data: string }) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single();
  if (error) return null;
  return data;
});

// Fetch current user's profile
export const getCurrentProfile = createServerFn({ method: 'GET' }).handler(async () => {
  const { data: { session } } = await getCachedSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  
  if (error) return null;
  return data;
});


// Enroll user in a bootcamp
export const enrollUserAction = createServerFn({ method: 'POST' }).handler(async ({ data: { bootcampId, profileId } }: { data: { bootcampId: string; profileId: string } }) => {
  const { data, error } = await supabase
    .from('enrollments')
    .insert([{ bootcamp_id: bootcampId, profile_id: profileId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
});

// Fetch learners for a bootcamp
export const getBootcampLearners = async (bootcampId: string) => {
  const { data, error } = await supabase
    .from('enrollments')
    .select('created_at, profiles(*)')
    .eq('bootcamp_id', bootcampId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error("Error fetching learners:", error);
    return [];
  }
  return data || [];
};

// Create a new post
export const createPostAction = createServerFn({ method: 'POST' }).handler(async ({ data: payload }: { data: { author_id: string; content: string; media_urls?: string[]; quoted_post_id?: string; is_build_post?: boolean; bootcamp_id?: string } }) => {
  const { data, error } = await supabase
    .from('posts')
    .insert([payload])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
});

// Create a new note
export const createNoteAction = createServerFn({ method: 'POST' }).handler(async ({ data: payload }: { data: any }) => {
  const { data, error } = await supabase
    .from('notes')
    .insert([payload])
    .select()
    .single();
  if (error) {
    if (error.code === '42P01') {
      throw new Error("The 'notes' table doesn't exist in Supabase yet.");
    }
    throw new Error(error.message);
  }
  return data;
});

// Update an existing note
export const updateNoteAction = createServerFn({ method: 'POST' }).handler(async ({ data: { id, updates } }: { data: { id: string; updates: any } }) => {
  const { data, error } = await supabase
    .from('notes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
});

// Delete a note
export const deleteNoteAction = async ({ data: { noteId } }: { data: { noteId: string } }) => {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId);
  if (error) throw new Error(error.message);
  return { success: true };
};

// Update profile
export const updateProfileAction = createServerFn({ method: 'POST' }).handler(async ({ data: { id, updates } }: { data: { id: string; updates: any } }) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
});

// Follow a user
export const followUserAction = createServerFn({ method: 'POST' }).handler(async ({ data: { followerId, followingId } }: { data: { followerId: string; followingId: string } }) => {
  const { error } = await supabase
    .from('follows')
    .insert([{ follower_id: followerId, following_id: followingId }]);
  if (error) throw new Error(error.message);
  return { success: true };
});

// Unfollow a user
export const unfollowUserAction = createServerFn({ method: 'POST' }).handler(async ({ data: { followerId, followingId } }: { data: { followerId: string; followingId: string } }) => {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw new Error(error.message);
  return { success: true };
});

// Fetch profiles that follow the current user
export const getFollowers = async () => {
  const { data: { session } } = await getCachedSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('follows')
    .select('profiles:follower_id(*)')
    .eq('following_id', session.user.id);

  if (error) {
    console.error("Error fetching followers:", error);
    return [];
  }
  return data?.map(f => f.profiles) || [];
};
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getQuests = async () => {
  const { data: { session } } = await getCachedSession();
  if (!session) return [];

  const TODAY_QUESTS = [
    { id: 'quest_login', title: 'Login', description: 'Log in to Zero Club today.', reward_xp: 100, icon_name: 'Rocket', criteria_type: 'login', criteria_count: 1 },
    { id: 'quest_post', title: 'Make your first post for the day', description: 'Share something with the community.', reward_xp: 100, icon_name: 'Share2', criteria_type: 'post_today', criteria_count: 1 },
    { id: 'quest_comment', title: 'Comment on someone\'s post', description: 'Engage with other builders.', reward_xp: 50, icon_name: 'Users', criteria_type: 'comment', criteria_count: 1 },
    { id: 'quest_quote', title: 'Quote someone else post', description: 'Share a post with your thoughts.', reward_xp: 50, icon_name: 'Star', criteria_type: 'quote', criteria_count: 1 },
    { id: 'quest_club', title: 'Create your private club and invite up to 20 friends to join', description: 'Build your own community.', reward_xp: 200, icon_name: 'Trophy', criteria_type: 'club', criteria_count: 20 }
  ];

  // Fetch only posts created today in local timezone
  const localTodayStart = new Date();
  localTodayStart.setHours(0, 0, 0, 0);
  const localTodayStartIso = localTodayStart.toISOString();

  // Fetch user stats for progress calculation
  const [postsCount, commentsCount, quotesCount, userClubsRes] = await Promise.all([
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', session.user.id)
      .gte('created_at', localTodayStartIso),
    supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', session.user.id)
      .gte('created_at', localTodayStartIso),
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', session.user.id)
      .not('quoted_post_id', 'is', null)
      .gte('created_at', localTodayStartIso),
    supabase
      .from('clubs')
      .select('id')
      .eq('creator_id', session.user.id)
  ]);

  let clubMembersCount = 0;
  if (userClubsRes.data && userClubsRes.data.length > 0) {
    const clubIds = userClubsRes.data.map(c => c.id);
    const { count } = await supabase
      .from('club_members')
      .select('club_id', { count: 'exact', head: true })
      .in('club_id', clubIds);
    clubMembersCount = count || 0;
  }

  return TODAY_QUESTS.map(q => {
    let progress = 0;
    if (q.criteria_type === 'login') progress = 1;
    if (q.criteria_type === 'post_today') progress = postsCount.count || 0;
    if (q.criteria_type === 'comment') progress = commentsCount.count || 0;
    if (q.criteria_type === 'quote') progress = quotesCount.count || 0;
    if (q.criteria_type === 'club') progress = clubMembersCount;

    const dateStr = getLocalDateString();
    const claimKey = `quest_claimed_${session.user.id}_${q.id}_${dateStr}`;
    const isClaimed = typeof window !== 'undefined' ? localStorage.getItem(claimKey) === 'true' : false;

    return {
      ...q,
      progress: Math.min(progress, q.criteria_count),
      isCompleted: progress >= q.criteria_count,
      isClaimed: isClaimed
    };
  });
};

// Claim a quest reward
export const claimQuestRewardAction = async ({ data: questId }: { data: string }) => {
  const { data: { session } } = await getCachedSession();
  if (!session) throw new Error("Unauthorized");

  const dateStr = getLocalDateString();
  const claimKey = `quest_claimed_${session.user.id}_${questId}_${dateStr}`;
  
  if (typeof window !== 'undefined' && localStorage.getItem(claimKey) === 'true') {
    throw new Error("Quest already claimed today!");
  }

  // Mock successful claim since DB table doesn't exist
  let reward = 50;
  if (questId === 'quest_login' || questId === 'quest_post') reward = 100;
  if (questId === 'quest_club') reward = 200;
  
  // Add XP to user profile
  const { data: profile } = await supabase.from('profiles').select('xp').eq('id', session.user.id).single();
  const currentXp = profile?.xp || 0;
  
  // Award XP per quest claimed
  await supabase
    .from('profiles')
    .update({ 
      xp: currentXp + reward
    })
    .eq('id', session.user.id);
    
  if (typeof window !== 'undefined') {
    localStorage.setItem(claimKey, 'true');
  }

  return { success: true, reward };
};

// Send a message
export const sendMessageAction = async ({ receiverId, content, reply_to_id }: { receiverId: string; content: string; reply_to_id?: string }) => {
  const { data: { session } } = await getCachedSession();
  const user = session?.user;
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from('messages')
    .insert([{ 
      sender_id: user.id, 
      receiver_id: receiverId, 
      content,
      reply_to_id
    }])
    .select()
    .single();
  
  if (error) throw new Error(error.message);
  return data;
};

// Fetch messages for a conversation
export const getMessages = async (otherUserId: string) => {
  const { data: { session } } = await getCachedSession();
  const user = session?.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('*, profiles:sender_id(username, avatar_url, full_name)')
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
    .not('content', 'like', 'CLUB_REQUEST:%')
    .not('content', 'eq', 'DISMISSED_CLUB_REQUEST')
    .order('created_at', { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }
  
  return (data || []).filter(m => !m.content?.startsWith('CLUB_REQUEST:') && m.content !== 'DISMISSED_CLUB_REQUEST');
};

// Fetch all conversations for current user
export const getConversations = async () => {
  const { data: { session } } = await getCachedSession();
  const user = session?.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:sender_id(id, username, full_name, avatar_url, updated_at), receiver:receiver_id(id, username, full_name, avatar_url, updated_at)')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .not('content', 'like', 'CLUB_REQUEST:%')
    .not('content', 'eq', 'DISMISSED_CLUB_REQUEST')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return [];

  // Sort messages descending explicitly by created_at in JavaScript to guarantee that the newest message is always processed first
  const sortedData = [...(data || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Filter out club requests completely in Javascript
  const validData = sortedData.filter(m => !m.content?.startsWith('CLUB_REQUEST:') && m.content !== 'DISMISSED_CLUB_REQUEST');

  // Track which conversations have unread messages at the individual message level
  const unreadConversations = new Set();
  validData.forEach(msg => {
    const otherUserId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      
    if (!msg.is_read && msg.receiver_id === user.id) {
      unreadConversations.add(otherUserId);
    }
  });

  const conversationsMap = new Map();
  validData.forEach(msg => {
    const otherUser = msg.sender_id === user.id ? msg.receiver : msg.sender;
    if (otherUser) {
      if (!conversationsMap.has(otherUser.id)) {
        const lastSeen = otherUser.updated_at ? new Date(otherUser.updated_at).getTime() : 0;
        const now = Date.now();
        const diffMins = (now - lastSeen) / (1000 * 60);
        
        let status = 'offline';
        if (diffMins < 5) status = 'online';
        else if (diffMins < 15) status = 'away';

        conversationsMap.set(otherUser.id, {
          id: otherUser.id,
          user: otherUser,
          lastMessage: msg.content,
          time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          unread: unreadConversations.has(otherUser.id),
          status
        });
      }
    }
  });

  return Array.from(conversationsMap.values());
};

// Edit a message
export const editMessageAction = async ({ messageId, content }: { messageId: string; content: string }) => {
  const { data: { session } } = await getCachedSession();
  const user = session?.user;
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from('messages')
    .update({ content })
    .eq('id', messageId)
    .eq('sender_id', user.id)
    .select()
    .single();
  
  if (error) throw new Error(error.message);
  return data;
};

// Search across posts, bootcamps, and tutors
export const searchEverything = async (query: string) => {
  if (!query || query.length < 2) return { posts: [], bootcamps: [], profiles: [] };
  
  const q = `%${query}%`;
  
  // 1. Search Posts
  const { data: posts } = await supabase
    .from('posts')
    .select('*, profiles(username, full_name, avatar_url)')
    .or(`content.ilike.${q}`)
    .order('created_at', { ascending: false })
    .limit(20);

  // 2. Search Bootcamps
  const { data: bootcamps } = await supabase
    .from('bootcamps')
    .select('*, profiles(username, full_name, avatar_url)')
    .or(`title.ilike.${q},description.ilike.${q},category.ilike.${q}`)
    .eq('status', 'active')
    .limit(10);

  // 3. Search Profiles (Tutors & Builders)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.${q},full_name.ilike.${q},bio.ilike.${q}`)
    .limit(10);

  return {
    posts: posts || [],
    bootcamps: bootcamps || [],
    profiles: profiles || []
  };
};


