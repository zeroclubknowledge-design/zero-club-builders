import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, X } from "@/components/icons/glyphs";
import { useAuth } from "@/lib/auth";
import { zc } from "@/lib/config";
import { getSharedAccounts, switchSharedAccount, type SharedAccount } from "@/lib/sharedAccounts";

export function AccountMenu({children,to}:{children:ReactNode;to:string}) {
  const {session,profile} = useAuth();
  const [open,setOpen] = useState(false), [accounts,setAccounts] = useState<SharedAccount[]>([]);
  const [loading,setLoading] = useState(false), [busy,setBusy] = useState<string|null>(null), [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if (open) dialog.current?.showModal(); else dialog.current?.close();
  },[open]);
  useEffect(()=>{
    if (!open) return;
    let alive = true;setLoading(true);setError("");setAccounts([]);
    getSharedAccounts().then(rows=>{if(alive)setAccounts(rows);},err=>{if(alive)setError(err.message);}).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[open,attempt]);
  const current:SharedAccount = {id:session?.user.id || "",username:profile?.username || "",full_name:profile?.full_name || "Your account",avatar_url:profile?.avatar_url || null};
  const rows = [current,...accounts.filter(row=>row.id!==current.id)];
  const choose = async (account:SharedAccount) => {
    if (busy || !session || account.id===current.id) return;
    setBusy(account.id);setError("");
    try { await switchSharedAccount(account.id); window.location.reload(); }
    catch(err) {setError((err as Error).message);setBusy(null);}
  };
  return <>
    <button type="button" aria-label="Your account and switch accounts" aria-haspopup="dialog" onClick={()=>setOpen(true)} className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] ring-2 ring-transparent transition hover:ring-border focus-visible:ring-[#c3217e]">{children}</button>
    <dialog ref={dialog} aria-labelledby="account-menu-title" onCancel={event=>{if(busy)event.preventDefault();else setOpen(false);}} onClose={()=>setOpen(false)} onClick={event=>{const box=event.currentTarget.getBoundingClientRect();if(!busy && (event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))setOpen(false);}} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:max-w-[440px] sm:rounded-[28px] sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id="account-menu-title" className="text-lg font-bold">Switch account</h2><button type="button" disabled={!!busy} aria-label="Close account menu" onClick={()=>setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-foreground/[0.06] disabled:opacity-40"><X className="h-4 w-4" /></button></div>
      <p className="mb-4 text-sm text-muted-foreground">Accounts you’ve added in Zero Club on this browser.</p>
      <div className="space-y-2">{rows.map(account=><button type="button" key={account.id} disabled={!!busy || account.id===current.id} onClick={()=>void choose(account)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-default ${account.id===current.id ? "border-[#c3217e]/30 bg-[#c3217e]/[0.07]" : "border-border hover:bg-foreground/[0.04]"}`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] font-bold">{account.avatar_url?<img src={account.avatar_url} alt="" className="h-full w-full object-cover"/>:(account.full_name||account.username||"?").charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{account.full_name||account.username||"Zero account"}</span><span className="block truncate text-xs text-muted-foreground">{account.username?`@${account.username}`:account.id===current.id?"Current account":"Added account"}</span></span>
        {busy===account.id?<Loader2 className="h-4 w-4 animate-spin text-[#c3217e]"/>:account.id===current.id?<><span className="text-xs text-[#c3217e]">Current</span><Check className="h-4 w-4 text-[#c3217e]"/></>:null}
      </button>)}</div>
      {loading&&<p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Finding your added accounts…</p>}
      {error&&<div role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error} <button type="button" disabled={!!busy} onClick={()=>setAttempt(n=>n+1)} className="font-semibold underline">Try again</button></div>}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4"><Link to={to} onClick={()=>setOpen(false)} className={`rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background ${busy?"pointer-events-none opacity-50":""}`}>View my account</Link><a href={zc("/app/settings/account")} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold">Manage accounts</a></div>
    </dialog>
  </>;
}
