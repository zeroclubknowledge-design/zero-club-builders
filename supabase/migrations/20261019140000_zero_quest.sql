-- Zero Quest: private cooperative cities, server-checked missions and capped XP.
begin;

create table if not exists public.zero_quest_questions (
  id text primary key, district text not null check (district in ('code','design','story','business')),
  prompt text not null, choices jsonb not null, answer integer not null check (answer between 0 and 3), hint text not null
);
insert into public.zero_quest_questions values
 ('code-1','code','A form accepts a price from the browser. Where must you check the final price?', '["Only in the button label","On the server before charging","In a hidden input","In local storage"]',1,'Browser values can be changed by the person using the browser.'),
 ('code-2','code','Which HTTP method should retrieve data without changing it?', '["DELETE","PATCH","GET","POST"]',2,'Choose the method intended for reading a resource.'),
 ('code-3','code','Two users buy the last ticket at the same time. What protects the stock?', '["A loading spinner","A longer timeout","A page refresh","An atomic database transaction"]',3,'The stock check and deduction must happen together.'),
 ('code-4','code','What makes a payment retry safe after the connection drops?', '["An idempotency key","A new charge each time","Disabling browser history","Hiding the receipt"]',0,'The server needs to recognize the same request a second time.'),
 ('design-1','design','An icon button has no visible text. What helps screen-reader users understand it?', '["A bigger shadow","An accessible name","A random animation","An empty tooltip"]',1,'Assistive technology needs a meaningful label.'),
 ('design-2','design','A form fails validation. Which response best helps the user recover?', '["Clear every field","Reload the page","Explain the error beside the field and keep their input","Show only a red background"]',2,'Keep the work and identify the specific thing to fix.'),
 ('design-3','design','A mobile screen is narrower than your card. What is the best first response?', '["Force a desktop width","Hide the text","Disable zoom","Use a responsive layout that fits the viewport"]',3,'Content should adapt to the available screen width.'),
 ('design-4','design','Why should an error state use text as well as a red color?', '["Some users cannot distinguish the color","Red is always invisible","Text makes files smaller","All browsers block red"]',0,'Color alone should not carry the meaning.'),
 ('story-1','story','Which portfolio line communicates the clearest outcome?', '["I did many tasks","I am passionate","Reduced signup steps from seven to three after testing","I used several tools"]',2,'Describe the change you made and its measurable result.'),
 ('story-2','story','You quote a sentence from someone else. What should accompany it?', '["A new author name","No context","A claim that you wrote it","A clear attribution to its source"]',3,'Readers should be able to tell whose words they are.'),
 ('story-3','story','What should a useful project brief clarify first?', '["The audience and problem","The font size only","The creator favorite color","The final hashtag"]',0,'Start with who needs help and what they need to accomplish.'),
 ('story-4','story','Which message gives someone a clear next step?', '["Something happened","Review the draft and send your feedback by Friday","Please be aware","We are doing things"]',1,'Include an action and a time when one matters.'),
 ('business-1','business','A product earns 100 per sale and has 70 in variable costs. What is the contribution per sale?', '["170","70","30","100"]',2,'Subtract the variable costs from revenue.'),
 ('business-2','business','What is a useful first test before building an expensive feature?', '["Ask target users to try a simple prototype","Buy more office chairs","Copy every competitor feature","Hide the idea from users"]',0,'Test the main assumption with the people who have the problem.'),
 ('business-3','business','Which metric directly measures signup completion?', '["Logo size","Team headcount","Number of colors","Completed signups divided by started signups"]',3,'Measure the share of people who finish the flow.'),
 ('business-4','business','A team has two urgent tasks. How should it decide what to do first?', '["Choose the longest task","Compare user impact and effort","Always choose randomly","Wait until both expire"]',1,'Consider the benefit and the work required.')
on conflict (id) do update set prompt=excluded.prompt, choices=excluded.choices, answer=excluded.answer, hint=excluded.hint;

create table if not exists public.zero_quest_rooms (
 id uuid primary key default gen_random_uuid(), host_id uuid not null references public.profiles(id),
 title text not null check(char_length(title) between 3 and 60), invite_code text not null unique,
 status text not null default 'lobby' check(status in ('lobby','active','won','lost','cancelled')),
 health integer not null default 12 check(health between 0 and 12), created_at timestamptz not null default now(),
 started_at timestamptz, expires_at timestamptz not null default now()+interval '24 hours', finished_at timestamptz
);
create table if not exists public.zero_quest_members (
 room_id uuid not null references public.zero_quest_rooms(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 ready boolean not null default false, joined_at timestamptz not null default now(),
 last_seen timestamptz not null default now(), left_at timestamptz, contributions integer not null default 0,
 xp_awarded integer not null default 0, reward_note text,
 primary key(room_id,profile_id)
);
create table if not exists public.zero_quest_missions (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.zero_quest_rooms(id) on delete cascade,
 district text not null check(district in ('code','design','story','business')),
 kind text not null check(kind in ('challenge','brief')), question_id text references public.zero_quest_questions(id),
 status text not null default 'open' check(status in ('open','review','complete')),
 author_id uuid references public.profiles(id), reviewer_id uuid references public.profiles(id),
 work text, work_url text, feedback text, completed_at timestamptz,
 unique(room_id,district,kind)
);
create table if not exists public.zero_quest_attempts (
 mission_id uuid not null references public.zero_quest_missions(id) on delete cascade,
 profile_id uuid not null references public.profiles(id), attempted_at timestamptz not null default now(),
 primary key(mission_id,profile_id)
);
create table if not exists public.zero_quest_messages (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.zero_quest_rooms(id) on delete cascade,
 profile_id uuid not null references public.profiles(id), body text not null check(char_length(body) between 1 and 500),
 created_at timestamptz not null default now()
);
create index if not exists zero_quest_messages_room_time on public.zero_quest_messages(room_id,created_at desc);
create index if not exists zero_quest_members_profile on public.zero_quest_members(profile_id,room_id);
create table if not exists public.zero_quest_requests (
 profile_id uuid not null references public.profiles(id), request_id uuid not null,
 action text not null, payload jsonb not null, room_id uuid references public.zero_quest_rooms(id),
 result jsonb not null, created_at timestamptz not null default now(), primary key(profile_id,request_id)
);

create or replace function public.zero_quest_member(p_room uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.zero_quest_members where room_id=p_room and profile_id=auth.uid() and left_at is null)
$$;
revoke all on function public.zero_quest_member(uuid) from public,anon;
grant execute on function public.zero_quest_member(uuid) to authenticated;

alter table public.zero_quest_questions enable row level security;
alter table public.zero_quest_attempts enable row level security;
alter table public.zero_quest_requests enable row level security;
revoke all on public.zero_quest_questions, public.zero_quest_attempts, public.zero_quest_requests from public,anon,authenticated;
alter table public.zero_quest_rooms enable row level security;
alter table public.zero_quest_members enable row level security;
alter table public.zero_quest_missions enable row level security;
alter table public.zero_quest_messages enable row level security;
revoke all on public.zero_quest_rooms,public.zero_quest_members,public.zero_quest_missions,public.zero_quest_messages from public,anon,authenticated;
grant select on public.zero_quest_rooms,public.zero_quest_members,public.zero_quest_missions,public.zero_quest_messages to authenticated;
drop policy if exists quest_room_read on public.zero_quest_rooms;
create policy quest_room_read on public.zero_quest_rooms for select to authenticated using(public.zero_quest_member(id));
drop policy if exists quest_member_read on public.zero_quest_members;
create policy quest_member_read on public.zero_quest_members for select to authenticated using(public.zero_quest_member(room_id));
drop policy if exists quest_mission_read on public.zero_quest_missions;
create policy quest_mission_read on public.zero_quest_missions for select to authenticated using(public.zero_quest_member(room_id));
drop policy if exists quest_message_read on public.zero_quest_messages;
create policy quest_message_read on public.zero_quest_messages for select to authenticated using(public.zero_quest_member(room_id));

create or replace function public.zero_quest_home()
returns jsonb language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); rooms jsonb; wins integer; rewarded integer;
begin
 if caller is null then raise exception 'Sign in to play Zero Quest'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into rooms from (
  select q.id,q.title,q.status,q.invite_code,q.created_at,q.expires_at,m.xp_awarded,m.contributions
  from public.zero_quest_rooms q join public.zero_quest_members m on m.room_id=q.id
  where m.profile_id=caller and m.left_at is null order by q.created_at desc limit 20
 ) r;
 select count(*) into wins from public.zero_quest_members m join public.zero_quest_rooms q on q.id=m.room_id
  where m.profile_id=caller and m.contributions>0 and q.status='won';
 select count(*) into rewarded from public.xp_events where profile_id=caller and event_type='zero_quest_win'
  and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 return jsonb_build_object('rooms',rooms,'wins',wins,'rewarded_today',rewarded,'daily_limit',3,'win_xp',100);
end;
$$;

create or replace function public.zero_quest_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.zero_quest_rooms%rowtype; members jsonb; missions jsonb; messages jsonb;
begin
 if not public.zero_quest_member(p_room) then raise exception 'Join this squad to see its city'; end if;
 update public.zero_quest_rooms set status=case when status='active' then 'lost' else 'cancelled' end,finished_at=now()
  where id=p_room and status in ('active','lobby') and expires_at<=now();
 select * into r from public.zero_quest_rooms where id=p_room;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.profile_id,'name',coalesce(nullif(p.full_name,''),p.username,'Player'),
  'username',p.username,'avatar',p.avatar_url,'ready',m.ready,'last_seen',m.last_seen,'left_at',m.left_at,
  'contributions',m.contributions,'xp_awarded',m.xp_awarded,'reward_note',m.reward_note) order by m.joined_at),'[]'::jsonb)
  into members from public.zero_quest_members m join public.profiles p on p.id=m.profile_id where m.room_id=p_room;
 select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('prompt',q.prompt,'choices',q.choices,'hint',q.hint)
   order by m.district,m.kind),'[]'::jsonb) into missions
  from public.zero_quest_missions m left join public.zero_quest_questions q on q.id=m.question_id where m.room_id=p_room;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at),'[]'::jsonb) into messages from (
  select id,profile_id,body,created_at from public.zero_quest_messages where room_id=p_room order by created_at desc,id desc limit 50
 ) t;
 return jsonb_build_object('room',to_jsonb(r),'members',members,'missions',missions,'messages',messages,'server_now',now());
end;
$$;

create or replace function public.zero_quest_ping(p_room uuid)
returns void language sql security definer set search_path=public as $$
 update public.zero_quest_members set last_seen=now() where room_id=p_room and profile_id=auth.uid()
  and left_at is null and last_seen<now()-interval '20 seconds'
$$;

-- Only called internally after all eight missions pass. Profile locks serialize
-- daily rewards across different squads; the XP ledger deduplicates each win.
create or replace function public.zero_quest_finish(p_room uuid)
returns void language plpgsql security definer set search_path=public as $$
declare player record; total integer; rewarded integer;
begin
 select count(*) into total from public.zero_quest_missions where room_id=p_room and status='complete';
 if total<>8 or (select count(*) from public.zero_quest_members where room_id=p_room and contributions>0)<2 then return; end if;
 update public.zero_quest_rooms set status='won',finished_at=now() where id=p_room and status='active' and expires_at>now();
 if not found then return; end if;
 for player in select profile_id,contributions from public.zero_quest_members where room_id=p_room and left_at is null order by profile_id loop
  if player.contributions=0 then
   update public.zero_quest_members set reward_note='Contribute to a mission to earn win XP' where room_id=p_room and profile_id=player.profile_id;
   continue;
  end if;
  perform 1 from public.profiles where id=player.profile_id for update;
  select count(*) into rewarded from public.xp_events where profile_id=player.profile_id and event_type='zero_quest_win'
   and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if rewarded<3 then
   perform public.award_profile_xp(player.profile_id,'zero_quest_win',p_room::text,100,jsonb_build_object('game','Zero Quest','room_id',p_room));
   update public.zero_quest_members set xp_awarded=100,reward_note='City completed together' where room_id=p_room and profile_id=player.profile_id;
  else
   update public.zero_quest_members set reward_note='Daily XP limit reached. This city still counts as a win.' where room_id=p_room and profile_id=player.profile_id;
  end if;
 end loop;
end;
$$;
revoke all on function public.zero_quest_finish(uuid) from public,anon,authenticated;

create or replace function public.zero_quest_action(p_room uuid,p_action text,p_payload jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 caller uuid:=auth.uid(); r public.zero_quest_rooms%rowtype; m public.zero_quest_missions%rowtype;
 old public.zero_quest_requests%rowtype; out jsonb; title text; msg text; v_district text; qid text;
 active_count integer; approve boolean; next_host uuid; choice text; stamp timestamptz;
begin
 if caller is null then raise exception 'Sign in to play Zero Quest'; end if;
 if not exists(select 1 from public.profiles where id=caller and coalesce(account_status,'active')<>'suspended') then raise exception 'This account cannot play right now'; end if;
 if p_request is null or p_action is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid game request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,9182));
 select * into old from public.zero_quest_requests where profile_id=caller and request_id=p_request;
 if found then
  if old.action<>p_action or old.payload<>p_payload or (p_action not in ('create','join') and old.room_id is distinct from p_room) then raise exception 'Request already used for a different action'; end if;
  return old.result;
 end if;
 if p_action='create' then
  if exists(select 1 from public.zero_quest_members a join public.zero_quest_rooms b on b.id=a.room_id where a.profile_id=caller and a.left_at is null and b.status in ('lobby','active') and b.expires_at>now()) then raise exception 'Resume or leave your current squad before creating another'; end if;
  title:=btrim(coalesce(p_payload->>'title',''));
  if char_length(title) not between 3 and 60 then raise exception 'Give your city a name between 3 and 60 characters'; end if;
  insert into public.zero_quest_rooms(host_id,title,invite_code) values(caller,title,upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) returning * into r;
  insert into public.zero_quest_members(room_id,profile_id,ready) values(r.id,caller,true);
  foreach v_district in array array['code','design','story','business'] loop
   select id into qid from public.zero_quest_questions where zero_quest_questions.district=v_district order by random() limit 1;
   insert into public.zero_quest_missions(room_id,district,kind,question_id) values(r.id,v_district,'challenge',qid);
   insert into public.zero_quest_missions(room_id,district,kind) values(r.id,v_district,'brief');
  end loop;
 elsif p_action='join' then
  select * into r from public.zero_quest_rooms where invite_code=upper(btrim(coalesce(p_payload->>'code',''))) for update;
  if not found or r.expires_at<=now() or r.status not in ('lobby','active') then raise exception 'This invite is invalid or the game has ended'; end if;
  if exists(select 1 from public.zero_quest_members a join public.zero_quest_rooms b on b.id=a.room_id where a.profile_id=caller and a.room_id<>r.id and a.left_at is null and b.status in ('lobby','active') and b.expires_at>now()) then raise exception 'Resume or leave your current squad before joining another'; end if;
  if not public.zero_quest_member(r.id) then
   if r.status='active' and not exists(select 1 from public.zero_quest_members where room_id=r.id and profile_id=caller) then raise exception 'This game has started. Join a new squad instead'; end if;
   if (select count(*) from public.zero_quest_members where room_id=r.id and left_at is null)>=6 then raise exception 'This squad is full (6 players)'; end if;
   insert into public.zero_quest_members(room_id,profile_id) values(r.id,caller)
    on conflict(room_id,profile_id) do update set left_at=null,last_seen=now(),ready=false;
  end if;
 else
  select * into r from public.zero_quest_rooms where id=p_room for update;
  if not found or not public.zero_quest_member(p_room) then raise exception 'Join this squad first'; end if;
  if r.expires_at<=now() and r.status in ('lobby','active') and p_action<>'leave' then raise exception 'Time is up. Open the city to see the result'; end if;
  update public.zero_quest_members set last_seen=now() where room_id=r.id and profile_id=caller;
  if p_action='leave' then
   update public.zero_quest_members set left_at=now(),ready=false where room_id=r.id and profile_id=caller;
   select profile_id into next_host from public.zero_quest_members where room_id=r.id and left_at is null order by joined_at limit 1;
   if next_host is null and r.status in ('lobby','active') then update public.zero_quest_rooms set status='cancelled',finished_at=now() where id=r.id;
   elsif r.host_id=caller and next_host is not null then update public.zero_quest_rooms set host_id=next_host where id=r.id; end if;
  elsif p_action='ready' then
   if r.status<>'lobby' then raise exception 'The game has already started'; end if;
   if p_payload->>'ready' not in ('true','false') or p_payload->>'ready' is null then raise exception 'Choose a ready state'; end if;
   update public.zero_quest_members set ready=(p_payload->>'ready')::boolean where room_id=r.id and profile_id=caller;
  elsif p_action='start' then
   if r.status<>'lobby' then raise exception 'This game has already started'; end if;
   if r.host_id<>caller and exists(select 1 from public.zero_quest_members where room_id=r.id and profile_id=r.host_id and left_at is null and last_seen>now()-interval '90 seconds') then raise exception 'Only the host can start while they are online'; end if;
   select count(*) into active_count from public.zero_quest_members where room_id=r.id and left_at is null and last_seen>now()-interval '90 seconds';
   if active_count<2 then raise exception 'Invite at least one teammate to start'; end if;
   if exists(select 1 from public.zero_quest_members where room_id=r.id and left_at is null and last_seen>now()-interval '90 seconds' and not ready) then raise exception 'Every connected teammate must be online and ready'; end if;
   update public.zero_quest_rooms set host_id=caller,status='active',started_at=now(),expires_at=now()+interval '25 minutes' where id=r.id;
  elsif p_action='message' then
   if r.status not in ('lobby','active') then raise exception 'This game has ended'; end if;
   msg:=btrim(coalesce(p_payload->>'body',''));
   if char_length(msg) not between 1 and 500 then raise exception 'Messages can have 1 to 500 characters'; end if;
   if exists(select 1 from public.zero_quest_messages where room_id=r.id and profile_id=caller and created_at>clock_timestamp()-interval '1 second') then raise exception 'Wait a moment before sending another message'; end if;
   insert into public.zero_quest_messages(room_id,profile_id,body) values(r.id,caller,msg);
  elsif p_action in ('answer','submit','review','revise') then
   if r.status<>'active' then raise exception 'Missions are only open during a game'; end if;
   select * into m from public.zero_quest_missions where id=(p_payload->>'mission')::uuid and room_id=r.id for update;
   if not found then raise exception 'Mission not found'; end if;
   if m.status='complete' then raise exception 'Your squad already completed this mission'; end if;
   if p_action='answer' then
    if m.kind<>'challenge' then raise exception 'This mission needs a creative submission'; end if;
    choice:=p_payload->>'choice';
    if choice is null or choice not in ('0','1','2','3') then raise exception 'Choose an answer'; end if;
    select attempted_at into stamp from public.zero_quest_attempts where mission_id=m.id and profile_id=caller;
    if stamp>now()-interval '5 seconds' then raise exception 'Take five seconds to think before trying again'; end if;
    insert into public.zero_quest_attempts(mission_id,profile_id) values(m.id,caller) on conflict(mission_id,profile_id) do update set attempted_at=now();
    if exists(select 1 from public.zero_quest_questions where id=m.question_id and answer=choice::integer) then
     update public.zero_quest_missions set status='complete',author_id=caller,completed_at=now() where id=m.id;
     update public.zero_quest_members set contributions=contributions+1 where room_id=r.id and profile_id=caller;
     out:=jsonb_build_object('notice','Challenge complete. Your city is growing!','correct',true);
    else
     update public.zero_quest_rooms set health=health-1,status=case when health=1 then 'lost' else status end,finished_at=case when health=1 then now() else null end where id=r.id;
     out:=jsonb_build_object('notice','Not quite. Read the hint and try again. Your city lost one energy.','correct',false);
    end if;
   elsif p_action='submit' then
    if m.kind<>'brief' or m.status<>'open' then raise exception 'This brief is already awaiting review'; end if;
    msg:=btrim(coalesce(p_payload->>'work',''));
    if char_length(msg) not between 120 and 4000 then raise exception 'Write 120 to 4,000 characters for your brief'; end if;
    if coalesce(p_payload->>'url','')<>'' and (char_length(p_payload->>'url')>500 or p_payload->>'url' !~ '^https://[^[:space:]]+$') then raise exception 'Use a valid HTTPS link for your work'; end if;
    update public.zero_quest_missions set work=msg,work_url=nullif(p_payload->>'url',''),status='review',author_id=caller,reviewer_id=null,feedback=null where id=m.id;
    out:=jsonb_build_object('notice','Submitted. Ask a teammate to review your work.');
   elsif p_action='revise' then
    if m.kind<>'brief' or m.status<>'review' or m.author_id<>caller then raise exception 'Only the author can withdraw this submission'; end if;
    update public.zero_quest_missions set status='open' where id=m.id;
   else
    if m.kind<>'brief' or m.status<>'review' then raise exception 'This mission is not awaiting review'; end if;
    if m.author_id=caller then raise exception 'Ask a teammate to review your work'; end if;
    if p_payload->>'approve' is null or p_payload->>'approve' not in ('true','false') then raise exception 'Choose a review result'; end if;
    approve:=(p_payload->>'approve')::boolean;
    if approve and not exists(select 1 from public.zero_quest_members where room_id=r.id and profile_id=m.author_id and left_at is null) then raise exception 'The author has left. Request changes to reopen this brief, or ask them to rejoin'; end if;
    msg:=btrim(coalesce(p_payload->>'feedback',''));
    if char_length(msg)>500 or (not approve and char_length(msg)<10) then raise exception 'Give a useful review note (10 to 500 characters for revisions)'; end if;
    update public.zero_quest_missions set status=case when approve then 'complete' else 'open' end,reviewer_id=caller,feedback=msg,completed_at=case when approve then now() else null end where id=m.id;
    if approve then update public.zero_quest_members set contributions=contributions+1 where room_id=r.id and profile_id in (caller,m.author_id); end if;
    out:=jsonb_build_object('notice',case when approve then 'Brief approved. Great teamwork!' else 'Revision requested. Your teammate can improve and resubmit.' end);
   end if;
   perform public.zero_quest_finish(r.id);
  else raise exception 'Unknown game action'; end if;
 end if;
 out:=coalesce(out,'{}'::jsonb)||jsonb_build_object('room_id',r.id,'left',p_action='leave');
 insert into public.zero_quest_requests(profile_id,request_id,action,payload,room_id,result) values(caller,p_request,p_action,p_payload,r.id,out);
 return out;
end;
$$;

revoke all on function public.zero_quest_home() from public,anon;
revoke all on function public.zero_quest_room(uuid) from public,anon;
revoke all on function public.zero_quest_ping(uuid) from public,anon;
revoke all on function public.zero_quest_action(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.zero_quest_home(), public.zero_quest_room(uuid), public.zero_quest_ping(uuid), public.zero_quest_action(uuid,text,jsonb,uuid) to authenticated;

do $$ declare table_name text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach table_name in array array['zero_quest_rooms','zero_quest_members','zero_quest_missions','zero_quest_messages'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
    execute format('alter publication supabase_realtime add table public.%I',table_name);
   end if;
  end loop;
 end if;
end $$;
commit;
