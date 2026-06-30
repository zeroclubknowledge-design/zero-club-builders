import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Plus, Users, LayoutGrid, GraduationCap, Building2 } from "lucide-react";

export const Route = createFileRoute("/app/institution-studio/")({
  component: InstitutionStudioIndex,
});

function InstitutionStudioIndex() {
  const [activeTab, setActiveTab] = useState<"tutors" | "bootcamps" | "settings">("tutors");
  const [tutors, setTutors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    fetchTutors();
  }, []);

  async function fetchTutors() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    // Fetch tutors linked to this institution
    const { data, error } = await supabase
      .from("institution_tutors")
      .select("*, tutor:profiles!institution_tutors_tutor_id_fkey(*)")
      .eq("institution_id", session.user.id);
      
    if (!error && data) {
      setTutors(data);
    } else if (error && error.code !== "42P01") {
        console.error(error);
    }
    setLoading(false);
  }

  async function handleAddTutor(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // 1. Find the tutor by username or email
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, account_type")
      .or(`username.ilike.${inviteEmail},full_name.ilike.${inviteEmail}`)
      .maybeSingle();

    if (!profile) {
      toast.error("Could not find a user with that username or name.");
      return;
    }
    
    if (profile.account_type !== "Tutor") {
      toast.error("The selected user is not registered as a Tutor.");
      return;
    }

    // 2. Add them to institution_tutors
    const { error } = await supabase
      .from("institution_tutors")
      .insert({
        institution_id: session.user.id,
        tutor_id: profile.id
      });

    if (error) {
      if (error.code === "23505") {
        toast.error("This tutor is already in your organization.");
      } else {
        toast.error("Failed to add tutor.");
      }
    } else {
      toast.success("Tutor added successfully!");
      setInviteEmail("");
      fetchTutors();
    }
  }

  return (
    <div className="flex h-[calc(100vh-env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border/40 bg-card/30 p-6 flex flex-col hidden md:flex">
        <div className="flex items-center gap-3 mb-10">
          <div className="h-10 w-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="font-display font-black text-xl">Institution Hub</span>
        </div>

        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => setActiveTab("tutors")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "tutors" ? "bg-primary text-primary-foreground" : "hover:bg-accent/50 text-muted-foreground"}`}
          >
            <Users className="h-5 w-5" /> Tutors
          </button>
          <button 
            onClick={() => setActiveTab("bootcamps")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "bootcamps" ? "bg-primary text-primary-foreground" : "hover:bg-accent/50 text-muted-foreground"}`}
          >
            <LayoutGrid className="h-5 w-5" /> Bootcamps
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 md:p-10">
        {activeTab === "tutors" && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-3xl md:text-4xl font-black font-display">Manage Tutors</h1>
              <p className="text-muted-foreground mt-2">Add and manage the instructors who teach under your organization.</p>
            </div>

            <div className="bg-card border border-border/40 rounded-3xl p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-4">Add a new Tutor</h3>
              <form onSubmit={handleAddTutor} className="flex flex-col md:flex-row gap-3">
                <input 
                  type="text" 
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="Enter tutor username or name..." 
                  className="flex-1 h-12 bg-background border border-border/50 rounded-xl px-4 focus:ring-2 ring-primary/20 outline-none"
                />
                <button type="submit" className="h-12 px-6 bg-foreground text-background font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition">
                  <Plus className="h-4 w-4" /> Add Tutor
                </button>
              </form>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-lg">Your Organization`s Tutors</h3>
              {loading ? (
                <div className="animate-pulse h-20 bg-muted rounded-2xl"></div>
              ) : tutors.length === 0 ? (
                <div className="text-center p-10 border border-dashed rounded-3xl border-border/50 text-muted-foreground">
                  No tutors added yet. Add your first tutor above!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tutors.map((t: any) => (
                    <div key={t.id} className="p-5 border border-border/40 bg-card rounded-2xl flex items-center gap-4">
                      {t.tutor?.avatar_url ? (
                        <img src={t.tutor.avatar_url} className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                          {t.tutor?.username?.charAt(0).toUpperCase() || "T"}
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold">{t.tutor?.full_name || t.tutor?.username || "Unknown"}</h4>
                        <p className="text-xs text-muted-foreground">@{t.tutor?.username || "unknown"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "bootcamps" && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-3xl md:text-4xl font-black font-display">Organization Bootcamps</h1>
              <p className="text-muted-foreground mt-2">View all bootcamps created by your tutors.</p>
            </div>
            <div className="text-center p-10 border border-dashed rounded-3xl border-border/50 text-muted-foreground">
              Bootcamp tracking coming soon!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
