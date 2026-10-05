-- ALREADY APPLIED to Supabase project tiyifgfsuzhcvdvntjmp on 2026-10-05. Kept as a record only — do not re-run.
--
-- Club members can edit their own messages.
--  * Only the author, and only while still a member of the club.
--  * Only the written text changes; photos, videos, files and voice notes stay.
--  * Cards (ZeroNotes, giveaways, assignments, answers) can't be edited this way.
--  * edited_at marks the message as "Edited" for everyone.

alter table public.club_messages add column if not exists edited_at timestamptz;

create or replace function public.edit_club_message(p_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  m public.club_messages;
  body text := btrim(coalesce(p_text, ''));
  marker constant text := '$$MEDIA$$';
  media text;
  next_content text;
begin
  if auth.uid() is null then raise exception 'Sign in to edit messages'; end if;
  select * into m from public.club_messages where id = p_id for update;
  if m.id is null then raise exception 'Message not found'; end if;
  if m.profile_id <> auth.uid() then raise exception 'You can only edit your own messages'; end if;
  if not exists (select 1 from public.club_members where club_id = m.club_id and profile_id = auth.uid()) then
    raise exception 'You are no longer a member of this club';
  end if;
  if m.content like '::ZEROCLUB_%' then raise exception 'This kind of message cannot be edited'; end if;
  if length(body) > 4000 then raise exception 'Messages are limited to 4000 characters'; end if;

  media := case when position(marker in m.content) > 0 then substring(m.content from position(marker in m.content)) else null end;
  if body = '' and media is null then raise exception 'A message cannot be empty'; end if;
  next_content := case when media is null then body when body = '' then media else body || E'\n\n' || media end;

  if next_content = m.content then
    return jsonb_build_object('ok', true, 'id', m.id, 'content', m.content, 'edited_at', m.edited_at);
  end if;

  update public.club_messages set content = next_content, edited_at = now() where id = m.id;
  return jsonb_build_object('ok', true, 'id', m.id, 'content', next_content, 'edited_at', now());
end;
$fn$;
grant execute on function public.edit_club_message(uuid, text) to authenticated;
