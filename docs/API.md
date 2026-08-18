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
| GET | `/courses` | 课程列表、搜索、筛选和分页 |
| GET | `/courses/{courseUid}` | 课程详情 |
| GET | `/courses/{courseUid}/resources` | 课程资源与 R2 下载地址 |
| GET | `/review-groups` | 网站评价分组；未匹配分组正常保留 |
| GET | `/review-groups/{groupKey}` | 评价分组详情 |
| POST | `/reviews` | 匿名评价投稿，进入网站现有审核队列 |

所有动态路径参数必须 URL 编码。页面只能通过 `miniprogram/services/public-api.js` 调用公开接口。

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

- `course-selection`
- `training-program`
- `add-drop`
- `exam-grade`

列表字段为 `id/title/summary/category/updated_at/applicable_scope/related_course_ids`。详情额外使用 `steps`、`related_courses`、`source_title`、`source_url` 和 `correction_url`。

来源和纠错地址必须是无账号信息的公开 HTTPS URL。纠错按钮只复制公开链接，不调用新的写接口。生产指南为 0 时必须展示真实空态，不恢复本地 seed 或硬编码正文。

## 资源下载

资源仅读取 `id`、`course_id`、`course_name`、`title`、`size`、`size_label`、`description`、`section`、`type`、`term_label`、`extension`、`download_url`。

`download_url` 只接受 HTTPS 且主机严格等于 `resources.nkustudy.top`。客户端不拼接 `basePath`、内部文件路径或 R2 地址。

## 明确不调用

本阶段不调用：

- `/auth/wechat`
- `/favorites*`
- `/me/*`
- `/resource-submissions`
- `/resources/{id}`
- `/resources/{id}/reports`
- `/courses/{id}/reviews`
- 任何 `/admin-api/*`

request 合法域名为 `https://nkustudy.top`，downloadFile 合法域名为 `https://resources.nkustudy.top`。
