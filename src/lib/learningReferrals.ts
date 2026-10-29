import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

const ORIGIN = "https://www.zeroclubs.xyz";
const KEY = "zero-learning-referrals-v1";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
type Entry = { code:string; seenAt:number };
let memory: Record<string,Entry> = {};
function pending(): Record<string,Entry> {
  try {
    const value=JSON.parse(localStorage.getItem(KEY)||"{}");
    const entries:Record<string,Entry>=value && typeof value==="object" && !Array.isArray(value)?{...value}:{};
    for(const [id,entry] of Object.entries(memory))if(!entries[id] || entry.seenAt>=entries[id].seenAt)entries[id]=entry;
    return entries;
  } catch { return memory; }
}

/** The server binds the short code to auth.uid(), never to a browser-supplied referrer. */
export async function learningShareUrl({bootcampId,formSlug}:{bootcampId?:string;formSlug?:string}) {
  const {data:{session}} = await supabase.auth.getSession();
  if (!session) return formSlug ? `${ORIGIN}/form/${encodeURIComponent(formSlug)}` : `${ORIGIN}/app/bootcamps/${encodeURIComponent(bootcampId||"")}`;
  const {data,error} = await supabase.rpc("create_learning_share_link" as never,{p_bootcamp_id:bootcampId||null,p_form_slug:formSlug||null} as never);
  if (error || typeof data!=="string" || !/^[0-9a-f]{12}$/.test(data)) throw new Error("Could not create your referral link. Please try again.");
  return `${ORIGIN}/s/${data}`;
}

export async function claimLearningReferral(bootcampId?:string) {
  if (!bootcampId) return;
  const entry=pending()[bootcampId];
  if (!entry || !/^[0-9a-f]{12}$/.test(entry.code) || !Number.isFinite(entry.seenAt) || Date.now()-entry.seenAt>=MAX_AGE) return;
  const {data:{session}}=await supabase.auth.getSession();
  if (!session) return;
  const {error}=await supabase.rpc("record_learning_referral" as never,{p_code:entry.code,p_seen_at:new Date(entry.seenAt).toISOString()} as never);
  if (error) throw new Error("Could not save the bootcamp referral. Please try again before paying.");
}

export async function prepareLearningReferral({bootcampId,formSlug}:{bootcampId?:string;formSlug?:string}) {
  const code=new URLSearchParams(window.location.search).get("via");
  let camp=bootcampId;
  if (code && /^[0-9a-f]{12}$/.test(code)) {
    const {data,error}=await supabase.rpc("resolve_learning_share_link" as never,{p_code:code} as never);
    if (error) throw new Error("Could not check this referral link. Please try again.");
    const link=data as {bootcamp_id?:string;form_slug?:string}|null;
    if (link?.bootcamp_id && ((formSlug && link.form_slug===formSlug)||(!formSlug && link.bootcamp_id===bootcampId))) {
      camp=link.bootcamp_id;
      const entries=pending();
      if (entries[camp]?.code!==code || !Number.isFinite(entries[camp]?.seenAt) || Date.now()-entries[camp].seenAt>=MAX_AGE) entries[camp]={code,seenAt:Date.now()};
      memory=Object.fromEntries(Object.entries(entries).filter(([,v])=>v && Number.isFinite(v.seenAt) && Date.now()-v.seenAt<MAX_AGE).slice(-40));
      try { localStorage.setItem(KEY,JSON.stringify(memory)); } catch { /* The current-page referral still works through the memory fallback. */ }
    }
  }
  await claimLearningReferral(camp);
}

/** Capture on the destination page, then retain attribution through sign-in. */
export function useLearningReferral({bootcampId,formSlug,userId}:{bootcampId?:string;formSlug?:string;userId?:string|null}) {
  useEffect(()=>{
    void prepareLearningReferral({bootcampId,formSlug}).catch(()=>{ /* Payment retries attribution before money moves. */ });
  },[bootcampId,formSlug,userId]);
}
