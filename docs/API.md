# NKUStudy API 契约

API 前缀为 `/api/v1`，所有 JSON 响应统一为：

```json
{ "code": 0, "message": "ok", "data": {} }
```

分页数据位于 `data.items`，同时返回 `page`、`page_size` 和 `total`。写入接口使用 `Authorization: Bearer <token>`；管理端使用 `x-admin-key`，两者都不得出现在日志或前端仓库中。

## 公开读取

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/home` | 热门课程、最近更新和选课季提示 |
| GET | `/courses` | 支持 `query`、`category`、`requirement_type`、`sort`、分页 |
| GET | `/courses/{course_id}` | 课程概览、开课教师与聚合评分 |
| GET | `/courses/{course_id}/resources` | 已发布资料；列表不返回网盘链接 |
| GET | `/courses/{course_id}/reviews` | 已发布评价；支持 `offering_id` |
| GET | `/resources/{resource_id}` | 资料详情和网盘分享信息 |
| GET | `/search-index` | 课程、教师、资料、指南紧凑索引 |
| GET | `/guides` | 指南列表 |
| GET | `/guides/{guide_id}` | 指南步骤和相关课程 |

## 登录与用户写入

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/wechat` | 使用 `wx.login()` 的临时 code 换取内部登录态 |
| POST | `/favorites` | 收藏课程 |
| DELETE | `/favorites/{course_id}` | 取消收藏 |
| POST | `/resource-submissions` | 提交网盘链接，默认 `pending` |
| POST | `/resources/{resource_id}/reports` | 报告链接失效 |
| POST | `/reviews` | 提交匿名评价，默认 `pending` |
| GET | `/me/favorites` | 我的收藏 |
| GET | `/me/submissions` | 我的投稿及审核状态 |
| GET | `/me/reviews` | 我的评价及审核状态 |

同一用户对同一 `CourseOffering` 只能保留一条待审核或已发布评价。综合分只有在不少于 3 条已发布评价时才计算并展示。

## 管理端

管理 UI 位于 `/admin/`。课程支持草稿、发布和归档；资料投稿支持通过、需修改和不通过；评价支持发布、不通过和隐藏。资料投稿通过后由服务端生成 `Resource`，客户端从不接触网盘管理账号。
