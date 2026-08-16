# NKUStudy 小程序公开 API 契约

API 前缀为 `https://nkustudy.top/api/v1`。成功响应统一为：

```json
{ "code": 0, "data": {} }
```

错误响应为 `{ "code": "ERROR_CODE", "message": "说明" }`，可能使用 HTTP 400、404、409、429 或 500。小程序统一展示服务器错误；网络失败和超时可重试。

## 本阶段唯一允许的路由

| 方法 | 路径 | 客户端用途 |
|---|---|---|
| GET | `/health` | 发布与运维检查 |
| GET | `/home` | 公告、热门课程、最近更新 |
| GET | `/courses` | 课程列表和搜索 |
| GET | `/courses/{courseUid}` | 课程详情 |
| GET | `/courses/{courseUid}/resources` | 课程资源与 R2 下载地址 |
| GET | `/review-groups` | 网站评价分组；未匹配分组正常保留 |
| GET | `/review-groups/{groupKey}` | 评价分组详情 |
| POST | `/reviews` | 匿名评价投稿，进入网站现有审核队列 |

`GET /courses` 只发送 `page`、`page_size`、`q`、`term`、`group`、`tag`、`assessment`。`page_size` 不超过 100；不发送 `category`、`sort`、学年或校区。筛选项直接读取 `facets.groups/terms/tags/assessments`，没有客户端枚举。

课程 `id` 是服务器不可变 UUID。页面只使用服务端 `teacher_groups`，不建立本地教师或开课安排模型。评价只使用 `rating`、`body` 和 `tags`，没有多维评分。

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

资源字段只读取 `id`、`course_id`、`course_name`、`title`、`size`、`size_label`、`description`、`section`、`type`、`term_label`、`extension`、`download_url`。点击资源后用 `wx.downloadFile` 下载并用 `wx.openDocument` 打开；客户端不拼接 `basePath`、文件路径或 R2 地址。

## 明确不调用

本阶段不调用 `/search-index`、`/guides*`、`/auth/wechat`、`/favorites*`、`/me/*`、`/resource-submissions`、`/resources/{id}`、`/resources/{id}/reports`、`/courses/{id}/reviews`。也不调用任何 `/admin-api/*`。

request 合法域名为 `https://nkustudy.top`，downloadFile 合法域名为 `https://resources.nkustudy.top`。
