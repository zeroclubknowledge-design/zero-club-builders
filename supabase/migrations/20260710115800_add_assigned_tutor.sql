-- Allow institutions to create bootcamps and assign tutors
-- The bootcamp's creator_id will be the institution's ID
-- The assigned_tutor_id tracks which tutor is teaching

-- Add assigned_tutor_id column to bootcamps for institution-assigned tutors
alter table public.bootcamps add column if not exists assigned_tutor_id uuid references public.profiles(id);
