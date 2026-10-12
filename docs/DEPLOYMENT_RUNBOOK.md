# 环境搭建、发布与回滚手册

核对日期：2026-10-12。先读 [README](../README.md) 和 [STATUS](../STATUS.md)，代码事实以当前提交为准；本手册不代表数据库已经完成恢复演练。

## 1. 当前环境与版本关系

| 项目 | 已核实值 |
| --- | --- |
| GitHub | https://github.com/9003755/stu-sys |
| 最新业务基线 | `eb1df86`，分支 `codex/class-document-collection` |
| `main` | `85acf90`，比上述业务基线少 21 个提交；不可当作最新生产源码 |
| Netlify 站点 | `stu-system`，site ID `ba026096-481f-49b4-93a0-d6cc3c0d8815` |
| 生产地址 | https://stu-system.netlify.app |
| 当前发布 | `6acc5f0babc97a6cdb5167cd`，2026-10-12T04:16:11.082Z，状态 ready |
| 当前发布来源 | 手动 CLI 发布，Netlify 的 `commit_ref` 为空；前次发布已对照构建产物确认业务基线为 `eb1df86` |
| Git 自动发布设置 | `repo_branch=main`，构建 `npm run build`，发布目录 `dist` |
| Supabase 项目 | `kmeybkqwicrdfksbagfz`，https://kmeybkqwicrdfksbagfz.supabase.co |
| 本次复现运行时 | Node.js `22.23.1`、npm `10.9.8`；依赖锁定在 `package-lock.json` |

本次交接会新增文档和测试工具提交，不因此改变生产部署。**推送功能分支不会自动更新当前生产站；推送或合并旧 `main` 后触发的部署可能使生产功能倒退。** 后续整合主分支应单独评审完整差异，确认发布授权后执行，并同步本表。不要为了“重新部署一次”直接在 Netlify 对旧 `main` 点击重试。

## 2. 新电脑启动

准备 Git、Node.js 22 LTS、npm；Windows 使用 PowerShell，macOS/Linux 使用终端。先检查 `node --version` 和 `npm --version`，使用锁文件安装，不先升级依赖。

```sh
git clone --branch codex/class-document-collection https://github.com/9003755/stu-sys.git stu-system
cd stu-system
git status --short --branch
git log -1 --oneline
npm ci
```

首次在项目根目录复制 `.env.example` 为 `.env`，仅当目标文件不存在时操作；由项目所有者通过密码管理器或私密渠道提供配置。不要覆盖已有环境文件，不要把真实密钥写入文档或工单。

| 变量 | 当前代码用途 |
| --- | --- |
| `VITE_SUPABASE_URL` | 所有三个角色 client 和匿名资料上传调用的 Supabase 项目地址，必填 |
| `VITE_SUPABASE_ANON_KEY` | 浏览器使用的 anon key，必填；绝不能填 Service Role Key |
| `VITE_APP_SITE_URL` | 报名/资料二维码的站点根地址；本地可留空以采用当前 origin，HTTPS 测试指向测试站，生产为 `https://stu-system.netlify.app` |
| `VITE_SUPER_SITE_URL` | 超管站点链接；无独立子域名时可与主站相同 |

旧环境可能留有 `VITE_SUPABASE_SUPER_URL` / `VITE_SUPABASE_SUPER_ANON_KEY`，当前 `src/lib/supabase.js` 未读取，已从样例移除；不能据此认为超管连接独立数据库。

`VITE_` 变量会打入浏览器产物，均应视为公开配置。数据库授权依赖 RLS/RPC，而非隐藏 anon key。环境变量修改后必须重启开发服务，线上则重新构建发布。

```sh
npm run dev -- --host 127.0.0.1
```

按终端实际地址打开，默认 `http://127.0.0.1:5173`。先验证 `/login?role=admin`、`/super/login` 能渲染；真实登录与数据验证使用隔离的 Supabase 测试项目。未获得账号前，可按 [测试计划](TEST_PLAN.md) 用假数据运行 ZIP 自动测试。

手机无法访问电脑的 `127.0.0.1`。网页相机通常要求 HTTPS 安全上下文；局域网 HTTP 只能证明页面可达，不能验收相机。使用具有 HTTPS 的测试部署，用其地址生成测试班二维码。当前路由不提供早期 `/camera-upload-test` 页面，正式入口是 `/class-documents/<accessToken>`。

## 3. 准备一次发布

1. 从确认过的最新业务基线创建 `codex/` 分支；先检查 `git status`，保留他人修改。
2. 完成代码、迁移、测试与文档；记录提交、变更范围、影响角色和回滚方案。仅文档交接不必发布前端。
3. 按 [测试计划](TEST_PLAN.md) 执行 `npm test`、`npm run test:browser:zip`、`npm run check:docs`、`npm run build`、`npm run lint`。全仓 lint 目前有历史失败，必须如实列出；新改动不得引入额外失败，不能通过关规则或屏蔽源文件伪装全绿。
4. 涉及数据库时先按 [数据库手册](DATABASE_RUNBOOK.md) 核对线上对象、备份和迁移差异，再在隔离环境验证。不能把历史迁移目录当作可无条件重放的初始化脚本。
5. 提交并推送待发布分支，记录 `git rev-parse HEAD`。检查 diff 不包含 `.env`、会话 token、个人证件或测试下载。

前端 Vite 构建不会部署 SQL 或 Edge Functions。必须分别记录前端、数据库、函数版本，否则“前端发布成功”不能证明整套系统更新成功。

## 4. Netlify 手动发布流程

需要站点访问权限。CLI 可用 `npx netlify-cli --version` 确认版本并记入发布记录；首次按平台流程登录，不共享 token。当前仓库没有固定生产站点设置的 `netlify.toml`，UI 设置和 site ID 必须核对。

```sh
npm run build
npx netlify-cli deploy --dir=dist --site=ba026096-481f-49b4-93a0-d6cc3c0d8815
```

先得到草稿部署 URL，完成页面和业务冒烟验证。草稿部署只隔离前端；若构建连接生产 Supabase，所有数据操作仍是生产操作。要测新增、覆盖、删除，必须先把构建指向隔离测试项目。

获得此次生产发布授权、确认使用生产配置并重新构建后，执行：

```sh
npm run build
npx netlify-cli deploy --prod --dir=dist --site=ba026096-481f-49b4-93a0-d6cc3c0d8815
```

检查 `dist/_redirects` 和 `dist/_headers` 随构建存在：SPA 刷新需要 `/* /index.html 200`；当前保留了旧管理员 chunk 到 `admin-dashboard.js` 的兼容映射和相关缓存头。不要只上传 HTML，必须上传完整 `dist`。

发布后记录：UTC 时间、Git 完整 SHA、分支、Node/npm/CLI 版本、构建命令、环境名称（不记密钥值）、部署 ID/URL、迁移与函数版本、测试证据、发布人和回滚目标。写入 `STATUS.md` 的发布记录，再提交到仓库。

## 5. Supabase 函数与配置交接

| 能力 | 源码与线上名称 | 配置检查 |
| --- | --- | --- |
| 匿名资料提交 | `supabase/functions/submit-class-documents/index.ts` → `submit-class-documents` | 浏览器发送 anon key 的 `apikey` 和 `Authorization: Bearer ...`；平台校验与函数中的班级 token 校验共同决定可用性 |
| 容量巡检邮件 | `supabase/functions/send-capacity-report/index.ts` → 历史线上 slug **`quick-actionsend-capacity-report`** | 自定义 Secrets、Resend 发件配置、cron 调用 URL 三者一致 |

本次只读管理 API 请求因现存访问 token 失效返回 `Invalid access token`，未核实线上迁移台账、函数代码版本及 `verify_jwt`。接手者须重新以自己的身份登录 Supabase 控制台，逐项核实并登记，不能把此处写成“已完成”。不要因匿名上传失败就直接关闭 JWT 校验；先检查构建 key 类型、过期状态、函数实际设置与日志，再在测试环境验证兼容方案。

`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 由函数运行环境提供；自定义邮件 Secrets 见 [容量巡检说明](SUPABASE_CAPACITY_REPORT_EMAIL.md)。历史函数部署名与源码目录不同，不能按目录名称直接发布一个新函数并认为 cron 已切换。手动触发邮件会真实发信，须得到对应授权。

## 6. 回滚与交付完成标准

- 前端回滚：在 Netlify Deploys 选已验收的历史部署发布为生产，记录原部署和回滚部署；不要盲选 `main` 构建。回滚会改变线上行为，应按发布授权执行。
- 数据库/函数回滚：先核对兼容性和备份，按 [数据库](DATABASE_RUNBOOK.md) 及 [恢复手册](BACKUP_RESTORE.md) 执行。前端回滚不会还原已删除学员或覆盖的图片。
- 回滚后检查登录、超管路由、二维码页、资源 chunk、资料预览；真实写入只用授权测试数据。
- 交付需要新电脑能从 Git 拉取、安装、构建和运行测试；接手者拥有独立平台权限；线上配置台账和恢复演练有实证。仅有这份手册不等于权限、数据备份及恢复演练已经交接。
