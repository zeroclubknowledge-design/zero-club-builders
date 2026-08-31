-- ===========================================================================
-- Listings go live immediately, and MVPs can carry media.
--
-- The original design gated every listing behind an admin approval. That was
-- the wrong shape for this product: a builder who has just shipped something
-- wants testers today, and a queue that only one person can clear is a queue
-- that stalls the moment they are busy. Nothing is earned by making everyone
-- wait — the ZP is only paid when a builder approves a submission, so the
-- money-like decision still has a human on it.
--
-- Moderation becomes reactive instead of preventative: an admin can take a
-- listing down after the fact. That trades a guaranteed delay for every honest
-- builder against a short window of exposure for a bad one, which is the right
-- way round.
-- ===========================================================================

-- ------------------------------------------------------------------ media ---

alter table public.zs_mvps
  add column if not exists media_urls text[] not null default '{}';

comment on column public.zs_mvps.media_urls is
  'Screenshots and clips of the product, in display order. The first is used as the cover.';

-- --------------------------------------------------------------- go live ---

alter table public.zs_mvps alter column status set default 'live';

/* Anything already sitting in the review queue is released rather than
   stranded — those builders submitted under the old rule and should not be
   waiting on a queue that no longer exists. */
update public.zs_mvps
set status = 'live', updated_at = now()
where status in ('pending_review', 'approved');

/*
 * The builder now controls their own listing's visibility, including 'live'.
 * They still cannot set 'rejected': that is a moderation outcome, and a
 * builder quietly clearing their own takedown would make the takedown
 * pointless.
 */
drop policy if exists zs_mvps_builder_update on public.zs_mvps;
create policy zs_mvps_builder_update on public.zs_mvps for update to authenticated
  using (builder_id = auth.uid())
  with check (
    builder_id = auth.uid()
    and status in ('draft', 'live', 'paused', 'completed')
  );

/* Admins can see everything, so the moderation screen can show drafts and
   taken-down listings that the public read rule hides. */
drop policy if exists zs_mvps_public_read on public.zs_mvps;
create policy zs_mvps_public_read on public.zs_mvps for select to anon, authenticated
  using (
    status in ('approved', 'live', 'completed')
    or builder_id = auth.uid()
    or public.is_zero_club_admin()
  );

-- ------------------------------------------------------------ moderation ---

/* Replaces the approval pair. Approval before publishing is gone; the ability
   to remove something that should not be up is not. */
drop function if exists public.zs_review_mvp(uuid, boolean, text);
drop function if exists public.zs_pending_mvps();

create or replace function public.zs_take_down_mvp(p_mvp_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  update public.zs_mvps
  set status = 'rejected', review_note = p_note, updated_at = now()
  where id = p_mvp_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  /* Its campaigns stop recruiting too. Leaving them live would let testers
     keep joining work on a product that has just been taken down, and they
     would have every right to expect to be paid for it. */
  update public.zs_campaigns
  set status = 'cancelled', updated_at = now()
  where mvp_id = p_mvp_id and status in ('live', 'paused');

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.zs_take_down_mvp(uuid, text) to authenticated;

/* Restoring, so a takedown is not a one-way door. */
create or replace function public.zs_restore_mvp(p_mvp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  update public.zs_mvps
  set status = 'live', review_note = null, updated_at = now()
  where id = p_mvp_id and status = 'rejected';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.zs_restore_mvp(uuid) to authenticated;

-- --------------------------------------------------------------- storage ---

/*
 * Public bucket: these are product screenshots meant to be seen by anyone
 * browsing, so signed URLs would add a round trip and an expiry problem for no
 * privacy benefit.
 *
 * Files are stored as <builder_id>/<random>.<ext>. The first folder segment is
 * what the policies key off, so nobody can write into anyone else's folder.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zerostart-media',
  'zerostart-media',
  true,
  52428800, -- 50 MB, enough for a short screen recording
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ZeroStart media is publicly readable" on storage.objects;
create policy "ZeroStart media is publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'zerostart-media');

drop policy if exists "ZeroStart builders upload to their own folder" on storage.objects;
create policy "ZeroStart builders upload to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'zerostart-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ZeroStart builders replace their own media" on storage.objects;
create policy "ZeroStart builders replace their own media" on storage.objects
  for update to authenticated
  using (bucket_id = 'zerostart-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ZeroStart builders delete their own media" on storage.objects;
create policy "ZeroStart builders delete their own media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'zerostart-media' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
