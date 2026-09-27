import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, User, Mail, Globe, Trash2, ChevronRight, AlertCircle, Check, Loader2 } from "@/components/icons/glyphs";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";
import { Users, LogOut, PlusCircle } from "@/components/icons/glyphs";
import { getSavedAccounts, switchAccount, prepareAddAccount, removeSavedAccount, SavedAccount } from "@/lib/multiAccount";

export const Route = createFileRoute("/app/settings/account")({
  component: AccountSettings,
});

function AccountSettings() {
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState<string>("");
  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAccountTypeSheetOpen, setIsAccountTypeSheetOpen] = useState(false);
  const [isAccountsSheetOpen, setIsAccountsSheetOpen] = useState(false);
  const [newAccountType, setNewAccountType] = useState<string>("");
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email || "");
        supabase.from('profiles').select('*').eq('id', user.id).single()
          .then(({ data }) => {
            setProfile(data);
            setNewUsername(data?.username || "");
            setNewAccountType(data?.account_type || "Learner");
          });
      }
    });
    setSavedAccounts(getSavedAccounts());
  }, []);

  const handleUpdateUsername = async () => {
    if (!newUsername.trim() || newUsername === profile?.username) {
      setIsSheetOpen(false);
      return;
    }
    
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername.toLowerCase() })
      .eq('id', profile.id);
      
    if (error) {
      if (error.code === '23505') {
        toast.error("This username is already taken! ️");
      } else {
        toast.error(error.message);
      }
    } else {
      setProfile({ ...profile, username: newUsername.toLowerCase() });
      toast.success("Username updated!");
      setIsSheetOpen(false);
    }
    setLoading(false);
  };

  const handleUpdateAccountType = async () => {
    if (newAccountType === profile?.account_type) {
      setIsAccountTypeSheetOpen(false);
      return;
    }
    
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ account_type: newAccountType })
      .eq('id', profile.id);
      
    if (error) {
      toast.error(error.message);
    } else {
      setProfile({ ...profile, account_type: newAccountType });
      toast.success(`Account type switched to ${newAccountType}!`);
      setIsAccountTypeSheetOpen(false);
    }
    setLoading(false);
  };

  const accountInfo = [
    { label: "Username", value: profile?.username ? `${getFirstName(profile)}` : "...", icon: User },
    { label: "Email", value: email || "...", icon: Mail },
    { label: "Country", value: profile?.location || "Nigeria", icon: Globe },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center">
        <Link to="/app/settings" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Your account</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <section className="p-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            See information about your account, download an archive of your data, or learn about your account deactivation options.
          </p>
        </section>

        <section className="flex flex-col border-b border-border">
          <Drawer open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <DrawerTrigger asChild>
              <button className="flex items-center gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
                <div className="shrink-0">
                  <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-muted-foreground">Username</div>
                  <div className="text-[15px] font-medium text-foreground">{profile?.username ? `${getFirstName(profile)}` : "..."}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </DrawerTrigger>
            <DrawerContent desktopVariant="panel" hideClose className="h-[90vh] border-none bg-background p-0">
              <div className="flex h-full flex-col">
                <DrawerHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-5 pb-3 pt-1 text-left sm:px-5 sm:pb-3 sm:pt-1">
                  <DrawerTitle className="font-display text-[20px] font-semibold leading-tight sm:text-[20px]">Change username</DrawerTitle>
                  <button
                    onClick={handleUpdateUsername}
                    disabled={loading || !newUsername.trim() || newUsername === profile?.username}
                    className="flex h-9 min-w-[72px] items-center justify-center rounded-full bg-foreground px-4 text-[14px] font-semibold text-background transition active:scale-95 disabled:opacity-40"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Done"}
                  </button>
                </DrawerHeader>

                <div className="px-5 pt-2">
                  <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Username</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">@</span>
                    <input
                      autoFocus
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card pl-7 pr-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                      placeholder="new_handle"
                    />
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    Letters, numbers and underscores only. Your username is your unique identity on Zero Club.
                  </p>
                </div>
              </div>
            </DrawerContent>
          </Drawer>

          <button className="flex items-center gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
            <div className="shrink-0">
              <Mail className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground">Email</div>
              <div className="text-[15px] font-medium text-foreground">{email || "..."}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <button className="flex items-center gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
            <div className="shrink-0">
              <Globe className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground">Country</div>
              <div className="text-[15px] font-medium text-foreground">{profile?.location || "Nigeria"}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <Drawer open={isAccountTypeSheetOpen} onOpenChange={setIsAccountTypeSheetOpen}>
            <DrawerTrigger asChild>
              <button className="flex items-center gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
                <div className="shrink-0">
                  <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-muted-foreground">Account Type</div>
                  <div className="text-[15px] font-medium text-foreground">{profile?.account_type || "Learner"}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </DrawerTrigger>
            <DrawerContent desktopVariant="panel" hideClose className="h-[90vh] border-none bg-background p-0">
              <div className="flex h-full flex-col">
                <DrawerHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-5 pb-3 pt-1 text-left sm:px-5 sm:pb-3 sm:pt-1">
                  <div className="min-w-0">
                    <DrawerTitle className="font-display text-[20px] font-semibold leading-tight sm:text-[20px]">Account type</DrawerTitle>
                    <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                      Choose your primary role on Zero Club. This tailors your experience and the features you can access.
                    </p>
                  </div>
                  <button
                    onClick={handleUpdateAccountType}
                    disabled={loading || newAccountType === profile?.account_type}
                    className="flex h-9 min-w-[64px] shrink-0 items-center justify-center rounded-full bg-foreground px-4 text-[14px] font-semibold text-background transition active:scale-95 disabled:opacity-40"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </button>
                </DrawerHeader>

                <div className="space-y-2.5 px-5 pt-2">
                  {["Learner", "Tutor", "Institution"].map((type) => {
                    const selected = newAccountType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setNewAccountType(type)}
                        className={`flex w-full items-center justify-between rounded-2xl border-[1.5px] p-4 text-left transition-colors ${
                          selected
                            ? "border-[#cc208f] bg-[#cc208f]/[0.06]"
                            : "border-foreground/12 hover:bg-foreground/[0.04]"
                        }`}
                      >
                        <span className="text-[15px] font-semibold text-foreground">{type}</span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            selected ? "bg-[#cc208f]" : "border-[1.5px] border-foreground/25"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
          <Drawer open={isAccountsSheetOpen} onOpenChange={setIsAccountsSheetOpen}>
            <DrawerTrigger asChild>
              <button className="flex items-center gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
                <div className="shrink-0">
                  <Users className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-muted-foreground">Accounts</div>
                  <div className="text-[15px] font-medium text-foreground">Switch or add account</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </DrawerTrigger>
            <DrawerContent desktopVariant="panel" hideClose className="h-[90vh] border-none bg-background p-0">
              <div className="flex h-full flex-col overflow-y-auto">
                <DrawerHeader className="block space-y-0 px-5 pb-3 pt-1 text-left sm:px-5 sm:pb-3 sm:pt-1">
                  <DrawerTitle className="font-display text-[20px] font-semibold leading-tight sm:text-[20px]">Switch accounts</DrawerTitle>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    Tap an account to switch to it.
                  </p>
                </DrawerHeader>

                <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  {savedAccounts.map((account) => {
                    const isCurrent = account.id === profile?.id;
                    return (
                      <div key={account.id} className="flex items-center gap-3 py-3">
                        <button
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => {
                            if (isCurrent) {
                              setIsAccountsSheetOpen(false);
                            } else {
                              toast.loading("Switching accounts...");
                              switchAccount(account).catch(e => {
                                toast.dismiss();
                                toast.error("Failed to switch account: " + e.message);
                              });
                            }
                          }}
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">
                            {account.avatar_url ? (
                              <img src={account.avatar_url} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                            ) : (
                              (account.full_name || account.username || "U").charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-semibold text-foreground">{account.username}</span>
                              {isCurrent && (
                                <span className="shrink-0 rounded-full bg-[#1a7f4b]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#1a7f4b]">Active</span>
                              )}
                            </div>
                            <div className="truncate text-[13px] text-muted-foreground">{account.email}</div>
                          </div>
                        </button>
                        {!isCurrent && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSavedAccount(account.id);
                              setSavedAccounts(getSavedAccounts());
                              toast.success("Account removed");
                            }}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#e0245e]/10 hover:text-[#e0245e]"
                            title="Log out of this account"
                            aria-label="Log out of this account"
                          >
                            <LogOut className="h-[18px] w-[18px]" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={() => prepareAddAccount()}
                    className="mt-2 flex w-full items-center gap-3 rounded-2xl py-3 text-left transition-colors hover:bg-foreground/[0.04]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-foreground/25 text-foreground">
                      <PlusCircle className="h-[22px] w-[22px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-foreground">Add existing account</div>
                      <div className="text-[13px] text-muted-foreground">Log into another Zero Club account</div>
                    </div>
                  </button>
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </section>

        <section className="mt-4 flex flex-col border-b border-white/5">
          <button className="flex items-start gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
            <div className="mt-1 shrink-0 text-muted-foreground">
              <AlertCircle className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-bold text-foreground">Download an archive of your data</h3>
              <p className="mt-1 text-xs text-muted-foreground">Get a copy of the information Zero Club has about you.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
          </button>

          <button className="flex items-start gap-5 px-5 py-4 transition active:bg-white/5 text-left group text-destructive">
            <div className="mt-1 shrink-0">
              <Trash2 className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-bold">Deactivate your account</h3>
              <p className="mt-1 text-xs text-muted-foreground">Find out how you can deactivate your Zero Club account.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
          </button>
        </section>
      </div>
    </div>
  );
}
