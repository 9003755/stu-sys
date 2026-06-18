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

## 部署 Edge Function

```bash
supabase functions deploy send-capacity-report
```

## 手动测试

部署后可以先手动调用一次：

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/send-capacity-report" \
  -H "Authorization: Bearer <service-role-key>" \
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
- `vault`

### 2. 把项目地址和 service role key 存入 Vault

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

### 3. 创建定时任务

下面示例表示“每 3 天北京时间上午 9 点执行一次”。如果你项目数据库时区不是北京时间，请自行调整。

```sql
select
  cron.schedule(
    'send-capacity-report-every-3-days',
    '0 9 */3 * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/send-capacity-report',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := jsonb_build_object(
          'source', 'pg_cron',
          'triggered_at', now()
        )
      ) as request_id;
    $$
  );
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
