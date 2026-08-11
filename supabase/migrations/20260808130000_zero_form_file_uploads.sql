-- Zero Form: file upload questions.
--
-- Creates a PRIVATE bucket for anything registrants attach. Unlike avatars or
-- post media, these are CVs, certificates and portfolios - documents people
-- submit to one tutor, not publish. A public bucket would make every one of
-- them readable by anyone who guesses the URL, permanently and indexably.
-- Tutors read them through short-lived signed URLs instead.
--
-- Guests can register without an account, so uploads must be possible while
-- unauthenticated. That is deliberately constrained: 10 MB per file, a MIME
-- allowlist that excludes executables and video, and paths that must begin
-- with a real zero_forms id.
--
-- Object path layout:
--   <zero_form_id>/<random>-<safe original filename>
-- The first folder segment is what the policies key off.

-- ---------------------------------------------------------------- bucket ---
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zero-form-uploads',
  'zero-form-uploads',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -------------------------------------------------------------- policies ---

-- Upload: anyone, signed in or not, but only into a folder named after a form
-- that actually exists and is open. Without the existence check the bucket
-- would accept files into arbitrary folder names, which is free storage for
-- anyone who finds the endpoint.
drop policy if exists "Zero Form registrants can upload attachments" on storage.objects;
create policy "Zero Form registrants can upload attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'zero-form-uploads'
    and (storage.foldername(name))[1] is not null
    and exists (
      select 1
      from public.zero_forms form
      where form.id::text = (storage.foldername(name))[1]
        -- Published forms accept uploads from anyone. The owner can also
        -- upload while the form is still a draft, so a tutor can test the
        -- question before publishing it.
        and (form.status = 'published' or form.owner_id = auth.uid())
    )
  );

-- Read: only the person who owns the form. Registrants do not read back, and
-- the tutor's studio mints a signed URL per view.
drop policy if exists "Zero Form owners can read attachments" on storage.objects;
create policy "Zero Form owners can read attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'zero-form-uploads'
    and exists (
      select 1
      from public.zero_forms form
      where form.id::text = (storage.foldername(name))[1]
        and form.owner_id = auth.uid()
    )
  );

-- Delete: the owner, so a form can be cleaned up. Deliberately no UPDATE
-- policy - an uploaded answer should never be silently swapped for another
-- file after submission.
drop policy if exists "Zero Form owners can delete attachments" on storage.objects;
create policy "Zero Form owners can delete attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'zero-form-uploads'
    and exists (
      select 1
      from public.zero_forms form
      where form.id::text = (storage.foldername(name))[1]
        and form.owner_id = auth.uid()
    )
  );

comment on column public.zero_form_fields.field_type is
  'Input type. file_upload answers are stored in registration_data as '
  '{"path": "<bucket path>", "name": "<original filename>", "size": <bytes>} '
  'rather than a plain string, so the studio can render a download link.';
