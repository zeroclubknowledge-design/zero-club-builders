-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp on 2026-10-08 via Supabase MCP (migration "project_voice_confirmation").
-- Kept as a record; do not re-run.
-- A confirmation authorizes one immutable project snapshot, never a user-wide unlock.
begin;
create table public.project_publish_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  project_name text not null,
  target_id uuid references public.posts(id) on delete cascade,
  target_revision text,
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled','published')),
  method text check (method in ('voice','text')),
  voice_reserved boolean not null default false,
  call_id uuid unique,
  post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index project_publish_verifications_owner_idx on public.project_publish_verifications(profile_id, created_at desc);
alter table public.project_publish_verifications enable row level security;
revoke all on public.project_publish_verifications from public, anon, authenticated;
grant select on public.project_publish_verifications to authenticated;
grant all on public.project_publish_verifications to service_role;
create policy verification_owner_read on public.project_publish_verifications for select to authenticated using (profile_id = auth.uid());

-- The guard validates this ID. Avoid a circular FK cascade during account deletion.
alter table public.posts add column shipment_verification_id uuid;

create function public.project_publish_snapshot(p public.posts) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('content',p.content,'media_urls',coalesce(p.media_urls,'{}'::text[]),
    'project_root_id',p.project_root_id,'version_label',p.version_label,'release_notes',p.release_notes,
    'available_for_use',p.available_for_use,'license_type',p.license_type,'license_price',p.license_price,
    'bootcamp_id',p.bootcamp_id,'audience',p.audience,'audience_club_id',p.audience_club_id);
$$;

create function public.prepare_project_publication(p_payload jsonb, p_target_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid(); candidate public.posts; existing public.posts; result public.project_publish_verifications;
  title text; revision text; linked_club uuid;
begin
  if caller is null then raise exception 'Sign in to publish a project'; end if;
  -- Serialize attempts per account, including the quota check.
  perform 1 from public.profiles where id = caller for update;
  if not found then raise exception 'Account not found'; end if;
  if (select count(*) from public.project_publish_verifications where profile_id = caller and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many confirmation attempts. Try again later';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 100000 then raise exception 'Invalid project'; end if;
  candidate := jsonb_populate_record(null::public.posts, p_payload);
  candidate.author_id := caller;
  candidate.is_build_post := true;
  candidate.media_urls := coalesce(candidate.media_urls,'{}'::text[]);
  candidate.version_label := coalesce(nullif(trim(candidate.version_label),''),'1.0.0');
  candidate.available_for_use := coalesce(candidate.available_for_use,false);
  candidate.license_type := coalesce(candidate.license_type,'standard');
  candidate.license_price := case when candidate.available_for_use then coalesce(candidate.license_price,0) else 0 end;
  candidate.audience := coalesce(candidate.audience,'everyone');
  title := trim(replace(split_part(candidate.content,E'\n',1),'**Project:**',''));
  if candidate.content is null or candidate.content not like '**Project:** %' or length(title) not between 1 and 140
    or length(candidate.content) > 30000 or cardinality(candidate.media_urls) > 12
    or length(candidate.version_label) > 40 or length(coalesce(candidate.release_notes,'')) > 10000
    or candidate.license_type not in ('standard','commercial','full_ownership') or candidate.license_price < 0 or candidate.license_price > 100000000
    or candidate.audience not in ('everyone','club') then raise exception 'Invalid project details'; end if;
  if exists(select 1 from unnest(candidate.media_urls) u where u is null or u !~ '^https://' or length(u) > 2048) then
    raise exception 'Invalid project media';
  end if;
  if p_target_id is not null then
    select p.* into existing from public.posts p where p.id = p_target_id and p.author_id = caller and p.is_build_post for update;
    if not found then raise exception 'You can only edit your own project'; end if;
    revision := public.project_publish_snapshot(existing)::text;
  end if;
  if candidate.project_root_id is not null and not exists(select 1 from public.posts where id = candidate.project_root_id and author_id = caller and is_build_post) then
    raise exception 'You can only release versions of your own project';
  end if;
  if candidate.bootcamp_id is not null then
    select id into linked_club from public.clubs where bootcamp_id = candidate.bootcamp_id limit 1;
    if not exists(select 1 from public.enrollments where bootcamp_id = candidate.bootcamp_id and profile_id = caller)
      and not exists(select 1 from public.club_members where club_id = linked_club and profile_id = caller) then
      raise exception 'Join the bootcamp before tagging this project';
    end if;
  end if;
  if candidate.audience = 'club' then
    if linked_club is null or not exists(select 1 from public.club_members where club_id = linked_club and profile_id = caller) then
      raise exception 'Choose a bootcamp club you belong to for club-only visibility';
    end if;
    candidate.audience_club_id := linked_club;
  else candidate.audience_club_id := null;
  end if;
  insert into public.project_publish_verifications(profile_id,payload,project_name,target_id,target_revision)
    values(caller,public.project_publish_snapshot(candidate),title,p_target_id,revision) returning * into result;
  return jsonb_build_object('id',result.id,'status',result.status,'project_name',title,'payload',result.payload,'target_id',p_target_id,'expires_at',result.expires_at);
end;
$$;

create function public.reserve_project_voice_confirmation(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.project_publish_verifications;
begin
  update public.project_publish_verifications set voice_reserved = true
    where id = p_id and profile_id = auth.uid() and status = 'pending' and expires_at > now() and not voice_reserved returning * into v;
  if not found then raise exception 'This confirmation is no longer available. Start a new attempt'; end if;
  return to_jsonb(v);
end;
$$;

create function public.bind_project_voice_call(p_id uuid, p_call_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.project_publish_verifications set call_id = p_call_id
    where id = p_id and status = 'pending' and expires_at > now() and voice_reserved and call_id is null;
  return found;
end;
$$;

create function public.record_project_voice_decision(p_call_id uuid, p_decision text) returns text
language plpgsql security definer set search_path = public as $$
declare v public.project_publish_verifications;
begin
  if p_decision is null or p_decision not in ('approved','denied','cancelled') then raise exception 'Invalid decision'; end if;
  select * into v from public.project_publish_verifications where call_id = p_call_id for update;
  if not found then raise exception 'Call is not attached to a project confirmation'; end if;
  if v.status = 'pending' and v.expires_at > now() then
    update public.project_publish_verifications set status = p_decision, method = 'voice' where id = v.id;
    return p_decision;
  end if;
  return v.status;
end;
$$;

create function public.confirm_project_publication_text(p_id uuid, p_phrase text) returns text
language plpgsql security definer set search_path = public as $$
declare v public.project_publish_verifications;
begin
  select * into v from public.project_publish_verifications where id = p_id and profile_id = auth.uid() for update;
  if not found or v.status <> 'pending' or v.expires_at <= now() or v.voice_reserved then
    raise exception 'Start a fresh text confirmation';
  end if;
  if p_phrase is distinct from 'PUBLISH ' || v.project_name then raise exception 'Type the exact confirmation shown'; end if;
  update public.project_publish_verifications set status = 'approved', method = 'text' where id = v.id;
  return 'approved';
end;
$$;

create function public.cancel_project_publication(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.project_publish_verifications set status = 'cancelled'
    where id = p_id and profile_id = auth.uid() and status in ('pending','approved');
end;
$$;

-- Enforce confirmation even if a client skips the UI and writes directly to posts.
create function public.guard_confirmed_project_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.project_publish_verifications; current_revision text;
begin
  if TG_OP = 'UPDATE' then
    if not coalesce(old.is_build_post,false) and not coalesce(new.is_build_post,false) then return new; end if;
    if new.author_id is not distinct from old.author_id and new.is_build_post is not distinct from old.is_build_post
      and new.shipment_verification_id is not distinct from old.shipment_verification_id
      and public.project_publish_snapshot(new) = public.project_publish_snapshot(old) then return new; end if;
    if not coalesce(new.is_build_post,false) then raise exception 'Project publication cannot be bypassed'; end if;
  elsif not coalesce(new.is_build_post,false) then return new;
  end if;
  select * into v from public.project_publish_verifications where id = new.shipment_verification_id for update;
  if not found or auth.uid() is distinct from new.author_id or v.profile_id is distinct from new.author_id
    or v.status <> 'approved' or v.expires_at <= now() or v.payload <> public.project_publish_snapshot(new) then
    raise exception 'Confirm this exact project before publishing';
  end if;
  if (TG_OP = 'INSERT' and v.target_id is not null) or (TG_OP = 'UPDATE' and v.target_id is distinct from old.id) then
    raise exception 'Confirmation belongs to a different project action';
  end if;
  if TG_OP = 'UPDATE' then
    current_revision := public.project_publish_snapshot(old)::text;
    if current_revision is distinct from v.target_revision then raise exception 'Project changed. Review it and confirm again'; end if;
  end if;
  -- Membership may have changed while the voice conversation was active.
  if new.bootcamp_id is not null and not exists(select 1 from public.enrollments where bootcamp_id = new.bootcamp_id and profile_id = new.author_id)
    and not exists(select 1 from public.club_members m join public.clubs c on c.id = m.club_id where c.bootcamp_id = new.bootcamp_id and m.profile_id = new.author_id) then
    raise exception 'Join the bootcamp before tagging this project';
  end if;
  if new.audience = 'club' and not exists(select 1 from public.club_members where club_id = new.audience_club_id and profile_id = new.author_id) then
    raise exception 'You no longer belong to this club';
  end if;
  update public.project_publish_verifications set status = 'published' where id = v.id;
  return new;
end;
$$;
create trigger guard_confirmed_project_write before insert or update on public.posts
for each row execute function public.guard_confirmed_project_write();

-- Store the resulting project for every approved write, including a direct RLS write.
create function public.finish_confirmed_project_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shipment_verification_id is not null then
    update public.project_publish_verifications set post_id = new.id
      where id = new.shipment_verification_id and status = 'published' and post_id is null;
  end if;
  return new;
end;
$$;
create trigger finish_confirmed_project_write after insert or update on public.posts
for each row execute function public.finish_confirmed_project_write();
revoke all on function public.finish_confirmed_project_write() from public,anon,authenticated;

create function public.publish_confirmed_project(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.project_publish_verifications; candidate public.posts; saved public.posts; revision text;
begin
  select * into v from public.project_publish_verifications where id = p_id and profile_id = auth.uid() for update;
  if not found then raise exception 'Confirmation not found'; end if;
  -- Retrying a completed request returns its original project, without duplicate posts or rewards.
  if v.status = 'published' then return jsonb_build_object('id',v.post_id); end if;
  if v.status <> 'approved' or v.expires_at <= now() then raise exception 'Project has not been authorized'; end if;
  candidate := jsonb_populate_record(null::public.posts,v.payload);
  if v.target_id is null then
    insert into public.posts(author_id,content,media_urls,is_build_post,project_root_id,version_label,release_notes,
      available_for_use,license_type,license_price,bootcamp_id,audience,audience_club_id,shipment_verification_id)
    values(v.profile_id,candidate.content,candidate.media_urls,true,candidate.project_root_id,candidate.version_label,candidate.release_notes,
      candidate.available_for_use,candidate.license_type,candidate.license_price,candidate.bootcamp_id,candidate.audience,candidate.audience_club_id,v.id)
    returning * into saved;
  else
    select public.project_publish_snapshot(p)::text into revision from public.posts p where id = v.target_id and author_id = auth.uid() for update;
    if not found or revision is distinct from v.target_revision then raise exception 'Project changed. Review it and confirm again'; end if;
    update public.posts set content = candidate.content,media_urls = candidate.media_urls,project_root_id = candidate.project_root_id,
      version_label = candidate.version_label,release_notes = candidate.release_notes,available_for_use = candidate.available_for_use,
      license_type = candidate.license_type,license_price = candidate.license_price,bootcamp_id = candidate.bootcamp_id,
      audience = candidate.audience,audience_club_id = candidate.audience_club_id,shipment_verification_id = v.id
      where id = v.target_id and author_id = auth.uid() returning * into saved;
  end if;
  update public.project_publish_verifications set post_id = saved.id where id = v.id;
  return jsonb_build_object('id',saved.id);
end;
$$;

revoke all on function public.prepare_project_publication(jsonb,uuid), public.reserve_project_voice_confirmation(uuid),
  public.confirm_project_publication_text(uuid,text), public.cancel_project_publication(uuid), public.publish_confirmed_project(uuid),
  public.bind_project_voice_call(uuid,uuid), public.record_project_voice_decision(uuid,text), public.guard_confirmed_project_write() from public,anon,authenticated;
grant execute on function public.prepare_project_publication(jsonb,uuid), public.reserve_project_voice_confirmation(uuid),
  public.confirm_project_publication_text(uuid,text), public.cancel_project_publication(uuid), public.publish_confirmed_project(uuid) to authenticated;
grant execute on function public.bind_project_voice_call(uuid,uuid), public.record_project_voice_decision(uuid,text) to service_role;

-- Polling is sufficient without Realtime. Enable private status updates when publication exists.
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.project_publish_verifications;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
