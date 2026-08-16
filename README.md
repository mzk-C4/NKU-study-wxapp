# NKUStudy 微信小程序

NKUStudy 是南开学生共建的非官方课程学习平台。本仓库只包含原生微信小程序客户端；课程、资料、标签、教师安排和评价均由 NKUStudy 网站服务器统一维护，小程序不提供管理接口，也不保存第二份生产内容。

## 当前接入范围

已接入 `https://nkustudy.top/api/v1`：

- 首页、课程列表、服务器搜索与课程详情
- 课程资料列表及 R2 文件下载
- 网站现有评价分组、单一评分和匿名评价投稿

暂未开放：微信手机号登录、收藏、资料投稿、个人中心数据、举报和远程选课指南。相应页面只展示“建设中”，不会请求不存在的接口，也不会伪造登录态或本地生产数据。

内容管理继续使用网站后台。小程序不会调用 `/admin-api/*`，仓库中不存放服务器密码、AppSecret、R2 密钥或管理 Cookie。

## 网络配置

开发版、体验版和正式版统一使用真实生产地址，并保持 `project.config.json` 的 `urlCheck: true`：

| 微信合法域名类型 | HTTPS 域名 |
|---|---|
| request | `https://nkustudy.top` |
| downloadFile | `https://resources.nkustudy.top` |

开发者工具即使暂时收到 404 或网络错误，也不会切换到旧本地服务或假数据。生产 API 部署后直接重试即可。

## 开发与检查

```powershell
npm test
npm run devtools:open
```

`npm test` 检查公开 API adapter、允许的查询参数、评价分组、资源下载字段、未开放端点零调用以及小程序文件完整性。`npm run release:check` 还会访问真实 `/home`，仅在生产 API 已部署时运行。

完整契约见 [`docs/API.md`](docs/API.md)，字段映射见 [`docs/DATA_MAPPING.md`](docs/DATA_MAPPING.md)。
