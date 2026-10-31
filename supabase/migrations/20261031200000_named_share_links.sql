begin;
create table if not exists public.named_share_links (
  path text primary key,
  sharer_id uuid not null references public.profiles(id) on delete cascade,
  destination text not null,
  unique(sharer_id, destination)
);
alter table public.named_share_links enable row level security;
revoke all on public.named_share_links from public, anon, authenticated;

create or replace function public.create_named_share(p_destination text, p_title text default null)
returns text language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); handle text; result text; base text; kind text;
  resource text; tab text; item jsonb; suffix integer := 1; label text;
begin
  if caller is null then raise exception 'Please sign in to share'; end if;
  if length(p_destination)>2048 or p_destination !~ '^/(app/(post|profile|bootcamps|notes|live|challenge|games/t)/[^/?#]+|product/[^/?#]+|s/[0-9a-f]{12})([?#].*)?$'
     or p_destination ~ '[\\\r\n]' then raise exception 'Unsupported share destination'; end if;
  select username into handle from public.profiles where id=caller;
  if handle is null or handle !~ '^[A-Za-z0-9_]+$' then raise exception 'Please set your username first'; end if;
  perform pg_advisory_xact_lock(hashtextextended('named-share',0));
  select path into result from public.named_share_links where sharer_id=caller and destination=p_destination;
  if result is not null then return result; end if;
  resource := split_part(split_part(p_destination,'?',1),'#',1);
  kind := case when resource like '/app/games/t/%' then 'tournament'
    when resource like '/app/%' then split_part(resource,'/',3)
    else split_part(resource,'/',2) end;
  resource := regexp_replace(resource,'^.*/','');
  tab := case kind when 'post' then 'posts' when 'profile' then 'profiles'
    when 'bootcamps' then 'bootcamps' when 'notes' then 'notes'
    when 'product' then 'store_items' when 'live' then 'live_classes'
    when 'challenge' then 'challenges' when 'tournament' then 'zero_tournaments' end;
  if tab is not null and to_regclass('public.'||tab) is not null then
    execute format('select to_jsonb(t) from public.%I t where t.id::text=$1',tab) into item using resource;
  end if;
  if kind='s' and to_regclass('public.learning_share_links') is not null then
    select to_jsonb(b) into item from public.learning_share_links l
      join public.bootcamps b on b.id=l.bootcamp_id where l.code=resource;
    kind := 'learning';
  end if;
  label := coalesce(item->>'username',item->>'title',item->>'name',nullif(p_title,''),nullif(left(regexp_replace(item->>'content','<[^>]*>','','g'),70),''),kind);
  base := left(trim(both '-' from regexp_replace(lower(label),'[^a-z0-9]+','-','g')),64);
  if base='' then base:=kind; end if;
  result := '/share/'||kind||'/'||base||'/'||handle;
  while exists(select 1 from public.named_share_links where path=result) loop
    suffix:=suffix+1;
    result := '/share/'||kind||'/'||base||'-'||suffix||'/'||handle;
  end loop;
  insert into public.named_share_links values(result,caller,p_destination);
  return result;
end $$;

create or replace function public.resolve_named_share(p_path text)
returns text language sql stable security definer set search_path=public as $$
  select destination from public.named_share_links where path=p_path;
$$;
revoke all on function public.create_named_share(text,text),public.resolve_named_share(text) from public;
grant execute on function public.create_named_share(text,text) to authenticated;
grant execute on function public.resolve_named_share(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
