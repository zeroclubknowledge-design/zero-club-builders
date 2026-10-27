import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { useAuth } from "@/lib/auth";
import { Brand } from "@/components/Brand";

export function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (session) void navigate({ to: "/" }); }, [session, navigate]);
  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-3 py-4 text-foreground sm:px-5">
      <Link to="/" className="mx-auto flex w-full max-w-[560px] items-center gap-2.5"><Brand /></Link>
      <div className="mx-auto mt-6 w-full max-w-[560px] rounded-[22px] border border-border bg-card p-4 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.35)] sm:p-6">
        <AuthPanel initialMode={mode} compact onDone={() => void navigate({ to: "/" })} />
      </div>
    </div>
  );
}
