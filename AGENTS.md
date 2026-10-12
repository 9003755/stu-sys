# AGENTS.md — 学员报名系统项目约定

最后更新：2026-10-12。适用于本仓库全部开发工作。当前事实见 [STATUS.md](STATUS.md)，交接入口见 [docs/HANDOVER.md](docs/HANDOVER.md)。历史复盘不代替现行部署手册。

## 任务完成标记

每次最终回复末尾必须有且仅有一个隐藏标记：工作和必要验证完成时 `<!-- CODEX_STATUS:SUCCESS -->`；仍有必需工作未完成、被阻塞或必要验证失败时 `<!-- CODEX_STATUS:FAILED -->`。不把已知限制写成已解决。

## 目标与业务约束

保留三角色报名与班级管理、移动端身份证/证件照上传、超级管理员安全删除、Excel/PDF/ZIP 导出。资料收集必须保留：班级专属无期限二维码、免登录姓名提交、两份独立 A4 文档、手动四角确认、覆盖旧提交、未匹配姓名待核对、班级/学员/两份资料的 ZIP 层级。

黄框仅作构图提示，不再检测纸张是否在框内。当前扫描使用原生 Canvas 透视变换，不恢复 OpenCV 大包依赖。完整需求与实现差异见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)。

## 目录与命名

- `src/components/`：复用 UI；`src/contexts/`：三角色认证上下文。
- `src/lib/`：通用工具、Supabase 初始化、网络下载、站点 URL；班级归档业务编排在 `src/pages/admin/ClassDocumentArchive.js`。
- `src/pages/admin/`、`super/`、`tools/`：按职责归档；学生页及匿名上传页沿用 `src/pages/`，不要随意新增无归属大页面。
- `src/App.jsx`：匿名资料上传入口分流；`src/PrivateApp.jsx`：其余路由与 Provider。
- `supabase/migrations/`：SQL 历史与新迁移；`supabase/functions/`：Edge Functions。
- `tests/`：隔离自动测试；`scripts/`：维护工具；`docs/`：正式手册与复盘，不放临时日志或真实学员资料。
- 组件/页面 PascalCase；函数、变量、纯工具文件 camelCase；表/RPC snake_case；迁移 `YYYYMMDDHHmmss_描述.sql`；分支 `codex/`；提交信息动词开头。
- 手册使用仓库相对链接，禁止机器专属 `file:` 链接。新手册须在 README/交接指南索引中可发现。

## Supabase 与权限（重点）

三套登录态严格隔离，但当前共用同一组 `VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY`：

| 角色 | client | sessionStorage key |
|---|---|---|
| 学员 | `supabase` | `sb-<project-ref>-auth-token` |
| 普通管理员 | `supabaseAdmin` | `student-system-admin-token` |
| 超级管理员 | `supabaseSuper` | `student-system-super-token` |

页面只能使用对应角色 client。匿名资料上传页通过 token/RPC/Edge Function 工作，不引入角色登录态。历史 `VITE_SUPABASE_SUPER_*` 当前未被代码读取。

普通查询优先 `from().select()`；涉及绕过 RLS、复杂删除/批量/超级管理员操作的新函数使用经审查的 `SECURITY DEFINER` RPC，**必须同时校验调用者、角色、所属班级、授权对象，固定 search_path 并收紧 EXECUTE 授权**。SECURITY DEFINER 本身不是授权检查。

普通管理员只管理自己创建的班级；超级管理员以服务端可信角色（如 `admins.admin_type = 'super'`）校验。前端固定邮箱或模拟 OTP 不能作为安全边界。旧 RPC 存在授权债务，见数据库手册，不照搬为新代码模板。

涉及 auth.users 的新外键原则上保持既定 `ON DELETE CASCADE`；如业务确需保留记录/置空关联，必须明确评审影响并记录。数据库/RLS/外键修改必须有迁移，先测试再在目标环境执行并记入台账。当前历史目录含不可重放的一次性删除脚本，不允许盲目 `db reset/db push` 或全量执行到生产。

现有资料删除使用 RLS 约束的 direct delete 加 Storage 清理，这是实际兼容实现；不要在整理文档时擅自改为调用旧 RPC。任何数据库删除验证使用专用测试账号，不拿真实学员做测试。

## 移动端和 UI

- 图片压缩使用原生 Canvas，禁止引入 browser-image-compression。
- 上传组件保留独立状态，避免选图返回后重挂；调试 `?uploadDebug=1`。
- 不新增报名关键页面的懒加载，也不随意改变 AuthContext。事实例外：当前 PrivateApp 中 StudentProfile/EnrollConfirmation 已采用 lazyWithRetry；这是现存实现，不代表旧移动端风险已消失。若调整，必须按测试计划做真机回归。
- Apple 风格：背景 #f5f5f7，主色 #007aff，文字 #1d1d1f / #3a3a3c，圆角 12px，导航模糊 22px，按钮 scale(.98)，支持桌面与手机。
- ZIP 的成功文件仅在当前组件内存缓存，不宣称跨刷新断点续传或字节级续传。

## 验证、Git 与发布

1. 基于最新 `codex/class-document-collection` 开发，可另开 `codex/` 分支；不要直接在 main 提交功能。
2. 运行 `npm test`、`npm run check:docs`、`npm run lint:tools`、`npm run build`；受影响代码必须通过 ESLint。运行全量 `npm run lint`，区分既有基线与本次引入问题，**不得把失败结果写成通过，也不得为了归档关闭规则**。目前全量 lint 既有失败见核验记录；本次手册归档不代表这些债务已修复。功能发布前应完成所涉问题修复与必要回归。
3. 只暂存本次明确相关文件；禁止随意 git add .、丢弃用户改动、上传凭据和真实资料。提交后推送，并核对远程 SHA。
4. 新版依赖 SQL 时先在目标库验证迁移，再发布前端。最新生产 SQL 执行状态无法确认时写明未知，不猜测。
5. 当前 Netlify 自动构建分支是 main，生产最新版通过 CLI 手动发布。**推送开发分支不等于上线**。按 [部署手册](docs/DEPLOYMENT_RUNBOOK.md)操作；改主分支/生产分支或发布前确认对线上影响。
6. 每次上线记录源提交、部署 ID、数据库迁移、验收和回滚点。不要以编译成功代替真机、权限或恢复测试。

## 文档与留存

- README：统一入口；STATUS：当前快照；PROJECT_SUMMARY：时间线。
- CODE_WIKI：架构；REQUIREMENTS：需求和实际差异；HANDOVER：接手步骤。
- DATABASE_RUNBOOK / BACKUP_RESTORE：数据维护；DEPLOYMENT_RUNBOOK：发布。
- TEST_PLAN / TROUBLESHOOTING / HANDOVER_VERIFICATION：验收、排障、事实证据与遗留风险。
- 修改实现后同步相关文档；完成阶段时提交、推送代码和文档。账号权限与真实备份存放受控系统，不放 Git。资料删除期限仍按用户约定：无自动期限和自动删除策略。

## 禁止事项

不在前端直接删除 auth.users；不在生产改 RLS 而缺迁移；不提交 Service Role Key、密码、access token 或真实学员资料；不把历史安全缺陷抄成范例；不以未知平台状态宣称“已备份”“已验证”“已解决”。
