# 网站数据到小程序页面映射

生产服务器是唯一事实源。客户端集中在 `miniprogram/services/public-api.js` 中按公开 DTO 白名单转换，不兼容旧 seed、旧分类码或内部 manifest 字段。

| 服务器公开字段 | 小程序用途 |
|---|---|
| `course.id` | 不可变课程 UID；详情、收藏未来关联键 |
| `name` / `description` | 课程标题与简介 |
| `group` / `category_name` | 网站课程组，例如“通识选修课” |
| `term` / `tags` / `assessment` | 原样展示与筛选 |
| `teacher_groups` | 网站评价中的教师分组，不推导另一套教师安排 |
| `ratings` | 网站单一评价分的聚合结果 |
| `resource.section` / `type` | 原样生成资源筛选，不硬编码资料类型 |
| `resource.download_url` | 直接交给微信下载，不读取内部路径 |
| `review-group.matched` | 历史评价是否精确匹配当前课程 |
| `review.rating/tags/body` | 网站现有单评分、标签与正文 |

没有学年、校区字段。未匹配评价是网站正常历史数据：客户端显示 `matched=false`，不伪造课程或教师关联。评价投稿标签只复用该课程公开评价已经出现的标签；没有历史标签时允许不选。

删除的旧客户端兼容包括 `category_code`、`scope`、`recommended_stage`、A–E 分类、四维评价、网盘分享字段和本地搜索索引。需要调整少量源数据时应在网站数据中一次性修正，而不是在小程序增加长期特例。
