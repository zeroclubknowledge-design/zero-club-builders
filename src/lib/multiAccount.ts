import { supabase } from "./supabase";

export interface SavedAccount {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  session: any; // Store the full Supabase Session object
}

const STORAGE_KEY = "zero_club_multi_accounts";

export function getSavedAccounts(): SavedAccount[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to parse saved accounts", e);
    return [];
  }
}

export function saveAccounts(accounts: SavedAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function addOrUpdateSavedAccount(account: SavedAccount) {
  const accounts = getSavedAccounts();
  const existingIndex = accounts.findIndex(a => a.id === account.id);
  
  if (existingIndex >= 0) {
    accounts[existingIndex] = { ...accounts[existingIndex], ...account };
  } else {
    accounts.push(account);
  }
  
  saveAccounts(accounts);
}

export function removeSavedAccount(id: string) {
  const accounts = getSavedAccounts();
  saveAccounts(accounts.filter(a => a.id !== id));
}

function getSupabaseStorageKey() {
  return Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
}

export async function switchAccount(account: SavedAccount) {
  // Proactively save current account before switching
  const { data: { session: currentSession } } = await supabase.auth.getSession();
  if (currentSession && currentSession.user.id !== account.id) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', currentSession.user.id)
        .maybeSingle();

      addOrUpdateSavedAccount({
        id: currentSession.user.id,
        email: currentSession.user.email || "",
        username: profile?.username || "unknown",
        full_name: profile?.full_name || "",
        avatar_url: profile?.avatar_url || "",
        session: currentSession
      });
    } catch (e) {
      console.error("Failed to save current account state", e);
    }
  }

  const storageKey = getSupabaseStorageKey();

  if (storageKey && account.session.user) {
    // Direct localStorage injection bypasses all Supabase cross-session state bugs!
    localStorage.setItem(storageKey, JSON.stringify(account.session));
    window.location.href = "/app";
    return;
  }

  // Fallback for older accounts that only saved access_token & refresh_token
  const { error } = await supabase.auth.setSession({
    access_token: account.session.access_token,
    refresh_token: account.session.refresh_token
  });

  if (error) {
    console.error("Failed to switch account", error);
    removeSavedAccount(account.id);
    window.location.href = "/signin";
    return;
  }
  
  window.location.href = "/app";
}

export async function prepareAddAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();

      addOrUpdateSavedAccount({
        id: session.user.id,
        email: session.user.email || "",
        username: profile?.username || "unknown",
        full_name: profile?.full_name || "",
        avatar_url: profile?.avatar_url || "",
        session: session
      });
    } catch (e) {
      console.error("Failed to proactively save account", e);
    }
  }

  // Do NOT sign out. Just redirect to signin with a special flag.
  window.location.href = "/signin?add_account=true";
}

export async function logoutCurrentAccount(userId: string) {
  removeSavedAccount(userId);
  const accounts = getSavedAccounts();
  
  if (accounts.length > 0) {
    await switchAccount(accounts[0]);
  } else {
    await supabase.auth.signOut();
    window.location.href = "/signin";
  }
}

export function setupMultiAccountSync() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, full_name, avatar_url')
          .eq('id', session.user.id)
          .maybeSingle();

        addOrUpdateSavedAccount({
          id: session.user.id,
          email: session.user.email || "",
          username: profile?.username || "unknown",
          full_name: profile?.full_name || "",
          avatar_url: profile?.avatar_url || "",
          session: session
        });
      } catch (e) {
        console.error("Failed to sync account profile details", e);
      }
    }
  });
}
