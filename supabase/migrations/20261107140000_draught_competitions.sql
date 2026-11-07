begin;
alter table public.notifications add column if not exists link text;
create table if not exists public.zero_draught_competitions (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles(id), request_id uuid not null,
 title text not null check(length(title) between 3 and 100), capacity integer not null check(capacity between 4 and 128 and capacity%2=0),
 prize_splits integer[] not null default array[50,30,20] check(array_length(prize_splits,1)=3 and prize_splits[1]>0 and prize_splits[2]>0 and prize_splits[3]>0 and prize_splits[1]+prize_splits[2]+prize_splits[3]=100),
 fee_percent integer not null check(fee_percent in(20,30)), fee_amount bigint not null default 0, host_fee_share numeric not null default 0, net_prize_pool bigint,
 entry_fee bigint not null check(entry_fee between 0 and 10000000), host_pool bigint not null check(host_pool between 0 and 100000000),
 prize_pool bigint not null default 0 check(prize_pool>=0), status text not null default 'registration' check(status in('registration','running','finished','cancelled')),
 round integer not null default 1, created_at timestamptz not null default now(), registration_ends_at timestamptz not null default now()+interval '7 days', settled_at timestamptz,
 unique(creator_id,request_id)
);
create table if not exists public.zero_draught_competition_players (
 competition_id uuid not null references public.zero_draught_competitions(id), profile_id uuid not null references public.profiles(id),
 joined_at timestamptz not null default now(), entry_paid bigint not null, primary key(competition_id,profile_id)
);
create table if not exists public.zero_draught_fixtures (
 id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.zero_draught_competitions(id),
 round integer not null, slot integer not null, kind text not null default 'main' check(kind in('main','bronze')),
 red_id uuid not null references public.profiles(id), black_id uuid references public.profiles(id), winner uuid references public.profiles(id),
 room_id uuid references public.zero_draught_rooms(id), attempt integer not null default 0,
 unique(competition_id,round,slot,kind),check(red_id is distinct from black_id)
);
create table if not exists public.zero_draught_competition_games (
 room_id uuid primary key references public.zero_draught_rooms(id), fixture_id uuid not null references public.zero_draught_fixtures(id),
 attempt integer not null, unique(fixture_id,attempt)
);
create table if not exists public.zero_draught_competition_awards (
 competition_id uuid not null references public.zero_draught_competitions(id), place integer not null check(place between 1 and 3),
 profile_id uuid not null references public.profiles(id), amount bigint not null check(amount>=0),
 primary key(competition_id,place),unique(competition_id,profile_id)
);
alter table public.zero_draught_competitions enable row level security;
alter table public.zero_draught_competition_players enable row level security;
alter table public.zero_draught_fixtures enable row level security;
alter table public.zero_draught_competition_games enable row level security;
alter table public.zero_draught_competition_awards enable row level security;
revoke all on public.zero_draught_competitions,public.zero_draught_competition_players,public.zero_draught_fixtures,public.zero_draught_competition_games,public.zero_draught_competition_awards from public,anon,authenticated;
create index if not exists draught_competition_status on public.zero_draught_competitions(status,created_at desc);

create or replace function public.dc_open_match(p_fixture uuid) returns void language plpgsql security definer set search_path=public as $$
declare f public.zero_draught_fixtures; b integer[]; room uuid; next_attempt integer;
begin
 select * into f from zero_draught_fixtures where id=p_fixture for update;
 if f.winner is not null or f.black_id is null then return; end if;
 next_attempt:=f.attempt+1;
 select array_agg(case when (i/8+i%8)%2=0 then 0 when i<24 then 1 when i>=40 then -1 else 0 end order by i) into b from generate_series(0,63)i;
 insert into zero_draught_rooms(code,red_id,black_id,board,positions,status,moved_at,black_seen,red_ms,black_ms)
 values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),f.red_id,f.black_id,b,jsonb_build_object(array_to_string(b,',')||':1',1),'active',clock_timestamp()+interval '2 minutes',now(),case when next_attempt>=3 then 300000 else 600000 end,case when next_attempt>=3 then 240000 else 600000 end) returning id into room;
 insert into zero_draught_competition_games values(room,f.id,next_attempt);
 update zero_draught_fixtures set room_id=room,attempt=next_attempt where id=f.id;
 insert into notifications(recipient_id,actor_id,type,content,entity_id,link)
 select player,c.creator_id,'game_buzz','Your Zero Draught competition match is ready. Open the competition to play.',room,'/app/games/draught?room='||room||'&competition='||c.id
 from zero_draught_competitions c cross join unnest(array[f.red_id,f.black_id])player where c.id=f.competition_id;
end $$;

create or replace function public.dc_seed_round(p_id uuid,p_round integer,p_players uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare n integer:=array_length(p_players,1); power integer:=1; pairs integer; cursor integer:=1; slot integer:=1; fixture uuid;
begin
 if n<2 then raise exception 'Not enough players for a round'; end if;
 while power*2<=n loop power:=power*2;end loop;
 pairs:=n-power;if pairs=0 then pairs:=n/2;end if;
 while cursor<=n loop
  if slot<=pairs then
   insert into zero_draught_fixtures(competition_id,round,slot,red_id,black_id) values(p_id,p_round,slot,p_players[cursor],p_players[cursor+1]) returning id into fixture;
   perform dc_open_match(fixture);cursor:=cursor+2;
  else
   insert into zero_draught_fixtures(competition_id,round,slot,red_id,winner) values(p_id,p_round,slot,p_players[cursor],p_players[cursor]);cursor:=cursor+1;
  end if;
  slot:=slot+1;
 end loop;
end $$;

create or replace function public.dc_cancel(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare c public.zero_draught_competitions; refund record;
begin
 select * into c from zero_draught_competitions where id=p_id for update;
 if c.status<>'registration' then return;end if;
 for refund in select profile_id,amount from (select creator_id profile_id,host_pool amount from zero_draught_competitions where id=p_id union all select profile_id,entry_paid from zero_draught_competition_players where competition_id=p_id)r order by profile_id loop
  if refund.amount>0 then perform wallet_apply(refund.profile_id,'credit',refund.amount,'game','Draught competition cancelled','dc_refund_'||p_id||'_'||refund.profile_id,jsonb_build_object('competition_id',p_id));end if;
 end loop;
 update zero_draught_competitions set status='cancelled',prize_pool=0,settled_at=now() where id=p_id;
end $$;

create or replace function public.dc_progress(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare c public.zero_draught_competitions; f public.zero_draught_fixtures; r public.zero_draught_rooms; players uuid[]; losers uuid[]; winner_id uuid; fixture uuid; bronze uuid; final public.zero_draught_fixtures; prize record; second bigint; third bigint; entry_gross bigint; deduction bigint; host_share numeric; net_pool bigint;
begin
 select * into c from zero_draught_competitions where id=p_id for update;
 if not found or c.status in('finished','cancelled') then return;end if;
 if c.status='registration' then
  if (select count(*) from zero_draught_competition_players where competition_id=p_id)=c.capacity then
   select array_agg(profile_id order by random()) into players from zero_draught_competition_players where competition_id=p_id;
   update zero_draught_competitions set status='running' where id=p_id;
   perform dc_seed_round(p_id,1,players); c.status:='running';
  elsif c.registration_ends_at<=now() then perform dc_cancel(p_id);return;
  else return;end if;
 end if;
 for f in select * from zero_draught_fixtures where competition_id=p_id and winner is null and room_id is not null order by round,slot loop
  perform zero_draught_settle(f.room_id);
  select * into r from zero_draught_rooms where id=f.room_id;
  if r.status not in('finished','cancelled') then continue;end if;
  winner_id:=r.winner;
  if winner_id is null and f.attempt>=3 then winner_id:=r.black_id;end if;
  if winner_id is null then
   update zero_draught_fixtures set red_id=f.black_id,black_id=f.red_id where id=f.id;
   perform dc_open_match(f.id);
  else
   if winner_id not in(f.red_id,f.black_id) then raise exception 'Invalid match result';end if;
   update zero_draught_fixtures set winner=winner_id where id=f.id;
  end if;
 end loop;
 if exists(select 1 from zero_draught_fixtures where competition_id=p_id and round=c.round and kind='main' and winner is null) then return;end if;
 select array_agg(winner order by slot) into players from zero_draught_fixtures where competition_id=p_id and round=c.round and kind='main';
 if array_length(players,1)>2 then
  update zero_draught_competitions set round=round+1 where id=p_id;
  perform dc_seed_round(p_id,c.round+1,players);
 elsif array_length(players,1)=2 then
  select array_agg(case when winner=red_id then black_id else red_id end order by slot) into losers from zero_draught_fixtures where competition_id=p_id and round=c.round and kind='main';
  if array_length(losers,1)<>2 or losers[1] is null or losers[2] is null then raise exception 'Invalid semifinal bracket';end if;
  update zero_draught_competitions set round=round+1 where id=p_id;
  perform dc_seed_round(p_id,c.round+1,players);
  insert into zero_draught_fixtures(competition_id,round,slot,kind,red_id,black_id) values(p_id,c.round+1,1,'bronze',losers[1],losers[2]) returning id into fixture;
  perform dc_open_match(fixture);
 elsif array_length(players,1)=1 then
  select winner into bronze from zero_draught_fixtures where competition_id=p_id and kind='bronze';
  if bronze is null then return;end if;
  select * into final from zero_draught_fixtures where competition_id=p_id and round=c.round and kind='main';
  select coalesce(sum(entry_paid),0) into entry_gross from zero_draught_competition_players where competition_id=p_id;
  deduction:=floor(entry_gross*c.fee_percent/100.0);host_share:=deduction/2.0;
  net_pool:=c.prize_pool-deduction;
  second:=floor(net_pool*c.prize_splits[2]/100.0);third:=floor(net_pool*c.prize_splits[3]/100.0);
  insert into zero_draught_competition_awards values(p_id,1,final.winner,net_pool-second-third),(p_id,2,case when final.winner=final.red_id then final.black_id else final.red_id end,second),(p_id,3,bronze,third);
  for prize in select profile_id,amount,place,'prize' kind from zero_draught_competition_awards where competition_id=p_id
   union all select c.creator_id,host_share,0,'host' order by profile_id loop
   if prize.amount>0 then
    perform wallet_apply(prize.profile_id,'credit',prize.amount,case when prize.kind='host' then 'game_host' else 'game_prize' end,
     case when prize.kind='host' then 'Zero Draught host fee share' else 'Zero Draught prize #'||prize.place end,
     case when prize.kind='host' then 'dc_host_share_'||p_id else 'dc_prize_'||p_id||'_'||prize.place end,jsonb_build_object('competition_id',p_id,'place',prize.place));
   end if;
  end loop;
  if deduction-host_share>0 then
   insert into platform_revenue(source,buyer_id,gross_amount,fee_amount,payment_reference) values('draught_competition',c.creator_id,entry_gross,deduction-host_share,'dc_platform_'||p_id);
  end if;
  insert into notifications(recipient_id,actor_id,type,content,entity_id,link)
   select a.profile_id,c.creator_id,'game_buzz','You finished #'||a.place||' in '||c.title||case when a.amount>0 then '. Your cash prize is in your withdrawable wallet.' else '.' end,p_id,'/app/games/draught-competitions?id='||p_id
   from zero_draught_competition_awards a where a.competition_id=p_id;
  update zero_draught_competitions set status='finished',fee_amount=deduction,host_fee_share=host_share,net_prize_pool=net_pool,settled_at=now() where id=p_id;
 end if;
end $$;

create or replace function public.zero_draught_competition(p_action text,p_id uuid default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); c public.zero_draught_competitions; result jsonb; players jsonb; fixtures jsonb; awards jsonb; rid uuid; cap integer; fee bigint; pool bigint; splits integer[]; expected_net bigint; rate integer;
begin
 if caller is null then raise exception 'Sign in to use competitions';end if;
 if not exists(select 1 from profiles where id=caller and coalesce(account_status,'active')<>'suspended') then raise exception 'This account cannot use competitions';end if;
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc),'[]') into result from (
   select c.id,c.title,c.capacity,c.entry_fee,c.prize_pool,c.fee_percent,c.prize_splits,c.status,c.created_at,c.registration_ends_at,c.creator_id,
   (select count(*) from zero_draught_competition_players p where p.competition_id=c.id) players,
   exists(select 1 from zero_draught_competition_players p where p.competition_id=c.id and p.profile_id=caller) joined
   from zero_draught_competitions c order by c.created_at desc limit 100)row;
  return result;
 elsif p_action='create' then
  rid:=(p_payload->>'request_id')::uuid;cap:=(p_payload->>'capacity')::integer;fee:=coalesce((p_payload->>'entry_fee')::bigint,0);pool:=coalesce((p_payload->>'host_pool')::bigint,0);
  select array_agg(value::integer order by ordinality) into splits from jsonb_array_elements_text(coalesce(p_payload->'prize_splits','[50,30,20]'::jsonb)) with ordinality;
  if array_length(splits,1)<>3 or splits[1] is null or splits[2] is null or splits[3] is null or splits[1]<1 or splits[2]<1 or splits[3]<1 or splits[1]+splits[2]+splits[3]<>100 then raise exception 'Three positive prize percentages must add up to 100';end if;
  rate:=case when cap<100 then 30 else 20 end;
  expected_net:=pool+cap*fee-floor(cap::bigint*fee*rate/100.0);
  if rid is null or length(trim(coalesce(p_payload->>'title','')))<3 or length(trim(p_payload->>'title'))>100 then raise exception 'Give the competition a name';end if;
  if cap is null or cap<4 or cap>128 or cap%2<>0 then raise exception 'Choose an even number of participants from 4 to 128';end if;
  if fee<0 or fee>10000000 or pool<0 or pool>100000000 then raise exception 'Invalid competition funding';end if;
  if expected_net>0 and (floor(expected_net*splits[1]/100.0)<1 or floor(expected_net*splits[2]/100.0)<1 or floor(expected_net*splits[3]/100.0)<1) then raise exception 'Increase the prize pool so each winner gets at least 1 NGN after fees';end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text,8484));
  select * into c from zero_draught_competitions where creator_id=caller and request_id=rid;
  if found then
   if c.title<>trim(p_payload->>'title') or c.capacity<>cap or c.entry_fee<>fee or c.host_pool<>pool or c.prize_splits<>splits then raise exception 'This request already created a different competition';end if;
   return jsonb_build_object('id',c.id);
  end if;
  insert into zero_draught_competitions(creator_id,request_id,title,capacity,entry_fee,host_pool,prize_pool,prize_splits,fee_percent) values(caller,rid,trim(p_payload->>'title'),cap,fee,pool,pool,splits,rate) returning * into c;
  if pool>0 then perform wallet_apply(caller,'debit',pool,'game','Draught competition prize escrow','dc_host_'||c.id,jsonb_build_object('competition_id',c.id));end if;
  return jsonb_build_object('id',c.id);
 end if;
 select * into c from zero_draught_competitions where id=p_id for update;
 if not found then raise exception 'Competition not found';end if;
 if p_action='join' then
  if not exists(select 1 from zero_draught_competition_players where competition_id=p_id and profile_id=caller) then
   if c.creator_id=caller then raise exception 'Hosts cannot compete in their own competition';end if;
   if c.status<>'registration' or c.registration_ends_at<=now() then raise exception 'Registration has closed';end if;
   if (select count(*) from zero_draught_competition_players where competition_id=p_id)>=c.capacity then raise exception 'This competition is full';end if;
   if c.entry_fee>0 then perform wallet_apply(caller,'debit',c.entry_fee,'game','Draught competition registration','dc_entry_'||p_id||'_'||caller,jsonb_build_object('competition_id',p_id));end if;
   insert into zero_draught_competition_players(competition_id,profile_id,entry_paid) values(p_id,caller,c.entry_fee);
   update zero_draught_competitions set prize_pool=prize_pool+c.entry_fee where id=p_id;
  end if;
 elsif p_action='cancel' then
  if c.creator_id<>caller then raise exception 'Only the host can cancel';end if;
  if c.status<>'registration' then raise exception 'Only unstarted competitions can be cancelled';end if;
  perform dc_cancel(p_id);
 elsif p_action not in('detail','sync') then raise exception 'Unknown competition action';end if;
 perform dc_progress(p_id);
 select * into c from zero_draught_competitions where id=p_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.profile_id,'name',coalesce(nullif(pr.full_name,''),pr.username,'Player'),'photo',pr.avatar_url) order by joined_at),'[]') into players from zero_draught_competition_players p join profiles pr on pr.id=p.profile_id where competition_id=p_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'round',f.round,'slot',f.slot,'kind',f.kind,'red_id',f.red_id,'black_id',f.black_id,'winner',f.winner,'room_id',f.room_id,'attempt',f.attempt) order by f.round,f.kind,f.slot),'[]') into fixtures from zero_draught_fixtures f where competition_id=p_id;
 select coalesce(jsonb_agg(jsonb_build_object('place',a.place,'profile_id',a.profile_id,'amount',a.amount) order by place),'[]') into awards from zero_draught_competition_awards a where competition_id=p_id;
 return jsonb_build_object('competition',jsonb_build_object('id',c.id,'title',c.title,'creator_id',c.creator_id,'capacity',c.capacity,'entry_fee',c.entry_fee,'prize_pool',c.prize_pool,'host_pool',c.host_pool,'prize_splits',to_jsonb(c.prize_splits),'fee_percent',c.fee_percent,'fee_amount',c.fee_amount,'host_fee_share',c.host_fee_share,'net_prize_pool',c.net_prize_pool,'status',c.status,'round',c.round,'registration_ends_at',c.registration_ends_at),'players',players,'fixtures',fixtures,'awards',awards,'you',caller);
end $$;

create or replace function public.tick_zero_draught_competitions() returns void language plpgsql security definer set search_path=public as $$
declare c record;
begin
 for c in select id from zero_draught_competitions where status in('registration','running') loop
  begin perform dc_progress(c.id); exception when others then raise warning 'Draught competition % could not progress: %',c.id,sqlerrm;end;
 end loop;
end $$;
revoke all on function public.dc_open_match(uuid),public.dc_seed_round(uuid,integer,uuid[]),public.dc_cancel(uuid),public.dc_progress(uuid),public.tick_zero_draught_competitions() from public,anon,authenticated;
revoke all on function public.zero_draught_competition(text,uuid,jsonb) from public,anon;
grant execute on function public.zero_draught_competition(text,uuid,jsonb) to authenticated;
-- Background advancement/expiry; browsing also syncs authoritatively.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  if not exists(select 1 from cron.job where jobname='zero-draught-competitions') then
   perform cron.schedule('zero-draught-competitions','* * * * *','select public.tick_zero_draught_competitions();');
  end if;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
