# NKUStudy 网站数据到小程序 API 的映射基线

对应 SYH-01、SYH-02、SYH-03、SYH-06。生产服务器数据是唯一事实源；仓库中的 `server/` 是待部署的生产 API 实现与契约测试，不能作为第二套生产数据源。

## 服务器字段直接复用

| 网站字段 | 小程序字段 | 处理方式 |
|---|---|---|
| `course.id` | `source_id` | 原样保留，并派生稳定 API `id` |
| `course.title` | `name` | 原样复用 |
| `course.group` | `category_name`、`scope` | 原样复用，如“通识选修课”“专业必修课” |
| `course.term` | `term`、`recommended_stage` | 原样复用，如“大一上”“E课” |
| `course.tags` | `tags` | 原样复用、仅去重，不由小程序覆盖 |
| `course.summary` | `description` | 原样复用 |
| `section.title` | `Resource.source_section` | 原样保留；`type` 只是筛选用派生值 |
| `resourceRoot/basePath/path` | `Resource.share_url` | 分段 URL 编码，只接受受控 HTTPS 域名 |
| `review.courseTitle` | `Review.course_title` | 原样复用；不要求一定存在于课程清单 |
| `review.teacher` | `Review.teacher` | 原样复用，并按“课程名 + 教师名”分组，与网站一致 |
| `review.rating` | `Review.rating` | 原样复用单一 1–5 分，不生成多维评分 |
| `review.content` | `Review.body` | 原样复用 |

人工补充字段必须与服务器字段分开保存。例如补充标签放在 `extra_tags`，不能覆盖 `tags`。旧客户端字段 `category_code` 和旧 seed 的 `recommend` 只保留读取兼容。

## 已确认的结构差异

| 差异 | 当前处理 |
|---|---|
| 小程序旧稿使用 A–E，网站使用课程组 | 展示和筛选使用网站 `category_name`；不要求 A–E |
| 小程序旧稿使用四维评价，网站只有单一评分 | API 和页面只使用 `rating` |
| 小程序旧稿有 Teacher/CourseOffering 主表，网站没有 | 不建立额外教师主表；教师保留为评价文本并分组 |
| 20 条公开评价的课程名不在 68 门课程中 | 71 条评价全部保留；这 20 条不出现在某门课程详情，但仍属于合法网站评价 |
| 小程序旧稿有学年、校区字段，网站没有 | 新 API、投稿表单和页面均不提供这两个字段 |
| 网站没有独立 Guide 数据源 | 本地 5 条指南只作为界面占位；上线前需决定保留静态内容还是在网站增加内容源 |

## 服务器核验结果

2026-08-14 只读核验生产服务器：68 门课程、787 个资源文件、71 条公开评价。适配器完整保留 71 条评价，其中 51 条能关联课程详情，20 条按网站方式独立保留。没有稳定 ID 冲突。

## 开发工具与正式环境接入

开发版、体验版和正式版统一请求 `https://nkustudy.top/api/v1`，并开启合法域名校验。评价、资料投稿、举报、收藏等写操作也必须走同一个生产 API，不允许用本地运行库冒充真实提交。

## 生产接入

当前 `https://nkustudy.top/api/v1/home` 返回 404，说明生产 `/api/v1` 尚未挂载。生产部署必须在网站服务中实时读取 `manifest.json`、`reviews.json` 并使用同一转换规则。小程序不得访问 `/admin-api/*`，也不得携带后台 Cookie。资源下载继续直连 `resources.nkustudy.top`。
