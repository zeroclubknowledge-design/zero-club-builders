import { useLoaderData, createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Star, Clock, Users, PlayCircle, CheckCircle2, FileText, Smartphone, Globe, Award, Loader2, Video } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/lib/supabase";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { enrollUserAction } from "@/api";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app/bootcamps/$id")({
  component: BootcampDetail,
});

function BootcampDetail() {
  const { id } = Route.useParams();
  
  const { data: bootcampData, isLoading: isBootcampLoading } = useQuery({
    queryKey: ['bootcamp', id],
    queryFn: async () => {
      const { data: bootcamp, error } = await supabase
        .from('bootcamps')
        .select('*, profiles(*)')
        .eq('id', id)
        .single();
      
      if (error) throw error;

      const { data: modules, error: modulesError } = await supabase
        .from('modules')
        .select('*, lessons(*)')
        .eq('bootcamp_id', id)
        .order('order_index', { ascending: true });

      if (modulesError) throw modulesError;

      const { data: club } = await supabase
        .from('clubs')
        .select('*')
        .eq('name', bootcamp.title)
        .eq('creator_id', bootcamp.creator_id)
        .eq('category', 'Bootcamp')
        .single();

      return { bootcamp, modules, club };
    }
  });

  const { bootcamp, modules = [], club = null } = bootcampData || {};

  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);

  useEffect(() => {
    if (bootcamp?.id) checkEnrollment();
  }, [bootcamp?.id]);

  async function checkEnrollment() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setCurrentUser(prof || session.user);
      
      const { data } = await supabase
        .from('enrollments')
        .select('*')
        .eq('profile_id', session.user.id)
        .eq('bootcamp_id', bootcamp.id)
        .single();
      setIsEnrolled(!!data);
    }
  }

  async function handleEnroll() {
    if (!currentUser) {
      toast.error("Please sign in to enroll");
      return;
    }
    setLoading(true);
    try {
      await enrollUserAction({ 
        data: { 
          bootcampId: bootcamp.id, 
          profileId: currentUser.id 
        } 
      });
      if (club) {
        await supabase.from('club_members').insert([{
          club_id: club.id,
          profile_id: currentUser.id,
          role: 'Member'
        }]);
      }
      setIsEnrolled(true);
      toast.success("Enrolled successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (isBootcampLoading || !bootcamp) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen py-20 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground font-medium">Loading bootcamp details...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero / Cover */}
      <div className="relative h-48 w-full">
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent z-10" />
        <div className="h-full w-full bg-muted overflow-hidden">
          {bootcamp.banner_url ? (
            <img src={bootcamp.banner_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-primary" style={{ background: "linear-gradient(135deg,#cc208f,#a78bfa)" }} />
          )}
        </div>
        <Link to="/app/bootcamps" className="absolute top-4 left-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
      </div>

      <div className="px-5 -mt-12 relative z-20">
        {/* Bootcamp Header */}
        <div className="space-y-3">
          <div className="inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary border border-primary/20 uppercase">
            {bootcamp.category}
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight">{bootcamp.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {bootcamp.description}
          </p>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="font-bold text-warning">5.0</span>
              <div className="flex text-warning"><Star className="h-3 w-3 fill-current" /><Star className="h-3 w-3 fill-current" /><Star className="h-3 w-3 fill-current" /><Star className="h-3 w-3 fill-current" /><Star className="h-3 w-3 fill-current" /></div>
              <span className="text-muted-foreground">(New)</span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Created by <span className="text-primary font-bold">{bootcamp.profiles?.full_name || bootcamp.profiles?.username}</span>
          </div>
        </div>

        {/* Pricing Card */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">Price</span>
            <div className="flex flex-wrap items-baseline gap-2">
              {(() => {
                const basePrice = Number(bootcamp.price) || 0;
                const tier = currentUser?.tier || "Basic";
                let pct = 0;
                if (tier === "Premium") pct = 0.3;
                else if (tier === "Premium+") pct = 0.5;

                const discountedPrice = Math.round(basePrice * (1 - pct));

                if (pct > 0) {
                  return (
                    <>
                      <span className="font-display text-3xl font-black text-foreground">₦{discountedPrice.toLocaleString()}</span>
                      <span className="text-sm font-bold text-muted-foreground/60 line-through">₦{basePrice.toLocaleString()}</span>
                      <span className="text-[10px] font-black bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 shrink-0">
                        {pct * 100}% {tier} OFF
                      </span>
                    </>
                  );
                }
                return <span className="font-display text-3xl font-black text-foreground">₦{basePrice.toLocaleString()}</span>;
              })()}
            </div>
          </div>
          
          {isEnrolled ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-center gap-2 py-3.5 bg-success/10 text-success rounded-xl font-bold text-sm">
                <CheckCircle2 className="h-5 w-5" />
                You are enrolled
              </div>
              <Link 
                to="/app/live/$classId" 
                params={{ classId: bootcamp.id }}
                className="w-full rounded-xl bg-red-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Video className="h-5 w-5" />
                Join Live Class
              </Link>
              {club && (
                <Link 
                  to="/app/clubs/chat" 
                  search={{ clubId: club.id }}
                  className="w-full rounded-xl bg-primary/10 text-primary py-3.5 text-sm font-bold shadow-sm transition active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Users className="h-5 w-5" />
                  Enter Club
                </Link>
              )}
            </div>
          ) : (
            <button 
              onClick={handleEnroll}
              disabled={loading}
              className="mt-4 w-full rounded-xl bg-gradient-primary py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Enroll Now
            </button>
          )}

          {(!isEnrolled && currentUser?.id === bootcamp.creator_id) && (
            <div className="mt-4 space-y-3">
              <Link 
                to="/app/live/$classId" 
                params={{ classId: bootcamp.id }}
                className="w-full rounded-xl bg-red-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Video className="h-5 w-5" />
                Go Live (Tutor)
              </Link>
              {club && (
                <Link 
                  to="/app/clubs/chat" 
                  search={{ clubId: club.id }}
                  className="w-full rounded-xl bg-primary/10 text-primary py-3.5 text-sm font-bold shadow-sm transition active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Users className="h-5 w-5" />
                  Enter Club (Admin)
                </Link>
              )}
            </div>
          )}
          
          <button className="mt-2 w-full rounded-xl border border-border py-3.5 text-sm font-bold transition active:bg-accent/30">
            Add to Wishlist
          </button>
        </div>

        {/* Bootcamp Content */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Bootcamp content</h2>
            <span className="text-xs text-muted-foreground">{modules.length} sections</span>
          </div>
          
          <Accordion type="single" collapsible className="space-y-3">
            {modules.map((m: any, i: number) => (
              <AccordionItem key={i} value={`item-${i}`} className="border border-border rounded-2xl bg-card/40 px-4 overflow-hidden">
                <AccordionTrigger className="hover:no-underline py-4 text-left font-semibold text-sm">
                  {m.title}
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-1 space-y-4">
                  {m.lessons?.sort((a: any, b: any) => a.order_index - b.order_index).map((l: any, j: number) => (
                    <div key={j} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {l.content_type === "video" ? <PlayCircle className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-xs leading-snug">{l.title}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{l.duration || '5m'}</span>
                    </div>
                  ))}
                  {(!m.lessons || m.lessons.length === 0) && (
                    <p className="text-xs text-muted-foreground italic">No lessons in this module yet.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Includes Section */}
        <div className="mt-10 mb-10">
          <h2 className="text-lg font-bold">This bootcamp includes:</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {[
              { icon: PlayCircle, t: "Lifetime access" },
              { icon: FileText, t: "Articles & Resources" },
              { icon: Smartphone, t: "Access on mobile" },
              { icon: Globe, t: "Certificate" },
              { icon: Award, t: "Verified Badge" },
              { icon: Users, t: "Discord channel" },
            ].map((item) => (
              <div key={item.t} className="flex items-center gap-2 text-xs text-muted-foreground">
                <item.icon className="h-4 w-4 text-primary" />
                <span>{item.t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
