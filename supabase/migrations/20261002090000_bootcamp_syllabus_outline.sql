-- ALREADY APPLIED to Supabase project tiyifgfsuzhcvdvntjmp on 2026-10-02. Kept as a record only — do not re-run.
--
-- Public syllabus outline. Lessons are readable only by enrolled learners and
-- the bootcamp's managers (rows hold content_url), so the bootcamp page showed
-- section names with no lessons to everyone else. This returns the outline
-- only — title, type, duration, order — never the content link.
create or replace function public.bootcamp_syllabus_outline(p_bootcamp_id uuid)
returns table (id uuid, module_id uuid, title text, content_type text, duration text, order_index integer)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.module_id, l.title, l.content_type, l.duration, l.order_index
  from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.bootcamps b on b.id = m.bootcamp_id
  where m.bootcamp_id = p_bootcamp_id
    and (b.status = 'active' or public.can_manage_bootcamp(b.id))
  order by l.order_index;
$$;
grant execute on function public.bootcamp_syllabus_outline(uuid) to anon, authenticated;
