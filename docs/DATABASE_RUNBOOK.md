# 数据库、Storage 与服务端交接手册

核对日期：2026-10-12。依据：仓库中的 44 个 SQL 文件、两份 Edge Function 源码及其前端调用点。本次编写没有连接生产数据库、执行迁移、修改权限或处理真实学员数据。下文将“代码所描述的行为”“历史部署记录”“本次实际验证”分开记录。

## 1. 环境与责任边界

| 项目 | 当前资料 | 接手时核对位置 |
|---|---|---|
| Supabase project ref | `kmeybkqwicrdfksbagfz` | [项目控制台](https://supabase.com/dashboard/project/kmeybkqwicrdfksbagfz) |
| 前端 | Netlify `stu-system` | [部署手册](DEPLOYMENT_RUNBOOK.md) |
| SQL 源码 | `supabase/migrations/`，44 个文件 | 本手册第 4 节 |
| 无登录资料提交 | `submit-class-documents` | Edge Functions 列表、日志、部署版本与 JWT 配置 |
| 容量邮件 | 本地目录 `send-capacity-report`；历史线上 slug 为 `quick-actionsend-capacity-report` | 不能根据本地目录名假定线上 endpoint |
| 定时任务 | `send-capacity-report-every-3-days` | Cron 列表及 HTTP 结果 |

三种浏览器 client 都使用 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，在同一个 Supabase 项目中通过独立的 `sessionStorage` key 隔离登录态。`supabaseSuper` 并不是 service role，也不能仅凭 client 名称取得服务端权限。配置文件为 `src/lib/supabase.js`。

服务端的 `SUPABASE_SERVICE_ROLE_KEY` 只允许存在于 Edge Function/受控运维环境，不能放进 `VITE_*`、Git、截图或交接正文。平台成员权限、生产操作授权和业务超级管理员身份是三个不同层次，详见 [备份与恢复手册](BACKUP_RESTORE.md)。

## 2. 数据模型与文件关系

| 对象 | 用途、关联与注意事项 |
|---|---|
| `auth.users` | Supabase 账号，由 Auth 服务管理；前端不直接删除此表 |
| `public.profiles` | 学员档案；`user_id` 对应 Auth 用户；身份证等文件保存 URL；`id_number` 是旧 `id_card` 重命名后的字段 |
| `public.admins` | `user_id` 对应 Auth 用户；`id` 是管理员记录 ID，不能混作用户 ID；`admin_type` 为 `normal`/`super` |
| `public.classes` | `admin_id` 指向 `auth.users.id`，不是 `admins.id`；班级状态和归属均在此 |
| `public.enrollments` | 班级报名，关联 `class_id`、`profile_id`、`user_id`；`exam_type` 为报考类型 |
| `public.class_document_collections` | 每班一条二维码配置；`access_token` 是无登录上传凭据，不在公开日志/盘点报告中输出 |
| `public.class_document_submissions` | 姓名、匹配状态、两份图片路径；`matched` 已归档，`pending` 待管理员核对；同一 `enrollment_id` 有部分唯一索引 |
| `public.super_audit_logs` | `SuperDashboard.jsx` 尝试写入的表；仓库没有建表迁移，是否存在及其真实结构需平台核对，不能作为完整审计保证 |
| `storage.buckets` / `storage.objects` | 文件桶配置和对象元数据；数据库备份里的这些行不等于图片文件字节已经备份 |

外键必须以线上查询结果为准。仓库中 2026-09-10 迁移将 `enrollments.user_id`、`enrollments.profile_id` 改为 `ON DELETE CASCADE`；资料提交表的 `enrollment_id`、`resolved_by` 刻意使用 `ON DELETE SET NULL`，不是所有外键都应该级联删除。

删除 Auth 用户可能删除档案和报名、使资料提交的 `enrollment_id` 变空，但不会自动通过 Storage API 删除文件字节。删除班级也不能等同于清理全部 Storage 对象。恢复/清理必须同时核对数据库关系和文件清单，不能仅凭行数判断成功。

### 文件桶

| Bucket | 仓库配置 | 调用者与对象命名 |
|---|---|---|
| `student-documents` | 历史 SQL 设置为 public，允许 authenticated 写入；策略范围较宽 | 学员报名上传身份证正反面、证件照；实际路径构造见 `StudentProfile.jsx`，引用保存在 `profiles` |
| `class-submission-documents` | private；策略按路径第一段班级 UUID 验证所属管理员 | `{class_id}/{submission_id}/criminal-record.jpg` 与 `health-declaration.jpg`；管理员获取短期 signed URL 下载 |

不得为解决下载失败直接把私有资料桶改成公开桶。历史 `student-documents` 的公开性及宽泛写权限属于需要审计的现有配置；本次手册没有改变它。更改桶可见性前必须评估档案中现有 public URL 的兼容性。

## 3. RPC 与 Edge Functions

### 前端/服务端实际调用的 RPC

| 功能 | RPC | 代码入口与权限核查重点 |
|---|---|---|
| 查询报名邮箱 | `get_user_emails(uuid[])` | `EnrollmentManagement.jsx`；检查调用方管理员身份及查询范围 |
| 管理员列表/班级统计 | `get_all_admins()`、`get_admin_class_stats(uuid)` | `SuperDashboard.jsx`；参数可能是管理员记录 ID；最新历史定义做 ID 转换 |
| 学员总览 | `get_all_students_overview()` | `AllStudents.jsx`；旧实现绑定指定超级管理员邮箱 |
| 密码重置 | `reset_student_password(uuid,text)`、`reset_user_password(uuid,text)` | 前者核对管理员班级归属/超级角色；后者旧实现绑定邮箱 |
| 删除学员 | `force_delete_student(uuid)`、`force_delete_students_batch(uuid[])` | `AllStudents.jsx`；删除 Auth 账号并依赖外键；不可用真实人员作回归样本 |
| 删除管理员 | `delete_admin_by_super(uuid)` | 删除所属班级报名、班级、管理员及 Auth 账号；高影响操作 |
| 未建档账号 | `get_zombie_users()`、`delete_zombie_user(uuid)`、`delete_zombie_users_batch(uuid[])` | `SuperDashboard.jsx`；“无档案”不等于可以无审核删除 |
| 数据归属救援 | `find_lost_super_data()`、`rescue_lost_classes(uuid,text)` | 改班级归属；`NULL` 旧管理员参数可影响所有无归属班级 |
| 生成资料二维码 | `ensure_class_document_collection(uuid)` | 班级所属管理员调用；保留既有 access token，无到期逻辑 |
| 提交替换 | `replace_class_document_submission(uuid,uuid,uuid,text,text,text,text)` | 只授权 service_role，Edge Function 调用；返回要清理的旧图片路径 |
| 姓名纠正归档 | `resolve_class_document_submission(uuid,uuid)` | 所属管理员调用；2026-09-08 修正复合记录赋值 |
| 资料删除历史接口 | `delete_class_document_submission(uuid)` | SQL 保留；当前管理页使用受 RLS 约束的 `from().delete().select()` 验证删行，再清理 Storage |
| 容量统计 | `get_capacity_report_snapshot()` | 仅 service_role；Edge Function 使用；目前仅统计 `student-documents`，遗漏新增资料桶 |

还有历史诊断 RPC `debug_class_ownership()`、`check_super_admin_status()`、`debug_admin_data(uuid)`、`setup_super_admin(text,text)`。它们属于历史维护接口；不能仅因保存在仓库就对外开放或在新环境主动执行。

**已识别的权限技术债**：仓库中的 `delete_admin_by_super`、`force_delete_student(s_batch)`、`delete_zombie_users_batch`、`rescue_lost_classes` 等 `SECURITY DEFINER` 函数缺少完整的调用者授权检查；部分读接口仅检查登录，部分旧函数用固定邮箱且没有显式拒绝 `auth.uid() IS NULL`。旧 RLS 文件还可能残留宽泛策略，PostgreSQL permissive 策略通常以 OR 合并。前端隐藏按钮不构成安全边界。这是静态源码发现，不代表已确认线上暴露，也不代表已修复。

接手后优先核对真实函数定义、owner、EXECUTE 授权（尤其默认 PUBLIC/anon）及所有生效策略。在隔离环境验证普通学员、其他班级管理员、匿名调用均被拒绝后，以新迁移收紧生产权限。不要盲目重放旧 SQL。新建 `SECURITY DEFINER` 应显式验证调用者、目标归属与允许操作，固定安全 `search_path`，按需 REVOKE/GRANT；能通过 RLS 完成的操作继续使用 `SECURITY INVOKER`。

### `submit-class-documents`

源码：`supabase/functions/submit-class-documents/index.ts`。入口仅 `POST` 和 CORS `OPTIONS`；表单字段为 `accessToken`、`studentName`、`criminalRecord`、`healthDeclaration`，每份图片大于 0、最多 12 MiB。前端先通过原生 Canvas 生成 JPEG，服务端保存时使用 `image/jpeg`。

服务端凭班级 token 查询该班报名，去除姓名空白并转小写后匹配。只有恰好一个匹配才归档，零个或多个匹配均进入 `pending`。两份文件上传后调用替换 RPC；异常会尝试清理新文件，成功替换会尝试清理旧文件。这不是数据库与文件存储的跨服务原子事务，清理失败可能留下孤立文件，需要事后核对。

前端以项目 anon key 的 `apikey` 和 `Authorization` header 调用，学员不需要账号登录。部署时先核对平台实际 JWT 校验设置和该 key 类型是否与网关匹配，再用隔离测试班级完整提交验证。仓库没有 `supabase/config.toml` 固化线上函数网关配置，不能假定默认选项就是现网配置。

### 容量邮件

源码：`supabase/functions/send-capacity-report/index.ts`。历史线上 slug 为 `quick-actionsend-capacity-report`；修改或恢复现有函数时不要无意新建另一个 endpoint。服务端使用平台注入的 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 和自定义 secrets：

- `RESEND_API_KEY`、`REPORT_FROM_EMAIL`
- `REPORT_RECIPIENT_EMAIL`
- `REPORT_DATABASE_TOTAL_MB`、`REPORT_FILE_STORAGE_TOTAL_MB`、`REPORT_ESTIMATED_FILE_MB_PER_STUDENT`

历史报告/恢复说明记录 2026-06-19 和 06-27 的成功发信及 endpoint 修正，详见 [专项说明](SUPABASE_CAPACITY_REPORT_EMAIL.md)。本次没有重新触发邮件，也没有复验当前计划额度或当前定时任务。

`0 1 */3 * *` 是 UTC 每月日期 1、4、7……的 01:00（北京时间 09:00），月界不保证严格相隔 72 小时。恢复时保留既有语义，若业务要求固定间隔需单独调整。不要在通用报告中输出 `cron.job.command`，其中可能包含 Authorization。任务显示成功只说明调度 SQL 成功，还要看 `pg_net` HTTP 状态；不要在测试环境启用生产收件人定时发送。

## 4. 全部迁移目录：供比对，不是执行清单

文件名时间戳是仓库命名，不证明实际执行日期。下表按文件名排序列出全部 44 个 SQL 文件。分类：**结构** 为 DDL/字段/外键；**权限** 为 RLS/授权；**RPC** 为函数定义（函数创建不等于函数已被执行）；**一次性数据** 是文件执行即改历史数据；**诊断** 为历史调试接口。

| 文件（均在 `supabase/migrations/`） | 分类 | 内容与顺序/风险说明 |
|---|---|---|
| `20240123000000_init_schema.sql` | 结构、权限 | 初始 4 表/RLS；不是当前完整基线，重复 CREATE POLICY 会失败 |
| `20240123000001_update_profiles_schema.sql` | 结构 | 字段重命名与报名字段；rename 不可盲重跑 |
| `20240123000002_storage_setup.sql` | 结构、权限 | 创建公开报名桶及宽泛策略；INSERT 无冲突保护 |
| `20240123000003_add_email_contact.sql` | 结构 | 档案联系邮箱 |
| `20240123000004_admin_setup.sql` | RPC、权限 | 历史超级管理员提权接口；缺完整授权校验 |
| `20240123000005_fix_admin_access.sql` | 权限、一次性数据 | 公开读 admins，并确认/提升指定邮箱账号；不可作为新环境通用初始化 |
| `20240123000006_create_classes.sql` | 结构、权限 | 第二种 classes 建表定义，IF NOT EXISTS 不会补已有表字段 |
| `20240123000007_update_classes_schema.sql` | 结构、一次性数据 | 增加 status，放宽 admin_id/class_code，回填状态 |
| `20240123000008_create_enrollments.sql` | 结构、权限 | 第二种 enrollments 定义；与初始表/策略存在重放冲突 |
| `20240123000009_fix_enrollments_schema.sql` | 结构、权限、一次性数据 | 增加 user_id、回填、移除旧状态约束、重设策略 |
| `20240123000010_fix_admin_visibility.sql` | 权限 | 放宽管理员可见性；需与后续隔离策略合并核对 |
| `20240123000011_get_user_emails.sql` | RPC | 邮箱查询初版，后续 000012 覆盖 |
| `20240123000012_fix_rpc_ambiguity.sql` | RPC | 修正邮箱查询列歧义，前置依赖 admins |
| `20240126000001_get_all_admins.sql` | RPC | 管理员列表初版，引用 full_name；字段在后续文件才增加 |
| `20240126000002_fix_rpc_permission.sql` | RPC、权限 | 替换管理员列表并授予执行；仅检查登录 |
| `20240126000003_cleanup_zombie_users.sql` | **一次性数据（删除）** | 直接删除指定历史邮箱的 auth.users；禁止例行重放 |
| `20240126000004_add_full_name_to_admins.sql` | 结构、一次性数据 | 管理员姓名及空值回填 |
| `20240126000005_cleanup_failed_registrations.sql` | **一次性数据（删除）** | 删除指定历史注册账号；禁止例行重放 |
| `20240126000006_allow_admin_insert_own_profile.sql` | 权限 | admins 自建记录策略；需审计角色字段是否可被越权设置 |
| `20240126000007_isolate_admin_data.sql` | 权限 | 班级/报名归属隔离；不保证移除了全部历史宽泛策略 |
| `20240126000008_debug_ownership.sql` | 诊断、RPC | 读取班级归属与邮箱；不是匿名公共接口 |
| `20240126000009_allow_super_access.sql` | 权限、一次性数据 | 超级管理员可读，并将指定邮箱提升角色 |
| `20240126000010_check_super_status.sql` | 诊断、RPC | 指定历史邮箱的超级管理员状态 |
| `20240126000011_get_admin_stats_rpc.sql` | RPC | 班级统计初版，后续 000013 覆盖 |
| `20240126000012_debug_data.sql` | 诊断、RPC | 管理员 ID 映射/班级诊断 |
| `20240126000013_fix_stats_rpc.sql` | RPC | 修正 admins.id → user_id 映射 |
| `20240126000014_delete_admin_rpc.sql` | RPC（高影响） | 管理员级联删除初版；不要主动调用，后续 000015 覆盖 |
| `20240126000015_improve_delete_cascade.sql` | RPC（高影响） | 删除管理员前先删报名/班级；缺调用者校验 |
| `20240126000016_find_lost_super.sql` | 诊断、RPC | 查找归属数据 |
| `20240126000017_rescue_data.sql` | RPC（高影响） | 班级转移初版；后续 000018/000019 覆盖 |
| `20240126000018_fix_rescue_logic.sql` | RPC（高影响） | 转移诊断修正 |
| `20240126000019_handle_null_rescue.sql` | RPC（高影响） | NULL 归属转移，范围较大；缺调用者校验 |
| `20240126000020_reset_password_rpc.sql` | RPC（高影响） | 管理员密码重置；固定邮箱检查、NULL 鉴权问题需审计 |
| `20240126000021_zombie_users_rpc.sql` | RPC | 未建档账号查询/删除；固定邮箱检查需审计 |
| `20240126000022_batch_delete_zombies.sql` | RPC、权限 | 批量删除未建档账号；缺调用者角色检查 |
| `20240126000023_get_all_students_overview.sql` | RPC、权限 | 全局学员列表；固定邮箱检查需审计 |
| `20240126000024_force_delete_student.sql` | RPC、权限 | 删除单学员；只保护被删对象非管理员，没有调用者角色检查 |
| `20240126000025_force_delete_students_batch.sql` | RPC、权限 | 批量删除学员；同上，依赖正确外键级联 |
| `20260517000001_reset_student_password_rpc.sql` | RPC、权限 | 学员密码重置，校验调用角色/班级归属/密码长度 |
| `20260618000002_capacity_report_snapshot_rpc.sql` | RPC、权限 | 仅 service_role 容量统计；只统计报名文件桶 |
| `20260627140000_add_exam_type_to_enrollments.sql` | 结构 | 报考类型字段 |
| `20260812000000_add_class_document_collection.sql` | 结构、权限、RPC | 两张资料表、私有桶和 4 个 RPC；依赖完整班级/报名/档案结构 |
| `20260908000000_fix_class_document_submission_record_assignment.sql` | RPC | 修正 resolve/delete 复合记录 `SELECT s.*`，依赖 20260812 |
| `20260910000000_fix_student_delete_cascade.sql` | 结构 | 重建 enrollments 的两个外键为 CASCADE；检查约束名、孤儿数据与锁等待 |

`supabase/schedule_capacity_report.sql` 不在迁移目录，是另一个会创建扩展、替换 cron 任务的操作脚本，含待替换的 Authorization 占位值。不能原样执行，也不能在新环境不加审查地启用。

### 历史执行证据

| 项目 | 已有证据 | 本次交接状态 |
|---|---|---|
| 20260618 容量 RPC / 邮件函数 / cron | 专项文档记录 06-19、06-27 成功调用 | 历史证据；当前运行状态未复验 |
| 20260812 资料收集 | 会话记录用户扫码、拍照、手动四角上传测试通过，后续上线使用 | 证明当时链路可用；不是全量 schema/RLS 导出 |
| 20260908 资料删除/纠错 | SQL 修复源码及前端绕过删除 RPC 的提交存在 | 不能由 Git 提交推断该迁移已在远程完整执行 |
| 20260910 删除外键 | 会话历史记录迁移执行成功；旧 STATUS 曾写“已验证” | 本次未查询远程约束，也未复做删除；接手以只读约束查询和隔离样本验证为准 |
| 20261012 弱网 ZIP | 前端修改，不需要数据库迁移 | 不改变 DB schema |
| 其余 40 个历史文件 | Git 中有 SQL 源码 | 无逐文件的线上执行台账；不能填作“已执行” |

线上 `supabase_migrations.schema_migrations` 即使存在，也只记录 CLI 登记的迁移；SQL Editor 手工执行可能不在其中。应将线上定义、约束、策略与文件比对后建立台账，而不是使用 migration repair 把历史全部标成已应用。

## 5. 接手第一天的只读盘点

在有权访问该项目的 Supabase SQL Editor 分节执行 [handoff_inventory.sql](../scripts/sql/handoff_inventory.sql)。它输出结构、约束、策略、RPC 权限、函数定义校验摘要、桶配置及统计，不读取密码、JWT、二维码 token 或学员姓名。先核对 project ref，保留结果于受限运维档案；不要把包含对象路径/姓名的额外人工查询结果放公开仓库。

核对结果至少登记：执行人和 UTC 时间、项目 ref、数据库版本、迁移表是否存在、六张核心 public 表和可选审计表、各外键删除规则、启用中的 RLS 全集、RPC owner/definer/execute 授权、两桶可见性、Edge Function slug/部署时间/JWT 设置、cron 时间与最近 HTTP 状态。函数定义比对必须由有权限人员在控制台查看，不能用“有该函数”代替“函数内容正确”。

发现差异后新建台账条目，标记“预期/实测/处理提交”。业务账号密码、API key、connection string、完整 cron command 不进入台账。

## 6. 生产增量变更流程

1. 固定当前 Git commit、Netlify deploy ID、DB 盘点摘要；先确认目标是生产还是测试。获得所需项目权限，不借用他人会话。
2. 只为本次差异新增一个时间戳迁移。写明前置表/字段/约束、受影响行数估算、锁影响、失败回退、兼容前端版本；不改已执行历史文件。
3. 先在隔离 Supabase 项目或恢复副本执行。权限变更必须做匿名、学员、班级 A 管理员、班级 B 管理员和超级管理员的正反向验证。删除测试只用专门创建的假资料账号。
4. 按 [备份手册](BACKUP_RESTORE.md) 确认可用恢复点，保存要替换的函数/策略/约束原定义。涉及数据转换时保留可逆映射或备份，不依赖 Git 恢复业务记录。
5. 生产采用 reviewed SQL Editor 单文件执行；普通兼容 DDL 可在事务内执行，并设置合理 `lock_timeout`、`statement_timeout`。`CREATE INDEX CONCURRENTLY` 等不支持事务的操作需单独方案。出现等待/错误先停止排查，不能关闭校验强行推进。
6. 若使用 Supabase CLI，先验证 CLI 版本、项目链接、`migration list` 和 `db push --dry-run`。历史台账未清理前禁止直接 `db push` 或 `db reset`；CLI 可能误把未登记的历史删除脚本当作待执行。
7. 执行后运行同一只读盘点，核查结果及 RLS 负向用例；记录文件 SHA/Git commit、操作者、UTC 时间、结果、生产 project ref、对应前端版本。再按依赖顺序部署 Edge Function 与前端，执行验收。

记录模板（创建实际发布记录时填写，不能预填成功）：

```text
变更编号 / Git commit：
项目 ref / 环境：
迁移文件及 SHA256：
执行人 / UTC 时间：
前置检查 / 恢复点引用：
执行结果 / 约束和权限核查结果：
正向与负向测试证据：
Edge Function 部署版本 / Netlify deploy ID：
回退条件、步骤与负责人：
```

### 回退

前端回退不能撤销 DB 变更。优先使用向后兼容的扩展式迁移，旧前端仍可读取。函数/策略可用保存的旧定义创建单独回退迁移；删除列、删记录、级联删除不能靠反向 DDL找回数据。若必须恢复数据，先在隔离项目恢复并比对，再制定生产恢复窗口；不要直接向仍接收提交的生产库整库覆盖。文件替换/删除需要从独立 Storage 备份恢复相应版本。

## 7. 从零重建或测试环境初始化

**本仓库目前不是已验证可从空库一键重放的迁移链。** 原因包括两种建表历史、重复同名策略、非幂等 rename、旧账号删除与提权、缺少 `super_audit_logs` DDL、线上手工操作未完整入账，以及遗留 RPC/策略权限问题。不要运行 `supabase db reset` 来“试试看”，也不要将整个目录粘贴到生产 SQL Editor。

可维护的重建路径：

1. 从已授权、已盘点的环境获取当前 schema、函数、RLS、grants、bucket 配置；先审查并清除环境特定凭据和一次性数据操作，形成新的基线候选。
2. 在独立空 Supabase 项目应用经审查的基线；Auth、Storage 等托管 schema 按平台支持方式处理，禁止覆盖系统内部结构。
3. 通过受控平台操作创建假账号，再建立业务管理员角色、班级、报名；不要依赖历史邮箱或 `setup_super_admin` 自动提权。
4. 部署两个 Edge Function，逐项配置 Auth redirect、JWT 验证、secrets、桶策略；测试邮件关闭定时任务并使用测试收件人。
5. 执行完整验收和权限负向测试；从另一空环境重复成功后，才将基线及重建脚本登记为“可复现”。

本次交接完成了路径与检查清单，没有生成生产 schema 快照，也没有声称已完成空库重建。需要平台访问权和一个可销毁的独立测试项目才能实际演练。
