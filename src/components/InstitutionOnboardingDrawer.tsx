import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { supabase } from "@/lib/supabase";
import { formatNaira } from "@/features/membership/plans";

const INSTITUTION_TYPES = [
  "University", "Polytechnic", "College", "Secondary school", "Training provider",
  "Bootcamp provider", "NGO or foundation", "Government agency", "Corporate academy", "Other",
];

const EMPTY = {
  institution_name: "", institution_type: "University", registration_number: "", website: "",
  country: "", city: "", address: "", organization_size: "small", learner_count: "", tutor_count: "",
  programs_planned: "", contact_name: "", contact_role: "", contact_email: "", contact_phone: "",
  goals: "", hear_about: "",
};

export function InstitutionOnboardingDrawer({
  open,
  onOpenChange,
  profile,
  onActivated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: any;
  onActivated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const status = useQuery({
    queryKey: ["institution-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_institution_status");
      if (error) throw error;
      return data as any;
    },
    enabled: open,
    retry: false,
  });

  // Prefill from an existing application, or from the signed-in profile.
  useEffect(() => {
    const existing = status.data?.application;
    if (existing) {
      setForm({
        institution_name: existing.institution_name || "", institution_type: existing.institution_type || "University",
        registration_number: existing.registration_number || "", website: existing.website || "",
        country: existing.country || "", city: existing.city || "", address: existing.address || "",
        organization_size: existing.organization_size || "small",
        learner_count: existing.learner_count?.toString() || "", tutor_count: existing.tutor_count?.toString() || "",
        programs_planned: existing.programs_planned || "", contact_name: existing.contact_name || "",
        contact_role: existing.contact_role || "", contact_email: existing.contact_email || "",
        contact_phone: existing.contact_phone || "", goals: existing.goals || "", hear_about: existing.hear_about || "",
      });
    } else if (open && profile) {
      setForm((f) => ({ ...f, contact_name: f.contact_name || profile.full_name || "", institution_name: f.institution_name || profile.full_name || "" }));
    }
  }, [status.data, open, profile]);

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_institution_application", { payload: form });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(data?.is_new ? "Your 30-day Digital Hub trial has started" : "Institution details updated");
      queryClient.invalidateQueries({ queryKey: ["institution-status"] });
      queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      onActivated?.();
    },
    onError: (error: any) => toast.error(error.message || "Could not submit your details"),
  });

  const activate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("activate_digital_hub");
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success("Digital Hub activated for 12 months");
      queryClient.invalidateQueries({ queryKey: ["institution-status"] });
      queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      onActivated?.();
    },
    onError: (error: any) => toast.error(error.message || "Activation failed"),
  });

  const price = Number(status.data?.price || (form.organization_size === "large" ? 400000 : 150000));
  const balance = Number(profile?.coins || 0);
  const trialDaysLeft = Number(status.data?.trial_days_left || 0);
  const hasApplication = !!status.data?.has_application;
  const isActive = !!status.data?.is_active;
  const setupMissing = (status.error as any)?.code === "PGRST202";

  const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/50";
  const label = "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-2xl border-none bg-background p-0">
        <div className="overflow-y-auto px-5 pb-8 pt-2 sm:px-7">
          <DrawerHeader className="p-0 text-left">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></div>
            <DrawerTitle className="mt-4 text-[20px] font-semibold tracking-tight">Digital Hub for institutions</DrawerTitle>
            <DrawerDescription className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Tell us about your organisation to start a free 30-day trial. After the trial, fund your wallet and activate the plan that matches your size.
            </DrawerDescription>
          </DrawerHeader>

          {setupMissing ? (
            <div className="mt-6 rounded-lg border border-border bg-card p-5 text-center">
              <ShieldCheck className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-[13px] font-semibold">Setup required</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Run 20260730210000_institution_onboarding.sql in Supabase, then reopen this form.</p>
            </div>
          ) : (
            <>
              {hasApplication && (
                <div className={`mt-5 rounded-lg p-4 ring-1 ${isActive ? "bg-emerald-500/[0.06] ring-emerald-500/20" : "bg-primary/[0.05] ring-primary/20"}`}>
                  <p className="text-[12px] font-semibold">
                    {isActive ? "Digital Hub is active" : trialDaysLeft > 0 ? `Trial active — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left` : "Your trial has ended"}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {isActive
                      ? "Your workspace is fully set up. Update your details below at any time."
                      : trialDaysLeft > 0
                        ? "Explore the Digital Hub freely. Activate before the trial ends to keep access without interruption."
                        : "Activate below to restore access, or update your details and contact Zero Club for a guided setup."}
                  </p>
                </div>
              )}

              <div className="mt-6 space-y-6">
                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Organisation</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><p className={label}>Institution name *</p><input value={form.institution_name} onChange={(e) => set("institution_name", e.target.value)} placeholder="Lagos Institute of Technology" className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>Type</p><select value={form.institution_type} onChange={(e) => set("institution_type", e.target.value)} className={`${field} mt-1.5`}>{INSTITUTION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div>
                    <div><p className={label}>Registration / RC number</p><input value={form.registration_number} onChange={(e) => set("registration_number", e.target.value)} placeholder="RC 123456" className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>Website</p><input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>Country *</p><input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Nigeria" className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>City</p><input value={form.city} onChange={(e) => set("city", e.target.value)} className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>Address</p><input value={form.address} onChange={(e) => set("address", e.target.value)} className={`${field} mt-1.5`} /></div>
                  </div>
                </section>

                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Size and programs</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Your plan is based on the size of your organisation.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "small", title: "Small organisation", detail: "Up to 500 learners", amount: 150000 },
                      { key: "large", title: "Large organisation", detail: "500+ learners, multiple campuses", amount: 400000 },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => set("organization_size", option.key)}
                        className={`rounded-lg border p-4 text-left transition ${form.organization_size === option.key ? "border-primary bg-primary/[0.05]" : "border-border hover:bg-muted/60"}`}
                      >
                        <p className="text-[13px] font-semibold">{option.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{option.detail}</p>
                         <p className="mt-2 text-[13px] font-semibold tabular-nums">{formatNaira(option.amount)} <span className="text-[10px] font-medium text-muted-foreground">/ year</span></p>
                      </button>
                    ))}
                    <div><p className={label}>Learners</p><input type="number" value={form.learner_count} onChange={(e) => set("learner_count", e.target.value)} placeholder="450" className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>Tutors or staff</p><input type="number" value={form.tutor_count} onChange={(e) => set("tutor_count", e.target.value)} placeholder="25" className={`${field} mt-1.5`} /></div>
                    <div className="sm:col-span-2"><p className={label}>Programs you plan to run</p><textarea value={form.programs_planned} onChange={(e) => set("programs_planned", e.target.value)} rows={2} placeholder="Software engineering cohort, data analytics diploma…" className={`${field} h-auto resize-none py-2.5 mt-1.5`} /></div>
                  </div>
                </section>

                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Primary contact</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div><p className={label}>Full name *</p><input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>Role</p><input value={form.contact_role} onChange={(e) => set("contact_role", e.target.value)} placeholder="Director of Academics" className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>Work email *</p><input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} className={`${field} mt-1.5`} /></div>
                    <div><p className={label}>Phone</p><input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} className={`${field} mt-1.5`} /></div>
                    <div className="sm:col-span-2"><p className={label}>What do you want to achieve on Zero Club?</p><textarea value={form.goals} onChange={(e) => set("goals", e.target.value)} rows={3} className={`${field} h-auto resize-none py-2.5 mt-1.5`} /></div>
                    <div className="sm:col-span-2"><p className={label}>How did you hear about Zero Club?</p><input value={form.hear_about} onChange={(e) => set("hear_about", e.target.value)} className={`${field} mt-1.5`} /></div>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[12px] font-semibold">{form.organization_size === "large" ? "Large organisation plan" : "Small organisation plan"}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Paid from your Zero Club wallet · 12 months</p>
                    </div>
                     <p className="shrink-0 text-[18px] font-semibold tabular-nums">{formatNaira(price)}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5 text-primary" />
                     Wallet balance <strong className="font-semibold text-foreground tabular-nums">{formatNaira(balance)}</strong>
                     {balance < price && <span className="text-amber-600">· fund {formatNaira(price - balance)} more to activate</span>}
                  </div>
                </section>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => submit.mutate()}
                    disabled={submit.isPending}
                    className="flex h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50 sm:h-12"
                  >
                    {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {hasApplication ? "Save details" : "Start 30-day trial"}
                  </button>
                  {hasApplication && (
                    <button
                      onClick={() => activate.mutate()}
                      disabled={activate.isPending || balance < price}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-[13.5px] font-semibold disabled:opacity-50"
                      title={balance < price ? "Fund your wallet to activate" : undefined}
                    >
                      {activate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Activate Digital Hub
                    </button>
                  )}
                </div>

                <p className="text-center text-[10.5px] leading-relaxed text-muted-foreground">
                  Need a guided setup or a custom arrangement? Submit this form and the Zero Club team will reach out to your primary contact.
                </p>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
