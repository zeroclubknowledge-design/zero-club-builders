-- APPLIED to project tiyifgfsuzhcvdvntjmp as zero_words_tournament_packs (2026-10-22). Record only.
-- Zero Words: word packs on tournaments (additive)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='zero_tournaments' and column_name='word_pack_id') then
    alter table public.zero_tournaments add column word_pack_id uuid;
  end if;
end $$;

-- Creator attaches one of their visible packs to a Zero Words tournament. The pack becomes public so every player can load it.
create or replace function public.set_tournament_word_pack(p_tournament uuid, p_pack uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.zero_tournaments; p public.word_packs; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into t from zero_tournaments where id = p_tournament;
  if not found then raise exception 'Tournament not found'; end if;
  if t.creator_id <> me then raise exception 'Only the host can choose the word pack'; end if;
  if t.game_type <> 'words' then raise exception 'Word packs only work with Zero Words tournaments'; end if;
  if t.starts_at is not null and t.starts_at <= now() then raise exception 'The tournament has already started'; end if;
  if p_pack is null then
    update zero_tournaments set word_pack_id = null where id = t.id;
    return null;
  end if;
  select * into p from word_packs where id = p_pack;
  if not found or not word_pack_visible(p, me) then raise exception 'This word pack is private or no longer exists'; end if;
  if p.owner_id = me and p.visibility <> 'public' then
    update word_packs set visibility = 'public', club_id = null where id = p.id returning * into p;
  elsif p.visibility <> 'public' then
    raise exception 'Use one of your own packs or a public pack';
  end if;
  update zero_tournaments set word_pack_id = p.id where id = t.id;
  return word_pack_json(p, me);
end $$;

-- Pack for a tournament (null when it uses the classic word list).
create or replace function public.zero_tournament_word_pack(p_tournament uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.word_packs; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in to play'; end if;
  select wp.* into p from zero_tournaments t join word_packs wp on wp.id = t.word_pack_id where t.id = p_tournament;
  if not found then return null; end if;
  return word_pack_json(p, me);
end $$;

grant execute on function public.set_tournament_word_pack(uuid, uuid) to authenticated;
grant execute on function public.zero_tournament_word_pack(uuid) to authenticated;
