-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp via Supabase MCP (migration "fund_link_hide").
-- Kept as a record; do not re-run.
-- Lets a member swipe a CLOSED money request off their Request Money page.

alter table public.fund_links add column if not exists hidden_at timestamptz;

create or replace function public.hide_fund_link(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare caller uuid := auth.uid(); affected integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  update public.fund_links set hidden_at = now()
  where slug = p_slug and owner_id = caller and status <> 'active';
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'Only closed requests can be removed'; end if;
  return jsonb_build_object('hidden', true);
end;
$fn$;
revoke all on function public.hide_fund_link(text) from public, anon;
grant execute on function public.hide_fund_link(text) to authenticated;
