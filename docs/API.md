# NKUStudy 小程序公开 API 契约

本文只记录当前小程序实际使用的生产公开只读契约。生产事实与数据的 owner 位于 NKUStudy.top 网站/生产 API 仓库；本仓库的 `server/` 仅是旧契约的本地参考 mock，不是生产服务，也不得作为生产回退。

## 基址与响应

- 生产 API：`https://nkustudy.top/api/v1`
- 资源下载域名：`https://resources.nkustudy.top`
- 体验版和正式版请求必须使用 HTTPS；微信公众平台还需分别配置 request 与 downloadFile 合法域名。

成功响应：

```json
{ "code": 0, "data": {} }
```

生产成功响应不要求包含 `message`。失败响应使用字符串错误码：

```json
{ "code": "COURSE_NOT_FOUND", "message": "课程不存在。" }
```

客户端传输层保留 HTTP 状态、字符串 `code` 和受控原始 payload，但页面只展示经过清理的安全提示。当前区分：

| HTTP | 客户端分类 | 典型含义 |
|---|---|---|
| 400 | `invalid_request` | 查询、分页或路径输入无效 |
| 404 | `not_found` | 内容不存在或功能未开放 |
| 409 | `conflict` | 当前状态不允许操作 |
| 429 | `rate_limited` | 请求过于频繁 |
| 500 | `server_error` | 服务端暂时失败 |
| 503 | `unavailable` | 服务暂不可用或状态不确定 |

网络失败单独归类为 `network_error`。客户端不会自动重试写请求。

## 当前使用的七个公开 GET

所有页面请求都必须经 `miniprogram/services/public-api.js`，页面不得直接拼接路径或解释生产原始 DTO。

| 方法 | 路径 | 小程序用途 |
|---|---|---|
| GET | `/health` | 公开服务健康模型（adapter 已提供语义方法） |
| GET | `/home` | 首页公告、热门课程和最近更新 |
| GET | `/courses` | 课程列表、筛选、分页与课程搜索 |
| GET | `/courses/{courseUid}` | 课程详情 |
| GET | `/courses/{courseUid}/resources` | 课程资源与受控下载地址 |
| GET | `/review-groups` | 公开评价分组列表 |
| GET | `/review-groups/{groupKey}` | 评价分组与公开评价明细 |

动态路径参数必须 URL 编码。`groupKey` 只能来自评价分组列表，不由客户端猜测或自行生成。

### 课程查询

adapter 只允许输出以下生产参数：

- `q`
- `term`
- `group`
- `tag`
- `assessment`
- `page`
- `page_size`

`page_size` 最大为 100。生产 trial/release 请求不得发送旧 `query`、`category`、`requirement_type` 或本地排序参数。课程搜索固定使用 `GET /courses?q=<keyword>`；当前不伪装支持资料或指南搜索。

### 页面模型与隐私边界

adapter 逐字段构造页面模型：

- 课程只保留不可变 UUID、名称/摘要、`term`、`group/category_name`、`assessment`、公开标签、`teachers/teacher_groups`、资源/评价计数、单一 `rating` 和更新时间。
- 资源只保留公开展示字段与校验后的 `download_url`。
- 评价分组只保留 `group_key`、明确的 `course_id` 映射、课程/教师名、匹配状态、计数和平均分；评价明细只保留公开正文、单评分、标签、帮助数与时间。

以下字段不得穿透页面模型：内部 `basePath/path/resourceRoot`、源码或仓库位置、revision、审核内部字段、IP/actor hash、User-Agent、联系方式、管理元数据、R2 内部配置及任何本地或服务器路径。

不再制造旧 A–E 分类、开课实例、学年/校区或四维评分。生产字段缺失时使用真实空态。

### 资源下载

课程资源列表直接返回 `download_url`。adapter 只接受 HTTPS 且主机严格等于 `resources.nkustudy.top` 的地址；页面使用 `wx.downloadFile` 下载，再用 `wx.openDocument` 打开。小程序不请求独立资源详情，也不展示内部路径、分享凭据或存储密钥。

### 公开评价

课程评价页先读取 `/review-groups`，只接受 `matched:true` 且 `course_id` 与当前课程 UUID 完全相同的分组，再读取对应 `/review-groups/{groupKey}`。无法可靠匹配时显示诚实空态，不按标题或教师名猜测。

## 明确未开放

以下能力在小程序运行代码中必须保持零网络调用：

- 微信登录、收藏与个人数据；
- 资料投稿、资源详情和失效举报；
- 旧课程评价列表、旧搜索索引与指南；
- 评价写入。

生产文档已经声明 `POST /reviews`，但本阶段客户端保持禁用。启用前仍需生产 owner 提供写入校验、限流、审核、隐私、并发及稳定错误响应证据。建设中页面不得显示虚假的登录、提交或空数据成功状态。

## 本地参考 mock

`server/` 继续服务旧契约测试与本地参考，不得扩建为第二套生产服务。develop 环境的必要兼容仅存在于 `public-api` adapter：旧课程 DTO 被收窄为当前页面模型，旧查询仅做隔离转换；页面没有生产/本地双分支。旧 mock 不提供评价分组时，客户端显示明确空态而不会恢复已废弃端点。

## 验证边界

- `npm.cmd run verify:quick`：小程序静态、语法和端点边界检查。
- `npm.cmd run verify:local`：旧本地服务测试、客户端契约测试和小程序静态检查。
- `npm.cmd run verify:external`：访问外部 API，只有取得明确授权后才能运行。

本地自动化通过不代表微信开发者工具、真机、体验版、真实资源下载、生产 API 或生产环境通过。生产 `DATA_MAPPING.md` 的精确原文当前不在本地，本文件未根据摘要伪造它。
