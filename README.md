# 学员报名系统

这是一个用于培训机构学员报名、资料采集、班级管理与后台管理的 Web 系统。

技术栈概览：

- 前端：React + Vite
- 后端：Supabase
- 部署：Netlify

## 常用入口

- 项目总览与历史问题总结：[PROJECT_SUMMARY.md](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/PROJECT_SUMMARY.md)
- 本次移动端上传修复复盘：[UPLOAD_FIX_RETROSPECT_20260422.md](file:///d:/Ai编程学习/学员报名系统（再试一次）（完成）/docs/UPLOAD_FIX_RETROSPECT_20260422.md)

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

构建生产版本：

```bash
npm run build
```

## 重点经验

- 报名页与资料上传属于移动端高敏感链路，修改后应优先回归微信内置浏览器、三星浏览器和安卓 Chrome。
- 如果移动端上传再次出现“选图后回到上传前状态”，优先查看上传复盘文档，不要直接从压缩参数开始排查。
- 调试上传问题时，可在页面 URL 后加 `?uploadDebug=1` 打开调试日志面板。

## 文档维护

- 项目级总结：`PROJECT_SUMMARY.md`
- 上传问题专项复盘：`docs/UPLOAD_FIX_RETROSPECT_20260422.md`
