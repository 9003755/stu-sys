# Supabase 容量巡检邮件

## 目标

每 3 天执行一次容量巡检，并将结果邮件发送到固定邮箱 `9003755@qq.com`。

邮件内容包括：

- 数据库总容量（MB）
- 数据库已用容量（MB）
- 数据库剩余容量（MB）
- 文件存储总容量（MB）
- 文件存储已用容量（MB）
- 文件存储剩余容量（MB）
- 系统内管理员总数
- 每个管理员名下的班级数量
- 每个班级的学生数量
- 按 3 张图片/学员估算，剩余文件存储还能注册多少学员

## 当前部署状态

截至 `2026-06-19`，线上已完成以下部署与验证：

- RPC `public.get_capacity_report_snapshot()` 已部署成功
- Edge Function 在线资源实际 slug 为 `quick-actionsend-capacity-report`
- 在线代码已恢复为本地 `Secrets` 版本，不再依赖硬编码发件参数
- 已新增自定义 Secrets：
  - `RESEND_API_KEY`
  - `REPORT_FROM_EMAIL`
- 已手动触发一次函数并成功发信到 `9003755@qq.com`
- 已创建定时任务 `send-capacity-report-every-3-days`

最近一次手动验证返回示例：

```json
{
  "success": true,
  "recipient": "9003755@qq.com",
  "subject": "学员报名系统容量巡检报告 - 2026/6/19 15:11:21",
  "resend": {
    "id": "875c7b54-f5bf-46f4-a029-9b656432040d"
  }
}
```

## 实现结构

### 数据库侧

- RPC：`public.get_capacity_report_snapshot()`
- 位置：[`20260618000002_capacity_report_snapshot_rpc.sql`](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/supabase/migrations/20260618000002_capacity_report_snapshot_rpc.sql)

职责：

- 统计数据库已用容量：`pg_database_size(current_database())`
- 统计文件存储已用容量：`storage.objects` 中 `student-documents` bucket 的文件大小总和
- 统计管理员总数、班级总数、学生总数
- 汇总每个管理员的班级清单与每班学生数

### Edge Function

- 函数名：`send-capacity-report`
- 位置：[`send-capacity-report/index.ts`](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/supabase/functions/send-capacity-report/index.ts)

职责：

- 调用 `get_capacity_report_snapshot()`
- 结合环境变量中的“总容量”配置，计算剩余容量
- 按 `30 MB/学员`（3 张图，每张约 10 MB）估算剩余可注册学员数
- 使用 Resend 发送中文邮件

## 需要配置的 Secrets

在 Supabase 项目中设置以下 Edge Function Secrets：

```bash
supabase secrets set \
  RESEND_API_KEY=你的ResendKey \
  REPORT_FROM_EMAIL=你的已验证发件邮箱 \
  REPORT_RECIPIENT_EMAIL=9003755@qq.com \
  REPORT_DATABASE_TOTAL_MB=500 \
  REPORT_FILE_STORAGE_TOTAL_MB=1024 \
  REPORT_ESTIMATED_FILE_MB_PER_STUDENT=30
```

说明：

- `REPORT_DATABASE_TOTAL_MB`
  - Free 方案可填 `500`
  - Pro 方案可填 `8192`
- `REPORT_FILE_STORAGE_TOTAL_MB`
  - Free 方案可填 `1024`
  - Pro 方案可填 `102400`
- `REPORT_FROM_EMAIL`
  - 必须是 Resend 已验证域名下的发件地址
  - 当前线上实际使用：`onboarding@resend.dev`
- `REPORT_RECIPIENT_EMAIL`
  - 当前线上实际使用：`9003755@qq.com`

## 部署 Edge Function

```bash
supabase functions deploy send-capacity-report
```

## 手动测试

部署后可以先手动调用一次：

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/quick-actionsend-capacity-report" \
  -H "Authorization: Bearer <anon-or-publishable-key>" \
  -H "Content-Type: application/json"
```

调用成功后，固定邮箱应收到一封容量巡检邮件。

## 定时任务（每 3 天一次）

Supabase 官方支持使用 `pg_cron + pg_net + vault` 定时调用 Edge Function：

- Scheduling Edge Functions: [Supabase Docs](https://supabase.com/docs/guides/functions/schedule-functions)
- Cron: [Supabase Docs](https://supabase.com/docs/guides/cron)

### 1. 启用扩展

在 Supabase Dashboard 中启用：

- `pg_cron`
- `pg_net`

注意：

- 本项目线上环境中 `vault` 扩展不可用
- 因此最终采用的是 `pg_cron + pg_net` 方案
- 由于本函数只读取服务端 Secrets 并执行业务逻辑，定时任务使用项目 `anon key` 调用即可满足当前需求

### 2. 创建定时任务

线上实际部署使用的 cron 表达式为 `0 1 */3 * *`。

说明：

- Supabase 数据库时区按 UTC 处理
- `01:00 UTC` 对应北京时间 `09:00`
- 因此这条任务等价于“每 3 天北京时间上午 9 点执行一次”

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

补充说明：

- 2026-06-27 排查发现：`cron.job_run_details` 虽然显示任务成功调度，但 `net._http_response` 返回 `404 Requested function was not found`
- 根因是定时任务 URL 仍指向 `send-capacity-report`，而线上实际可调用 endpoint 是 `quick-actionsend-capacity-report`
- 线上已修复 cron URL，并用修复后的配置手动触发验证，HTTP 返回 `200`，邮件已成功发往 `9003755@qq.com`

### 3. 查询已创建任务

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'send-capacity-report-every-3-days';
```

## 当前口径说明

### 数据库容量

- 已用容量：实时读取当前 Postgres 数据库大小
- 总容量：通过 `REPORT_DATABASE_TOTAL_MB` 配置

### 文件存储容量

- 已用容量：实时统计 `student-documents` bucket 文件总大小
- 总容量：通过 `REPORT_FILE_STORAGE_TOTAL_MB` 配置

### 剩余还能注册几个学员

当前按“每个学员 3 张图片、共约 30 MB”估算：

```text
剩余可注册学员数 = floor(文件存储剩余容量 MB / 30)
```

注意：这个值是面向业务的容量估算值，不是数据库物理上限的精确学员数。
