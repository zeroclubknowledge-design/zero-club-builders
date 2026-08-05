-- Zero Form: pre-registration, early-bird pricing, payment and automatic
-- enrolment for Zero Club Bootcamps.
--
-- Extends the existing bootcamp/enrolment/wallet systems. It does not replace
-- them: payment uses the wallet balance already on profiles.coins, and
-- enrolment writes to the existing public.enrollments table.

-- ---------------------------------------------------------------------------
-- 1. Bootcamp lifecycle additions (nullable, so existing bootcamps are unaffected)
-- ---------------------------------------------------------------------------

alter table public.bootcamps add column if not exists starts_at timestamptz;
alter table public.bootcamps add column if not exists ends_at timestamptz;
alter table public.bootcamps add column if not exists owner_type text not null default 'Tutor';
alter table public.bootcamps add column if not exists seat_limit integer;

-- Keep owner_type aligned with the creator's account type.
update public.bootcamps as bootcamp
set owner_type = coalesce(profile.account_type, 'Tutor')
from public.profiles as profile
where profile.id = bootcamp.creator_id
  and bootcamp.owner_type is distinct from coalesce(profile.account_type, 'Tutor');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.zero_forms (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_type text not null default 'Tutor' check (owner_type in ('Tutor', 'Institution')),
  template_id text not null default 'standard',
  slug text not null unique,
  title text not null,
  description text,
  banner_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  regular_price numeric not null default 0 check (regular_price >= 0),
  early_bird_price numeric not null default 0 check (early_bird_price >= 0),
  registration_deadline timestamptz,
  seat_limit integer check (seat_limit is null or seat_limit > 0),
  views integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Early-bird must never exceed the regular price (spec section 8).
  constraint zero_forms_price_order check (early_bird_price <= regular_price),
  -- One Zero Form per bootcamp keeps the model unambiguous.
  constraint zero_forms_bootcamp_unique unique (bootcamp_id)
);

create index if not exists zero_forms_owner_idx on public.zero_forms (owner_id, created_at desc);
create index if not exists zero_forms_status_idx on public.zero_forms (status);

create table if not exists public.zero_form_fields (
  id uuid primary key default gen_random_uuid(),
  zero_form_id uuid not null references public.zero_forms(id) on delete cascade,
  field_key text not null,
  field_type text not null default 'text'
    check (field_type in ('text', 'email', 'phone', 'number', 'textarea', 'select', 'country')),
  label text not null,
  placeholder text,
  required boolean not null default false,
  position integer not null default 0,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (zero_form_id, field_key)
);

create index if not exists zero_form_fields_form_idx on public.zero_form_fields (zero_form_id, position);

create table if not exists public.zero_form_registrations (
  id uuid primary key default gen_random_uuid(),
  zero_form_id uuid not null references public.zero_forms(id) on delete cascade,
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  registration_data jsonb not null default '{}'::jsonb,
  amount numeric not null default 0,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded', 'not_required')),
  registration_status text not null default 'pending'
    check (registration_status in ('pending', 'payment_pending', 'confirmed', 'enrolled', 'cancelled', 'refunded')),
  payment_reference text,
  registered_at timestamptz not null default now(),
  confirmed_at timestamptz,
  enrolled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Duplicate protection (spec section 26).
  constraint zero_form_registrations_unique unique (zero_form_id, user_id)
);

create index if not exists zero_form_registrations_form_idx
  on public.zero_form_registrations (zero_form_id, created_at desc);
create index if not exists zero_form_registrations_user_idx
  on public.zero_form_registrations (user_id);

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------

alter table public.zero_forms enable row level security;
alter table public.zero_form_fields enable row level security;
alter table public.zero_form_registrations enable row level security;

-- Published forms are publicly readable so the shareable link works.
drop policy if exists zero_forms_select_public on public.zero_forms;
create policy zero_forms_select_public
  on public.zero_forms for select
  using (status = 'published' or owner_id = auth.uid());

drop policy if exists zero_form_fields_select_public on public.zero_form_fields;
create policy zero_form_fields_select_public
  on public.zero_form_fields for select
  using (exists (
    select 1 from public.zero_forms form
    where form.id = zero_form_id
      and (form.status = 'published' or form.owner_id = auth.uid())
  ));

-- Responses are private: only the learner who submitted, or the form owner.
drop policy if exists zero_form_registrations_select_own on public.zero_form_registrations;
create policy zero_form_registrations_select_own
  on public.zero_form_registrations for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.zero_forms form where form.id = zero_form_id and form.owner_id = auth.uid())
  );

-- All writes go through the security-definer functions below, never directly.

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

create or replace function public.zero_form_slugify(source text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(source, 'bootcamp')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Live view of a form's state. Deadlines and bootcamp start times are evaluated
-- here on the server, never trusted from the browser (spec sections 25 and 33).
create or replace function public.zero_form_state(form public.zero_forms, bootcamp public.bootcamps)
returns text
language plpgsql
stable
as $$
declare
  confirmed_count integer;
begin
  if form.status = 'draft' then return 'draft'; end if;
  if form.status = 'closed' then return 'closed'; end if;

  if bootcamp.starts_at is not null and bootcamp.starts_at <= now() then
    return 'bootcamp_started';
  end if;

  if form.registration_deadline is not null and form.registration_deadline <= now() then
    return 'deadline_passed';
  end if;

  if form.seat_limit is not null then
    select count(*) into confirmed_count
    from public.zero_form_registrations
    where zero_form_id = form.id
      and registration_status in ('confirmed', 'enrolled');
    if confirmed_count >= form.seat_limit then
      return 'full';
    end if;
  end if;

  return 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Automatic transition: close forms and enrol confirmed learners
--    Runs whenever a relevant page or action touches the bootcamp, so it does
--    not depend on a frontend timer or a scheduled job.
-- ---------------------------------------------------------------------------

create or replace function public.process_zero_form_launch(target_bootcamp_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  bootcamp public.bootcamps;
  enrolled_count integer := 0;
  registration record;
begin
  select * into bootcamp from public.bootcamps where id = target_bootcamp_id;
  if bootcamp.id is null then return 0; end if;
  if bootcamp.starts_at is null or bootcamp.starts_at > now() then return 0; end if;

  -- The bootcamp has started: close the form.
  update public.zero_forms
  set status = 'closed', updated_at = now()
  where bootcamp_id = target_bootcamp_id and status = 'published';

  -- Enrol every confirmed registration that is not yet enrolled.
  for registration in
    select reg.* from public.zero_form_registrations reg
    where reg.bootcamp_id = target_bootcamp_id
      and reg.registration_status = 'confirmed'
  loop
    -- Guarded rather than relying on a unique constraint that may not exist
    -- on older databases.
    if not exists (
      select 1 from public.enrollments
      where bootcamp_id = target_bootcamp_id and profile_id = registration.user_id
    ) then
      insert into public.enrollments (bootcamp_id, profile_id)
      values (target_bootcamp_id, registration.user_id);
    end if;

    update public.zero_form_registrations
    set registration_status = 'enrolled', enrolled_at = now(), updated_at = now()
    where id = registration.id;

    insert into public.notifications (profile_id, actor_id, type, content)
    values (registration.user_id, bootcamp.creator_id, 'system',
            'Your bootcamp "' || bootcamp.title || '" has started. You now have full access.');

    enrolled_count := enrolled_count + 1;
  end loop;

  return enrolled_count;
end;
$$;

grant execute on function public.process_zero_form_launch(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. Public read: everything the shareable registration page needs
-- ---------------------------------------------------------------------------

create or replace function public.get_zero_form_public(form_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  form public.zero_forms;
  bootcamp public.bootcamps;
  owner public.profiles;
  state text;
  seats_taken integer;
  my_registration jsonb;
begin
  select * into form from public.zero_forms where slug = form_slug;
  if form.id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into bootcamp from public.bootcamps where id = form.bootcamp_id;
  select * into owner from public.profiles where id = form.owner_id;

  -- Evaluate the launch transition before reporting state.
  perform public.process_zero_form_launch(form.bootcamp_id);
  select * into form from public.zero_forms where id = form.id;

  state := public.zero_form_state(form, bootcamp);

  select count(*) into seats_taken
  from public.zero_form_registrations
  where zero_form_id = form.id and registration_status in ('confirmed', 'enrolled');

  if auth.uid() is not null then
    select to_jsonb(reg) into my_registration
    from public.zero_form_registrations reg
    where reg.zero_form_id = form.id and reg.user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'found', true,
    'state', state,
    'form', jsonb_build_object(
      'id', form.id, 'slug', form.slug, 'title', form.title, 'description', form.description,
      'banner_url', coalesce(form.banner_url, bootcamp.banner_url),
      'status', form.status, 'regular_price', form.regular_price,
      'early_bird_price', form.early_bird_price, 'registration_deadline', form.registration_deadline,
      'seat_limit', form.seat_limit, 'seats_taken', seats_taken,
      'seats_left', case when form.seat_limit is null then null else greatest(0, form.seat_limit - seats_taken) end
    ),
    'bootcamp', jsonb_build_object(
      'id', bootcamp.id, 'title', bootcamp.title, 'description', bootcamp.description,
      'category', bootcamp.category, 'banner_url', bootcamp.banner_url,
      'starts_at', bootcamp.starts_at, 'ends_at', bootcamp.ends_at, 'price', bootcamp.price
    ),
    'owner', jsonb_build_object(
      'id', owner.id, 'username', owner.username, 'full_name', owner.full_name,
      'avatar_url', owner.avatar_url, 'account_type', owner.account_type
    ),
    'fields', coalesce((
      select jsonb_agg(to_jsonb(field) order by field.position)
      from public.zero_form_fields field where field.zero_form_id = form.id
    ), '[]'::jsonb),
    'my_registration', my_registration
  );
end;
$$;

grant execute on function public.get_zero_form_public(text) to authenticated, anon;

create or replace function public.record_zero_form_view(form_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.zero_forms set views = views + 1 where slug = form_slug and status = 'published';
$$;

grant execute on function public.record_zero_form_view(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 7. Learner submission. The server decides the price and the status.
-- ---------------------------------------------------------------------------

create or replace function public.submit_zero_form(form_slug text, answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  form public.zero_forms;
  bootcamp public.bootcamps;
  state text;
  payable numeric;
  balance numeric;
  existing public.zero_form_registrations;
  new_registration public.zero_form_registrations;
  reference text;
begin
  if caller is null then raise exception 'Please sign in to register'; end if;

  select * into form from public.zero_forms where slug = form_slug;
  if form.id is null then raise exception 'This Zero Form no longer exists'; end if;

  select * into bootcamp from public.bootcamps where id = form.bootcamp_id;

  perform public.process_zero_form_launch(form.bootcamp_id);
  select * into form from public.zero_forms where id = form.id;

  state := public.zero_form_state(form, bootcamp);
  if state = 'draft' then raise exception 'This form has not been published yet'; end if;
  if state = 'closed' or state = 'deadline_passed' then raise exception 'Registration for this bootcamp has closed'; end if;
  if state = 'bootcamp_started' then raise exception 'This bootcamp has already started. Join it directly instead'; end if;
  if state = 'full' then raise exception 'All seats for this bootcamp have been taken'; end if;

  -- Already enrolled through the normal flow?
  if exists (select 1 from public.enrollments where bootcamp_id = form.bootcamp_id and profile_id = caller) then
    raise exception 'You are already enrolled in this bootcamp';
  end if;

  select * into existing from public.zero_form_registrations
  where zero_form_id = form.id and user_id = caller;

  -- The server sets the amount. A client-supplied price is never used.
  payable := form.early_bird_price;

  if existing.id is not null then
    if existing.registration_status in ('confirmed', 'enrolled') then
      return jsonb_build_object('status', 'already_registered', 'registration', to_jsonb(existing));
    end if;
    -- Let the learner resume an unfinished payment rather than duplicating.
    update public.zero_form_registrations
    set registration_data = answers, amount = payable, updated_at = now()
    where id = existing.id
    returning * into new_registration;
  else
    insert into public.zero_form_registrations (
      zero_form_id, bootcamp_id, user_id, registration_data, amount,
      payment_status, registration_status
    ) values (
      form.id, form.bootcamp_id, caller, answers, payable,
      case when payable > 0 then 'pending' else 'not_required' end,
      case when payable > 0 then 'payment_pending' else 'pending' end
    )
    returning * into new_registration;
  end if;

  -- Free bootcamp: confirm immediately, no payment step (spec section 14).
  if payable <= 0 then
    update public.zero_form_registrations
    set registration_status = 'confirmed', payment_status = 'not_required',
        confirmed_at = now(), updated_at = now()
    where id = new_registration.id
    returning * into new_registration;

    insert into public.notifications (profile_id, actor_id, type, content)
    values (caller, form.owner_id, 'system',
            'You are registered for "' || bootcamp.title || '". It starts soon.');

    return jsonb_build_object('status', 'confirmed', 'registration', to_jsonb(new_registration));
  end if;

  -- Paid bootcamp: charge the Zero Club wallet, the platform's existing money.
  select coalesce(coins, 0) into balance from public.profiles where id = caller;
  if balance < payable then
    return jsonb_build_object(
      'status', 'insufficient_funds',
      'amount', payable,
      'balance', balance,
      'shortfall', payable - balance,
      'registration', to_jsonb(new_registration)
    );
  end if;

  reference := 'zf_' || replace(gen_random_uuid()::text, '-', '');

  update public.profiles set coins = coins - payable where id = caller;

  -- Credit the bootcamp owner.
  update public.profiles set coins = coalesce(coins, 0) + payable where id = form.owner_id;

  update public.zero_form_registrations
  set payment_status = 'paid', registration_status = 'confirmed',
      payment_reference = reference, confirmed_at = now(), updated_at = now()
  where id = new_registration.id
  returning * into new_registration;

  insert into public.notifications (profile_id, actor_id, type, content)
  values
    (caller, form.owner_id, 'system',
     'Registration confirmed for "' || bootcamp.title || '".'),
    (form.owner_id, caller, 'system',
     'New Zero Form registration for "' || bootcamp.title || '".');

  return jsonb_build_object('status', 'confirmed', 'registration', to_jsonb(new_registration));
end;
$$;

grant execute on function public.submit_zero_form(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Creator: save (create or update) a Zero Form
-- ---------------------------------------------------------------------------

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
  if bootcamp.creator_id <> caller and coalesce(bootcamp.assigned_tutor_id, '00000000-0000-0000-0000-000000000000'::uuid) <> caller then
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

grant execute on function public.save_zero_form(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Creator dashboards
-- ---------------------------------------------------------------------------

create or replace function public.get_my_zero_forms()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  -- Apply any pending launches before reporting.
  perform public.process_zero_form_launch(bootcamp_id)
  from public.zero_forms where owner_id = caller;

  return coalesce((
    select jsonb_agg(to_jsonb(row) order by row.created_at desc) from (
      select form.id, form.slug, form.title, form.status, form.regular_price,
             form.early_bird_price, form.registration_deadline, form.seat_limit,
             form.views, form.created_at, form.published_at,
             bootcamp.id as bootcamp_id, bootcamp.title as bootcamp_title,
             bootcamp.banner_url, bootcamp.starts_at, bootcamp.category,
             public.zero_form_state(form, bootcamp) as state,
             (select count(*) from public.zero_form_registrations reg where reg.zero_form_id = form.id) as total_registrations,
             (select count(*) from public.zero_form_registrations reg where reg.zero_form_id = form.id and reg.registration_status in ('confirmed', 'enrolled')) as confirmed_registrations,
             (select count(*) from public.zero_form_registrations reg where reg.zero_form_id = form.id and reg.registration_status = 'payment_pending') as pending_payments,
             (select coalesce(sum(reg.amount), 0) from public.zero_form_registrations reg where reg.zero_form_id = form.id and reg.payment_status = 'paid') as revenue
      from public.zero_forms form
      join public.bootcamps bootcamp on bootcamp.id = form.bootcamp_id
      where form.owner_id = caller
    ) as row
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_zero_forms() to authenticated;

create or replace function public.get_zero_form_detail(target_form_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  form public.zero_forms;
  bootcamp public.bootcamps;
  seats_taken integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into form from public.zero_forms where id = target_form_id;
  if form.id is null then raise exception 'Zero Form not found'; end if;
  if form.owner_id <> caller then raise exception 'You do not have access to this Zero Form'; end if;

  perform public.process_zero_form_launch(form.bootcamp_id);
  select * into form from public.zero_forms where id = target_form_id;
  select * into bootcamp from public.bootcamps where id = form.bootcamp_id;

  select count(*) into seats_taken from public.zero_form_registrations
  where zero_form_id = form.id and registration_status in ('confirmed', 'enrolled');

  return jsonb_build_object(
    'form', to_jsonb(form),
    'bootcamp', to_jsonb(bootcamp),
    'state', public.zero_form_state(form, bootcamp),
    'seats_taken', seats_taken,
    'fields', coalesce((
      select jsonb_agg(to_jsonb(field) order by field.position)
      from public.zero_form_fields field where field.zero_form_id = form.id
    ), '[]'::jsonb),
    'metrics', jsonb_build_object(
      'views', form.views,
      'total', (select count(*) from public.zero_form_registrations where zero_form_id = form.id),
      'confirmed', seats_taken,
      'pending_payments', (select count(*) from public.zero_form_registrations where zero_form_id = form.id and registration_status = 'payment_pending'),
      'cancelled', (select count(*) from public.zero_form_registrations where zero_form_id = form.id and registration_status = 'cancelled'),
      'revenue', (select coalesce(sum(amount), 0) from public.zero_form_registrations where zero_form_id = form.id and payment_status = 'paid'),
      'conversion', case when form.views > 0
        then round((seats_taken::numeric / form.views::numeric) * 100, 1) else 0 end
    ),
    'registrations', coalesce((
      select jsonb_agg(to_jsonb(row) order by row.created_at desc) from (
        select reg.id, reg.registration_data, reg.amount, reg.payment_status,
               reg.registration_status, reg.payment_reference, reg.registered_at,
               reg.confirmed_at, reg.enrolled_at, reg.created_at,
               profile.username, profile.full_name, profile.avatar_url, profile.id as user_id
        from public.zero_form_registrations reg
        left join public.profiles profile on profile.id = reg.user_id
        where reg.zero_form_id = form.id
      ) as row
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_zero_form_detail(uuid) to authenticated;

-- Learner's own upcoming registrations (spec section 22).
create or replace function public.get_my_zero_form_registrations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  perform public.process_zero_form_launch(bootcamp_id)
  from public.zero_form_registrations where user_id = caller;

  return coalesce((
    select jsonb_agg(to_jsonb(row) order by row.starts_at nulls last) from (
      select reg.id, reg.registration_status, reg.payment_status, reg.amount,
             reg.registered_at, reg.confirmed_at,
             bootcamp.id as bootcamp_id, bootcamp.title, bootcamp.banner_url,
             bootcamp.category, bootcamp.starts_at,
             form.slug
      from public.zero_form_registrations reg
      join public.bootcamps bootcamp on bootcamp.id = reg.bootcamp_id
      join public.zero_forms form on form.id = reg.zero_form_id
      where reg.user_id = caller
        and reg.registration_status in ('pending', 'payment_pending', 'confirmed', 'enrolled')
    ) as row
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_zero_form_registrations() to authenticated;

notify pgrst, 'reload schema';
