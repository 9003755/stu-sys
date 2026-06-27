-- Capacity report cron job
-- Online project ref: kmeybkqwicrdfksbagfz
-- Run time: every 3 days at 09:00 Asia/Shanghai (01:00 UTC)
-- Note: this project environment does not provide the vault extension,
-- so the schedule uses pg_cron + pg_net directly.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'send-capacity-report-every-3-days'
  ) then
    perform cron.unschedule('send-capacity-report-every-3-days');
  end if;
end $$;

select cron.schedule(
  'send-capacity-report-every-3-days',
  '0 1 */3 * *',
  $$
  select
    net.http_post(
      url := 'https://kmeybkqwicrdfksbagfz.supabase.co/functions/v1/quick-actionsend-capacity-report',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon-or-publishable-key>"}'::jsonb,
      body := '{"source":"pg_cron","triggered_at":"scheduled"}'::jsonb
    ) as request_id;
  $$
);

select jobid, jobname, schedule, command
from cron.job
where jobname = 'send-capacity-report-every-3-days';
