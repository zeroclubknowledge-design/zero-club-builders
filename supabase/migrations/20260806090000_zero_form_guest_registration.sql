-- Zero Form v2:
--   * anyone can register without a Zero Club account (like Google Forms)
--   * two intents: register interest, or pay now
--   * the public page also returns the curriculum and video for the flyer view

-- ---------------------------------------------------------------------------
-- 1. Registrations no longer require an account
-- ---------------------------------------------------------------------------

alter table public.zero_form_registrations alter column user_id drop not null;

alter table public.zero_form_registrations add column if not exists guest_name text;
alter table public.zero_form_registrations add column if not exists guest_email text;
alter table public.zero_form_registrations add column if not exists guest_phone text;
alter table public.zero_form_registrations add column if not exists intent text not null default 'pay';

-- Widen the status vocabulary to include an expression of interest.
alter table public.zero_form_registrations drop constraint if exists zero_form_registrations_registration_status_check;
alter table public.zero_form_registrations
  add constraint zero_form_registrations_registration_status_check
  check (registration_status in ('pending', 'payment_pending', 'interested', 'confirmed', 'enrolled', 'cancelled', 'refunded'));

alter table public.zero_form_registrations drop constraint if exists zero_form_registrations_intent_check;
alter table public.zero_form_registrations
  add constraint zero_form_registrations_intent_check check (intent in ('interest', 'pay'));

-- The old "one row per user" rule cannot apply to guests (user_id is null).
alter table public.zero_form_registrations drop constraint if exists zero_form_registrations_unique;
create unique index if not exists zero_form_registrations_user_unique
  on public.zero_form_registrations (zero_form_id, user_id) where user_id is not null;
create unique index if not exists zero_form_registrations_guest_unique
  on public.zero_form_registrations (zero_form_id, lower(guest_email)) where user_id is null and guest_email is not null;

-- Let the creator choose which intents their form offers.
alter table public.zero_forms add column if not exists allow_interest boolean not null default true;
alter table public.zero_forms add column if not exists allow_guest boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Public payload: adds curriculum, video and creator-configured options
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
      'seats_left', case when form.seat_limit is null then null else greatest(0, form.seat_limit - seats_taken) end,
      'allow_interest', form.allow_interest,
      'allow_guest', form.allow_guest
    ),
    'bootcamp', jsonb_build_object(
      'id', bootcamp.id, 'title', bootcamp.title, 'description', bootcamp.description,
      'category', bootcamp.category, 'banner_url', bootcamp.banner_url,
      'video_url', bootcamp.video_url,
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
    -- Curriculum for the "Course content" tab.
    'curriculum', coalesce((
      select jsonb_agg(to_jsonb(row) order by row.order_index) from (
        select m.id, m.title, m.order_index,
               coalesce((
                 select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title) order by l.order_index)
                 from public.lessons l where l.module_id = m.id
               ), '[]'::jsonb) as lessons
        from public.modules m where m.bootcamp_id = bootcamp.id
      ) as row
    ), '[]'::jsonb),
    'my_registration', my_registration
  );
end;
$$;

grant execute on function public.get_zero_form_public(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Submission that works with or without an account
--
-- `intent`:
--   'interest' - details only, no payment, recorded so the creator can follow up
--   'pay'      - charged immediately (members: wallet; guests: handled by the
--                payment step, which confirms the row afterwards)
-- ---------------------------------------------------------------------------

create or replace function public.submit_zero_form_v2(
  form_slug text,
  answers jsonb,
  intent text default 'pay',
  guest jsonb default null
)
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
  reg public.zero_form_registrations;
  reference text;
  g_name text := nullif(trim(guest ->> 'name'), '');
  g_email text := lower(nullif(trim(guest ->> 'email'), ''));
  g_phone text := nullif(trim(guest ->> 'phone'), '');
begin
  if intent not in ('interest', 'pay') then raise exception 'Invalid registration type'; end if;

  select * into form from public.zero_forms where slug = form_slug;
  if form.id is null then raise exception 'This Zero Form no longer exists'; end if;
  select * into bootcamp from public.bootcamps where id = form.bootcamp_id;

  perform public.process_zero_form_launch(form.bootcamp_id);
  select * into form from public.zero_forms where id = form.id;

  state := public.zero_form_state(form, bootcamp);
  if state = 'draft' then raise exception 'This form has not been published yet'; end if;
  if state in ('closed', 'deadline_passed') then raise exception 'Registration for this bootcamp has closed'; end if;
  if state = 'bootcamp_started' then raise exception 'This bootcamp has already started'; end if;
  if state = 'full' and intent = 'pay' then raise exception 'All seats for this bootcamp have been taken'; end if;

  if intent = 'interest' and not form.allow_interest then
    raise exception 'This form only accepts paid registrations';
  end if;

  -- Guests are identified by email; members by their account.
  if caller is null then
    if not form.allow_guest then raise exception 'Please sign in to register for this bootcamp'; end if;
    if g_email is null then raise exception 'An email address is required'; end if;
    if g_name is null then raise exception 'Your name is required'; end if;

    select * into existing from public.zero_form_registrations
    where zero_form_id = form.id and user_id is null and lower(guest_email) = g_email;
  else
    if exists (select 1 from public.enrollments where bootcamp_id = form.bootcamp_id and profile_id = caller) then
      raise exception 'You are already enrolled in this bootcamp';
    end if;
    select * into existing from public.zero_form_registrations
    where zero_form_id = form.id and user_id = caller;
  end if;

  -- The server decides the amount. Nothing from the browser is trusted.
  payable := case when intent = 'interest' then 0 else form.early_bird_price end;

  if existing.id is not null and existing.registration_status in ('confirmed', 'enrolled') then
    return jsonb_build_object('status', 'already_registered', 'registration', to_jsonb(existing));
  end if;

  if existing.id is not null then
    update public.zero_form_registrations
    set registration_data = answers, amount = payable, intent = submit_zero_form_v2.intent,
        guest_name = coalesce(g_name, guest_name),
        guest_email = coalesce(g_email, guest_email),
        guest_phone = coalesce(g_phone, guest_phone),
        updated_at = now()
    where id = existing.id
    returning * into reg;
  else
    insert into public.zero_form_registrations (
      zero_form_id, bootcamp_id, user_id, registration_data, amount, intent,
      guest_name, guest_email, guest_phone, payment_status, registration_status
    ) values (
      form.id, form.bootcamp_id, caller, answers, payable, submit_zero_form_v2.intent,
      g_name, g_email, g_phone,
      case when payable > 0 then 'pending' else 'not_required' end,
      case when payable > 0 then 'payment_pending' else 'pending' end
    )
    returning * into reg;
  end if;

  -- Expression of interest, or a free bootcamp: done immediately.
  if payable <= 0 then
    update public.zero_form_registrations
    set registration_status = case when submit_zero_form_v2.intent = 'interest' and form.early_bird_price > 0
                                   then 'interested' else 'confirmed' end,
        payment_status = 'not_required', confirmed_at = now(), updated_at = now()
    where id = reg.id
    returning * into reg;

    insert into public.notifications (profile_id, actor_id, type, content)
    values (form.owner_id, coalesce(caller, form.owner_id), 'system',
            coalesce(g_name, 'Someone') || ' registered interest in "' || bootcamp.title || '".');

    if caller is not null then
      insert into public.notifications (profile_id, actor_id, type, content)
      values (caller, form.owner_id, 'system',
              'You are on the list for "' || bootcamp.title || '".');
    end if;

    return jsonb_build_object('status', case when submit_zero_form_v2.intent = 'interest' and form.early_bird_price > 0
                                             then 'interested' else 'confirmed' end,
                              'registration', to_jsonb(reg));
  end if;

  -- Paid: signed-in members pay straight from their Zero Club wallet.
  if caller is not null then
    select coalesce(coins, 0) into balance from public.profiles where id = caller;
    if balance < payable then
      return jsonb_build_object('status', 'insufficient_funds', 'amount', payable,
                                'balance', balance, 'shortfall', payable - balance,
                                'registration', to_jsonb(reg));
    end if;

    reference := 'zf_' || replace(gen_random_uuid()::text, '-', '');
    update public.profiles set coins = coins - payable where id = caller;
    update public.profiles set coins = coalesce(coins, 0) + payable where id = form.owner_id;

    update public.zero_form_registrations
    set payment_status = 'paid', registration_status = 'confirmed',
        payment_reference = reference, confirmed_at = now(), updated_at = now()
    where id = reg.id
    returning * into reg;

    insert into public.notifications (profile_id, actor_id, type, content)
    values (caller, form.owner_id, 'system', 'Registration confirmed for "' || bootcamp.title || '".'),
           (form.owner_id, caller, 'system', 'New paid Zero Form registration for "' || bootcamp.title || '".');

    return jsonb_build_object('status', 'confirmed', 'registration', to_jsonb(reg));
  end if;

  -- Guests pay by card. The row stays pending until the payment is verified.
  return jsonb_build_object(
    'status', 'payment_required',
    'amount', payable,
    'registration_id', reg.id,
    'email', g_email,
    'registration', to_jsonb(reg)
  );
end;
$$;

grant execute on function public.submit_zero_form_v2(text, jsonb, text, jsonb) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Confirm a guest card payment (called by the payment verifier)
-- ---------------------------------------------------------------------------

create or replace function public.confirm_zero_form_payment(
  target_registration_id uuid,
  reference text,
  paid_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reg public.zero_form_registrations;
  form public.zero_forms;
  bootcamp public.bootcamps;
begin
  select * into reg from public.zero_form_registrations where id = target_registration_id;
  if reg.id is null then raise exception 'Registration not found'; end if;
  if reg.payment_status = 'paid' then
    return jsonb_build_object('status', 'already_paid', 'registration', to_jsonb(reg));
  end if;
  if paid_amount < reg.amount then raise exception 'Payment amount does not match the registration'; end if;

  select * into form from public.zero_forms where id = reg.zero_form_id;
  select * into bootcamp from public.bootcamps where id = reg.bootcamp_id;

  update public.zero_form_registrations
  set payment_status = 'paid', registration_status = 'confirmed',
      payment_reference = reference, confirmed_at = now(), updated_at = now()
  where id = reg.id
  returning * into reg;

  update public.profiles set coins = coalesce(coins, 0) + paid_amount where id = form.owner_id;

  insert into public.notifications (profile_id, actor_id, type, content)
  values (form.owner_id, form.owner_id, 'system',
          'New paid Zero Form registration for "' || bootcamp.title || '".');

  return jsonb_build_object('status', 'confirmed', 'registration', to_jsonb(reg));
end;
$$;

revoke all on function public.confirm_zero_form_payment(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.confirm_zero_form_payment(uuid, text, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Creator view: include guest details and intent
-- ---------------------------------------------------------------------------

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
      'interested', (select count(*) from public.zero_form_registrations where zero_form_id = form.id and registration_status = 'interested'),
      'pending_payments', (select count(*) from public.zero_form_registrations where zero_form_id = form.id and registration_status = 'payment_pending'),
      'cancelled', (select count(*) from public.zero_form_registrations where zero_form_id = form.id and registration_status = 'cancelled'),
      'revenue', (select coalesce(sum(amount), 0) from public.zero_form_registrations where zero_form_id = form.id and payment_status = 'paid'),
      'conversion', case when form.views > 0 then round((seats_taken::numeric / form.views::numeric) * 100, 1) else 0 end
    ),
    'registrations', coalesce((
      select jsonb_agg(to_jsonb(row) order by row.created_at desc) from (
        select reg.id, reg.registration_data, reg.amount, reg.payment_status, reg.intent,
               reg.registration_status, reg.payment_reference, reg.registered_at,
               reg.confirmed_at, reg.enrolled_at, reg.created_at,
               reg.guest_name, reg.guest_email, reg.guest_phone,
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

-- ---------------------------------------------------------------------------
-- 6. Let the creator turn the two options on or off when saving a form
-- ---------------------------------------------------------------------------

create or replace function public.set_zero_form_options(
  target_form_id uuid,
  new_allow_interest boolean,
  new_allow_guest boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.zero_forms
  set allow_interest = coalesce(new_allow_interest, allow_interest),
      allow_guest = coalesce(new_allow_guest, allow_guest),
      updated_at = now()
  where id = target_form_id and owner_id = auth.uid();
  if not found then raise exception 'Zero Form not found'; end if;
end;
$$;

grant execute on function public.set_zero_form_options(uuid, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
