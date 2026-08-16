# NKUStudy 微信小程序

NKUStudy 是由南开学生共建的非官方课程学习平台。当前小程序开放课程、课程资料、课程搜索和公开评价的只读浏览；指南、登录、收藏、投稿、举报、个人数据和评价提交仍在建设中，不会调用未开放的线上接口。

## 目录

- `miniprogram/`：原生微信小程序，覆盖 12 个设计界面
- `server/`：旧契约的本地参考 mock，不是生产服务或生产回退
- `admin/`：内部课程、资料投稿和评价审核页
- `design/`：HTML 界面设计稿和逐页 PNG
- `docs/`：协作计划、接口契约和验收说明
- 当前任务状态与跨聊天交接：[`docs/COLLABORATION_PLAN.md`](docs/COLLABORATION_PLAN.md)（唯一状态 owner）

## 本地运行

1. 启动 API：

   ```powershell
   cd server
   $env:ALLOW_DEV_LOGIN='true'
   $env:TOKEN_SECRET='replace-with-a-local-secret'
   $env:ADMIN_KEY='replace-with-a-local-admin-key'
   node src/server.js
   ```

2. 使用微信开发者工具打开仓库根目录。开发版接口默认是 `http://127.0.0.1:3000/api/v1`。
3. 开发者工具中勾选“不校验合法域名”进行本地联调；生产环境必须配置 HTTPS 业务域名。
4. 管理页访问 `http://127.0.0.1:3000/admin/`，填入本地 `ADMIN_KEY` 后操作。

本地 `server/` 仅用于旧 mock 与自动化测试。develop 环境由小程序 adapter 做有限兼容；公开评价分组等生产能力不会通过扩建本地服务来伪造。

也可以从仓库根目录启动开发者工具（Windows PowerShell 推荐使用 `npm.cmd`，避免 `npm.ps1` 执行策略问题）：

```powershell
npm.cmd run devtools:open
```

若开发者工具不在常见安装目录，先设置 `WECHAT_DEVTOOLS_HOME`。兼容脚本只在内存中更换 CLI 桥接端口，不会修改微信开发者工具安装文件；可用 `WECHAT_CLI_BRIDGE_PORT` 指定其他空闲端口。

## 环境与发布

小程序根据微信环境自动选择接口：

| 微信环境 | API 地址 |
|---|---|
| 开发版 `develop` | `http://127.0.0.1:3000/api/v1` |
| 体验版 `trial` | `https://nkustudy.top/api/v1` |
| 正式版 `release` | `https://nkustudy.top/api/v1` |

微信公众平台需要把 `https://nkustudy.top` 配置为 request 合法域名，并把 `https://resources.nkustudy.top` 配置为 downloadFile 合法域名。

## 验证与发布

Windows PowerShell 推荐使用以下命令；`package.json` 与 Linux CI 内部仍使用跨平台的 `npm`：

| 层级 | PowerShell 命令 | 验证内容 | 外部边界 |
|---|---|---|---|
| 快速静态验证 | `npm.cmd run verify:quick` | 小程序页面、组件引用、JS 语法、配置与敏感信息静态检查 | 不访问外部网络、生产 API 或微信开发者工具 |
| 完整本地验证 | `npm.cmd run verify:local` | 本地参考服务测试、客户端契约测试及上述小程序静态检查 | 仅使用本机临时数据和回环地址，不访问生产 API 或微信开发者工具 |
| 外部 API 验证 | `npm.cmd run verify:external` | 现有 HTTPS `/api/v1/home` 契约检查 | 会访问外部 API（默认生产 API），需要网络和明确授权 |
| 完整发布检查 | `npm.cmd run release:check` | 依次运行完整本地验证和外部 API 验证，任一步失败即停止 | 会访问外部 API（默认生产 API），需要网络和明确授权 |

证据状态统一使用：`PASS` 表示实际运行且通过；`FAIL` 表示实际运行但失败；`SKIP` 表示本轮有意未运行；`BLOCKED` 表示应运行但被环境、权限或前置条件阻止。每个状态都应附实际命令或原因。

本地验证 `PASS` 只证明本地自动化检查通过，不代表微信开发者工具、真机、体验版、生产 API 或生产环境通过。这些环节必须分别运行并记录证据。

获得外部访问和发布授权后，可执行完整发布检查：

```powershell
npm.cmd run release:check
```

检查通过后，可在微信开发者工具中生成预览或上传体验版：

```powershell
npm.cmd run devtools:preview
npm.cmd run devtools:upload -- -v 0.1.0 -d "NKUStudy MVP"
```

`devtools:upload` 始终先执行 `release:check`；本地验证失败、外部 API 不可用或响应不符合契约时会停止上传，避免发布无法联调的体验版。

## 安全

- 不提交 `.env`、`project.private.config.json`、服务器密码、Token 或 OpenID。
- 生产环境不得启用 `ALLOW_DEV_LOGIN`。
- 当前小程序不连接线上登录、个人数据或写入服务，也不会发送匿名评价。
- 资源只接受生产公开契约返回的受控 HTTPS 下载地址，不接收或展示网盘管理凭证。

详细分工见 [`docs/COLLABORATION_PLAN.md`](docs/COLLABORATION_PLAN.md)。
