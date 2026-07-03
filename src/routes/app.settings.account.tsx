import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, User, Mail, Phone, Globe, Trash2, ChevronRight, AlertCircle, Check, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";
import { Users, LogOut, PlusCircle } from "lucide-react";
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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b border-border">
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
            <DrawerContent hideClose className="h-[90vh] border-none bg-background p-0">
              <div className="flex h-full flex-col p-6">
                <DrawerHeader className="mb-8 flex flex-row items-center justify-between space-y-0">
                  <DrawerTitle className="text-xl font-bold">Change username</DrawerTitle>
                  <button 
                    onClick={handleUpdateUsername}
                    disabled={loading || !newUsername.trim() || newUsername === profile?.username}
                    className="rounded-full bg-primary px-5 py-1.5 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50 disabled:grayscale"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Done"}
                  </button>
                </DrawerHeader>

                <div className="space-y-6">
                  <div className="relative">
                    <label className="text-xs text-primary ml-1 mb-2 block">Username</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-lg">@</span>
                      <input 
                        autoFocus
                        type="text" 
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        className="w-full rounded-2xl bg-accent border border-border p-4 pl-9 text-lg font-medium text-foreground outline-none focus:ring-2 ring-primary/50 transition-all"
                        placeholder="new_handle"
                      />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed px-1">
                      Your username is your unique identity on Zero Club. Choose something that represents your builder spirit!
                    </p>
                  </div>
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
            <DrawerContent hideClose className="h-[90vh] border-none bg-background p-0">
              <div className="flex h-full flex-col p-6">
                <DrawerHeader className="mb-8 flex flex-row items-center justify-between space-y-0">
                  <DrawerTitle className="text-xl font-bold">Account Type</DrawerTitle>
                  <button 
                    onClick={handleUpdateAccountType}
                    disabled={loading || newAccountType === profile?.account_type}
                    className="rounded-full bg-primary px-5 py-1.5 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50 disabled:grayscale"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </button>
                </DrawerHeader>

                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed px-1">
                    Select your primary role on Zero Club. This will tailor your experience and access to features.
                  </p>
                  
                  <div className="grid gap-3">
                    {["Learner", "Tutor", "Institution"].map((type) => (
                      <button
                        key={type}
                        onClick={() => setNewAccountType(type)}
                        className={`flex items-center justify-between rounded-2xl border p-4 transition-all ${
                          newAccountType === type 
                            ? "border-primary bg-primary/5 shadow-sm" 
                            : "border-border bg-card hover:bg-accent/50"
                        }`}
                      >
                        <span className={`font-bold ${newAccountType === type ? "text-primary" : "text-foreground"}`}>
                          {type}
                        </span>
                        {newAccountType === type && <Check className="h-5 w-5 text-primary" />}
                      </button>
                    ))}
                  </div>
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
            <DrawerContent hideClose className="h-[90vh] border-none bg-background p-0">
              <div className="flex h-full flex-col p-6 overflow-y-auto">
                <DrawerHeader className="mb-6 flex flex-row items-center justify-between space-y-0 px-0">
                  <DrawerTitle className="text-xl font-bold">Switch accounts</DrawerTitle>
                </DrawerHeader>

                <div className="space-y-4">
                  {savedAccounts.map((account) => {
                    const isCurrent = account.id === profile?.id;
                    return (
                      <div key={account.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 transition-all hover:bg-accent/50">
                        <button
                          className="flex flex-1 items-center gap-3 text-left"
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
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/50 bg-accent flex items-center justify-center text-muted-foreground font-bold text-sm">
                            {account.avatar_url ? (
                              <img src={account.avatar_url} className="h-full w-full object-cover" />
                            ) : (
                              (account.full_name || account.username || "U").charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="font-bold flex items-center gap-2">
                              {account.username}
                              {isCurrent && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">Active</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">{account.email}</div>
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
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors ml-2"
                            title="Log out of this account"
                          >
                            <LogOut className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={() => prepareAddAccount()}
                    className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-transparent p-4 text-left transition-all hover:bg-accent hover:border-solid hover:border-primary/50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                      <PlusCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold">Add existing account</div>
                      <div className="text-xs text-muted-foreground">Log into another Zero Club account</div>
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
