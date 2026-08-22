-- A private task list.
--
-- Zero Club already tracks what other people ask of you — bootcamp deadlines,
-- club activity, opportunities. None of that covers the thing you told
-- yourself you would do this week, which is usually the work that actually
-- moves someone forward.
--
-- Deliberately private. There is no sharing, no assignment and no visibility
-- to anyone else, because the moment a list like this can be seen by a tutor
-- it stops being an honest one.

create table if not exists public.user_tasks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,

  title text not null check (length(btrim(title)) > 0),
  note text,

  -- low | normal | high. Stored as text so a fourth level does not need a
  -- type migration.
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),

  due_on date,
  done_at timestamptz,

  -- Manual ordering within the list, lowest first.
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_tasks_owner_idx
  on public.user_tasks (profile_id, done_at, position, created_at desc);

alter table public.user_tasks enable row level security;

drop policy if exists user_tasks_own on public.user_tasks;
create policy user_tasks_own
  on public.user_tasks for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create or replace function public.touch_user_task()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_tasks_touch on public.user_tasks;
create trigger user_tasks_touch
  before update on public.user_tasks
  for each row execute function public.touch_user_task();

notify pgrst, 'reload schema';
