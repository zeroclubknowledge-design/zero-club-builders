-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp on 2026-10-09 via Supabase MCP
-- (migration "message_receipts"). Kept as a record; do not re-run.
-- Ticks on direct messages: one tick = saved, two grey = delivered, two pink = seen.
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
-- stamp_message_receipts (trigger, before update of is_read): sets read_at and
--   delivered_at when is_read turns true.
-- mark_messages_delivered(): security definer; marks everything sent to auth.uid()
--   as delivered. Called by the recipient's app while it is open.
-- Also: send-push edge function v14 labels voice notes "Voice note" (they are .webm and
-- were announced as "Video"), and job notifications open the job.
