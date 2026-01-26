# 学员报名系统开发总结报告

**日期**：2026-01-26  
**项目**：学员报名管理系统 (Student Enrollment System)  
**技术栈**：React + Vite + TailwindCSS (前端), Supabase (后端/数据库/Auth)

---

## 1. 项目概况
本项目旨在构建一个多租户的学员报名管理系统。系统包含两个核心角色：
- **普通管理员**：只能管理自己创建的班级和学员，数据严格隔离。
- **超级管理员**：拥有上帝视角，可查看所有管理员的数据，管理管理员账号，并处理系统级的数据维护（如数据救援）。

---

## 2. 开发历程与关键需求实现

### 阶段一：基础架构与身份识别
**需求**：
1.  搭建管理员登录与控制台。
2.  **控制台顶部需显示当前登录的名字和账号**。

**实现**：
- 集成 `Supabase Auth` 处理身份验证。
- 在 `AdminDashboard.jsx` 中，通过 `useEffect` 获取当前会话的 `user` 信息，并查询 `public.admins` 表获取 `full_name`。
- **问题修复**：起初在小屏幕上不显示名字。
    - **原因**：CSS 样式使用了 `hidden lg:flex`，导致非大屏设备隐藏了该信息。
    - **解决**：移除 `hidden` 类，强制在所有尺寸屏幕上显示用户信息栏。

### 阶段二：超级管理员权限与数据隔离 (RLS)
**需求**：
1.  普通管理员之间数据互不可见。
2.  超级管理员可以看到所有人的班级，但之前**看不到**（显示班级数为 0）。

**实现与调试**：
- **RLS 策略**：在数据库层启用行级安全策略（Row Level Security）。
    - 策略 `Admins can view own classes`：限制普通用户只能 `SELECT * FROM classes WHERE admin_id = auth.uid()`。
    - 策略 `Super Admin can view all`：允许 `admin_type = 'super'` 的用户绕过限制。
- **Bug 修复：超级管理员看别人班级数为 0**
    - **现象**：超级管理员控制台展开普通管理员 `gl2` 时，班级列表为空。
    - **根源分析**：
        1.  前端传给后端的 ID 是 `public.admins` 表的主键（UUID A）。
        2.  `classes` 表中存储的 `admin_id` 是 Auth 系统的 `user_id`（UUID B）。
        3.  两者不匹配，导致查询落空。
    - **解决方案**：
        - 编写后端 RPC 函数 `get_admin_class_stats`。
        - 逻辑：接受 `admin_table_id` -> 查出对应的 `user_id` -> 再去 `classes` 表统计数据。
        - 效果：彻底解决了 ID 映射问题，同时 RPC 方式天然绕过了前端 RLS 的复杂性，性能更高。

### 阶段三：管理员删除与数据安全
**需求**：
1.  超级管理员需要能删除普通管理员。
2.  **确保删除操作不会残留垃圾数据**（如孤儿学员记录），且**绝不能影响其他管理员的数据**。

**实现**：
- **权限突破**：前端客户端无权直接删除 `auth.users`。
- **解决方案**：
    - 创建 `SECURITY DEFINER` 级别的 RPC 函数 `delete_admin_by_super`。
    - 该函数拥有数据库最高权限，可直接执行 `DELETE FROM auth.users`。
- **级联清理逻辑**：
    1.  **先删学员**：`DELETE FROM enrollments WHERE class_id IN (该管理员的班级)`。
    2.  **再删班级**：`DELETE FROM classes WHERE admin_id =Target`。
    3.  **删资料**：`DELETE FROM admins ...`
    4.  **删账号**：`DELETE FROM auth.users ...`
- **安全性**：所有删除操作严格限定在 `WHERE admin_id = target_id` 范围内，确保了 100% 的数据隔离安全。

### 阶段四：数据救援（“幽灵账号”处理）
**需求**：
1.  系统中存在一些“旧 Super 账号”遗留的班级数据，这些账号已被删除，但班级还在（变成无主数据）。
2.  需要找出这些数据，并将其转移给现有的管理员（如 `gl3`）。

**实现与调试**：
- **探测器**：创建 `find_lost_super_data` 函数，扫描所有 `admin_id` 不在当前管理员列表中的班级。
- **转移工具**：创建 `rescue_lost_classes` 函数，将指定班级的 `admin_id` 更新为新管理员的 ID。
- **Bug 修复：转移时提示 "No classes found for ID ."**
    - **现象**：点击转移按钮，报错提示 ID 为空，无法更新。
    - **原因**：经调试发现，这些遗留数据的 `admin_id` 在数据库中实际上是 `NULL`。前端试图传递 `null`，但在某些逻辑检查中被拦截或被后端 SQL 忽略。
    - **最终解决**：
        1.  **后端升级**：修改 `rescue_lost_classes`，增加 `IF target_id IS NULL` 的分支处理，专门处理 `WHERE admin_id IS NULL` 的记录。
        2.  **前端放行**：允许前端传递 `null` 作为目标 ID。
    - **结果**：成功将 2 个遗留班级和 5 名学员无缝转移到了 `gl3@guanli.com` 名下。

---

## 3. 技术总结
1.  **RPC (Remote Procedure Call) 的重要性**：
    - 在处理跨表复杂逻辑（如级联删除）、权限提升（如删除 Auth 用户）以及绕过 RLS（如超级管理员统计）时，封装 SQL 函数（RPC）是比纯前端 SDK 调用更稳健、更安全的方案。
2.  **ID 一致性原则**：
    - 本项目最大的坑在于 `public.admins.id` (业务主键) 与 `auth.users.id` (Auth主键) 的混淆。
    - **教训**：在多表关联查询时，必须时刻警惕 ID 的来源，确保 JOIN 条件使用的是同一套 ID 体系。
3.  **数据兜底**：
    - “数据救援”功能证明了系统不仅要有正常的增删改查，还必须具备处理异常状态（如脏数据、孤儿数据）的能力，这是系统健壮性的体现。

---

*生成时间：2026-01-26*
