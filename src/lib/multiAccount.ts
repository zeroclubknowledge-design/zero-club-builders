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
  // Set the session using the saved tokens
  const { error } = await supabase.auth.setSession({
    access_token: account.session.access_token,
    refresh_token: account.session.refresh_token
  });

  if (error) {
    throw error;
  }
  
  // Reload the window to clear all app state and query cache
  window.location.reload();
}

export function prepareAddAccount() {
  // Clear the local storage keys related to supabase auth to log out locally 
  // WITHOUT invalidating the current session on the server
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      localStorage.removeItem(key);
    }
  });
  
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
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
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
