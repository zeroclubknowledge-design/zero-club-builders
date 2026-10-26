import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { CertificateArtwork } from "./CertificateArtwork";
import { SignatureInput } from "./SignatureInput";
import type { CertificateDesign } from "./design";

type CosignRequest = {
  bootcamp_id: string;
  bootcamp_title: string;
  starts_at: string | null;
  status: "pending" | "signed";
  name: string;
  title: string;
  signature_url: string | null;
  signed_at: string | null;
  creator: { id: string; name: string | null; avatar_url: string | null } | null;
  design: CertificateDesign | null;
};

/**
 * Certificates someone asked you to co-sign (two-signature PRO designs).
 * You see the certificate with your signature in place, draw or upload it,
 * and sign. Until you do, the bootcamp's certificates can't be issued.
 * Opened from the notification (/app/certifications?sign=<bootcamp id>).
 */
export function CosignRequests() {
  const { data: user } = useUser();
  const q = useQuery({
    queryKey: ["certificate-cosign-requests", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_certificate_cosign_requests" as never);
      if (error) throw error;
      return (data || []) as unknown as CosignRequest[];
    },
  });
  const focus = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sign") : null;
  const list = q.data || [];
  if (!list.length) return null;
  const pending = list.filter((r) => r.status === "pending").length;
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#9a1963]">Co-signing</p>
        <h2 className="mt-1 font-display text-xl font-semibold">
          {pending ? `Waiting for your signature (${pending})` : "Certificates you co-signed"}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          These bootcamps use a two-signature certificate with you as the second signatory. Learners' certificates are issued only after you sign.
        </p>
      </div>
      {list.map((r) => <CosignCard key={r.bootcamp_id} request={r} highlight={focus === r.bootcamp_id} />)}
    </section>
  );
}

function CosignCard({ request, highlight }: { request: CosignRequest; highlight: boolean }) {
  const client = useQueryClient();
  const ref = useRef<HTMLElement>(null);
  const [signature, setSignature] = useState(request.signature_url || "");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(request.status === "pending");
  useEffect(() => { if (highlight) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [highlight]);

  const sign = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("sign_bootcamp_certificate" as never, { p_bootcamp: request.bootcamp_id, p_signature_url: signature } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signed", { description: `Your signature is on the certificates for ${request.bootcamp_title}.` });
      setEditing(false);
      void client.invalidateQueries({ queryKey: ["certificate-cosign-requests"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save your signature"),
  });

  const design: CertificateDesign | null = request.design
    ? { ...request.design, cosigner: { ...(request.design.cosigner || {}), name: request.name || request.design.cosigner?.name || "", title: request.title || request.design.cosigner?.title || "", signature_url: signature || undefined } }
    : null;
  const starts = request.starts_at ? new Date(request.starts_at) : null;
  const signed = request.status === "signed";

  return (
    <article ref={ref} className={`overflow-hidden rounded-2xl border bg-card ${highlight ? "border-[#c3217e] ring-2 ring-[#c3217e]/20" : "border-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{request.bootcamp_title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            From {request.creator?.name || "the bootcamp creator"}
            {starts ? ` · starts ${starts.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${signed ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/12 text-amber-700 dark:text-amber-400"}`}>
          {signed ? `Signed${request.signed_at ? ` · ${new Date(request.signed_at).toLocaleDateString()}` : ""}` : "Needs your signature"}
        </span>
      </div>
      {design && (
        <div className="border-y border-border bg-white">
          <CertificateArtwork design={design} course={request.bootcamp_title} />
        </div>
      )}
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          You sign as <b className="text-foreground">{request.name || "the second signatory"}</b>{request.title ? `, ${request.title}` : ""}. The bootcamp creator sets the name and title.
        </p>
        {editing ? (
          <>
            <SignatureInput value={signature} onChange={setSignature} onBusyChange={setBusy} disabled={sign.isPending} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!signature || busy || sign.isPending}
                onClick={() => sign.mutate()}
                className="min-h-11 rounded-full bg-foreground px-6 text-sm font-semibold text-background disabled:opacity-50"
              >
                {sign.isPending ? "Signing…" : signed ? "Save new signature" : "Sign the certificates"}
              </button>
              {signed && (
                <button type="button" onClick={() => { setSignature(request.signature_url || ""); setEditing(false); }} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold">
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold">
            Change my signature
          </button>
        )}
      </div>
    </article>
  );
}
