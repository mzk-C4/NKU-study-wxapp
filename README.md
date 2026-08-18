# NKUStudy 微信小程序

NKUStudy 是南开学生共建的非官方课程学习平台。本仓库只包含原生微信小程序客户端；课程、资料、标签、教师安排和评价均由 NKUStudy 网站服务器统一维护，小程序不提供管理接口，也不保存第二份生产内容。

## 当前接入范围

已接入 `https://nkustudy.top/api/v1`：

- 首页、课程列表、课程筛选与课程详情
- 课程、教师、资料和指南四类搜索
- 指南列表、分类、分页、详情、相关课程和公开纠错入口
- 课程资料列表及 R2 文件下载
- 网站现有评价分组、单一评分和匿名评价投稿

暂未开放：微信手机号登录、收藏、资料投稿、个人中心数据和举报。相应页面只展示“建设中”，不会请求不存在的接口，也不会伪造登录态或本地生产数据。生产指南尚无已发布内容时，小程序展示真实空态。

内容管理继续使用网站后台。小程序不会调用 `/admin-api/*`，仓库中不存放服务器密码、AppSecret、R2 密钥或管理 Cookie。

## 网络配置

开发版默认使用真实生产地址，体验版和正式版强制使用生产地址，并保持 `project.config.json` 的 `urlCheck: true`。只有开发版可通过固定本地存储值显式切换到 `reference` profile：

| 微信合法域名类型 | HTTPS 域名 |
|---|---|
| request | `https://nkustudy.top` |
| downloadFile | `https://resources.nkustudy.top` |

开发者工具即使暂时收到 404 或网络错误，也不会自动切换到旧本地服务或假数据。需要本地参考服务时，开发版执行 `wx.setStorageSync('nkustudy_api_profile', 'reference')` 后重新编译；验收结束后移除该键恢复 production。

## 开发与检查

```powershell
npm test
npm run devtools:open
```

`npm test` 同时运行远端既有课程/评价契约、页面状态、搜索/指南契约和小程序静态门禁。`npm run release:check` 还会访问真实 `/home`，仅在生产 API 已部署时运行。

完整契约见 [`docs/API.md`](docs/API.md)，字段映射见 [`docs/DATA_MAPPING.md`](docs/DATA_MAPPING.md)。
