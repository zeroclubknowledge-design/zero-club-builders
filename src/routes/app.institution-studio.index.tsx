import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Plus, Users, LayoutGrid, GraduationCap, Building2, MoreHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getInstitutionBootcamps } from "@/api";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/app/institution-studio/")({
  component: InstitutionStudioIndex,
});

function InstitutionStudioIndex() {
  const [activeTab, setActiveTab] = useState<"tutors" | "bootcamps" | "settings">("tutors");
  const [tutors, setTutors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: bootcamps = [], isLoading: isLoadingBootcamps } = useQuery({
    queryKey: ['institution-bootcamps'],
    queryFn: () => getInstitutionBootcamps()
  });

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

  async function handleRemoveTutor(tutorId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    if (!confirm("Are you sure you want to remove this tutor from your organization?")) return;

    const { error } = await supabase
      .from("institution_tutors")
      .delete()
      .match({ institution_id: session.user.id, tutor_id: tutorId });
      
    if (error) {
      toast.error("Failed to remove tutor.");
    } else {
      toast.success("Tutor removed.");
      fetchTutors();
    }
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

    // 2. Instead of inserting to institution_tutors directly, send an invite DM
    // First check if they are already a tutor
    const { data: existing } = await supabase
      .from("institution_tutors")
      .select("id")
      .eq("institution_id", session.user.id)
      .eq("tutor_id", profile.id)
      .maybeSingle();

    if (existing) {
      toast.error("This tutor is already in your organization.");
      return;
    }

    // Get current institution name (from user profile)
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", session.user.id)
      .single();

    const instName = myProfile?.full_name || myProfile?.username || "Unknown Institution";

    // Send DM
    const { error } = await supabase
      .from("messages")
      .insert({
        sender_id: session.user.id,
        receiver_id: profile.id,
        content: `TUTOR_INVITE:${session.user.id}:${instName}`
      });

    if (error) {
      toast.error("Failed to send invitation.");
    } else {
      toast.success("Invitation sent to tutor's inbox!");
      setInviteEmail("");
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
                      <div className="flex-1">
                        <h4 className="font-bold">{t.tutor?.full_name || t.tutor?.username || "Unknown"}</h4>
                        <p className="text-xs text-muted-foreground">@{t.tutor?.username || "unknown"}</p>
                      </div>
                      <button 
                        onClick={() => handleRemoveTutor(t.tutor_id)}
                        className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Remove tutor"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
            {isLoadingBootcamps ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse h-64 bg-card rounded-[24px]"></div>
                ))}
              </div>
            ) : bootcamps.length === 0 ? (
              <div className="text-center p-10 border border-dashed rounded-3xl border-border/50 text-muted-foreground">
                No bootcamps have been created by your tutors yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bootcamps.map((bootcamp) => (
                  <div key={bootcamp.id} className="group relative flex flex-col overflow-hidden rounded-[24px] border border-border bg-card transition-all hover:border-border/80 hover:shadow-xl hover:shadow-black/5">
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                      {bootcamp.cover_image_url ? (
                        <img 
                          src={bootcamp.cover_image_url} 
                          alt={bootcamp.title}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                          <GraduationCap className="h-12 w-12 text-primary/40" />
                        </div>
                      )}
                      <div className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-bold backdrop-blur-md border border-white/10 shadow-sm">
                        {bootcamp.status === 'published' ? (
                          <span className="text-green-500">Published</span>
                        ) : (
                          <span className="text-muted-foreground">Draft</span>
                        )}
                      </div>
                      {bootcamp.price > 0 && (
                        <div className="absolute right-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-black text-primary backdrop-blur-md border border-white/10 shadow-sm">
                          ${bootcamp.price}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-1 flex-col p-5">
                      <div className="mb-4">
                        <h3 className="line-clamp-2 font-display text-lg font-bold leading-tight group-hover:text-primary transition-colors">
                          {bootcamp.title}
                        </h3>
                      </div>
                      
                      <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4">
                        <div className="flex items-center gap-2">
                          <img 
                            src={bootcamp.profiles?.avatar_url || "https://github.com/shadcn.png"} 
                            className="h-6 w-6 rounded-full border border-border"
                          />
                          <span className="text-xs font-medium text-muted-foreground line-clamp-1">
                            {bootcamp.profiles?.full_name || bootcamp.profiles?.username}
                          </span>
                        </div>
                        {bootcamp.club && bootcamp.club.id && (
                           <Link to={`/app/clubs/${bootcamp.club.id}`} className="text-xs font-bold text-primary hover:underline">
                             View Class
                           </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
