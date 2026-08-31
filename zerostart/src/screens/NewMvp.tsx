import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CATEGORIES } from "@/types";
import { Card } from "@/components/ui/primitives";

/** A URL-safe slug, made unique by a short suffix rather than by a round trip
    to check — the column is unique, so a collision would be an error either
    way, and this makes one practically impossible. */
function slugify(name: string) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mvp";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export function NewMvp() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [fullDescription, setFullDescription] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [zerohubUrl, setZerohubUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the database's own constraints, so the form refuses what the
  // database would refuse — but the database stays the one that decides.
  const hasLink = Boolean(zerohubUrl.trim() || websiteUrl.trim());
  const valid =
    name.trim().length >= 2 &&
    shortDescription.trim().length >= 10 &&
    shortDescription.trim().length <= 200 &&
    hasLink;

  const save = async (submitForReview: boolean) => {
    if (!session) { navigate({ to: "/signin" }); return; }
    setSaving(true);
    setError(null);

    const { data, error: e } = await supabase
      .from("zs_mvps")
      .insert({
        builder_id: session.user.id,
        name: name.trim(),
        slug: slugify(name),
        short_description: shortDescription.trim(),
        full_description: fullDescription.trim() || null,
        category,
        zerohub_url: zerohubUrl.trim() || null,
        website_url: websiteUrl.trim() || null,
        logo_url: logoUrl.trim() || null,
        status: submitForReview ? "pending_review" : "draft",
      })
      .select("id")
      .single();

    setSaving(false);
    if (e) { setError(e.message); return; }
    if (data) navigate({ to: "/build" });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/build" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Build
      </Link>

      <Card className="p-6 sm:p-8">
        <h1 className="text-[22px] font-bold text-ink">List your MVP</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          Testers see this before they decide to spend their time on you. Be concrete about
          what it does.
        </p>

        <Text label="Name" value={name} onChange={setName} placeholder="What it's called" />

        <Text
          label="One-line description"
          value={shortDescription}
          onChange={setShortDescription}
          placeholder="What it does, in a sentence"
          hint={`${shortDescription.trim().length}/200 · at least 10 characters`}
        />

        <label className="mt-5 block">
          <span className="text-[13px] font-medium text-ink">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition focus:border-accent/50"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <Area
          label="Full description"
          value={fullDescription}
          onChange={setFullDescription}
          placeholder="What you're trying to prove, who it's for, anything a tester should know before they start."
        />

        <Text label="Zerohub link" value={zerohubUrl} onChange={setZerohubUrl}
          placeholder="https://www.zeroclubs.xyz/app/zerohub?product=…" />
        <Text label="Or a direct link" value={websiteUrl} onChange={setWebsiteUrl}
          placeholder="https://" hint="One of the two links is required — testers need somewhere to go." />
        <Text label="Logo URL" value={logoUrl} onChange={setLogoUrl} placeholder="Optional" />

        {error && (
          <p className="mt-5 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>
        )}

        {/* Both buttons are w-full on phones and sm:flex-1 side by side, so they
            are always the same size. A bare `flex-1` here was the bug: on a
            phone this container is flex-col, so flex-1 applies to the vertical
            axis and its flex-basis:0% squashed the button's height, overriding
            h-12. The draft button had no flex-1 and so kept its full height —
            which is exactly the mismatch that showed up. */}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => save(true)}
            disabled={!valid || saving}
            className="zs-glow h-12 w-full shrink-0 rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1"
          >
            {saving ? "Saving…" : "Submit for review"}
          </button>
          <button
            onClick={() => save(false)}
            disabled={!valid || saving}
            className="h-12 w-full shrink-0 rounded-full bg-white/8 text-[14px] font-semibold text-ink transition hover:bg-white/12 disabled:opacity-40 sm:flex-1"
          >
            Save as draft
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          A ZeroStart admin checks every listing before it goes live. Once approved, you can
          open a campaign and start recruiting testers.
        </p>
      </Card>
    </div>
  );
}

function Text({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
      />
      {hint && <span className="mt-1.5 block text-[11.5px] text-ink-faint">{hint}</span>}
    </label>
  );
}

function Area({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="mt-2 w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
      />
    </label>
  );
}
