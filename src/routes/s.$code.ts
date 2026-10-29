import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

async function follow(code:string) {
  if (!/^[0-9a-f]{12}$/i.test(code)) return new Response("Link not found",{status:404});
  const {data,error}=await supabase.rpc("resolve_learning_share_link" as never,{p_code:code.toLowerCase()} as never);
  const link=data as {bootcamp_id?:string;form_slug?:string}|null;
  if (error) return new Response("This link is temporarily unavailable. Please try again.",{status:503,headers:{"Cache-Control":"no-store"}});
  if (!link?.bootcamp_id && !link?.form_slug) return new Response("Link not found",{status:404});
  const path=link.form_slug ? `/form/${encodeURIComponent(link.form_slug)}` : `/app/bootcamps/${encodeURIComponent(link.bootcamp_id!)}`;
  return new Response(null,{status:302,headers:{Location:`https://www.zeroclubs.xyz${path}?via=${code.toLowerCase()}`,"Cache-Control":"no-store"}});
}
export const Route=createFileRoute("/s/$code")({server:{handlers:{GET:({params}:any)=>follow(params.code),HEAD:({params}:any)=>follow(params.code)}}});
