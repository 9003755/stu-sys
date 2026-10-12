# 学员报名系统

培训机构学员报名、班级管理、二维码资料收集、移动端拍照扫描、Excel / PDF / ZIP 导出系统。前端 React + Vite，后端 Supabase，网站托管于 Netlify。

## 接手先读

**完整交接入口：[docs/HANDOVER.md](docs/HANDOVER.md)**。当前工作基线在 `codex/class-document-collection`，不要从旧 `main` 开始新功能。

| 需要了解 | 文件 |
|---|---|
| 当前版本、已完成工作、遗留事项 | [STATUS.md](STATUS.md) |
| 开发约定、提交与验证要求 | [AGENTS.md](AGENTS.md) |
| 新电脑准备、权限交接、签收流程 | [交接指南](docs/HANDOVER.md) |
| 需求、业务操作、实现边界 | [需求与差异](docs/REQUIREMENTS.md)、[用户操作手册](docs/USER_GUIDE.md) |
| 代码、路由、数据流、模块位置 | [代码 Wiki](docs/CODE_WIKI.md) |
| 发布、配置、回滚 | [部署手册](docs/DEPLOYMENT_RUNBOOK.md) |
| 表、RPC、RLS、迁移分类 | [数据库手册](docs/DATABASE_RUNBOOK.md) |
| 数据与上传文件备份、恢复 | [备份恢复手册](docs/BACKUP_RESTORE.md) |
| 验收步骤与故障排查 | [测试计划](docs/TEST_PLAN.md)、[排障手册](docs/TROUBLESHOOTING.md) |
| 本次核查证据、限制与待办 | [交接核验记录](docs/HANDOVER_VERIFICATION.md) |
| 历史阶段总结 | [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) |

## 本地开发

推荐 Node.js **22.23.1**、npm **10.9.8**（本次验证版本，见 `.nvmrc`）。

```sh
git clone --branch codex/class-document-collection https://github.com/9003755/stu-sys.git
cd stu-sys
npm ci
```

将 `.env.example` 复制为 `.env`，向项目所有者取得对应环境的 Supabase URL 和 **anon key**；不要使用 Service Role Key。日常开发使用独立测试环境，不能用生产学员数据做删除测试。操作系统复制命令、浏览器测试前提见交接指南。

```sh
npm run dev
npm test
npm run check:docs
npm run lint:tools
npm run build
npm run lint
```

`lint` 有已登记的历史问题，具体基线与本次验证结果见核验记录；不能把构建成功当作所有质量检查通过。

## 当前站点

- GitHub：<https://github.com/9003755/stu-sys>
- 生产网站：<https://stu-system.netlify.app>
- 普通管理员：<https://stu-system.netlify.app/login?role=admin>
- 超级管理员：<https://stu-system.netlify.app/super/login>

2026-10-12 核查：Netlify 自动构建分支仍为 `main`，而最新功能位于 `codex/class-document-collection`，当前生产版本通过手动部署发布。**推送开发分支不等于生产发布**；发布前必须阅读部署手册并确认分支，防止旧 `main` 构建覆盖新生产版本。

## 文档维护

每次完成一个功能或修复，应同步更新状态、测试证据和受影响手册，并将代码与文档一起提交、推送。历史复盘记录当时的方案，当前操作以本 README 指向的手册为准。数据库和上传文件不在 Git 仓库中，必须单独备份。
