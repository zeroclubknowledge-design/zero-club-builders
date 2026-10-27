-- Browse open campaigns from either app, including platform-sponsored admin
-- campaigns. Do not infer discoverability from wallet funding or old opt-in flags.
begin;

create or replace function public.browse_zero_gift_campaigns(
  p_service text default null, p_search text default null, p_limit integer default 60
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  wanted_service text := nullif(lower(btrim(p_service)), '');
  term text := lower(ltrim(btrim(coalesce(p_search, '')), '@'));
begin
  -- Refresh unused reservations before filtering exhausted campaigns. This
  -- migration also works on deployments that have not installed the use window.
  if to_regprocedure('public.refresh_zero_gift_claims(uuid)') is not null then
    execute 'select public.refresh_zero_gift_claims(null::uuid)';
  end if;
  if wanted_service = 'support' then wanted_service := 'universal'; end if;

  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
  into result
  from (
    select g.id, g.created_at, jsonb_build_object(
      'id', g.id, 'code', g.code, 'amount', g.amount, 'service', g.service,
      'template_id', g.template_id, 'message', g.message,
      'custom_purpose', g.custom_purpose, 'quantity', g.quantity,
      'claims_remaining', greatest(0, g.quantity - g.claimed_count),
      'expires_at', g.expires_at, 'created_at', g.created_at,
      'creator', jsonb_build_object(
        'id', p.id, 'name', coalesce(nullif(p.full_name, ''), p.username, 'Zero Club member'),
        'username', p.username, 'avatar_url', p.avatar_url
      ),
      'clubs', coalesce((select jsonb_agg(c.name order by c.name)
        from public.clubs c where c.id = any(g.club_ids)), '[]'::jsonb),
      'bootcamps', coalesce((select jsonb_agg(b.title order by b.title)
        from public.bootcamps b where b.id = any(g.bootcamp_ids)), '[]'::jsonb),
      'mine', coalesce(g.creator_id = auth.uid(), false),
      'claimed', exists(select 1 from public.gift_cards receipt
        where receipt.parent_gift_id = g.id and receipt.claimed_by = auth.uid())
    ) as item
    from public.gift_cards g
    left join public.profiles p on p.id = g.creator_id
    where g.parent_gift_id is null and g.claimed_by is null
      and g.status = 'active' and g.refunded_at is null
      and g.expires_at > now() and g.claimed_count < g.quantity
      and (wanted_service is null or g.service = wanted_service
        or (wanted_service = 'universal' and g.service = 'support'))
      and (term = '' or strpos(lower(concat_ws(' ', g.message,
        g.custom_purpose, p.full_name, p.username)), term) > 0)
    order by g.created_at desc, g.id desc
    limit greatest(1, least(coalesce(p_limit, 60), 100))
  ) campaigns;
  return result;
end;
$$;

revoke all on function public.browse_zero_gift_campaigns(text,text,integer) from public;
grant execute on function public.browse_zero_gift_campaigns(text,text,integer) to anon, authenticated;

create index if not exists zero_gift_open_campaigns_idx
on public.gift_cards(created_at desc, id desc)
where parent_gift_id is null and claimed_by is null and status = 'active' and refunded_at is null;

-- Existing deployed clients call browse_gift_cards. Preserve its return type
-- while routing it through the same rules, so applying SQL fixes old clients too.
do $$
declare
  legacy_oid regprocedure := to_regprocedure('public.browse_gift_cards(text,text,integer)');
  return_shape text;
  body text;
  argument_names text[];
begin
  if legacy_oid is null then
    return_shape := 'jsonb';
  else
    select pg_get_function_result(oid), proargnames into return_shape, argument_names
    from pg_proc where oid = legacy_oid;
    if argument_names[1:3] is distinct from array['p_service','p_search','p_limit']::text[] then
      raise warning 'Legacy gift browse argument names differ; deploy Zero Gifts to use browse_zero_gift_campaigns';
      return;
    end if;
  end if;
  case return_shape
    when 'jsonb' then body := 'select public.browse_zero_gift_campaigns(p_service,p_search,p_limit)';
    when 'jsonb[]' then body := 'select coalesce(array_agg(value),array[]::jsonb[]) from jsonb_array_elements(public.browse_zero_gift_campaigns(p_service,p_search,p_limit))';
    when 'SETOF jsonb' then body := 'select value from jsonb_array_elements(public.browse_zero_gift_campaigns(p_service,p_search,p_limit))';
    else
      raise warning 'Legacy gift browse return shape differs; deploy Zero Gifts to use browse_zero_gift_campaigns';
      return;
  end case;
  execute format('create or replace function public.browse_gift_cards(p_service text default null,p_search text default null,p_limit integer default 60) returns %s language sql security definer set search_path=public as $body$ %s $body$',return_shape,body);
  revoke all on function public.browse_gift_cards(text,text,integer) from public;
  grant execute on function public.browse_gift_cards(text,text,integer) to anon, authenticated;
end;
$$;

notify pgrst, 'reload schema';
commit;
