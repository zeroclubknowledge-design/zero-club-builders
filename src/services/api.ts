import { createServerFn } from '@tanstack/react-start';
import { supabase } from './supabase';
import { getCachedSession } from './auth';

// Fetch all active bootcamps
export const getBootcamps = async () => {
  const { data: bootcamps, error } = await supabase
    .from('bootcamps')
    .select('*')
    .ilike('status', 'active')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to fetch bootcamps:', error);
    throw error;
  }
  if (!bootcamps?.length) return [];

  const creatorIds = [...new Set(bootcamps.map((bootcamp: any) => bootcamp.creator_id).filter(Boolean))];
  const bootcampIds = bootcamps.map((bootcamp: any) => bootcamp.id);
  const [{ data: creators }, { data: enrollments }, { data: modules }] = await Promise.all([
    supabase.from('profiles').select('id, username, full_name, avatar_url, account_type').in('id', creatorIds),
    supabase.from('enrollments').select('bootcamp_id').in('bootcamp_id', bootcampIds),
    supabase.from('modules').select('id, bootcamp_id').in('bootcamp_id', bootcampIds),
  ]);

  const creatorMap = new Map((creators || []).map((creator: any) => [creator.id, creator]));
  const enrollmentCounts = new Map<string, number>();
  const moduleCounts = new Map<string, number>();
  (enrollments || []).forEach((item: any) => enrollmentCounts.set(item.bootcamp_id, (enrollmentCounts.get(item.bootcamp_id) || 0) + 1));
  (modules || []).forEach((item: any) => moduleCounts.set(item.bootcamp_id, (moduleCounts.get(item.bootcamp_id) || 0) + 1));

  return bootcamps.map((bootcamp: any) => ({
    ...bootcamp,
    profiles: creatorMap.get(bootcamp.creator_id) || null,
    enrollments: [{ count: enrollmentCounts.get(bootcamp.id) || 0 }],
    modules: [{ count: moduleCounts.get(bootcamp.id) || 0 }],
  }));
};

// Fetch bootcamps created by current user
export const getTutorBootcamps = async () => {
  const { data: { session } } = await getCachedSession();
  if (!session) return [];

  // No profiles embed here on purpose. Bootcamps link to profiles twice
  // (creator_id and assigned_tutor_id), so an embed is ambiguous and the whole
  // query fails - which used to look like "you have no bootcamps". The creator
  // is fetched separately instead, exactly like the public bootcamp list does.
  const { data: bootcamps, error } = await supabase
    .from('bootcamps')
    .select('*')
    .or(`creator_id.eq.${session.user.id},assigned_tutor_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Could not load your bootcamps:', error);
    throw new Error(error.message || 'Could not load your bootcamps');
  }
  if (!bootcamps?.length) return [];

  const creatorIds = [...new Set(bootcamps.map((bootcamp: any) => bootcamp.creator_id).filter(Boolean))];
  const bootcampIds = bootcamps.map((bootcamp: any) => bootcamp.id);

  const [{ data: creators }, { data: enrollments }] = await Promise.all([
    supabase.from('profiles').select('id, username, full_name, avatar_url, account_type').in('id', creatorIds),
    supabase.from('enrollments').select('bootcamp_id').in('bootcamp_id', bootcampIds),
  ]);

  const creatorMap = new Map((creators || []).map((creator: any) => [creator.id, creator]));
  const enrollmentCounts = new Map<string, number>();
  (enrollments || []).forEach((row: any) =>
    enrollmentCounts.set(row.bootcamp_id, (enrollmentCounts.get(row.bootcamp_id) || 0) + 1),
  );

  return bootcamps.map((bootcamp: any) => ({
    ...bootcamp,
    profiles: creatorMap.get(bootcamp.creator_id) || null,
    enrollments: [{ count: enrollmentCounts.get(bootcamp.id) || 0 }],
  }));
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
      .select('*, profiles!bootcamps_creator_id_fkey(username, full_name, avatar_url), club:clubs(id)')
      .in('creator_id', tutorIds)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error(error);
      return [];
    }
    return data ?? [];
  };

// Create a new bootcamp (for tutors)
export const createBootcampAction = createServerFn({ method: 'POST' }).inputValidator((data: any) => data).handler(async ({ data: payload }) => {
  const { data, error } = await supabase
    .from('bootcamps')
    .insert([payload])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
});

// Delete a bootcamp
export const deleteBootcampAction = createServerFn({ method: 'POST' }).inputValidator((data: { bootcampId: string }) => data).handler(async ({ data: { bootcampId } }) => {
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
    .select('*, profiles!bootcamps_creator_id_fkey(username, full_name, avatar_url, account_type)')
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
export const bookmarkPostAction = createServerFn({ method: 'POST' }).inputValidator((data: { profileId: string; postId: string }) => data).handler(async ({ data: { profileId, postId } }) => {
  const { error } = await supabase
    .from('bookmarks')
    .insert([{ profile_id: profileId, post_id: postId }]);
  if (error) throw new Error(error.message);
  return { success: true };
});

// Unbookmark a post
export const unbookmarkPostAction = createServerFn({ method: 'POST' }).inputValidator((data: { profileId: string; postId: string }) => data).handler(async ({ data: { profileId, postId } }) => {
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
export const getProfile = createServerFn({ method: 'GET' }).inputValidator((data: string) => data).handler(async ({ data: username }) => {
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
export const enrollUserAction = createServerFn({ method: 'POST' }).inputValidator((data: { bootcampId: string; profileId: string }) => data).handler(async ({ data: { bootcampId, profileId } }) => {
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
export const createPostAction = createServerFn({ method: 'POST' }).inputValidator((data: { author_id: string; content: string; media_urls?: string[]; quoted_post_id?: string; is_build_post?: boolean; bootcamp_id?: string }) => data).handler(async ({ data: payload }) => {
  const { data, error } = await supabase
    .from('posts')
    .insert([payload])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
});

// Create a new note
export const createNoteAction = createServerFn({ method: 'POST' }).inputValidator((data: any) => data).handler(async ({ data: payload }) => {
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
export const updateNoteAction = createServerFn({ method: 'POST' }).inputValidator((data: { id: string; updates: any }) => data).handler(async ({ data: { id, updates } }) => {
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
export const updateProfileAction = createServerFn({ method: 'POST' }).inputValidator((data: { id: string; updates: any }) => data).handler(async ({ data: { id, updates } }) => {
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
export const followUserAction = createServerFn({ method: 'POST' }).inputValidator((data: { followerId: string; followingId: string }) => data).handler(async ({ data: { followerId, followingId } }) => {
  const { error } = await supabase
    .from('follows')
    .insert([{ follower_id: followerId, following_id: followingId }]);
  if (error) throw new Error(error.message);
  return { success: true };
});

// Unfollow a user
export const unfollowUserAction = createServerFn({ method: 'POST' }).inputValidator((data: { followerId: string; followingId: string }) => data).handler(async ({ data: { followerId, followingId } }) => {
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

  const fallbackQuests = [
    { id: 'quest_login', title: 'Login', description: 'Log in to Zero Club today.', type: 'daily', reward_xp: 100, icon_name: 'Rocket', criteria_type: 'login', criteria_count: 1 },
    { id: 'quest_post', title: 'Make your first post for the day', description: 'Share something with the community.', type: 'daily', reward_xp: 100, icon_name: 'Share2', criteria_type: 'post_today', criteria_count: 1 },
    { id: 'quest_comment', title: 'Comment on someone\'s post', description: 'Engage with other builders.', type: 'daily', reward_xp: 50, icon_name: 'Users', criteria_type: 'comment', criteria_count: 1 },
    { id: 'quest_quote', title: 'Quote someone else post', description: 'Share a post with your thoughts.', type: 'daily', reward_xp: 50, icon_name: 'Star', criteria_type: 'quote', criteria_count: 1 },
    { id: 'quest_club', title: 'Create your private club and invite up to 20 friends to join', description: 'Build your own community.', type: 'milestone', reward_xp: 200, icon_name: 'Trophy', criteria_type: 'club', criteria_count: 20 }
  ];

  const { data: configuredQuests, error: questsError } = await supabase
    .from('quests')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  const quests = !questsError && configuredQuests?.length
    ? configuredQuests
        .filter((quest: any) => !quest.status || quest.status === 'active')
        .map((quest: any) => ({ ...quest, database_id: quest.id, id: quest.slug || quest.id }))
    : fallbackQuests;

  // Fetch only posts created today in local timezone
  const localTodayStart = new Date();
  localTodayStart.setHours(0, 0, 0, 0);
  const localTodayStartIso = localTodayStart.toISOString();

  // Fetch user stats for progress calculation
  const [postsCount, commentsCount, quotesCount, userClubsRes, totalPosts, totalComments, totalQuotes, followsCount, enrollmentsCount, shipsCount, profileResult] = await Promise.all([
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
      .eq('creator_id', session.user.id),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', session.user.id),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('profile_id', session.user.id),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', session.user.id).not('quoted_post_id', 'is', null),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', session.user.id),
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('profile_id', session.user.id),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', session.user.id).eq('is_build_post', true),
    supabase.from('profiles').select('bio').eq('id', session.user.id).maybeSingle(),
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

  const dateStr = getLocalDateString();
  const { data: claimedQuestEvents } = await supabase
    .from('xp_events')
    .select('source_key')
    .eq('profile_id', session.user.id)
    .eq('event_type', 'daily_quest');
  const claimedQuestKeys = new Set((claimedQuestEvents || []).map((event) => event.source_key));

  return quests.map((q: any) => {
    let progress = 0;
    if (q.criteria_type === 'login') progress = 1;
    if (q.criteria_type === 'post_today') progress = postsCount.count || 0;
    if (q.criteria_type === 'post') progress = totalPosts.count || 0;
    if (q.criteria_type === 'comment') progress = q.type === 'daily' ? (commentsCount.count || 0) : (totalComments.count || 0);
    if (q.criteria_type === 'quote') progress = q.type === 'daily' ? (quotesCount.count || 0) : (totalQuotes.count || 0);
    if (q.criteria_type === 'club') progress = clubMembersCount;
    if (q.criteria_type === 'follow') progress = followsCount.count || 0;
    if (q.criteria_type === 'enrollment') progress = enrollmentsCount.count || 0;
    if (q.criteria_type === 'ship') progress = shipsCount.count || 0;
    if (q.criteria_type === 'profile') progress = profileResult.data?.bio?.trim() ? 1 : 0;

    const claimKey = `quest_claimed_${session.user.id}_${q.id}_${dateStr}`;
    const isClaimed = claimedQuestKeys.has(`${q.id}:${dateStr}`)
      || claimedQuestKeys.has(q.id)
      || (typeof window !== 'undefined' && localStorage.getItem(claimKey) === 'true');

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

  const { data, error } = await supabase.rpc('claim_daily_xp_quest', { p_quest_id: questId });
  if (error) throw error;
  const reward = Number(data?.reward || 0);
    
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
          lastSenderId: msg.sender_id,
          time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          unread: unreadConversations.has(otherUser.id),
          status
        });
      }
    }
  });

  const conversations = Array.from(conversationsMap.values());

  // The protected is_admin flag is the source of truth for the official
  // support identity. This makes support available before a member has ever
  // sent a message, without creating millions of placeholder message rows.
  const { data: supportProfile } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, updated_at, is_admin")
    .eq("is_admin", true)
    .neq("id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!supportProfile) return conversations;

  const supportIndex = conversations.findIndex((conversation: any) => conversation.id === supportProfile.id);
  const existingSupport = supportIndex >= 0 ? conversations[supportIndex] : null;
  const supportConversation = existingSupport
    ? {
        ...existingSupport,
        user: { ...existingSupport.user, ...supportProfile },
        isSupport: true,
        pinned: true,
      }
    : {
        id: supportProfile.id,
        user: supportProfile,
        lastMessage: "Message the Zero Club team for help",
        lastSenderId: null,
        time: "",
        unread: false,
        status: "support",
        isSupport: true,
        pinned: true,
      };

  return [supportConversation, ...conversations.filter((conversation: any) => conversation.id !== supportProfile.id)];
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
    .select('*, profiles!bootcamps_creator_id_fkey(username, full_name, avatar_url)')
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
