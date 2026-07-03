import { supabase } from "./supabase";

export interface SavedAccount {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  session: {
    access_token: string;
    refresh_token: string;
  };
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

export async function switchAccount(account: SavedAccount) {
  // Proactively save current account before switching to avoid losing its latest tokens
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
        session: {
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token
        }
      });
    } catch (e) {
      console.error("Failed to save current account state", e);
    }
  }

  // Sign out locally to clear the current active user state cleanly
  await supabase.auth.signOut({ scope: 'local' });

  // Set the session using the saved tokens
  const { error } = await supabase.auth.setSession({
    access_token: account.session.access_token,
    refresh_token: account.session.refresh_token
  });

  if (error) {
    console.error("Failed to switch account - session may have expired globally", error);
    // If the token is completely invalid on the server (e.g. revoked), we have no choice
    // but to prompt them to sign in to that account again. We can remove the invalid account
    // from the switcher to keep it clean.
    removeSavedAccount(account.id);
    window.location.href = "/signin";
    return;
  }
  
  // Reload the window to clear all app state and query cache and boot up with the new session
  window.location.href = window.location.pathname;
}

export async function prepareAddAccount() {
  // Proactively save the active session just to be absolutely certain it isn't lost
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
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token
        }
      });
    } catch (e) {
      console.error("Failed to proactively save account", e);
    }
  }

  // Log out locally to allow a new account to sign in, WITHOUT invalidating the server token
  await supabase.auth.signOut({ scope: 'local' });
  
  window.location.href = "/signin";
}

export async function logoutCurrentAccount(userId: string) {
  removeSavedAccount(userId);
  const accounts = getSavedAccounts();
  
  if (accounts.length > 0) {
    // If there are other accounts, switch to the first one available
    await switchAccount(accounts[0]);
  } else {
    // If no accounts left, do a full sign out
    await supabase.auth.signOut();
    window.location.href = "/signin";
  }
}

// Keep the saved tokens fresh when Supabase automatically refreshes them
export function setupMultiAccountSync() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      // We wrap the profile fetch in a try/catch so we don't crash the auth listener
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
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token
          }
        });
      } catch (e) {
        console.error("Failed to sync account profile details", e);
      }
    }
  });
}
