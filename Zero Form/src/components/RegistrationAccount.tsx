import { ArrowUpRight, LogOut } from "@/components/icons/glyphs";
import { zc } from "@/lib/config";

type AccountProfile = { full_name?: string | null; username?: string | null; avatar_url?: string | null };

export function RegistrationAccount({ profile, onSignOut }: { profile: AccountProfile | null; onSignOut: () => void }) {
  return (
      <section className="mb-5 flex flex-col gap-4 rounded-[22px] border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[17px] font-bold">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : (profile?.full_name || profile?.username || "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{profile?.full_name || profile?.username || "Your account"}</p>
          <p className="truncate text-[12.5px] text-muted-foreground">{profile?.username ? `@${profile.username} · ` : ""}Zero Club account</p>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <a href={zc("/app")} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-foreground px-4 text-[13px] font-semibold text-background sm:flex-none">
          Open Zero Club <ArrowUpRight className="h-4 w-4" />
        </a>
        <button type="button" onClick={onSignOut} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border px-4 text-[13px] font-semibold text-muted-foreground hover:text-foreground sm:flex-none">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
        </div>
      </section>
  );
}
