# 资料收集 ZIP 弱网下载

更新时间：2026-10-12。

## 下载行为

- 全班 ZIP 从最多 2 个并行请求开始；遇到自动重试或断网后，后续任务降为逐个下载。
- 现代浏览器使用流读取，每次收到数据都会重置 90 秒空闲计时。持续有数据到达的文件没有 45 秒或其他固定总时限。
- 无流读取能力的旧浏览器保留兼容路径，文件正文允许等待 10 分钟。
- 获取签名链接最多等待 60 秒；每次重试重新签发链接，有效期 1 小时。不会在长队列启动时预先签发所有链接。
- 每份文件最多尝试 4 次，重试间隔为 1.5、3、6 秒；网络故障、停滞、临时服务错误、过期链接均可重试。404 等明确的非暂时错误直接保留失败信息。
- 浏览器识别离线时暂停等待，联网后自动恢复，不消耗尝试次数。用户可以主动暂停。

## 续传与打包

已完整下载的文件只缓存在当前资料收集页面的内存中。暂停或失败后，点击“继续下载缺失资料”只重新获取未完成文件；正在传输但未完整下载的单份文件会重新下载，未实现 HTTP Range 字节级断点续传。

资料缓存按班级、提交记录、更新时间、路径区分。切换班级或离开组件会取消请求、释放缓存和 Blob URL；刷新整个网页同样无法保留进度。不写入 localStorage 或 IndexedDB。

只有所有文件完整下载后才生成 ZIP，不会静默遗漏失败资料。ZIP 保持 `班级/学员/学员+资料类型.jpg` 的目录与命名，使用 STORE 避免重复压缩 JPEG，按块生成 Blob 减少中间缓冲。生成后释放源文件缓存，并允许“再次保存 ZIP”而不重新联网下载。

此方案仍依赖浏览器内存，超大班级打包的内存上限未通过本次模拟测试覆盖。永久断网、资料已被删除或无访问权限时不能保证完成；页面会保留成功部分并显示失败原因。

## 实现位置

- `src/lib/resilientDownload.js`：通用网络下载、超时、重试、取消与离线处理。
- `src/pages/admin/ClassDocumentArchive.js`：班级归档任务、内存缓存、队列与 ZIP 生成。
- `src/pages/admin/ClassDocumentManagement.jsx`：管理员 UI、签名链接、暂停与继续操作。

## 验证

单元及集成测试：

```sh
node --test tests/*.test.mjs
npx eslint src/lib/resilientDownload.js src/pages/admin/ClassDocumentArchive.js src/pages/admin/ClassDocumentManagement.jsx
npm run build
```

浏览器测试先启动 `npm run dev -- --host 127.0.0.1`，然后运行 `node tests/classDocumentArchive.browser.mjs`。测试需要 Playwright 和本机 Edge；可通过 `PLAYWRIGHT_MODULE` 指向现有 Playwright 的 `index.mjs`，或使用标准安装的 Playwright。`ZIP_TEST_URL` 可覆盖本地开发地址。

浏览器测试使用隔离的模拟管理员、班级、资料和本地文件服务，不访问真实 Supabase 业务数据。覆盖临时失败重试、失败后复用成功文件、暂停后继续、离线恢复、48 秒持续传输、重复保存，以及 ZIP 内容和目录校验。桌面/手机截图保存在系统临时目录的 `student-system-zip-qa` 下。
