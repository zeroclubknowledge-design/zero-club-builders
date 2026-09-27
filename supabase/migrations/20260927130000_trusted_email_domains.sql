-- Sign-ups are limited to reputable email providers, educational institutions
-- (.edu, .edu.xx, .ac.xx) and Google sign-in. Temporary/disposable inboxes
-- are refused inside Supabase Auth itself. Applied to production 2026-09-27.
-- To allow another domain (e.g. a partner institution):
--   insert into public.allowed_email_domains (domain, note) values ('company.com', 'Partner');

create table if not exists public.allowed_email_domains (
  domain text primary key check (domain = lower(domain) and domain !~ '\s'),
  note text,
  created_at timestamptz not null default now()
);
alter table public.allowed_email_domains enable row level security;
drop policy if exists "Admins manage allowed email domains" on public.allowed_email_domains;
create policy "Admins manage allowed email domains" on public.allowed_email_domains
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_admin,false)))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_admin,false)));

insert into public.allowed_email_domains (domain, note) values
 ('gmail.com','Google'),('googlemail.com','Google'),
 ('yahoo.com','Yahoo'),('yahoo.co.uk','Yahoo'),('yahoo.fr','Yahoo'),('yahoo.de','Yahoo'),('yahoo.ca','Yahoo'),('yahoo.in','Yahoo'),('yahoo.com.au','Yahoo'),('yahoo.co.in','Yahoo'),('ymail.com','Yahoo'),('rocketmail.com','Yahoo'),
 ('outlook.com','Microsoft'),('hotmail.com','Microsoft'),('live.com','Microsoft'),('msn.com','Microsoft'),('hotmail.co.uk','Microsoft'),('hotmail.fr','Microsoft'),('outlook.fr','Microsoft'),('live.co.uk','Microsoft'),('outlook.co.uk','Microsoft'),
 ('icloud.com','Apple'),('me.com','Apple'),('mac.com','Apple'),
 ('aol.com','AOL'),
 ('proton.me','Proton'),('protonmail.com','Proton'),('pm.me','Proton'),
 ('zoho.com','Zoho'),('zohomail.com','Zoho'),
 ('gmx.com','GMX'),('gmx.net','GMX'),('gmx.de','GMX'),('web.de','Web.de'),('mail.com','Mail.com'),
 ('yandex.com','Yandex'),('yandex.ru','Yandex'),
 ('fastmail.com','Fastmail'),('hey.com','HEY'),('tuta.io','Tuta'),('tutanota.com','Tuta'),
 ('qq.com','Tencent'),('163.com','NetEase'),('126.com','NetEase'),('naver.com','Naver'),
 ('orange.fr','Orange'),('free.fr','Free'),('btinternet.com','BT'),('comcast.net','Comcast'),('verizon.net','Verizon'),('att.net','AT&T'),('sbcglobal.net','AT&T')
on conflict (domain) do nothing;

create or replace function public.is_email_domain_allowed(email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when email is null or position('@' in email) = 0 then false
    else (
      with d as (select lower(trim(split_part(email, '@', 2))) as domain)
      select exists (select 1 from public.allowed_email_domains a, d where a.domain = d.domain)
          or (select d.domain ~ '(^|\.)(edu|edu\.[a-z]{2}|ac\.[a-z]{2})$' from d)
    )
  end;
$$;
grant execute on function public.is_email_domain_allowed(text) to anon, authenticated;

create or replace function public.enforce_trusted_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data->>'provider', 'email') = 'google' then
    return new;
  end if;
  if not public.is_email_domain_allowed(new.email) then
    raise exception 'EMAIL_DOMAIN_NOT_ALLOWED: Use an email from a trusted provider such as Gmail, Yahoo, Outlook or iCloud.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_trusted_email_domain on auth.users;
create trigger enforce_trusted_email_domain
  before insert on auth.users
  for each row execute function public.enforce_trusted_email_domain();
