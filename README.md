# NKUStudy 微信小程序

NKUStudy 是由南开学生共建的非官方课程学习平台，提供课程资料、匿名评价、课程搜索和选课指南。浏览无需登录；收藏、投稿和写评价时才使用微信登录。

## 目录

- `miniprogram/`：原生微信小程序，覆盖 12 个设计界面
- `server/`：零外部依赖的 Node.js MVP API 与 JSON 持久化
- `admin/`：内部课程、资料投稿和评价审核页
- `design/`：HTML 界面设计稿和逐页 PNG
- `docs/`：协作计划、接口契约和验收说明

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

也可以从仓库根目录启动开发者工具：

```powershell
npm run devtools:open
```

若开发者工具不在常见安装目录，先设置 `WECHAT_DEVTOOLS_HOME`。兼容脚本只在内存中更换 CLI 桥接端口，不会修改微信开发者工具安装文件；可用 `WECHAT_CLI_BRIDGE_PORT` 指定其他空闲端口。

## 环境与发布

小程序根据微信环境自动选择接口：

| 微信环境 | API 地址 |
|---|---|
| 开发版 `develop` | `http://127.0.0.1:3000/api/v1` |
| 体验版 `trial` | `https://nkustudy.top/api/v1` |
| 正式版 `release` | `https://nkustudy.top/api/v1` |

微信公众平台需要把 `https://nkustudy.top` 配置为 request 合法域名。上传前先执行生产 API、自动测试和静态检查：

```powershell
npm run release:check
```

检查通过后生成预览或上传体验版：

```powershell
npm run devtools:preview
npm run devtools:upload -- -v 0.1.0 -d "NKUStudy MVP"
```

`devtools:upload` 会先执行发布检查；生产 API 未上线或响应不符合契约时会停止上传，避免发布无法联调的体验版。

## 测试

```powershell
npm test
```

## 安全

- 不提交 `.env`、`project.private.config.json`、服务器密码、Token 或 OpenID。
- 生产环境不得启用 `ALLOW_DEV_LOGIN`。
- 小程序只保存内部用户 ID 与登录 Token，不采集实名和学号。
- 资源首期只保存网盘链接元数据，不提供网盘管理凭证。

详细分工见 [`docs/COLLABORATION_PLAN.md`](docs/COLLABORATION_PLAN.md)。
