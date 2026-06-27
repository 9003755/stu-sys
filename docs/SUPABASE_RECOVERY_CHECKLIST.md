# Supabase 故障恢复清单

适用范围：`stu_sys`

- 项目 `ref`：`kmeybkqwicrdfksbagfz`
- 收件邮箱：`9003755@qq.com`
- 当前发件邮箱：`onboarding@resend.dev`
- 当前函数资源 slug：`quick-actionsend-capacity-report`
- 当前定时任务名：`send-capacity-report-every-3-days`

## 1. 先确认数据库侧是否正常

打开 Supabase 控制台 SQL Editor，执行：

```sql
select public.get_capacity_report_snapshot();
```

判断标准：

- 能正常返回 JSON，说明容量统计 RPC 正常
- 如果报错，先修复数据库函数，再继续下面步骤

## 2. 恢复 Edge Function 代码

打开：

```text
Edge Functions
-> quick-actionsend-capacity-report
-> Code
```

将在线代码覆盖为本地文件：

```text
supabase/functions/send-capacity-report/index.ts
```

判断标准：

- 必须是 `Deno.env.get(...)` 的 Secrets 版本
- 不能保留任何硬编码的 `RESEND_API_KEY`
- 不能保留临时写死的邮箱配置

## 3. 检查并补齐 Secrets

打开：

```text
Edge Functions
-> Secrets
```

至少确认以下项目存在：

- `RESEND_API_KEY`
- `REPORT_FROM_EMAIL`
- `REPORT_RECIPIENT_EMAIL`
- `REPORT_DATABASE_TOTAL_MB`
- `REPORT_FILE_STORAGE_TOTAL_MB`
- `REPORT_ESTIMATED_FILE_MB_PER_STUDENT`

当前推荐值：

- `REPORT_FROM_EMAIL=onboarding@resend.dev`
- `REPORT_RECIPIENT_EMAIL=9003755@qq.com`
- `REPORT_DATABASE_TOTAL_MB=500`
- `REPORT_FILE_STORAGE_TOTAL_MB=1024`
- `REPORT_ESTIMATED_FILE_MB_PER_STUDENT=30`

注意：

- `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 是平台默认提供的，不需要手动补

## 4. 手动测试函数

打开：

```text
Edge Functions
-> quick-actionsend-capacity-report
-> Code
-> Test
-> Send Request
```

判断标准：

- 返回 `200`
- 响应体包含 `"success": true`
- 响应体里有 `recipient` 和 `resend.id`
- `9003755@qq.com` 能收到邮件

成功示例：

```json
{
  "success": true,
  "recipient": "9003755@qq.com"
}
```

## 5. 如果测试失败，按错误快速判断

### 情况 A：缺少环境变量

典型报错：

```text
缺少环境变量：RESEND_API_KEY, REPORT_FROM_EMAIL
```

处理：

- 回到 `Secrets` 页面补齐缺失项
- 保存后重新测试

### 情况 B：Resend 403 域名未验证

典型报错：

```text
The xxx domain is not verified
```

处理：

- 不要使用 `qq.com` 作为发件邮箱
- 改用已验证发件地址：`onboarding@resend.dev`

### 情况 C：SyntaxError

典型报错：

```text
SyntaxError: Unexpected token '{'
```

处理：

- 说明在线函数代码已损坏
- 直接用本地 `supabase/functions/send-capacity-report/index.ts` 全量覆盖线上代码
- 重新部署后再测

### 情况 D：RPC 调用失败

典型报错：

```text
获取容量快照失败
```

处理：

- 先回 SQL Editor 单独执行 `select public.get_capacity_report_snapshot();`
- 如果这里也失败，优先修复数据库 RPC

## 6. 检查定时任务是否还在

打开 SQL Editor，执行：

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'send-capacity-report-every-3-days';
```

判断标准：

- 能查到 1 条记录
- `schedule` 应为：`0 1 */3 * *`

说明：

- 该表达式按 UTC 执行
- 等价于北京时间每 3 天上午 `09:00`

## 7. 如果定时任务丢了，重新创建

执行本地文件：

```text
supabase/schedule_capacity_report.sql
```

或者把下面 SQL 直接贴到 SQL Editor：

```sql
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
```

如果用户反馈一直收不到 3 天一次的邮件，优先执行下面两条排查：

```sql
select jobid, job_pid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'send-capacity-report-every-3-days'
)
order by start_time desc
limit 10;
```

```sql
select id, status_code, timed_out, error_msg, content, created
from net._http_response
order by created desc
limit 10;
```

若 `cron.job_run_details` 显示成功、但 `net._http_response` 出现 `404 Requested function was not found`，说明定时任务 URL 配错了；当前正确 endpoint 应为 `quick-actionsend-capacity-report`。

## 8. 最终验收

全部恢复完成后，至少做 3 个检查：

- SQL 里 `get_capacity_report_snapshot()` 正常
- Function 手动测试返回 `200`
- `cron.job` 里存在 `send-capacity-report-every-3-days`

如果这 3 项都通过，说明本次 Supabase 容量巡检邮件功能已恢复。
