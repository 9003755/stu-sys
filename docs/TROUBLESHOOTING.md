# 常见故障排查手册

更新：2026-10-12。先区分当前浏览器资源、Netlify 发布、Supabase Auth、数据库/RLS、Edge Function、Storage 和本机图片处理，避免把所有失败都归因于“网络慢”。参考 [部署手册](DEPLOYMENT_RUNBOOK.md)、[测试计划](TEST_PLAN.md) 与 [ZIP 说明](CLASS_DOCUMENT_ZIP_DOWNLOAD.md)。

## 1. 先留证据，再修改

记录发生时间与时区、页面路径、设备/浏览器、操作步骤、当前部署 ID、错误文字，以及开发者工具 Network 中失败请求的状态码和耗时。比较 HTML/JS 是否加载、Auth 是否返回、数据库/Storage 是否返回，定位到最小环节。

请求日志与截图必须删除密码、Authorization、签名下载链接、二维码 token、学员姓名和证件内容后再共享。不要复制完整 HAR 直接发到公共工单，也不要把生产数据库完整导出用于调试。首次排查优先只读，禁止为诊断直接重放清理 SQL、删除账号或修改 RLS。

## 2. 登录后一直“加载中”

1. 在 Network 看是否卡于 `.js`、`/auth/v1/token`、会话刷新、`/rest/v1/admins` 或其他业务查询。没有 HTTP 返回、401、403、5xx 与 React 运行异常是不同问题。
2. 如果 JS 失败，按下一节核对部署与缓存。若仅某台电脑失败，用隐私窗口打开同一正式地址，排查扩展、代理和陈旧会话；不要要求先清全站数据，以免丢失正在填写的资料。
3. 普通管理员 `AdminAuthContext.jsx` 给会话、登录和权限查询各设了 15 秒等待上限，`AdminDashboard.jsx` 的管理员资料查询也有 15 秒上限。它们是独立阶段，不能解释成整个登录固定 15 秒。
4. 学员 `AuthContext.jsx`、超级管理员 `SuperAuthContext.jsx` 没有同等超时兜底。若涉及这些角色，检查 `getSession()` 和 `onAuthStateChange`，不要认为管理员修复已覆盖三套客户端。
5. 三个 client 均使用同一个 Supabase URL/key，分别保存在 `sessionStorage`：学员 `sb-<ref>-auth-token`、普通管理员 `student-system-admin-token`、超管 `student-system-super-token`。只清理明确异常角色会话前先确认无未保存资料；正常情况下优先用退出再登录。

登录成功但无班级，核对 `admins.user_id`、`classes.admin_id` 与当前 `auth.users.id`，再查 RLS；不要更换成超管 client 绕过普通管理员权限。

超管页面目前含固定账号检查、模拟验证码和旧初始化分支，不能把它当作已启用真实 MFA，也不应在生产通过旧演示口令尝试初始化。账号安全与服务端权限必须另行核实；这一历史风险应优先整改，文档补齐没有改变其实现。

## 3. 动态模块加载失败、旧 OpenCV 报错、超管路由消失

- 当前扫描链路 `ClassDocumentUpload.jsx` 静态引用 `documentScanner.js`，使用 Canvas，**不再依赖 OpenCV**。若仍请求 `opencv*.js`，先确认用户拿到的是旧构建、旧标签页或错误部署。
- 从 Netlify 当前发布页面确认 deploy ID，再看浏览器实际请求的资源；不要以本地代码存在为依据认定线上已更新。
- `lazyWithRetry.js` 对动态模块失败只做一次整页重载，之后提示刷新；持续失败应检查响应状态、MIME 类型、CSP/代理和资源内容。SPA fallback 可能让不存在的 JS 返回 HTML，即使状态 200 也不是成功。
- `vite.config.js` 将管理员工作台主 chunk 固定为 `assets/admin-dashboard.js`；`public/_redirects` 保留一条历史 hash 的兼容映射。它不是所有历史资源的通用修复，完整部署和版本核对仍不可省略。
- `/super/login` 是当前正式路由。直接刷新出现 404，检查发布目录及 SPA `_redirects`；有 HTML 却空白则查 JS 异常/资源。早期独立子域名方案是可选方案，不表示当前另有已部署超管站。

## 4. 手机扫码慢、相机打不开、扫描生成失败

先看 `/class-documents/<accessToken>` 的 HTML 和静态资源：公开上传入口独立于 `PrivateApp` 和三套 Auth Provider，不需要等待学员登录。页面能显示但提交失败，转到下一节。

网页相机依赖 HTTPS、相机权限及 `getUserMedia`。在微信/浏览器权限页面允许相机；不支持时选择“系统相机”或“从相册上传”。手机访问电脑 `127.0.0.1` 会访问手机自己，局域网 HTTP 也不适合作为网页相机验收环境。

黄色 A4 框只作摆放引导，已取消“必须检测到纸张才允许拍照”。完成拍照后分别手动移动四角，不要让角点交叉、重合或围成很小面积；原片需要清晰、无反光、完整包含纸张。背景与纸张同色不会触发检测阻止。

“正在生成扫描件”阶段是本机 Canvas 处理，尚未向 Storage 上传。检查浏览器 Console、图片解码、尺寸/内存、角点位置；可用已知正常 JPG/PNG 复现。单份选择上限 12MB，浏览器不支持解码的格式（如部分 HEIC）应先转 JPG。正文模糊先检查原片对焦，透视修正不会恢复原片丢失的细节。

当前代码尚未为扫描阶段设置独立超时，也没有持久化未提交照片；不应承诺换浏览器/刷新后会保留所拍资料。先留脱敏证据，必要时告知重新选择图片的影响。

## 5. 上传后未出现在班级名单、姓名不匹配

保存请求是 `POST /functions/v1/submit-class-documents`。前端发送 `accessToken`、`studentName`、两份已生成的图片及 anon bearer；先查响应体：

| 结果 | 含义与处理 |
| --- | --- |
| `status: matched` | 本班姓名唯一匹配，查对应 `enrollment_id` 和两条文件路径 |
| `status: pending` | 无匹配或同名多匹配；管理员进入“资料收集”的“待核对姓名资料”，选择正确学员归档或删除 |
| 400 | 必填字段、图片类型/尺寸等校验失败，检查是否两份都确认四角 |
| 401/403 | 检查实际构建 key、函数 JWT 配置、RLS/权限；不要盲目关闭鉴权 |
| 404 / 二维码无效 | 核对班级 collection 的 token、二维码域名、班级是否存在 |
| 500 | 查函数日志中的上传、替换 RPC、Storage 错误；不要把成功上传单张当作整次提交成功 |

当前 pending 应向学员明确显示“未匹配、请联系管理员”，不是普通归档成功。它不会进入全班 ZIP，也不会把某个名单学员标记已提交。大小写/空白已规范化；两个同名学员必须人工确认。当前管理员归档下拉只显示尚未归档的本班学员。

若页面仍显示旧版的笼统成功提示，先核对部署。现有上传 fetch 没有 ZIP 下载那样的断网续传和超时策略；不能把 ZIP 的 90 秒空闲规则套用到照片提交。

## 6. 删除资料 UUID 错误、批量删除失败

`invalid input syntax for type uuid: "(整行记录...)"` 是历史删除函数把复合记录当 UUID 的问题。迁移 `20260908000000_fix_class_document_submission_record_assignment.sql` 修复 RPC；当前普通管理员页面直接按 `submission.id` 删除 `class_document_submissions` 并 `.select('id')` 核实删除结果，仍受 RLS 限制。再次出现旧 RPC 错误，应先确认旧前端是否仍在运行。

“记录不存在或无权删除”表示没有实际删除行，查记录 ID/归属/会话。若提示“资料记录已删除，但图片文件清理失败”，数据库删除已经成功，剩下的是 Storage 清理失败；先记录准确 bucket/path，核对权限和对象，再按授权范围清理，不能重复删除整班来解决。

超管学员批量删除调用 `force_delete_students_batch`，单删调用 `force_delete_student`。检查实际 RPC 参数中的用户 UUID、`admin_type` 权限、返回错误和外键；`20260910000000_fix_student_delete_cascade.sql` 是相关修复。迁移存在于仓库不代表线上已执行，应用前先核对当前函数/约束定义。所有删除回归必须使用隔离测试账号，并分别验证数据库关联与 Storage 文件，不以 UI 弹出成功为唯一证据。

## 7. 全班 ZIP 慢或失败

- 旧版固定 45 秒超时已在 `eb1df86` 替换。现代流式下载只在 **连续 90 秒没有新数据** 时判定停滞；持续接收的单份资料允许超过 45 秒。
- 签名链接获取最多等 60 秒；每份最多 4 次尝试，每次刷新链接；通常并发 2 份，重试/离线后降为 1。旧浏览器非流式兼容路径最多等正文 10 分钟。
- 浏览器识别离线后自动等联网；也可暂停后点“继续下载缺失资料”。保留的是当前页面已完整下载的文件，未完整的单份会重新下载，未实现字节级 Range 续传。
- 404/无权限等永久失败需要修复具体记录/文件，重试不能找回已删除资料；缺一份就不会生成不完整 ZIP。
- 保持当前页面和班级，刷新、离开或切班都会清缓存。生成完成后“再次保存 ZIP”不再联网；检查浏览器是否阻止下载和本地磁盘空间。
- 超大班级依赖浏览器内存，目前没有服务器异步打包、大文件容量承诺或跨页面恢复；此类问题记录人数、总文件大小、内存与阶段，作为后续容量改造依据。

单独下载按钮仍直接使用 Storage SDK，不共享全班 ZIP 的弱网队列。关于不同页面的报名资料 ZIP，也应先定位实际处理函数，不能把本次策略泛化到所有导出功能。

## 8. 容量邮件未送达及权限恢复

历史线上函数 slug 为 `quick-actionsend-capacity-report`，与源码目录 `send-capacity-report` 不同。先只读核对容量 RPC、cron 与函数日志，再核对 Secrets 和 Resend 域名/收件限制。`cron` 执行成功不等于 HTTP 成功或邮件实收。

计划表达式 `0 1 */3 * *` 按 UTC 的月内日号步进执行，不能严格解释为滚动每 72 小时。旧恢复文档的业务描述需以实际配置为准，检查时避免输出包含 bearer key 的完整 cron command。详见 [容量巡检历史记录](SUPABASE_CAPACITY_REPORT_EMAIL.md) 和 [数据库手册](DATABASE_RUNBOOK.md)。

管理 API 返回 `Invalid access token` 时，重新以接手者自己的 Supabase 管理身份授权；不代表浏览器 anon key 一定失效。当前线上 JWT、迁移、函数版本仍需有效权限核实。不要通过提交账号密码、复制 Service Role 到前端或全局放开 RLS 解决访问问题。
