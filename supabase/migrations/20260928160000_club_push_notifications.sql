-- ALREADY APPLIED to the live database on 28 Sep 2026 (as "club_push_notifications").
-- Kept for the record. Club chat pushes, join-request accepted pushes, open-club
-- join pushes, and removal of the duplicate DM webhook trigger.
drop trigger if exists "trigger-push-notifications" on public.messages;

create or replace function public.zc_push(p jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare fn_url text; fn_key text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'zero_club_edge_function_url' limit 1;
  select decrypted_secret into fn_key from vault.decrypted_secrets where name = 'zero_club_edge_function_key' limit 1;
  if nullif(trim(fn_url), '') is null or nullif(trim(fn_key), '') is null then return; end if;
  perform net.http_post(url := rtrim(fn_url, '/') || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || fn_key), body := p);
exception when others then null;
end; $$;
revoke all on function public.zc_push(jsonb) from public, anon, authenticated;

drop trigger if exists on_club_message_send_push on public.club_messages;
create trigger on_club_message_send_push after insert on public.club_messages
  for each row execute function public.handle_new_message_push();

-- zc_push_club_request_decision() + on_club_request_decided_push (messages, after update of content)
-- zc_push_club_joined() + on_club_member_joined_push (club_members, after insert)
-- See the live definitions: \df+ public.zc_push_club_request_decision / public.zc_push_club_joined
