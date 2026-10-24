import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, BriefcaseBusiness, Building2, Camera, Check, ChevronLeft, Loader2 } from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { uploadFile } from "@/lib/storage";
import {
  BUSINESS_GOALS,
  BUSINESS_INDUSTRIES,
  BUSINESS_SIZES,
  isBusiness,
  saveBusinessProfile,
  type BusinessMode,
} from "@/lib/business";
import { BusinessAuthShell, businessInput, businessLabel, businessPrimary } from "@/features/business/BusinessAuthShell";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/business/welcome")({
  component: BusinessWelcome,
  head: () => ({ meta: [{ title: "Set up your organization — Zero Club" }] }),
});

const STEPS = ["Type", "Details", "Goals"] as const;

function BusinessWelcome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useUser();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<BusinessMode>("company");
  const [orgName, setOrgName] = useState("");
  const [logo, setLogo] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [tagline, setTagline] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Only signed-in business accounts belong here.
  useEffect(() => {
    if (isLoading) return;
    if (!profile) {
      navigate({ to: "/business/signin" as never, replace: true });
      return;
    }
    if (!isBusiness(profile)) {
      navigate({ to: "/app", replace: true });
      return;
    }
    setOrgName((v) => v || profile.full_name || "");
    setLogo((v) => v || profile.avatar_url || "");
  }, [profile, isLoading, navigate]);

  const pickLogo = async (file?: File) => {
    if (!file || !profile) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image for your logo.");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const url = await uploadFile("profiles", file, `${profile.id}/avatar-${profile.id}-${Date.now()}.${ext}`);
      setLogo(url);
    } catch (error: any) {
      toast.error(error?.message || "Could not upload the logo");
    } finally {
      setUploading(false);
    }
  };

  const finish = async () => {
    if (!orgName.trim()) {
      setStep(1);
      return toast.error("Add your organization's name.");
    }
    setSaving(true);
    try {
      await saveBusinessProfile(
        { org_name: orgName, org_kind: kind, industry, size, country, city, website, tagline, goals, logo_url: logo, hiring: goals.includes("hire") },
        true,
      );
      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      toast.success(`${orgName.trim()} is set up`);
      if (kind === "institutional") {
        // Institutional opens after review: straight to the hub application.
        navigate({ to: "/app/business" as never, search: { tab: "overview", apply: 1 } as never, replace: true });
      } else {
        navigate({ to: "/app/business" as never, replace: true });
      }
    } catch (error: any) {
      toast.error(error?.message || "Could not save your organization");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/business" as never });
  };

  if (isLoading || !profile) {
    return (
      <BusinessAuthShell aside={false}>
        <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#6d6269] dark:text-white/60" /></div>
      </BusinessAuthShell>
    );
  }

  return (
    <BusinessAuthShell
      aside={false}
      topRight={<button type="button" onClick={signOut} className="rounded-xl px-3 py-2 text-[13px] font-medium text-[#6d6269] dark:text-white/55 hover:text-[#171417] dark:hover:text-white">Sign out</button>}
    >
      <div className="mx-auto w-full max-w-[620px]">
        {/* Progress */}
        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col gap-1.5">
              <span className={`h-1 rounded-full transition ${i <= step ? "bg-[#cc208f]" : "bg-black/10 dark:bg-white/10"}`} />
              <span className={`text-[11.5px] font-semibold ${i === step ? "text-[#241f23] dark:text-white" : "text-[#6d6269] dark:text-white/40"}`}>{label}</span>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div>
            <h1 className="font-display text-[clamp(24px,4vw,32px)] font-semibold leading-tight tracking-[-0.02em]">What kind of organization are you?</h1>
            <p className="mt-2 text-[14px] leading-6 text-[#6d6269] dark:text-white/55">You can switch between the two later, just like people switch between Learner and Tutor.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <KindCard
                active={kind === "company"}
                onClick={() => setKind("company")}
                Icon={BriefcaseBusiness}
                title="Company"
                subtitle="A company or business owner"
                points={["Hire builders & post gigs", "Sponsor challenges", "Train your team"]}
              />
              <KindCard
                active={kind === "institutional"}
                onClick={() => setKind("institutional")}
                Icon={Building2}
                title="Institutional"
                subtitle="A tech hub or training institution"
                points={["Bootcamps", "Tutors and admissions", "Learner outcomes"]}
                note="Reviewed by Zero Club before it opens"
              />
            </div>
            <button type="button" onClick={() => setStep(1)} className={`${businessPrimary} mt-6`}>Continue <ArrowRight className="h-4 w-4" /></button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-[clamp(24px,4vw,32px)] font-semibold leading-tight tracking-[-0.02em]">Tell people who you are</h1>
              <p className="mt-2 text-[14px] text-[#6d6269] dark:text-white/55">This becomes your organization's page on Zero Club.</p>
            </div>

            <div className="flex items-center gap-4">
              <label className="relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-black/20 dark:border-white/20 bg-black/[0.04] dark:bg-white/[0.04] transition hover:border-[#cc208f]/60">
                {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6 text-[#6d6269] dark:text-white/50" />}
                {uploading && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="h-5 w-5 animate-spin" /></span>}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <div className="text-[13px] leading-5 text-[#6d6269] dark:text-white/55">
                <p className="font-semibold text-[#241f23] dark:text-white">Logo</p>
                Square works best. You can change it any time.
              </div>
            </div>

            <div>
              <label className={businessLabel}>Organization name</label>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className={businessInput} placeholder="Acme Labs" />
            </div>
            <div>
              <label className={businessLabel}>One-line description</label>
              <input value={tagline} onChange={(e) => setTagline(e.target.value.slice(0, 160))} className={businessInput} placeholder={kind === "institutional" ? "A tech hub training the next 10,000 engineers in Lagos" : "We build payment tools for small businesses"} />
            </div>
            <div>
              <label className={businessLabel}>Industry</label>
              <ChipGroup options={BUSINESS_INDUSTRIES} value={industry} onChange={setIndustry} />
            </div>
            <div>
              <label className={businessLabel}>Team size</label>
              <ChipGroup options={BUSINESS_SIZES} value={size} onChange={setSize} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={businessLabel}>Country</label><input value={country} onChange={(e) => setCountry(e.target.value)} className={businessInput} placeholder="Nigeria" /></div>
              <div><label className={businessLabel}>City</label><input value={city} onChange={(e) => setCity(e.target.value)} className={businessInput} placeholder="Lagos" /></div>
            </div>
            <div>
              <label className={businessLabel}>Website <span className="font-normal text-[#6d6269] dark:text-white/40">(optional)</span></label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} className={businessInput} placeholder="acmelabs.com" inputMode="url" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(0)} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-black/10 dark:border-white/12 text-[#6d6269] dark:text-white/70 hover:bg-black/[0.05] dark:hover:bg-white/[0.05]" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => (orgName.trim() ? setStep(2) : toast.error("Add your organization's name."))} className={businessPrimary}>Continue <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="font-display text-[clamp(24px,4vw,32px)] font-semibold leading-tight tracking-[-0.02em]">What do you want to do first?</h1>
            <p className="mt-2 text-[14px] text-[#6d6269] dark:text-white/55">Pick any. We'll put these front and centre in your workspace.</p>
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              {BUSINESS_GOALS[kind].map((g) => {
                const on = goals.includes(g.key);
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setGoals((list) => (on ? list.filter((x) => x !== g.key) : [...list, g.key]))}
                    className={`flex h-14 items-center justify-between gap-2 rounded-xl border px-4 text-left text-[14px] font-semibold transition ${on ? "border-[#cc208f] bg-[#cc208f]/12 text-[#241f23] dark:text-white" : "border-black/10 dark:border-white/12 bg-black/[0.03] dark:bg-white/[0.03] text-[#6d6269] dark:text-white/75 hover:border-black/20 dark:hover:border-white/25"}`}
                  >
                    {g.label}
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${on ? "bg-[#cc208f]" : "ring-1 ring-black/20 dark:ring-white/25"}`}>{on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
            {kind === "institutional" && (
              <p className="mt-5 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-3.5 text-[13px] leading-5 text-[#6d6269] dark:text-white/60">
                Next, you'll fill in your Digital Hub application. Zero Club reviews it — usually within a few days — and Institutional mode opens once it's approved. Until then you can use everything in Company mode.
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setStep(1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-black/10 dark:border-white/12 text-[#6d6269] dark:text-white/70 hover:bg-black/[0.05] dark:hover:bg-white/[0.05]" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={finish} disabled={saving} className={businessPrimary}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Setting up</> : <>{kind === "institutional" ? "Continue to hub application" : "Open my Business Hub"} <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        )}
      </div>
    </BusinessAuthShell>
  );
}

function KindCard({ active, onClick, Icon, title, subtitle, points, note }: { active: boolean; onClick: () => void; Icon: any; title: string; subtitle: string; points: string[]; note?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-5 text-left transition ${active ? "border-[#cc208f] bg-[#cc208f]/10 ring-1 ring-[#cc208f]/40" : "border-black/10 dark:border-white/12 bg-black/[0.03] dark:bg-white/[0.03] hover:border-black/20 dark:hover:border-white/25"}`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid h-11 w-11 place-items-center rounded-xl ${active ? "bg-[#cc208f] text-white" : "bg-black/[0.07] dark:bg-white/[0.07] text-[#6d6269] dark:text-white/80"}`}><Icon className="h-5 w-5" /></span>
        <span className={`grid h-5 w-5 place-items-center rounded-full ${active ? "bg-[#cc208f]" : "ring-1 ring-black/20 dark:ring-white/25"}`}>{active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}</span>
      </div>
      <p className="mt-4 text-[17px] font-semibold">{title}</p>
      <p className="text-[13px] text-[#6d6269] dark:text-white/55">{subtitle}</p>
      <ul className="mt-3 grid gap-1">
        {points.map((p) => <li key={p} className="flex items-center gap-1.5 text-[12.5px] text-[#6d6269] dark:text-white/65"><Check className="h-3 w-3 text-[#cc208f]" /> {p}</li>)}
      </ul>
      {note && <p className="mt-3 text-[11.5px] font-medium text-[#6d6269] dark:text-white/40">{note}</p>}
    </button>
  );
}

function ChipGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(value === o ? "" : o)}
          className={`h-9 rounded-full border px-3.5 text-[13px] font-medium transition ${value === o ? "border-[#cc208f] bg-[#cc208f]/15 text-[#241f23] dark:text-white" : "border-black/10 dark:border-white/12 text-[#6d6269] dark:text-white/65 hover:border-black/20 dark:hover:border-white/25 hover:text-[#171417] dark:hover:text-white"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
