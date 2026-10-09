import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Award, BriefcaseBusiness, Loader2, Pencil, Plus, Trash2 } from "@/components/icons/glyphs";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { supabase } from "@/lib/supabase";
import {
  EMPLOYMENT_TYPES,
  SOCIAL_NETWORKS,
  experienceSpan,
  monthYear,
  useProfileCredentials,
  type Certificate,
  type Experience,
} from "./credentials";

const LABEL = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const FIELD =
  "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/40 disabled:opacity-60";

/** <input type="month"> gives "2024-03"; the database stores a date. */
const toMonth = (date?: string | null) => (date ? date.slice(0, 7) : "");
const fromMonth = (month: string) => (month ? `${month}-01` : null);

/* ── Social links (saved with the rest of Edit profile) ───────────── */

export function SocialLinksEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const filled = SOCIAL_NETWORKS.filter((n) => value[n.key]);
  const [showAll, setShowAll] = useState(false);
  const main = ["linkedin", "github", "x", "email"];
  const shown = showAll
    ? SOCIAL_NETWORKS
    : SOCIAL_NETWORKS.filter((n) => main.includes(n.key) || value[n.key]);
  return (
    <section
      id="links"
      className="scroll-mt-20 bg-card px-4 py-4 md:rounded-xl md:border md:border-border"
    >
      <h2 className="font-display text-[18px] font-semibold">Links</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Shown as icons on your profile and portfolio. A username or a full link both work.
      </p>
      <div className="mt-3 space-y-2.5">
        {shown.map((network) => (
          <label key={network.key} className="flex items-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-foreground/15 text-foreground/80"
              aria-hidden
            >
              {network.icon}
            </span>
            <span className="sr-only">{network.label}</span>
            <input
              value={value[network.key] || ""}
              onChange={(event) => onChange({ ...value, [network.key]: event.target.value })}
              placeholder={network.placeholder}
              inputMode={network.key === "email" ? "email" : "url"}
              autoCapitalize="none"
              autoCorrect="off"
              className={FIELD}
              disabled={disabled}
            />
          </label>
        ))}
      </div>
      {!showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 text-[14px] font-semibold text-accent"
        >
          + More links (Instagram, Behance, Dribbble, YouTube…)
        </button>
      )}
      {filled.length > 0 && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          {filled.length} link{filled.length === 1 ? "" : "s"} added
        </p>
      )}
    </section>
  );
}

/* ── Experience ─────────────────────────────────────── */

const emptyExperience = {
  title: "",
  company: "",
  employment_type: "",
  location: "",
  start: "",
  end: "",
  is_current: false,
  description: "",
};

export function ExperienceEditor({ profileId }: { profileId: string }) {
  const queryClient = useQueryClient();
  const { data } = useProfileCredentials(profileId);
  const experiences = data?.experiences || [];
  const [editing, setEditing] = useState<Experience | "new" | null>(null);
  const [form, setForm] = useState(emptyExperience);
  const [busy, setBusy] = useState(false);

  const open = (exp: Experience | "new") => {
    setEditing(exp);
    setForm(
      exp === "new"
        ? emptyExperience
        : {
            title: exp.title,
            company: exp.company,
            employment_type: exp.employment_type || "",
            location: exp.location || "",
            start: toMonth(exp.start_date),
            end: toMonth(exp.end_date),
            is_current: exp.is_current,
            description: exp.description || "",
          },
    );
  };

  const save = async () => {
    if (!form.title.trim() || !form.company.trim())
      return toast.error("Add your role and the company");
    if (!form.start) return toast.error("Add when you started");
    if (!form.is_current && form.end && form.end < form.start)
      return toast.error("The end date is before the start date");
    setBusy(true);
    const row = {
      profile_id: profileId,
      title: form.title.trim(),
      company: form.company.trim(),
      employment_type: form.employment_type || null,
      location: form.location.trim() || null,
      start_date: fromMonth(form.start),
      end_date: form.is_current ? null : fromMonth(form.end),
      is_current: form.is_current,
      description: form.description.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } =
      editing === "new"
        ? await supabase.from("profile_experiences").insert(row)
        : await supabase
            .from("profile_experiences")
            .update(row)
            .eq("id", (editing as Experience).id);
    setBusy(false);
    if (error) return toast.error(error.message || "Could not save");
    toast.success(editing === "new" ? "Experience added" : "Experience updated");
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ["profile-credentials", profileId] });
  };

  const remove = async () => {
    if (editing === "new" || !editing) return;
    setBusy(true);
    const { error } = await supabase.from("profile_experiences").delete().eq("id", editing.id);
    setBusy(false);
    if (error) return toast.error("Could not remove it");
    toast.success("Experience removed");
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ["profile-credentials", profileId] });
  };

  return (
    <section
      id="experience"
      className="scroll-mt-20 bg-card px-4 py-4 md:rounded-xl md:border md:border-border"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold">Experience</h2>
        <button
          type="button"
          onClick={() => open("new")}
          className="flex h-9 items-center gap-1 rounded-full bg-foreground px-3.5 text-[13.5px] font-semibold text-background"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      {experiences.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          Jobs, internships, freelance and volunteer roles.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {experiences.map((exp) => (
            <li key={exp.id} className="flex items-start gap-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.06]">
                <BriefcaseBusiness className="h-5 w-5 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{exp.title}</p>
                <p className="truncate text-[13.5px] text-foreground/80">{exp.company}</p>
                <p className="text-[12px] text-muted-foreground">{experienceSpan(exp)}</p>
              </div>
              <button
                type="button"
                onClick={() => open(exp)}
                aria-label={`Edit ${exp.title}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent
          desktopVariant="dialog"
          className="max-h-[92dvh] overflow-hidden border-border bg-background p-0"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-5 pb-2 pt-1 md:pt-5">
              <DrawerTitle className="font-display text-[20px] font-semibold">
                {editing === "new" ? "Add experience" : "Edit experience"}
              </DrawerTitle>
              <DrawerDescription className="mt-0.5 text-[13px] text-muted-foreground">
                Shown on your profile and portfolio as added by you.
              </DrawerDescription>
            </div>
            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 pb-4 pt-2">
              <label className="block">
                <span className={LABEL}>Role *</span>
                <input
                  className={FIELD}
                  value={form.title}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Product Designer"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Company or organisation *</span>
                <input
                  className={FIELD}
                  value={form.company}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Acme Studio"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className={LABEL}>Type</span>
                  <select
                    className={FIELD}
                    value={form.employment_type}
                    onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                  >
                    <option value="">Choose</option>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className={LABEL}>Location</span>
                  <input
                    className={FIELD}
                    value={form.location}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Lagos · Remote"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2.5 text-[14.5px] font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#cc208f]"
                  checked={form.is_current}
                  onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                />
                I currently work here
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className={LABEL}>Start *</span>
                  <input
                    type="month"
                    className={FIELD}
                    value={form.start}
                    onChange={(e) => setForm({ ...form, start: e.target.value })}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={LABEL}>End</span>
                  <input
                    type="month"
                    className={FIELD}
                    value={form.is_current ? "" : form.end}
                    disabled={form.is_current}
                    onChange={(e) => setForm({ ...form, end: e.target.value })}
                  />
                </label>
              </div>
              <label className="block">
                <span className={LABEL}>What you did</span>
                <textarea
                  className={`${FIELD} h-auto resize-none py-2.5 leading-relaxed`}
                  rows={5}
                  maxLength={2000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What you were responsible for, and what came of it."
                />
              </label>
            </div>
            <div className="flex gap-2 border-t border-border/60 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:pb-5">
              {editing !== "new" && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  aria-label="Remove"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-destructive/40 text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[15.5px] font-semibold text-background disabled:opacity-50"
              >
                {busy && <Loader2 className="h-5 w-5 animate-spin" />} Save
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}

/* ── Certificates ───────────────────────────────────── */

const emptyCertificate = {
  name: "",
  issuer: "",
  issued: "",
  expires: "",
  credential_id: "",
  credential_url: "",
};

export function CertificatesEditor({ profileId }: { profileId: string }) {
  const queryClient = useQueryClient();
  const { data } = useProfileCredentials(profileId);
  const certificates = data?.certificates || [];
  const [editing, setEditing] = useState<Certificate | "new" | null>(null);
  const [form, setForm] = useState(emptyCertificate);
  const [busy, setBusy] = useState(false);

  const open = (cert: Certificate | "new") => {
    setEditing(cert);
    setForm(
      cert === "new"
        ? emptyCertificate
        : {
            name: cert.name,
            issuer: cert.issuer,
            issued: toMonth(cert.issued_on),
            expires: toMonth(cert.expires_on),
            credential_id: cert.credential_id || "",
            credential_url: cert.credential_url || "",
          },
    );
  };

  const save = async () => {
    if (!form.name.trim() || !form.issuer.trim())
      return toast.error("Add the certificate name and who issued it");
    let url = form.credential_url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (form.issued && form.expires && form.expires < form.issued)
      return toast.error("The expiry date is before the issue date");
    setBusy(true);
    const row = {
      profile_id: profileId,
      name: form.name.trim(),
      issuer: form.issuer.trim(),
      issued_on: fromMonth(form.issued),
      expires_on: fromMonth(form.expires),
      credential_id: form.credential_id.trim() || null,
      credential_url: url || null,
      updated_at: new Date().toISOString(),
    };
    const { error } =
      editing === "new"
        ? await supabase.from("profile_certificates").insert(row)
        : await supabase
            .from("profile_certificates")
            .update(row)
            .eq("id", (editing as Certificate).id);
    setBusy(false);
    if (error)
      return toast.error(
        error.message.includes("credential_url")
          ? "That credential link doesn't look right"
          : error.message || "Could not save",
      );
    toast.success(editing === "new" ? "Certificate added" : "Certificate updated");
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ["profile-credentials", profileId] });
  };

  const remove = async () => {
    if (editing === "new" || !editing) return;
    setBusy(true);
    const { error } = await supabase.from("profile_certificates").delete().eq("id", editing.id);
    setBusy(false);
    if (error) return toast.error("Could not remove it");
    toast.success("Certificate removed");
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ["profile-credentials", profileId] });
  };

  return (
    <section
      id="certificates"
      className="scroll-mt-20 bg-card px-4 py-4 md:rounded-xl md:border md:border-border"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold">Licenses & certifications</h2>
        <button
          type="button"
          onClick={() => open("new")}
          className="flex h-9 items-center gap-1 rounded-full bg-foreground px-3.5 text-[13.5px] font-semibold text-background"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      {certificates.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          Certificates from other platforms and institutions. Zero Club bootcamps show up on their
          own.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {certificates.map((cert) => (
            <li key={cert.id} className="flex items-start gap-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#cc208f]/10 text-[#cc208f]">
                <Award className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{cert.name}</p>
                <p className="truncate text-[13.5px] text-foreground/80">{cert.issuer}</p>
                {cert.issued_on && (
                  <p className="text-[12px] text-muted-foreground">
                    Issued {monthYear(cert.issued_on)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => open(cert)}
                aria-label={`Edit ${cert.name}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent
          desktopVariant="dialog"
          className="max-h-[92dvh] overflow-hidden border-border bg-background p-0"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-5 pb-2 pt-1 md:pt-5">
              <DrawerTitle className="font-display text-[20px] font-semibold">
                {editing === "new" ? "Add certificate" : "Edit certificate"}
              </DrawerTitle>
              <DrawerDescription className="mt-0.5 text-[13px] text-muted-foreground">
                Add the credential link so anyone can check it.
              </DrawerDescription>
            </div>
            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 pb-4 pt-2">
              <label className="block">
                <span className={LABEL}>Name *</span>
                <input
                  className={FIELD}
                  value={form.name}
                  maxLength={160}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Google UX Design Certificate"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Issued by *</span>
                <input
                  className={FIELD}
                  value={form.issuer}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                  placeholder="Google · Coursera"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className={LABEL}>Issued</span>
                  <input
                    type="month"
                    className={FIELD}
                    value={form.issued}
                    onChange={(e) => setForm({ ...form, issued: e.target.value })}
                  />
                </label>
                <label className="block min-w-0">
                  <span className={LABEL}>Expires</span>
                  <input
                    type="month"
                    className={FIELD}
                    value={form.expires}
                    onChange={(e) => setForm({ ...form, expires: e.target.value })}
                  />
                </label>
              </div>
              <label className="block">
                <span className={LABEL}>Credential ID</span>
                <input
                  className={FIELD}
                  value={form.credential_id}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, credential_id: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Credential link</span>
                <input
                  className={FIELD}
                  value={form.credential_url}
                  inputMode="url"
                  autoCapitalize="none"
                  onChange={(e) => setForm({ ...form, credential_url: e.target.value })}
                  placeholder="https://…"
                />
              </label>
            </div>
            <div className="flex gap-2 border-t border-border/60 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:pb-5">
              {editing !== "new" && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  aria-label="Remove"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-destructive/40 text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[15.5px] font-semibold text-background disabled:opacity-50"
              >
                {busy && <Loader2 className="h-5 w-5 animate-spin" />} Save
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
