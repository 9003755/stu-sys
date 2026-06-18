## 学员报名资料导出：资料完整性检查（方案一）实现记录

- 日期：2026-06-18 22:01:32
- 目标：仅在管理员点击“下载报名资料（打包下载）”时，对勾选学员做资料完整性检查；发现不完整则提示管理员，并对该学员做标记
- 实现范围：仅前端（不新增后端字段、不新增 RPC、不增加额外请求）
- 改动文件：
  - [EnrollmentManagement.jsx](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/src/pages/admin/EnrollmentManagement.jsx)

## 1. 背景与问题

现有“下载报名资料”导出逻辑具备一层保护：如果报名记录没有关联 `profiles`，导出时会 `continue` 跳过，不会写入 Excel，也不会下载图片。

问题在于：
- 管理员勾选了资料不完整的学员时，系统不会提前提示
- 导出结果可能缺行/缺文件，管理员不易察觉

因此需要增加一套“导出前检查”，并在列表上让管理员直观看到哪些学员资料不全。

## 2. 方案选择理由（为什么选方案一）

本次选择“前端即时校验型”主要基于：
- 导出页本身已经拉取了 `enrollments` + `profiles`（用于展示/导出），完整性判断可以完全复用现有数据
- 检查只涉及字符串/空值判断，属于 O(N) 轻量计算
- 不新增额外查询，不占用 Supabase 资源，执行速度快

后续如果希望把规则做成系统级统一口径，再演进到“后端统一规则型”（视图/RPC）即可。

## 3. 规则定义（什么叫“资料完整”）

此规则是“为导出资料服务”，按导出 Excel 与证件照打包的最小要求判断。

### 3.1 必填字段（profiles）

按当前导出字段与证件照打包逻辑，设置如下必填项（字段名 → 展示名）：

- `real_name` → 姓名
- `gender` → 性别
- `id_type` → 证件类型
- `id_number` → 证件号码
- `nationality` → 国籍
- `ethnicity` → 民族
- `birth_date` → 出生日期
- `region` → 地址
- `contact_phone` → 联系电话
- `postal_code` → 邮政编码
- `address_detail` → 详细地址
- `photo_url` → 证件照

### 3.2 邮箱字段规则（enrollment/user_email 优先）

邮箱列优先使用 `enrollment.user_email`（从 RPC `get_user_emails` 补全），若不存在再回退 `profiles.email_contact`。

因此邮箱完整性判定为：
- `enrollment.user_email` 和 `profiles.email_contact` 均为空 → 缺少邮箱

### 3.3 profiles 缺失

当 `enrollment.profiles` 为空时，视为缺少学员档案，直接判定“资料不完整”。

## 4. 实现方式（关键代码点）

### 4.1 新增纯前端计算函数

位置：文件顶部（imports 下方）。

- `EXPORT_REQUIRED_PROFILE_FIELDS`：定义必填字段清单
- `hasValue(value)`：统一的“非空”判定（null/undefined/空白字符串均视为空）
- `getEnrollmentCompleteness(enrollment)`：返回
  - `isComplete: boolean`
  - `missingFields: string[]`（展示名）
  - `summary: string`（用于 UI 展示与弹窗）

对应变更参考：
- [EnrollmentManagement.jsx](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/src/pages/admin/EnrollmentManagement.jsx)

### 4.2 仅在导出点击时计算并缓存结果

不在报名列表加载时做任何完整性检查，避免“登录/进入页面就检查全量数据”的行为。

实现方式：
- 在 `handleDownloadData` 内部，对 `selectedEnrollments` 逐条调用 `getEnrollmentCompleteness(enrollment)`
- 将结果写入本地状态 `exportCheckByEnrollmentId[enrollment.id] = check`，用于后续 UI 标记（无需落库）

设计意图：
- 满足“只有点击打包下载才检查”的业务要求
- 校验范围严格限定为“勾选项”，减少不必要的计算
- 检查后仍可在列表中对不完整学员做标记，便于管理员回头处理

### 4.3 列表 UI 标记（检查后才出现结果）

在表格新增一列“资料状态”：
- 未触发检查前：显示 `未检查`（灰色 badge）
- 触发检查后：
  - `资料完整`：绿色 badge
  - `资料不全`：黄色 badge + 缺失摘要

同时对不完整记录行做淡黄色底色，方便快速扫视。

### 4.4 勾选提示（检查后才可见）

通过 `useMemo` 基于 `exportCheckByEnrollmentId` 计算“当前已选中且资料不完整”的记录集合：
- `selectedIncompleteEnrollments`

当数量 > 0 时，在表格上方显示黄色提示条：
- 显示不完整人数
- 显示前 3 位学员 + 缺失摘要
- 超过 3 位则追加“另外还有 N 位”

### 4.5 导出前拦截

在 `handleDownloadData` 开始阶段增加检查：
- 逐条检查勾选项并收集 `incompleteEnrollments`
- 若存在：
  - 弹出 alert，列出前 5 位学员 + 缺失摘要
  - 直接 return，不进入打包流程

设计意图：
- 明确阻止导出不完整资料，避免产生“看似成功但内容缺失”的 zip
- 提示内容足够定位问题学员

## 5. 性能与资源占用评估

- 计算复杂度：O(K)，K = 本次勾选的学员数量
- 不增加 Supabase 请求次数
- 未点击导出时，不进行完整性计算（除展示 `未检查` 状态外无额外开销）

## 6. 验证方式

已通过：
- `npm run build`
- `npx eslint src/pages/admin/EnrollmentManagement.jsx`

手工建议回归：
- 勾选 1 条资料完整学员：导出正常
- 勾选 1 条缺少 `region`（地址）学员：点击导出后弹窗拦截，并在列表中标记“资料不全”
- 勾选 1 条无 `profiles` 的报名记录：点击导出后弹窗拦截，并在列表中标记“缺少学员档案”
- 混合勾选完整/不完整：导出拦截并列出缺失名单

## 7. 后续可选增强（不在本次范围）

- 弹窗交互升级：使用自定义 Modal 代替 `alert`，并提供“仅导出完整学员”按钮
- 规则配置化：把必填字段改成可配置（不同导出场景不同规则）
- 后端统一规则：通过 View/RPC 返回 `is_complete/missing_fields`，供多个页面复用
