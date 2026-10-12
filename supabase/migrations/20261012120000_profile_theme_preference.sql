-- ALREADY APPLIED to tiyifgfsuzhcvdvntjmp via MCP on 2026-10-12. Do not re-run.
-- Account-level appearance, written by Zero Club and read by ZeroStart.
alter table public.profiles add column if not exists theme_mode text, add column if not exists dark_theme text;
alter table public.profiles add constraint profiles_theme_mode_check check (theme_mode is null or theme_mode in ('on','off','system'));
alter table public.profiles add constraint profiles_dark_theme_check check (dark_theme is null or dark_theme in ('lights-out','dim','rose-noir'));
