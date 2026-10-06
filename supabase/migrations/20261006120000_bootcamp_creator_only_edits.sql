-- Club administration and assigned teaching do not confer bootcamp editing.
-- Keep can_manage_bootcamp for reading drafts and running the cohort.
-- Restrictive policies intersect every existing permissive policy, including
-- collaborator/admin policies, and also check the destination on reassignment.
begin;

create or replace function public.can_edit_bootcamp(p_bootcamp_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.bootcamps
    where id = p_bootcamp_id and creator_id = auth.uid()
  );
$$;
revoke all on function public.can_edit_bootcamp(uuid) from public;
grant execute on function public.can_edit_bootcamp(uuid) to authenticated;

alter table public.bootcamps enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.bootcamp_coupons enable row level security;

create policy bootcamps_creator_insert on public.bootcamps
  as restrictive for insert to authenticated with check (creator_id = auth.uid());
create policy bootcamps_creator_update on public.bootcamps
  as restrictive for update to authenticated
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy bootcamps_creator_delete on public.bootcamps
  as restrictive for delete to authenticated using (creator_id = auth.uid());

create policy modules_creator_insert on public.modules
  as restrictive for insert to authenticated with check (public.can_edit_bootcamp(bootcamp_id));
create policy modules_creator_update on public.modules
  as restrictive for update to authenticated
  using (public.can_edit_bootcamp(bootcamp_id)) with check (public.can_edit_bootcamp(bootcamp_id));
create policy modules_creator_delete on public.modules
  as restrictive for delete to authenticated using (public.can_edit_bootcamp(bootcamp_id));

create policy lessons_creator_insert on public.lessons
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.modules m where m.id = module_id and public.can_edit_bootcamp(m.bootcamp_id)));
create policy lessons_creator_update on public.lessons
  as restrictive for update to authenticated
  using (exists (select 1 from public.modules m where m.id = module_id and public.can_edit_bootcamp(m.bootcamp_id)))
  with check (exists (select 1 from public.modules m where m.id = module_id and public.can_edit_bootcamp(m.bootcamp_id)));
create policy lessons_creator_delete on public.lessons
  as restrictive for delete to authenticated
  using (exists (select 1 from public.modules m where m.id = module_id and public.can_edit_bootcamp(m.bootcamp_id)));

create policy bootcamp_coupons_creator_insert on public.bootcamp_coupons
  as restrictive for insert to authenticated with check (public.can_edit_bootcamp(bootcamp_id));
create policy bootcamp_coupons_creator_update on public.bootcamp_coupons
  as restrictive for update to authenticated
  using (public.can_edit_bootcamp(bootcamp_id)) with check (public.can_edit_bootcamp(bootcamp_id));
create policy bootcamp_coupons_creator_delete on public.bootcamp_coupons
  as restrictive for delete to authenticated using (public.can_edit_bootcamp(bootcamp_id));

-- This SECURITY DEFINER RPC also writes dates and price, so RLS alone
-- cannot protect it. Its authorization must require the creator too.
create or replace function public.save_zero_form(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_bootcamp uuid := (payload ->> 'bootcamp_id')::uuid;
  bootcamp public.bootcamps;
  owner public.profiles;
  form public.zero_forms;
  base_slug text;
  candidate text;
  suffix integer := 0;
  field jsonb;
  new_starts_at timestamptz := nullif(payload ->> 'starts_at', '')::timestamptz;
  new_deadline timestamptz := nullif(payload ->> 'registration_deadline', '')::timestamptz;
  regular numeric := coalesce((payload ->> 'regular_price')::numeric, 0);
  early numeric := coalesce((payload ->> 'early_bird_price')::numeric, 0);
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into bootcamp from public.bootcamps where id = target_bootcamp;
  if bootcamp.id is null then raise exception 'Bootcamp not found'; end if;
  if bootcamp.creator_id is distinct from caller then
    raise exception 'You can only create a Zero Form for your own bootcamp';
  end if;

  if early > regular then raise exception 'The early-bird price cannot be higher than the regular price'; end if;
  if new_starts_at is null then raise exception 'Set the bootcamp start date first'; end if;
  if new_deadline is not null and new_deadline > new_starts_at then
    raise exception 'The registration deadline must be before the bootcamp starts';
  end if;

  select * into owner from public.profiles where id = caller;

  -- Keep the bootcamp record itself in step.
  update public.bootcamps
  set starts_at = new_starts_at,
      ends_at = coalesce(nullif(payload ->> 'ends_at', '')::timestamptz, ends_at),
      price = regular,
      owner_type = coalesce(owner.account_type, 'Tutor')
  where id = target_bootcamp;

  select * into form from public.zero_forms where bootcamp_id = target_bootcamp;

  if form.id is null then
    base_slug := public.zero_form_slugify(coalesce(nullif(payload ->> 'title', ''), bootcamp.title));
    candidate := base_slug;
    while exists (select 1 from public.zero_forms where slug = candidate) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix;
    end loop;

    insert into public.zero_forms (
      bootcamp_id, owner_id, owner_type, template_id, slug, title, description,
      banner_url, regular_price, early_bird_price, registration_deadline, seat_limit, status
    ) values (
      target_bootcamp, caller,
      case when coalesce(owner.account_type, 'Tutor') = 'Institution' then 'Institution' else 'Tutor' end,
      coalesce(payload ->> 'template_id', 'standard'), candidate,
      coalesce(nullif(payload ->> 'title', ''), bootcamp.title || ' — Zero Form'),
      nullif(payload ->> 'description', ''),
      nullif(payload ->> 'banner_url', ''),
      regular, early, new_deadline,
      nullif(payload ->> 'seat_limit', '')::integer,
      case when coalesce(payload ->> 'status', 'draft') = 'published' then 'published' else 'draft' end
    )
    returning * into form;
  else
    update public.zero_forms
    set title = coalesce(nullif(payload ->> 'title', ''), title),
        description = nullif(payload ->> 'description', ''),
        banner_url = nullif(payload ->> 'banner_url', ''),
        template_id = coalesce(payload ->> 'template_id', template_id),
        regular_price = regular,
        early_bird_price = early,
        registration_deadline = new_deadline,
        seat_limit = nullif(payload ->> 'seat_limit', '')::integer,
        status = case
          when payload ->> 'status' = 'published' then 'published'
          when payload ->> 'status' = 'draft' then 'draft'
          else status end,
        updated_at = now()
    where id = form.id
    returning * into form;
  end if;

  if form.status = 'published' and form.published_at is null then
    update public.zero_forms set published_at = now() where id = form.id returning * into form;
  end if;

  -- Replace the field set when one is supplied.
  if payload ? 'fields' then
    delete from public.zero_form_fields where zero_form_id = form.id;
    for field in select * from jsonb_array_elements(payload -> 'fields') loop
      insert into public.zero_form_fields (
        zero_form_id, field_key, field_type, label, placeholder, required, position, options
      ) values (
        form.id,
        coalesce(field ->> 'field_key', public.zero_form_slugify(field ->> 'label')),
        coalesce(field ->> 'field_type', 'text'),
        coalesce(field ->> 'label', 'Question'),
        nullif(field ->> 'placeholder', ''),
        coalesce((field ->> 'required')::boolean, false),
        coalesce((field ->> 'position')::integer, 0),
        coalesce(field -> 'options', '[]'::jsonb)
      )
      on conflict (zero_form_id, field_key) do nothing;
    end loop;
  end if;

  return jsonb_build_object('form', to_jsonb(form));
end;
$$;

notify pgrst, 'reload schema';
commit;
