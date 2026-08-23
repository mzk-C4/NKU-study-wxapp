# NKUStudy 小程序公开 API 契约

本文只记录当前小程序实际使用的生产公开只读契约。生产事实与数据的 owner 位于 NKUStudy.top 网站/生产 API 仓库；本仓库的 `server/` 仅是旧契约的本地参考 mock，不是生产服务，也不得作为生产回退。

## 基址与响应

- 生产 API：`https://nkustudy.top/api/v1`
- 资源下载域名：`https://resources.nkustudy.top`
- 体验版和正式版请求必须使用 HTTPS；微信公众平台还需分别配置 request 与 downloadFile 合法域名。
- API 数据源与微信 `envVersion` 已解耦：`develop` 默认使用固定 `production` profile，`trial/release` 强制使用 `production`；只有 `develop` 可通过本地存储键 `nkustudy_api_profile=reference` 显式切换至固定的 `http://127.0.0.1:3000/api/v1`，未知值或读取失败一律回退生产。客户端不接受任意 URL、IP 或协议。

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

## 当前使用的十个公开 GET

所有页面请求都必须经 `miniprogram/services/public-api.js`，页面不得直接拼接路径或解释生产原始 DTO。

| 方法 | 路径 | 小程序用途 |
|---|---|---|
| GET | `/health` | 公开服务健康模型（adapter 已提供语义方法） |
| GET | `/home` | 首页公告、热门课程和最近更新 |
| GET | `/search-index` | 完整、同版本的课程、教师、资料和指南公开索引；正式搜索页在无课程 facet 时使用 |
| GET | `/guides` | 指南列表、分类 facets 和分页 |
| GET | `/guides/{guideId}` | 指南详情、相关课程、来源和公开纠错链接 |
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

`page_size` 最大为 100。production profile 不得发送旧 `query`、`category`、`requirement_type` 或本地排序参数。正式搜索页仅在任一课程 facet（`term/group/tag/assessment`）生效时使用 `GET /courses?q=<keyword>` 并保持服务器分页、去重和 latest-request-wins；清空全部 facet 后回到四类本地索引搜索。

课程对象正式增加 `short_name` 和 `aliases`。两者只来自生产数据源，缺失时分别映射为 `""` 和 `[]`；客户端不从课程名称猜测简称或维护第二套别名。

### 完整搜索索引

`GET /search-index` 不接收查询参数，一次返回 `{version,generated_at,items,total}`。搜索页首次进入加载一个完整快照，随后对课程、教师、资料和指南执行本地 Fuse 排序；输入和类型切换不重复请求生产，每次显示 20 条，触底只增加本地可见条数。索引加载失败可重试并重新获取完整快照。

索引项公共字段仅为 `id/type/type_label/badge/name/short_name/aliases/tags/teachers/search_text/subtitle`，`type` 只允许 `course/teacher/resource/guide`。资源项另保留 `course_id/course_name/resource_type/term_label`，指南项另保留 `category/updated_at`。未知类型以及缺少稳定 `id/name` 的项目会被丢弃，原始对象中的路径、revision、审核和管理字段不会穿透。

候选集保持 NFKC、80 字符上限、标点/空格规范化和 token AND；直接包含检查覆盖全部公开搜索字段，跳字简称只在名称、简称和别名内成立，避免把不同长字段中的字符拼成假阳性。Fuse 权重为 `name 0.30 / short_name 0.20 / aliases 0.15 / tags 0.15 / teachers 0.10 / search_text 0.10`，同分时使用稳定字段和稳定 ID 排序。

结果键固定为 `type:id`。课程结果按不可变 UUID 打开课程概览；教师结果把教师名写回搜索词并切换为课程类型，不虚构教师详情；资料只在存在合法 `course_id` 时进入所属课程资料页，不请求独立资源详情；指南按 URL 编码后的稳定 ID 打开现有详情页。生产指南数量为 0 时保持真实 0 和诚实空态，不恢复本地 seed。

### 指南查询与详情

`GET /guides` 的 adapter 只发送 `category/page/page_size`。`category` 为空时不发送，否则只允许：

- `course-selection`
- `training-program`
- `add-drop`
- `exam-grade`

`page_size` 最大为 100。列表响应映射 `items/total/page/page_size/facets.categories/data_updated_at`；摘要项只保留 `id/title/summary/category/updated_at/applicable_scope/related_course_ids`。

`GET /guides/{guideId}` 的动态 ID 必须 URL 编码。详情只保留 `id/title/summary/category/updated_at/applicable_scope`、`steps[{title,body}]`、`related_courses[{id,name}]`、`source_title/source_url/correction_url`。来源和纠错地址必须是无账号信息、无空白或反斜杠的 HTTPS URL；不合格值统一映射为空字符串。纠错入口仅复制公开链接，不调用反馈写接口。

### 页面模型与隐私边界

adapter 逐字段构造页面模型：

- 课程只保留不可变 UUID、名称/简称/别名、摘要、`term`、`group/category_name`、`assessment`、公开标签、`teachers/teacher_groups`、资源/评价计数、单一 `rating` 和更新时间。
- 资源只保留公开展示字段与校验后的 `download_url`。
- 评价分组只保留 `group_key`、明确的 `course_id` 映射、课程/教师名、匹配状态、计数和平均分；评价明细只保留公开正文、单评分、标签、帮助数与时间。
- 搜索索引、指南摘要和指南详情均逐字段构造；相关课程只保留公开课程 UUID 与名称，指南 URL 经过独立安全校验。

以下字段不得穿透页面模型：内部 `basePath/path/resourceRoot`、源码或仓库位置、revision、审核内部字段、IP/actor hash、User-Agent、联系方式、管理元数据、R2 内部配置及任何本地或服务器路径。

不再制造旧 A–E 分类、开课实例、学年/校区或四维评分。生产字段缺失时使用真实空态。

### 资源下载

课程资源列表直接返回 `download_url`。adapter 只接受 HTTPS 且主机严格等于 `resources.nkustudy.top` 的地址；页面使用 `wx.downloadFile` 下载，再用 `wx.openDocument` 打开。小程序不请求独立资源详情，也不展示内部路径、分享凭据或存储密钥。

### 公开评价

课程评价页先读取 `/review-groups`，只接受 `matched:true` 且 `course_id` 与当前课程 UUID 完全相同的分组，再读取对应 `/review-groups/{groupKey}`。无法可靠匹配时显示诚实空态，不按标题或教师名猜测。

## 明确未开放

以下能力在小程序运行代码中必须保持零网络调用：

- 微信登录、收藏与个人数据；
- 资料投稿、独立资源详情和失效举报；
- 旧课程评价列表；
- 评价写入。

生产文档已经声明 `POST /reviews`，但本阶段客户端保持禁用。启用前仍需生产 owner 提供写入校验、限流、审核、隐私、并发及稳定错误响应证据。建设中页面不得显示虚假的登录、提交或空数据成功状态。

## 本地参考 mock

`server/` 继续服务旧契约测试与本地参考，不得扩建为第二套生产服务。reference profile 的必要客户端兼容仅存在于 `public-api` adapter：旧课程 DTO 被收窄为当前页面模型，旧查询仅做隔离转换；production profile 即使运行在开发者工具中也使用正式 `q`、允许评价分组并且不进入 reference 降级。为了让新版指南页面可在本地验收，参考服务额外把旧 seed 中的四个中文学习事务分类映射为正式英文枚举，提供 `/api/v1/health`、指南分页、facets 和更新时间，并过滤不属于正式四分类的旧指南；这只是本地 fixture 兼容，不是生产数据回退。旧 mock 缺少某项公开数据时，客户端仍显示真实空态或安全错误态，不恢复未发布内容、不硬编码指南正文，也不把 mock 扩成第二套生产实现。

开发者工具显式切换 reference：

```js
wx.setStorageSync('nkustudy_api_profile', 'reference')
```

重新编译后生效。恢复 production：

```js
wx.removeStorageSync('nkustudy_api_profile')
```

## 验证边界

- `npm.cmd run verify:quick`：小程序静态、语法和端点边界检查。
- `npm.cmd run verify:local`：旧本地服务测试、客户端契约测试和小程序静态检查。
- `npm.cmd run verify:external`：访问外部 API，只有取得明确授权后才能运行。

本地自动化通过不代表微信开发者工具、真机、体验版、真实资源下载、生产 API 或生产环境通过。生产 `DATA_MAPPING.md` 的精确原文当前不在本地，本文件未根据摘要伪造它。
