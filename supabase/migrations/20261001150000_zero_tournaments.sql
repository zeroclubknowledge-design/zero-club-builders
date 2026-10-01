
-- ── zero_tournaments_start_run_fix ──
-- start_zero_run read fields from an unassigned record for non-sudoku games; it now uses plain variables.
create or replace function public.start_zero_run(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  t public.zero_tournaments;
  run_id uuid;
  b_puzzle text;
  b_solution text;
begin
  select * into t from public.zero_tournaments where id = p_id;
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if public.zt_status(t) <> 'live' then return jsonb_build_object('ok', false, 'reason', public.zt_status(t)); end if;
  if not exists (select 1 from public.zero_tournament_players where tournament_id = t.id and profile_id = caller) then
    return jsonb_build_object('ok', false, 'reason', 'not_joined');
  end if;
  update public.zero_tournament_runs set finished_at = now(), score = 0
  where tournament_id = t.id and profile_id = caller and finished_at is null;

  if t.game_type = 'sudoku' then
    select puzzle, solution into b_puzzle, b_solution from public.zero_game_sudoku_bank where difficulty = t.difficulty order by random() limit 1;
    if b_puzzle is null then select puzzle, solution into b_puzzle, b_solution from public.zero_game_sudoku_bank order by random() limit 1; end if;
  end if;

  insert into public.zero_tournament_runs (tournament_id, profile_id, solution, meta)
  values (t.id, caller, b_solution, case when b_puzzle is not null then jsonb_build_object('puzzle', b_puzzle) else '{}'::jsonb end)
  returning id into run_id;

  update public.zero_tournament_players set plays = plays + 1 where tournament_id = t.id and profile_id = caller;

  return jsonb_build_object('ok', true, 'run_id', run_id, 'puzzle', b_puzzle, 'difficulty', t.difficulty, 'profession', t.profession,
    'ends_at', t.ends_at);
end;
$$;
