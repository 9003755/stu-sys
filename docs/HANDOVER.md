# 项目交接指南

更新：2026-10-12。目标：接手者凭仓库、明确授予的平台权限和本手册完成运行、维护、发布与排障，不依赖聊天记录。**文档完备不等于账号已授权、数据库已备份或所有历史缺陷已消除**，这些状态须按本指南签收。

## 1. 先确认接到的是哪个版本

| 项目 | 交接基线 |
|---|---|
| 仓库 | https://github.com/9003755/stu-sys |
| 最新开发/交接分支 | `codex/class-document-collection` |
| 当前业务代码提交 | `eb1df863df924dbbab60a40f95caf92ce8d82467` |
| 文档与测试工具更新 | 以该分支最新提交及 `git log -1` 为准；不会修改既有业务代码 |
| 旧 main | `85acf90`，比业务代码基线少 21 个提交 |
| 生产网站 | https://stu-system.netlify.app |
| Netlify Site ID | `ba026096-481f-49b4-93a0-d6cc3c0d8815` |
| 生产部署基线 | `6acc5f0babc97a6cdb5167cd`，2026-10-12；手动发布，平台 commit_ref 为空 |
| Supabase 项目 ref | `kmeybkqwicrdfksbagfz` |

业务源提交和部署关联来自上一轮构建发布验证；本轮 API 已核对生产部署 ID/ready 状态。不要用空 commit_ref 猜测来源。当前生产自动构建仍监听旧 main，合并或推送 main 可能覆盖生产的新功能。详情见[部署手册](DEPLOYMENT_RUNBOOK.md)。

## 2. 第一天的阅读顺序

1. [STATUS](../STATUS.md)：当前版本、已完成事项与下一步。
2. [需求与差异](REQUIREMENTS.md)、[用户操作手册](USER_GUIDE.md)：用户已经确定的约束、界面操作、尚未闭环的差异。
3. [CODE_WIKI](CODE_WIKI.md)：入口、数据流、代码定位；[AGENTS](../AGENTS.md)：开发规则。
4. [部署](DEPLOYMENT_RUNBOOK.md)、[数据库](DATABASE_RUNBOOK.md)、[备份恢复](BACKUP_RESTORE.md)：生产维护。
5. [测试](TEST_PLAN.md)、[排障](TROUBLESHOOTING.md)、[核验记录](HANDOVER_VERIFICATION.md)：可复现证据与真实限制。
6. [阶段总结](../PROJECT_SUMMARY.md)及专项复盘：理解为何选择手动四角、为何不能随意改认证恢复链。

## 3. 账号、配置与密钥交接

由项目所有者授予接手者自己的账号权限，不共享所有者登录密码或把凭据放进 Git。当前所有者为用户；接手者姓名/账号尚未指定，由签收时填写。

| 服务 | 接手者需要 | 验收方式 |
|---|---|---|
| GitHub | 仓库读写与分支/PR 权限 | clone、创建测试分支；不要为验证推送 main |
| Netlify | stu-system 的部署、构建配置和环境变量管理 | 看见正确 Site ID、生产部署和构建日志 |
| Supabase | 项目数据库、Auth、Storage、Functions 管理 | 看见正确 ref；运行数据库手册只读核查 |
| Resend | 容量邮件所用账户/域名/API Key 管理（如继续维护邮件） | 检查配置及邮件日志，不为检查擅自发信 |
| 备份保管位置 | 受控备份存储的读取/恢复权限 | 获得最新备份时间、校验值、恢复演练记录 |

本轮现有 `SUPABASE_ACCESS_TOKEN` 被管理 API 返回 `Invalid access token`，不能据此确认线上迁移、函数认证配置或备份状态。所有者/接手者须重新登录或提供自己的有效管理权限；普通 anon key 不能代替此权限。

旧规则文件曾存明文数据库密码，本次已移除当前文件中的值，但无法仅靠一次提交撤销历史暴露。接手前由所有者核实并轮换相关凭据、检查使用该密码的工具；不要尝试沿用旧文档密码。见核验记录 H13。

配置变量逐项见 `.env.example` 与部署手册。三个角色当前共用同一 Supabase 项目，只隔离浏览器 sessionStorage。所有 `VITE_*` 都会进入前端包，严禁填入 service_role。

## 4. 从全新电脑运行

准备 Git、Node.js 22.23.1（含 npm 10.9.8）；可用自己的版本管理器读取根目录 `.nvmrc`。不要依赖原维护者的系统全局依赖。

```sh
git clone --branch codex/class-document-collection https://github.com/9003755/stu-sys.git
cd stu-sys
git status --short
git log -1 --oneline
npm ci
```

Windows PowerShell：

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
```

macOS/Linux：

```sh
cp .env.example .env
```

在编辑器填写 `.env`：`VITE_SUPABASE_URL` 与对应的 `VITE_SUPABASE_ANON_KEY`；本地两个 SITE_URL 留空，避免生成错误的生产二维码。只读构建和 ZIP 隔离测试可保留示例变量，**示例变量不能用于真实登录或上传**。不自动从生产复制真实账号/学员数据。

```sh
npm test
npm run check:docs
npm run lint:tools
npm run build
npm run lint
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

使用 localhost 登录页检查渲染；业务联调使用已配置的独立测试项目。全量 lint 现有失败见核验记录，安装或构建失败不能用它解释。

浏览器 ZIP 隔离测试（Vite 保持运行，在另一个终端）：

```sh
npx playwright install chromium
npm run test:browser:zip
```

Playwright 已锁定开发依赖，默认 Chromium，不需要原维护者私有路径。Linux CI 可使用 `npx playwright install --with-deps chromium` 安装系统库。若改用已安装的 Edge，PowerShell 设置 `$env:ZIP_TEST_CHANNEL = 'msedge'`，POSIX 使用 `ZIP_TEST_CHANNEL=msedge npm run test:browser:zip`。测试至少包含一段 48 秒慢流，正常耗时超过一分钟。

手机访问电脑的 `127.0.0.1` 指向手机本身。真机相机必须使用可达 HTTPS 测试地址和已配置后端；浏览器模拟手机尺寸不等于真机摄像头通过。

## 5. 日常维护与发布

在最新基线上创建 `codex/任务名` 分支，完成小范围修改及相关测试，同步 STATUS、相关手册和变更原因，然后提交、推送并核对远程 SHA。发布按部署手册走：先确认后端依赖、构建和预览、再生产发布、验收、登记部署及回滚点。

不要把 Supabase `migrations/` 当成安全的全量重建命令。该目录保存的是演进历史，含一次性清理操作；新建后端需要数据库手册的基线核查与独立演练。

## 6. 本地历史文件的处置

交接所需运行代码、手册、测试与迁移通过 Git 留存。以下原工作区遗留内容未接入当前生产路由，不作为运行依赖：

- `demo-*.html`、`demo-ui*.html/css`：历史视觉原型，原样保留在旧工作区。
- `src/pages/CameraUploadTest.jsx`、`src/pages/tools/CameraUploadTestQr.jsx`：未跟踪的旧试验页，当前路由未导入；早期完整试验另存远程 `codex/camera-upload-test` 分支。
- `.codex-ui-backups/`：本地历史 UI 备份；Git 中另有历史提交 `5bcb4af`、`85acf90`，不可将旧 UI 源码覆盖为当前生产基线。
- `.env`、`.netlify/`、`supabase/.temp/`、临时日志：机器配置/缓存，重新配置，不从旧电脑照搬凭据。

本次不删除上述文件，不将其夹带进发布。若所有者希望保存原型，单独审核敏感信息后归档至受控历史资料目录；生产接手不依赖它们。

## 7. 交接签收清单

资料、工具验证结果由本次核验记录提供；下面的人员/平台签收不能由文档作者代签。

- [ ] 接手人姓名、日期、仓库分支与 SHA 已登记。
- [ ] GitHub、Netlify、Supabase（以及需要时的 Resend）权限已分别确认。
- [ ] 全新目录完成安装、构建、自动测试；已阅读 lint 基线及安全风险。
- [ ] 使用专用测试班/账号走完报名、拍照、四角确认、上传、姓名核对、ZIP 流程。
- [ ] 已核对生产迁移/函数/网关/RLS 状态；没有盲目重放历史 SQL。
- [ ] 数据库与两个 Storage 桶的备份已核实；独立环境恢复演练有记录。
- [ ] 发布、回滚在测试环境演练；生产分支与手动发布关系已理解。
- [ ] 已接收遗留问题列表、优先级和责任人；不将文档归档误记为缺陷修复。

签收记录建议在受控工单中填写：交出人、接收人、日期、源 SHA、部署 ID、后端核查记录、备份位置/时间、演练结论、未通过事项与责任人。不要记录密钥明文。
