import { useEffect, useState } from "react";
import { giftTimeLeft } from "@/lib/giftClaimExpiry";

export function GiftClaimDeadline({ expiresAt, className = "mt-3 text-xs text-white/65" }: { expiresAt?: string | null; className?: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) return null;
  const expired = Date.parse(expiresAt) <= now;
  return <p className={className} aria-label="Gift claim deadline">
    <span className="block font-semibold">{expired ? "Claim deadline passed" : `Use within ${giftTimeLeft(expiresAt, now)}`}</span>
    <span className="block">{expired ? "Expired" : "Use before"} {new Date(expiresAt).toLocaleString()}.</span>
    <span className="mt-1 block">Completely unused claims return to the available places.</span>
  </p>;
}
