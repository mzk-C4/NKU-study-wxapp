# NKUStudy 小程序公开 API 契约

生产 API 前缀为 `https://nkustudy.top/api/v1`。成功响应统一为：

```json
{ "code": 0, "data": {} }
```

失败响应使用 `{ "code": "ERROR_CODE", "message": "说明" }`。网络失败与服务端错误由请求层转换为受控提示，页面不得直接展示 provider、路径、Token 或堆栈细节。

## API profile

- `develop` 默认使用固定 production profile。
- `trial` 和 `release` 强制使用 production profile。
- 只有 `develop` 可通过本地存储键 `nkustudy_api_profile=reference` 显式切换到固定的 `http://127.0.0.1:3000/api/v1`。
- 客户端不接受任意 URL、IP 或协议覆盖。

## 当前允许的路由

| 方法 | 路径 | 客户端用途 |
|---|---|---|
| GET | `/health` | 发布与运维检查 |
| GET | `/home` | 公告、热门课程、最近更新 |
| GET | `/search-index` | 同一版本的课程、教师、资料和指南搜索快照 |
| GET | `/guides` | 指南分类、列表和分页 |
| GET | `/guides/{guideId}` | 指南详情、相关课程、来源和纠错入口 |
| GET | `/guides/{guideId}/variants/{variantId}` | 转专业等多学院指南的学院正文与来源 |
| POST | `/guide-assistant/answers` | 需要 Bearer Token 的学习指南针 AI 问答 |
| GET | `/courses` | 课程列表、搜索、筛选和分页 |
| GET | `/courses/{courseUid}` | 课程详情 |
| GET | `/courses/{courseUid}/resources` | 课程资源与 R2 下载地址 |
| GET | `/review-groups` | 网站评价分组；未匹配分组正常保留 |
| GET | `/review-groups/{groupKey}` | 评价分组详情 |
| POST | `/auth/wechat` | `wx.login` code 换取 30 天 Bearer Token |
| POST | `/auth/logout` | 注销当前 Bearer Token |
| GET | `/me` | 当前小程序用户信息 |
| POST | `/me/profile` | 更新昵称与 HTTPS 头像地址 |
| GET | `/me/favorites` | 我的收藏课程列表 |
| GET | `/me/reviews` | 我的评价与审核状态 |
| GET | `/me/feedback` | 我的反馈与处理状态 |
| POST | `/me/web-password` | 设置网站登录密码 |
| POST | `/me/delete-account` | 注销当前账号绑定关系 |
| POST | `/favorites` | 收藏课程 |
| DELETE | `/favorites/{courseUid}` | 取消收藏课程 |
| POST | `/reviews` | 匿名评价投稿，进入网站现有审核队列 |

所有动态路径参数必须 URL 编码。通用业务页面通过 `miniprogram/services/public-api.js` 调用公开接口；学习指南针通过 feature-local 的 `miniprogram/features/learning-compass/api.js` 调用指南接口，两者都复用统一请求层与认证会话。

### 学习指南针生产契约

生产已提供五分类指南、学院 variant、R2 原件和 AI 回答接口。AI 请求为：

```json
{
  "question": "课程成绩有异议，如何申请复核？",
  "history": [{ "role": "user", "content": "……" }],
  "profile": { "admission_year": 2025, "major": "计算机科学与技术" }
}
```

`question` 为 1～1000 字；`history` 最多 9 个已完成轮次；`profile` 可选，入学年份使用四位整数。客户端最多完成 10 轮，第 10 轮请求携带前 9 轮历史。请求必须使用统一 Bearer Token，会话不存在时客户端先展示登录恢复，不静默重发原问题。

正常回答和业务拒答均返回 200；正式拒答原因是 `INSUFFICIENT_EVIDENCE` 或 `SOURCE_CONFLICT`。传输错误稳定映射为 `400 INVALID_AI_QUESTION`、`401 AUTH_REQUIRED`、`429 RATE_LIMITED` 和 `503 AI_UNAVAILABLE`。客户端请求预算为 30 秒，provider 重试由服务端负责。

生产指南原件只接受约定的公开 HTTPS 资源地址；reference profile 的回环原件地址不得进入生产响应。

## 课程与评价

`GET /courses` 只发送 `page`、`page_size`、`q`、`term`、`group`、`tag`、`assessment`。客户端不发送旧 `category`、`sort`、学年或校区；`page_size` 不超过 100。

课程 `id` 是服务器不可变 UUID。简称和别名分别来自 `short_name` 与 `aliases`，客户端不自行猜测。页面使用服务端 `teacher_groups`，不建立第二套教师或开课安排模型。

评价提交正文：

```json
{
  "course_id": "immutable-course-uuid",
  "teacher": "教师姓名",
  "rating": 5,
  "tags": ["网站已有评价标签"],
  "body": "评价正文",
  "anonymous": true
}
```

评价只使用单一 `rating`、`body` 和 `tags`，不恢复旧多维评分。

## 微信登录与个人数据

个人主体小程序不使用手机号授权。客户端调用 `wx.login()` 获取一次性 code，再提交 `{ "code": "..." }` 到 `/auth/wechat`。服务器返回：

```json
{ "token": "...", "expires_in": 2592000, "user": { "id": 1, "nickname": "", "avatar_url": "" } }
```

Token 仅保存于微信本地存储，受保护请求使用 `Authorization: Bearer <token>`；过期或收到 401 时立即清除。openid 与 AppSecret 不进入响应、日志或客户端仓库。昵称最多 32 字符，头像只接受公开 HTTPS 地址。

`GET /me/favorites` 与 `GET /me/reviews` 使用 `page/page_size`，`page_size` 不超过 100。收藏正文为 `{ "course_id": "immutable-course-uuid" }`。已登录用户提交评价时携带可选 Token，因此公开内容仍匿名，但可在“我的评价”查看审核状态。

## 四类搜索

`GET /search-index` 不接收查询参数，一次返回 `{version,generated_at,items,total}`。索引项 `type` 只允许：

- `course`
- `teacher`
- `resource`
- `guide`

搜索页无课程 facet 时只加载一次完整索引，之后在本地执行 Fuse 排序和类型切换；每次显示 20 条，触底增加本地可见数量。任一 `term/group/tag/assessment` facet 生效时切换为服务器课程筛选模式。

Fuse 权重为 `name 0.30 / short_name 0.20 / aliases 0.15 / tags 0.15 / teachers 0.10 / search_text 0.10`。结果键固定为 `type:id`：

- 课程进入课程概览；
- 教师把姓名写回搜索词并细化为课程结果；
- 资料进入所属课程资料页，不请求独立资源详情；
- 指南按稳定 ID 进入指南详情。

索引 adapter 逐字段构造结果，不允许内部路径、revision、审核字段或管理元数据穿透。

## 指南

`GET /guides` 只发送 `category/page/page_size`，其中 `category` 只允许：

- `course-study`
- `exam-grade`
- `student-status-graduation`
- `academic-development`
- `rules-rights`

列表使用稳定五分类值与 `category_label`。详情使用 `sections[{id,title,body_format,body,source_ids}]`、`sources[{id,title,document_no,publisher,published_at,file_type,file_name,file_url,official_page_url,location_label}]` 和轻量 `variants[{id,title,order,source_count}]`。

转专业概览只展示校级章节，学院正文必须通过 variant 接口按需获取，不得在学院间复用内容。旧 `steps/source_title/source_url` 已退出正式生产契约，客户端不得依赖这些字段恢复正文。

生产来源 `file_url` 必须位于 `https://resources.nkustudy.top/guide-sources/`；客户端使用 `downloadFile → openDocument` 打开 PDF、DOC 和 DOCX。公共响应不得包含仓库路径、服务器路径、chunk、审核字段、提示词或检索分数。

## 资源下载

资源仅读取 `id`、`course_id`、`course_name`、`title`、`size`、`size_label`、`description`、`section`、`type`、`term_label`、`extension`、`download_url`。

`download_url` 只接受 HTTPS 且主机严格等于 `resources.nkustudy.top`。客户端不拼接 `basePath`、内部文件路径或 R2 地址。

## 公开站点访问统计

首页通过独立于 `/api/v1` 的公开站点统计接口展示运行时长与累计访问量：

- `POST https://nkustudy.top/visit-api/hit` 只发送 `{ "path": "/mp/<page>" }`，页面名限制为小写字母、数字和中划线；响应中的公开统计可用于首页展示。
- `GET https://nkustudy.top/visit-api/stats` 只读取 `total`、`today`、`updatedAt` 和可选的 `startedAt`；客户端不读取访客明细或身份字段。

统计请求不携带 Token、OpenID 或设备标识，失败时静默降级，不得阻塞首页业务内容。生产接口尚未返回 `startedAt` 时，客户端使用已核验的网站启用时间兼容展示；字段上线后以服务端值为准。

## 明确不调用

仍不调用：

- `/auth/phone`
- `/resource-submissions`
- `/resources/{id}`
- `/resources/{id}/reports`
- `/courses/{id}/reviews`
- 任何 `/admin-api/*`

request 合法域名为 `https://nkustudy.top`，downloadFile 合法域名为 `https://resources.nkustudy.top`。
