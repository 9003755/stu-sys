# 学员报名系统开发全景总结报告

**日期**：2026-01-27  
**项目**：学员报名管理系统 (Student Enrollment System)  
**版本**：v2.0 (Stable)

---

## 1. 基础设施与工作流 (Infrastructure & Workflow)

本项目的构建依托于现代 Serverless 架构，主要由三大基础设施支撑：GitHub、Netlify 和 Supabase。

### 1.1 GitHub：代码托管与版本控制
*   **作用**：项目的“大脑”。负责存储所有源代码，记录每一次代码变更（Commit），并管理多人协作开发。
*   **核心操作指南**：
    *   **提交代码 (Commit)**：当完成一个功能点时，在本地终端执行：
        ```bash
        git add .
        git commit -m "描述你做了什么修改"
        ```
    *   **推送代码 (Push)**：将本地修改同步到云端仓库，这是触发自动化部署的关键动作：
        ```bash
        git push
        ```
    *   **查看状态**：`git status` 查看当前有哪些文件被修改但未提交。

### 1.2 Netlify：自动化部署与托管
*   **作用**：项目的“生产车间”与“门户”。
    *   **CI/CD**：它监听 GitHub 的变动。一旦检测到 GitHub 有新的 `push`，Netlify 会自动拉取最新代码，执行 `npm run build` 打包构建。
    *   **Hosting**：将构建生成的静态文件（HTML/CSS/JS）分发到全球 CDN 节点，让用户可以通过域名访问网站。
*   **核心操作指南**：
    *   **查看部署状态**：登录 Netlify 后台，在 "Deploys" 标签页可以看到构建日志。如果网站打不开，首先看这里是否有 "Failed" 记录。
    *   **环境变量配置**：在 "Site configuration" -> "Environment variables" 中配置 API Key（如 `VITE_SUPABASE_URL`），确保生产环境能连接后端。

### 1.3 Supabase：后端即服务 (BaaS)
*   **作用**：项目的“心脏”。提供数据库 (PostgreSQL)、身份认证 (Auth) 和文件存储 (Storage)。
*   **核心操作指南**：
    *   **Table Editor**：可视化查看和管理数据库表数据，类似 Excel。
    *   **SQL Editor**：**（最重要）** 用于执行复杂的数据库操作、创建 RPC 函数、编写 RLS 策略。
        *   *示例*：创建清理僵尸用户的函数代码必须在这里运行。
    *   **Authentication**：查看所有注册用户（Admin/Student），可在此手动发送重置密码邮件或直接删除非法用户。
    *   **Storage**：管理上传的身份证和证件照文件。

---

## 2. 深度问题复盘与解决方案 (Problem Solving & Solutions)

### 2.1 移动端图片上传崩溃问题
*   **现象**：低端安卓机和旧版 iPhone 在上传身份证时，浏览器直接闪退或页面重新加载。
*   **根因分析**：
    1.  手机拍摄的照片通常很大（5MB-10MB），分辨率极高。
    2.  前端使用了 `browser-image-compression` 库，该库在压缩大图时会占用大量内存 (RAM)。
    3.  移动浏览器对单标签页内存有限制，一旦超限，系统会强制杀死进程。
*   **解决方案**：
    *   **弃用第三方库**：移除 `browser-image-compression`。
    *   **原生 Canvas 重构**：利用 HTML5 原生 `<canvas>` API 进行压缩。
    *   **分步处理**：先将图片绘制到较小的 Canvas 上（限制最大宽高为 1920px），再导出为 JPEG。这种方式内存占用极低且速度快。
    *   **代码位置**：`src/pages/StudentProfile.jsx` 中的 `compressImage` 函数。

### 2.2 超级管理员无法查看普通管理员的班级
*   **现象**：超级管理员账号登录后，点击普通管理员详情，看到的班级列表为空，但数据库里明明有数据。
*   **根因分析**：
    *   **ID 体系混淆**：`classes` 表关联的是 `admin_id` (Auth User UUID)，而前端路由传递的是 `id` (public.admins 表的自增主键)。
    *   **RLS 拦截**：Row Level Security 默认只允许用户看自己的数据，虽然超级管理员有权限，但前端直接查询会被默认策略拦截。
*   **解决方案**：
    *   **后端 RPC 封装**：创建 `get_admin_class_stats` 函数。
    *   **逻辑**：前端只传 `admin_table_id`，后端函数内部将其转换为 `auth_user_id`，并使用 `SECURITY DEFINER` 权限绕过 RLS 直接查询数据库。
    *   **成效**：彻底解决了 ID 映射错误，同时保证了前端调用的简洁性。

### 2.3 “幽灵数据”与数据救援
*   **现象**：手动在 Auth 表删除了某个管理员账号，但他在 `classes` 表里创建的班级依然存在，且 `admin_id` 变成了无效 ID，导致这些班级在系统里“失踪”了。
*   **根因分析**：删除操作未通过级联逻辑执行，导致出现了外键约束失效的“孤儿数据”。
*   **解决方案**：
    1.  **探测**：编写 SQL 查询找出所有 `admin_id` 不在 `auth.users` 表中的班级。
    2.  **救援**：开发“数据转移”功能，允许超级管理员将这些无主班级一键划拨给现有的管理员账号。
    3.  **预防**：开发 `force_delete_admin` RPC 函数，强制要求删除管理员时，必须先自动删除其名下所有班级和学员，杜绝后患。

### 2.4 僵尸账号清理
*   **现象**：数据库中存在大量仅注册了邮箱但未填写任何报名资料的账号，占用资源且干扰统计。
*   **解决方案**：
    *   **多表联合筛选**：通过 SQL `LEFT JOIN profiles` 筛选出 `profiles.id IS NULL` 的用户。
    *   **批量删除**：前端提供多选框，后端提供 `batch_delete_users` 接口，一次性清理数百个无效账号。

---

## 3. 开发阶段里程碑

### 阶段一：基础架构搭建
*   完成 Vite + React 项目初始化。
*   配置 Supabase 客户端，实现邮箱/密码登录。
*   **难点**：TailwindCSS 的响应式配置，确保手机端和 PC 端布局自适应。

### 阶段二：多租户权限体系
*   设计数据库模型：`admins` (普通管理员), `super_admins` (超级管理员), `students` (学员)。
*   实施 RLS 策略：`auth.uid() = admin_id`，确保数据物理隔离。

### 阶段三：核心业务功能
*   **班级管理**：增删改查，生成班级专属报名链接/二维码。
*   **学员档案**：身份证/证件照上传，PDF 自动合成下载，Excel 数据导出。

### 阶段四：系统健壮性提升
*   **错误边界处理**：为所有 API 调用添加 `try-catch`，并提供用户友好的 `alert` 错误提示。
*   **交互优化**：增加 Loading 状态、操作确认弹窗、红色危险操作警示。

---

## 4. 操作指南汇总

### 如何发布新版本？
1.  在本地 VS Code 修改代码。
2.  运行 `git add .` -> `git commit -m "更新内容"` -> `git push`。
3.  等待 1-2 分钟，访问 Netlify 提供的线上域名即可看到更新。

### 如何手动修改数据库数据？
1.  登录 Supabase 后台。
2.  进入 **Table Editor**。
3.  选择对应的表（如 `profiles`），像编辑 Excel 一样直接修改单元格内容，修改后点击 "Save"。

### 如何处理“权限不足” (401/403) 错误？
1.  首先检查 RLS 策略（Authentication -> Policies）。
2.  如果逻辑过于复杂，建议编写 **Postgres Function (RPC)**，并在函数定义中加上 `SECURITY DEFINER`，赋予函数“超级管理员”权限，然后前端直接调用该函数。

---

*文档维护：Trae AI 编程助手*
*最后更新：2026-01-27*
