# Three claimed-gift reminders

Apply `supabase/migrations/20261028090000_gift_claim_reminders.sql` after the
six-hour use-window migration (`20261027090000_gift_claim_use_window.sql`).
This checkout does not have a live database deployment connection.

The database schedules a minute job named `zero-gift-claim-reminders`.
Full six-hour claims get reminders with 3 hours, 1 hour and 15 minutes left.
Shorter windows cap those lead times at half, a third and a quarter of their
actual window. A 30-minute claim therefore gets reminders with 15 minutes,
10 minutes and 7 minutes 30 seconds left. The actual receipt expiry always
wins, including a campaign deadline shortened after a claim.

Reminders appear in the existing Alerts and realtime notification UI, link to
the gift, and use the existing push notification pipeline where configured and
permitted by the device. No email/SMS service is required. Fully spent, expired,
released and cancelled claims are excluded; partially used balances qualify.
The private delivery ledger records each of the three reminders once per claim.
It is committed with its notification so failed inserts can be retried safely.

If pg_cron is unavailable, schedule `select public.send_zero_gift_claim_reminders();`
every minute from a trusted server connection. Ordinary clients cannot call it.
Minute scheduling can group reminders for extremely short claims or during
catch-up after an outage; no reminders are sent after expiry. Background delivery
requires the scheduler to be active, even when users have closed the app.

Verify after applying:

```sql
select jobname, schedule, active from cron.job
where jobname='zero-gift-claim-reminders';
select start_time, status, return_message from cron.job_run_details
where jobid=(select jobid from cron.job where jobname='zero-gift-claim-reminders')
order by start_time desc limit 5;
```

Local checks:

```powershell
node --test scripts/gift-claim-reminders.test.mjs scripts/bootcamp-schedule.test.mjs scripts/gift-claim-window.test.mjs
node node_modules/typescript/bin/tsc --noEmit --pretty false
```
