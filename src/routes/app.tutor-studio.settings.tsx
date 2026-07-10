import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, ChevronDown, ChevronRight, Calendar, Loader2,
  User, Wallet, GraduationCap, BellRing, ShieldCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/tutor-studio/settings")({
  component: TutorSettingsPage,
});

function TutorSettingsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    availability_days: "Weekdays (Mon-Fri)",
    availability_start: "09:00",
    availability_end: "17:00",
    availability_duration: "60 minutes",
  });

  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/signin" });
        return;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (data) {
        setProfile(data);
        setBookingForm({
          availability_days: data.availability_days || "Weekdays (Mon-Fri)",
          availability_start: data.availability_start || "09:00",
          availability_end: data.availability_end || "17:00",
          availability_duration: data.availability_duration || "60 minutes",
        });
      }
      setLoading(false);
    }
    loadProfile();
  }, [navigate]);

  const handleSaveAvailability = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update(bookingForm)
      .eq("id", session.user.id);
    setSaving(false);

    if (error) {
      toast.error(`Failed to save availability: ${error.message}`);
    } else {
      toast.success("Availability saved");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full w-1/3 rounded-full bg-primary animate-progress" />
        </div>
      </div>
    );
  }

  const quickLinks = [
    {
      Icon: User,
      title: "Public tutor profile",
      desc: "Name, bio, avatar, and banner shown to learners.",
      to: "/app/profile/edit",
    },
    {
      Icon: Wallet,
      title: "Payouts & wallet",
      desc: "Manage how you receive bootcamp earnings.",
      to: "/app/wallet/settings",
    },
    {
      Icon: BellRing,
      title: "Notifications",
      desc: "Choose which studio activity notifies you.",
      to: "/app/settings/notifications",
    },
    {
      Icon: ShieldCheck,
      title: "Security",
      desc: "Account access and connected sessions.",
      to: "/app/settings/security",
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline pt-[env(safe-area-inset-top)]">
        <div className="flex items-center px-4 py-3.5 gap-3 max-w-2xl mx-auto">
          <Link
            to="/app/tutor-studio"
            className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04]"
          >
            <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
          </Link>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Studio settings</h1>
            <p className="text-[11px] text-muted-foreground">{profile?.full_name || profile?.username}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 pt-6 space-y-6">
        {/* Booking availability */}
        <section className="rounded-2xl ring-1 ring-border bg-card shadow-soft overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b hairline">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/8 ring-1 ring-primary/15">
              <Calendar className="h-4 w-4 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-[14.5px] font-semibold tracking-tight text-foreground">Booking availability</h2>
              <p className="text-[12px] text-muted-foreground">When learners can book 1-on-1 sessions with you.</p>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Working days</label>
              <div className="relative">
                <select
                  value={bookingForm.availability_days}
                  onChange={(e) => setBookingForm({ ...bookingForm, availability_days: e.target.value })}
                  className="w-full appearance-none bg-background ring-1 ring-border rounded-2xl px-5 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground cursor-pointer"
                >
                  <option>Weekdays (Mon-Fri)</option>
                  <option>Weekends (Sat-Sun)</option>
                  <option>Everyday</option>
                </select>
                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Start time</label>
                <input
                  type="time"
                  value={bookingForm.availability_start}
                  onChange={(e) => setBookingForm({ ...bookingForm, availability_start: e.target.value })}
                  className="w-full bg-background ring-1 ring-border rounded-2xl px-5 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">End time</label>
                <input
                  type="time"
                  value={bookingForm.availability_end}
                  onChange={(e) => setBookingForm({ ...bookingForm, availability_end: e.target.value })}
                  className="w-full bg-background ring-1 ring-border rounded-2xl px-5 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Session duration</label>
              <div className="relative">
                <select
                  value={bookingForm.availability_duration}
                  onChange={(e) => setBookingForm({ ...bookingForm, availability_duration: e.target.value })}
                  className="w-full appearance-none bg-background ring-1 ring-border rounded-2xl px-5 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground cursor-pointer"
                >
                  <option>30 minutes</option>
                  <option>45 minutes</option>
                  <option>60 minutes</option>
                </select>
                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <button
              onClick={handleSaveAvailability}
              disabled={saving}
              className="w-full bg-foreground text-background font-semibold tracking-tight py-3.5 rounded-full tap shadow-lift hover:opacity-90 text-[14px] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save availability
            </button>
          </div>
        </section>

        {/* Teaching summary */}
        <section className="rounded-2xl ring-1 ring-border bg-card shadow-soft overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b hairline">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/8 ring-1 ring-primary/15">
              <GraduationCap className="h-4 w-4 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-[14.5px] font-semibold tracking-tight text-foreground">Teaching account</h2>
              <p className="text-[12px] text-muted-foreground">How you appear across Zero Club.</p>
            </div>
          </div>
          <div className="divide-y divide-hairline">
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[13px] text-muted-foreground">Account type</span>
              <span className="text-[13px] font-semibold tracking-tight text-foreground">{profile?.account_type || "Tutor"}</span>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[13px] text-muted-foreground">Username</span>
              <span className="text-[13px] font-semibold tracking-tight text-foreground">@{profile?.username}</span>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[13px] text-muted-foreground">Membership</span>
              <span className="text-[13px] font-semibold tracking-tight text-foreground">{profile?.tier || "Basic"}</span>
            </div>
          </div>
        </section>

        {/* Quick links */}
        <section className="rounded-2xl ring-1 ring-border bg-card shadow-soft overflow-hidden divide-y divide-hairline">
          {quickLinks.map((item) => (
            <Link
              key={item.title}
              to={item.to}
              className="group flex items-center gap-4 px-5 py-4 tap hover:bg-foreground/[0.02]"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ring-border bg-background/60">
                <item.Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold tracking-tight text-foreground">{item.title}</h3>
                <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
