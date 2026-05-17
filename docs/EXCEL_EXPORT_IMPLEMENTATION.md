# Excel 导出功能开发文档

## 文档目的

本文档用于整理当前“学员报名资料按固定格式导出 Excel”功能的现有实现，作为后续维护、排查和迭代的基础说明。

本文档聚焦以下内容：

- 功能入口与用户操作路径
- 前端依赖与核心文件
- 数据来源与查询链路
- Excel 模板与字段映射规则
- 压缩包产物结构
- 当前实现的约束、风险点与维护建议

本文档描述的是仓库中的当前实现，不代表理想方案，也不等同于需求文档。

## 功能概述

该功能位于普通管理员后台的报名管理页，允许管理员对已勾选的报名记录执行“下载报名资料”操作。

当前实现不是单独下载一个 `.xlsx` 文件，而是生成一个 `.zip` 压缩包。压缩包内包含：

- 一个按固定模板填充后的 Excel 文件
- 一个证件照目录，按身份证号重命名学员证件照后放入其中

因此，这个功能本质上是“报名资料打包导出”，其中 Excel 是核心产物之一。

## 入口与代码位置

主实现文件：

- `src/pages/admin/EnrollmentManagement.jsx`

模板文件：

- `public/stuIm.xlsx`

相关数据库函数：

- `supabase/migrations/20240123000011_get_user_emails.sql`
- `supabase/migrations/20240123000012_fix_rpc_ambiguity.sql`

依赖定义：

- `package.json`

页面中的入口按钮文案为：

- `下载报名资料 (N)`

只有在管理员勾选了一条或多条报名记录后，按钮才会显示。

## 依赖与技术方案

当前实现依赖以下前端库：

- `exceljs`
  - 用于读取 Excel 模板、清空旧数据行、追加新行、导出新的工作簿二进制内容
- `jszip`
  - 用于将 Excel 文件与证件照文件一起打包成 zip
- 浏览器 `fetch`
  - 用于读取模板文件
  - 用于下载学员证件照
- `@supabase/supabase-js`
  - 用于读取当前管理员名下的报名数据和资料数据

整体策略是：

1. 从 `public/stuIm.xlsx` 读取固定模板
2. 查询当前管理员可见的报名记录及其关联资料
3. 将资料按既定列顺序写入模板
4. 下载学员证件照并放入 zip 子目录
5. 将 Excel 和图片一起生成 zip 后触发浏览器下载

## 用户操作流程

管理员在报名管理页执行以下操作：

1. 进入报名管理页
2. 使用班级、状态、搜索条件筛选列表
3. 勾选一个或多个报名记录
4. 点击 `下载报名资料`
5. 浏览器开始生成并下载 zip 文件

下载文件名格式为：

```text
学员报名资料包_YYYY-MM-DD.zip
```

## 数据来源与查询链路

### 1. 管理员身份范围

功能只导出当前登录普通管理员自己名下班级对应的报名数据。

实现方式：

1. 通过 `supabaseAdmin.auth.getUser()` 获取当前登录管理员
2. 查询 `classes` 表，找出 `admin_id = 当前用户 id` 的班级
3. 以这些班级 id 为范围查询 `enrollments`

这意味着该功能天然受管理员数据隔离约束，不会跨管理员导出其他人的学员数据。

### 2. 主数据查询

报名数据来自 `enrollments` 表，并联表读取：

- `classes`
- `profiles`

当前导出逻辑实际依赖的主要字段包括：

- `enrollments.id`
- `enrollments.user_id`
- `profiles.real_name`
- `profiles.gender`
- `profiles.id_type`
- `profiles.id_number`
- `profiles.nationality`
- `profiles.ethnicity`
- `profiles.birth_date`
- `profiles.region`
- `profiles.contact_phone`
- `profiles.email_contact`
- `profiles.postal_code`
- `profiles.address_detail`
- `profiles.photo_url`

### 3. 邮箱补全逻辑

由于报名记录本身不直接带认证邮箱，当前实现额外调用 RPC：

- `get_user_emails`

用途：

- 通过报名记录中的 `user_id`，批量查出认证系统中的真实邮箱

回填规则：

1. 优先使用 RPC 返回的认证邮箱
2. 如果 RPC 失败或未命中，则退回使用 `profiles.email_contact`
3. 再不行则使用兜底文案

因此，Excel 中“邮箱”列的实际来源优先级是：

```text
auth 邮箱 -> profile 联系邮箱 -> 空或兜底值
```

## 模板文件说明

模板文件路径为：

- `public/stuIm.xlsx`

前端通过以下 URL 读取模板：

```text
/stuIm.xlsx
```

这也意味着该模板必须放在前端静态资源目录中，确保打包部署后仍可被浏览器直接访问。

当前实现默认取工作簿的第一个工作表：

```text
workbook.getWorksheet(1)
```

因此，模板的维护需要遵守以下前提：

- 第一张工作表必须是用于导出的目标表
- 第一行必须保留为表头行
- 模板若修改列顺序，代码中的写入顺序也必须同步调整

## 模板清空与写入规则

在写入新数据前，当前实现会尝试清空模板中第 2 行及之后的全部内容。

处理方式分两段：

1. 先根据 `worksheet.rowCount` 一次性删除第 2 行之后的内容
2. 再通过 `while (worksheet.rowCount > 1)` 循环删除，确保模板残留行被清干净

这么写的原因是当前实现对模板中的历史行、格式行或残留数据采取“宁可重复清理一次，也不要保留脏数据”的保守策略。

## Excel 字段映射

代码注释中定义的模板列顺序如下：

1. 姓名
2. 性别
3. 证件类型
4. 证件号码
5. 国籍
6. 民族
7. 出生日期
8. 地址
9. 联系电话
10. 邮箱
11. 邮政编码
12. 详细地址

当前写入规则如下：

| Excel 列 | 数据来源 |
| --- | --- |
| 姓名 | `profiles.real_name` |
| 性别 | `profiles.gender` |
| 证件类型 | `profiles.id_type` |
| 证件号码 | `profiles.id_number` |
| 国籍 | `profiles.nationality` |
| 民族 | `profiles.ethnicity` |
| 出生日期 | `profiles.birth_date` |
| 地址 | 由 `profiles.region` 经过二次处理后生成 |
| 联系电话 | `profiles.contact_phone` |
| 邮箱 | `enrollment.user_email`，若无则回退 `profiles.email_contact` |
| 邮政编码 | `profiles.postal_code` |
| 详细地址 | `profiles.address_detail` |

### 地址字段的特殊规则

“地址”列并不是直接写入 `profiles.region` 原值，而是做了定制处理：

1. 先按空格拆分 `region`
2. 取最后一段作为最终写入内容
3. 根据层级补空格缩进

当前逻辑假设 `region` 形如：

```text
省 市 区
```

示例结果：

- 只有一级地址时：不加空格
- 两级地址时：前面补 2 个空格
- 三级地址时：前面补 4 个空格

这说明“地址”列并不是完整行政区字符串，而更像是为了贴合既有 Excel 模板格式做的定制值。

## 导出记录筛选规则

当前导出只处理被勾选的报名记录。

另外，代码中存在一道保护：

- 如果某条报名记录没有关联 `profiles`，则 `continue` 跳过，不写入 Excel，也不处理图片

因此，最终导出的 Excel 行数可能小于勾选记录数。典型原因包括：

- 某条报名记录资料尚未完善
- 资料关联缺失

## 证件照打包规则

当前 zip 中会额外创建图片目录：

```text
stuTemplate/stu/stuPicture/
```

对于每条可导出的报名记录：

1. 如果存在 `profiles.photo_url`
2. 且存在 `profiles.id_number`
3. 则尝试下载该图片
4. 下载成功后，以 `身份证号.后缀名` 的形式写入图片目录

后缀名规则：

1. 先根据图片 blob 的 MIME 类型推断
2. 再尝试从图片 URL 路径中提取扩展名
3. 如果 URL 中可提取到扩展名，则优先采用 URL 扩展名

需要注意的是，当前“报名资料”打包中处理的是：

- `photo_url`

并不包含：

- `id_card_front_url`
- `id_card_back_url`

身份证正反面属于另一个下载功能的职责范围。

## 压缩包结构

当前实现生成的 zip 内部目录结构为：

```text
stuTemplate/
  stu/
    stulm.xlsx
    stuPicture/
      证件号1.jpg
      证件号2.png
      ...
```

需要特别说明：

- 模板文件名是 `stuIm.xlsx`
- 但 zip 中最终写入的 Excel 文件名是 `stulm.xlsx`

这两个文件名当前并不一致。该行为来自现有实现，应视为“当前状态记录”，不是经过文档化确认的命名规范。

## 异常处理

当前实现的错误处理以页面提示为主：

- 模板加载失败时，提示“无法加载模版文件 (stuIm.xlsx)”
- 整体导出失败时，提示“导出资料失败：...”
- 单张图片下载失败时，只在控制台打印警告，不中断整个导出流程

这意味着：

- Excel 生成属于主流程，失败会直接中止下载
- 个别证件照获取失败属于非阻塞问题，不会让整个 zip 生成失败

## 当前实现的约束与风险点

### 1. 强依赖模板首张工作表

代码固定读取第一个工作表。如果模板新增封面页、说明页或调整工作表顺序，导出结果会错位。

### 2. 强依赖列顺序而非列名

写入使用 `worksheet.addRow([...])`，并未按表头名做映射。因此模板列顺序一旦变化，代码必须同步修改。

### 3. 强依赖 `region` 的字符串格式

地址列逻辑默认 `region` 使用空格分隔。如果未来地址控件改为其他分隔方式，导出格式会异常。

### 4. 导出内容只覆盖部分资料图片

当前“报名资料导出”只打包证件照，不包含身份证正反面。如果业务预期是“完整资料包”，需要额外确认是否满足需求。

### 5. 产物命名存在不一致

模板名 `stuIm.xlsx` 与 zip 内 Excel 名 `stulm.xlsx` 不一致，后续若有人按名字查问题，容易误判为拼写错误或漏文件。

### 6. 模板内预置格式可能影响 `rowCount`

代码之所以进行两次清理，说明模板内部可能存在格式化空行或历史内容残留。后续替换模板时，仍需重点验证清空逻辑是否稳定。

## 维护建议

后续维护此功能时，建议遵守以下原则：

1. 修改模板前，先确认首张工作表、首行表头、列顺序是否保持兼容
2. 修改 `profiles` 地址字段结构时，同步检查 `region` 到“地址”列的格式化逻辑
3. 如果要扩展导出字段，优先先补文档中的字段映射表，再改代码
4. 如果要让压缩包内容更易理解，优先统一 `stuIm.xlsx` 与 `stulm.xlsx` 的命名
5. 如果业务要求导出完整证件资料，需明确是否要把身份证正反面也纳入当前 zip
6. 每次调整后，至少验证以下场景：
   - 单条记录导出
   - 多条记录导出
   - 无 `profiles` 的记录混合勾选
   - 图片下载失败但 Excel 仍可生成
   - 模板替换后的列顺序与内容是否正确

## 相关文件清单

- `src/pages/admin/EnrollmentManagement.jsx`
- `public/stuIm.xlsx`
- `package.json`
- `supabase/migrations/20240123000011_get_user_emails.sql`
- `supabase/migrations/20240123000012_fix_rpc_ambiguity.sql`
- `src/pages/StudentProfile.jsx`

## 总结

当前 Excel 导出功能采用“前端读取模板并现场组装 zip”的实现方式，优点是部署简单、无需单独后端文件生成服务；代价是对模板结构、字段顺序和前端数据格式存在较强耦合。

后续如果继续沿用当前方案，最重要的维护点不是单纯修改按钮或下载逻辑，而是始终保证以下三件事保持一致：

- 模板结构
- 代码字段映射
- 报名资料数据结构
