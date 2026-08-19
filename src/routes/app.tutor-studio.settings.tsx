import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, ChevronDown, ChevronRight, Calendar, Loader2,
  User, Wallet, GraduationCap, BellRing, ShieldCheck,
} from "@/components/icons/solar";
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
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3.5 md:px-7">
          <Link
            to="/app/tutor-studio"
            className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card tap hover:bg-muted"
          >
            <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
          </Link>
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Tutor Studio</p>
            <h1 className="text-[19px] font-semibold tracking-tight text-foreground">Studio settings</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-6 md:px-7 md:py-8">
        <div className="mb-6 max-w-2xl">
          <h2 className="font-display text-[25px] font-semibold tracking-tight md:text-[30px]">Set up how learners work with you.</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Manage booking availability, your teaching identity, payouts, notifications, and account protection.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b hairline px-5 py-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10">
                <Calendar className="h-[18px] w-[18px] text-primary" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Booking availability</h2>
                <p className="text-[12px] text-muted-foreground">Choose when learners can schedule one-to-one sessions.</p>
              </div>
            </div>

            <div className="space-y-5 p-5 md:p-6">
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase text-muted-foreground">Working days</label>
                <div className="relative">
                  <select
                    value={bookingForm.availability_days}
                    onChange={(e) => setBookingForm({ ...bookingForm, availability_days: e.target.value })}
                    className="h-12 w-full appearance-none rounded-lg border border-border bg-background px-4 pr-11 text-[13px] font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                  >
                    <option>Weekdays (Mon-Fri)</option>
                    <option>Weekends (Sat-Sun)</option>
                    <option>Everyday</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase text-muted-foreground">Start time</label>
                  <input type="time" value={bookingForm.availability_start} onChange={(e) => setBookingForm({ ...bookingForm, availability_start: e.target.value })} className="h-12 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 sm:px-4" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase text-muted-foreground">End time</label>
                  <input type="time" value={bookingForm.availability_end} onChange={(e) => setBookingForm({ ...bookingForm, availability_end: e.target.value })} className="h-12 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 sm:px-4" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase text-muted-foreground">Session duration</label>
                <div className="relative">
                  <select value={bookingForm.availability_duration} onChange={(e) => setBookingForm({ ...bookingForm, availability_duration: e.target.value })} className="h-12 w-full appearance-none rounded-lg border border-border bg-background px-4 pr-11 text-[13px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                    <option>30 minutes</option><option>45 minutes</option><option>60 minutes</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/[0.045] p-4 text-[12px] leading-relaxed text-muted-foreground">
                These hours appear on your public tutor profile and are used when learners request a session.
              </div>

              <button onClick={handleSaveAvailability} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:w-auto">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save availability
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center gap-3 border-b hairline px-5 py-4">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10"><GraduationCap className="h-4 w-4 text-primary" /></div>
                <div><h2 className="text-[14px] font-semibold">Teaching account</h2><p className="text-[11.5px] text-muted-foreground">Your studio identity</p></div>
              </div>
              <div className="divide-y divide-border">
                {[
                  ["Account type", profile?.account_type || "Tutor"],
                  ["Username", `@${profile?.username}`],
                  ["Membership", profile?.tier || "Basic"],
                ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 px-5 py-3.5"><span className="text-[12px] text-muted-foreground">{label}</span><span className="truncate text-[12px] font-semibold text-foreground">{value}</span></div>)}
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
              {quickLinks.map((item) => (
                <Link key={item.title} to={item.to} className="group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><item.Icon className="h-4 w-4" strokeWidth={2} /></div>
                  <div className="min-w-0 flex-1"><h3 className="text-[13px] font-semibold text-foreground">{item.title}</h3><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.desc}</p></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
