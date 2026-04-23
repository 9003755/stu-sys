# 超级管理员独立子域名部署说明

## 目标

将当前超级管理员后台从“必须本地启动才能访问”，改为可直接通过独立子域名访问，例如：

- 主站：`https://www.example.com`
- 超级管理员后台：`https://super.example.com`

第一版默认只保留“账号密码登录”，先优先跑通线上入口。

## 已完成的代码准备

本次代码已完成以下最小改造：

- 新增站点地址配置工具：[siteUrls.js](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/src/lib/siteUrls.js)
- 普通管理员生成报名链接时，改为使用 `VITE_APP_SITE_URL`
- 超级管理员页面里的普通管理员注册链接，改为使用 `VITE_APP_SITE_URL`
- 修复超级管理员“返回控制台”错误路由
- 新增环境变量样例：[.env.example](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/.env.example)

## 必需环境变量

在部署平台中配置：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SUPER_URL=https://your-project.supabase.co
VITE_SUPABASE_SUPER_ANON_KEY=your-super-anon-key
VITE_APP_SITE_URL=https://www.example.com
VITE_SUPER_SITE_URL=https://super.example.com
```

说明：

- `VITE_APP_SITE_URL`：学员和普通管理员使用的主站域名
- `VITE_SUPER_SITE_URL`：超级管理员后台域名

## 推荐部署方式

### 方式一：两个 Netlify 站点，共用同一仓库

推荐建立两个 Netlify Site：

1. 主站
   - 绑定：`www.example.com`
   - 用途：学员报名、普通管理员后台
2. 超级管理员站
   - 绑定：`super.example.com`
   - 用途：超级管理员登录与后台

### 当前阶段的最小上线方式

第一版不强制拆成两个不同构建产物，可以先让两个域名都指向同一前端应用：

- 主站用户访问主站域名
- 超级管理员直接访问：`https://super.example.com/super/login`

这样可以先实现“任何电脑随时打开超级管理员后台”，同时把域名职责先分开。

## 上线步骤

1. 在 Netlify 新建超级管理员站点
2. 连接当前 GitHub 仓库
3. 构建命令设置为：

```bash
npm run build
```

4. 发布目录设置为：

```bash
dist
```

5. 在站点环境变量中配置：
   - `VITE_APP_SITE_URL`
   - `VITE_SUPER_SITE_URL`
   - Supabase 相关变量
6. 给站点绑定自定义域名：
   - `super.example.com`
7. 发布后用以下地址验证：
   - `https://super.example.com/super/login`
   - `https://super.example.com/super/dashboard`

## 第一版验证清单

- 能在任意电脑直接打开 `super.example.com/super/login`
- 超级管理员登录成功
- 登录后能进入控制台
- “学员档案查询”页面可正常打开
- “新增管理员请访问主站注册页”会跳到主站域名
- 班级二维码中的报名链接会生成主站域名，而不是超级管理员域名

## 后续增强建议

第一版跑通后，下一阶段建议继续做：

- 将超级管理员域名根路径直接重定向到 `/super/login`
- 为超级管理员域名增加访问控制
- 加入二次验证
- 将超级管理员站进一步裁剪为仅保留 `/super/*` 页面，减少无关页面暴露

## 相关文件

- [siteUrls.js](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/src/lib/siteUrls.js)
- [ClassManagement.jsx](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/src/pages/admin/ClassManagement.jsx)
- [SuperDashboard.jsx](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/src/pages/super/SuperDashboard.jsx)
- [AllStudents.jsx](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/src/pages/super/AllStudents.jsx)
- [.env.example](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/.env.example)
