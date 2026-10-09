-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp via Supabase MCP (migration "retire_linkedin_share_rewards").
-- Kept as a record. Do not re-run.
-- LinkedIn sharing no longer earns ZP. The functions stay (older app builds
-- still call them) but always award nothing.
create or replace function public.claim_linkedin_share_reward(p_post uuid)
returns jsonb language sql security definer set search_path to 'public' as $$
  select jsonb_build_object('awarded', 0, 'reason', 'retired');
$$;

create or replace function public.claim_linkedin_product_share_reward(p_item uuid)
returns jsonb language sql security definer set search_path to 'public' as $$
  select jsonb_build_object('awarded', 0, 'reason', 'retired');
$$;

create or replace function public.linkedin_reward_daily_left(p_profile uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select 0;
$$;
