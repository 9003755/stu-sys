# Supabase 项目维护入口

项目约定以根目录 [AGENTS.md](../../AGENTS.md) 为准，交接入口见 [HANDOVER.md](../../docs/HANDOVER.md)。

数据库密码、Service Role Key、管理 access token 只能存放在机构受控的密码管理器或平台 Secrets，不得写入规则文件、前端变量、Git 或交接正文。

2026-10-12 交接检查已移除此文件原有的明文凭据。删除当前文件中的值不会清除 Git 历史；项目所有者须在平台确认暴露范围、轮换相关密码并核对依赖。不要把旧历史值视为可继续使用的交接方式。详情见交接核验记录 H13。
