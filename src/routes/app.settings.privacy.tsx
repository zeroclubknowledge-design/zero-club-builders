import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Eye, MessageSquare, UserMinus, Shield, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/settings/privacy")({
  component: PrivacySettings,
});

function PrivacySettings() {
  const items = [
    { icon: Eye, title: "Audience and tagging", desc: "Manage what information you allow others to see" },
    { icon: MessageSquare, title: "Direct Messages", desc: "Manage who can send you private messages" },
    { icon: UserMinus, title: "Mute and block", desc: "Manage the accounts and words that you've muted or blocked" },
    { icon: Shield, title: "Data sharing", desc: "Control how your data is shared with partners" },
  ];

  const [hideClubs, setHideClubs] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase
          .from("profiles")
          .select("hide_clubs_unless_following")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setHideClubs(data.hide_clubs_unless_following || false);
            }
            setLoading(false);
          });
      }
    });
  }, []);

  const handleToggleHideClubs = async () => {
    const newValue = !hideClubs;
    setHideClubs(newValue);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from("profiles")
        .update({ hide_clubs_unless_following: newValue })
        .eq("id", session.user.id);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b border-border">
        <Link to="/app/settings" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Privacy and safety</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
        <div className="mt-4 flex flex-col border-b border-border">
          {items.map((item) => (
            <button key={item.title} className="flex items-start gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
              <div className="mt-1 shrink-0">
                <item.icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-foreground">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
            </button>
          ))}
        </div>

        <div className="mt-6 px-5">
          <h2 className="text-sm text-muted-foreground mb-4">Clubs Privacy</h2>
          <div className="flex items-center justify-between py-4 border-b border-border">
            <div className="flex-1 pr-4">
              <h3 className="text-[15px] font-bold text-foreground">Hide clubs unless following</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                When turned on, other users will only be able to see the clubs you have joined if they are following you.
              </p>
            </div>
            <button 
              onClick={handleToggleHideClubs}
              disabled={loading}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${hideClubs ?'bg-primary' : 'bg-muted'}`}
            >
              <span className="sr-only">Hide clubs unless following</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${hideClubs ?'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
