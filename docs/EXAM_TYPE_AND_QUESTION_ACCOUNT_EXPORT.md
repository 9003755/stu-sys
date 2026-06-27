# 报考类型与题库账号导出说明

## 变更记录

- 2026-06-27
  - 学员报名页新增 `报考类型` 下拉字段
  - 管理员学员列表新增 `报考类型` 列
  - 管理员后台新增 `下载题库账号` Excel 导出
  - `enrollments` 表新增 `exam_type` 字段

## 文档目的

本文档用于简要记录本次“报考类型”和“题库账号导出”功能的实现位置、数据流和验证结果，便于后续维护与排查。

## 功能概述

本次改动包含 3 个部分：

- 学员报名信息页增加 `报考类型` 字段，采用下拉选择
- 管理员报名管理列表中，在“联系方式”右侧增加 `报考类型` 展示列
- 管理员报名管理页增加 `下载题库账号` 按钮，导出 Excel 文件 `学员题库账号.xlsx`

报考类型固定为以下 4 个选项：

- `多旋翼三类视距内`
- `多旋翼三类超视距`
- `多旋翼四类视距内`
- `多旋翼四类超视距`

页面同时展示说明文案：

- `三类=小型；四类=中型`

## 数据设计

本次没有把 `报考类型` 放入 `profiles`，而是放入 `enrollments`。

原因：

- `profiles` 更偏向学员长期档案
- `报考类型` 更偏向某一次具体报名的业务属性
- 同一学员后续若报名不同项目，避免被单一档案字段覆盖

数据库变更文件：

- `supabase/migrations/20260627140000_add_exam_type_to_enrollments.sql`

新增字段：

- `public.enrollments.exam_type varchar(50)`

## 代码位置

### 1. 学员报名页

文件：

- `src/pages/StudentProfile.jsx`

主要改动：

- 新增 `EXAM_TYPE_OPTIONS` 常量
- `useForm` 默认值增加 `exam_type`
- 仅在报名场景 `classId` 存在时显示 `报考类型` 字段
- 提交报名时把 `data.exam_type` 写入 `enrollments.exam_type`

说明：

- 若报名记录已存在且 `exam_type` 发生变化，会同步更新原报名记录

### 2. 管理员报名管理页

文件：

- `src/pages/admin/EnrollmentManagement.jsx`

主要改动：

- 查询 `enrollments` 时增加 `exam_type`
- 表格表头新增 `报考类型`
- 每行在“联系方式”后显示对应 `exam_type`

### 3. 题库账号导出

文件：

- `src/pages/admin/EnrollmentManagement.jsx`

入口规则：

- 仅在管理员勾选一条或多条报名记录后显示按钮
- 按钮文案：`下载题库账号 (N)`

导出文件：

- `学员题库账号.xlsx`

工作表名称：

- `学员题库账号`

导出字段：

- `*账号`：学员手机号，对应 `profiles.contact_phone`
- `*密码`：固定值 `abc123456`
- `*姓名`：学员姓名，对应 `profiles.real_name`
- `*部门`：学员所在班级，对应 `classes.name`

表头样式：

- 第一行字段名统一带 `*`
- 表头加粗、居中、浅蓝底色
- 表体保留基础边框，便于直接交付使用

## 验证情况

本次改动已完成以下验证：

- `eslint` 通过
- `vite build` 通过
- Supabase 远端数据库已确认存在 `enrollments.exam_type`

数据库校验使用的查询为：

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'enrollments'
  and column_name = 'exam_type';
```

预期结果：

- `column_name = exam_type`
- `data_type = character varying`

## 维护建议

- 后续如需按 `报考类型` 做筛选，可直接在 `EnrollmentManagement.jsx` 的现有筛选区扩展
- 如需让题库账号导出支持更多列，优先在当前 `handleDownloadQuestionAccounts()` 基础上增量修改
- 若未来存在“一个报名记录对应多个题库账号模板”的场景，建议把导出列配置提取为独立常量或配置文件
