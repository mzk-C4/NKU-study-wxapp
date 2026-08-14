# NKUStudy 网站数据到小程序 API 的映射基线

对应飞书任务：SYH-01、SYH-02、SYH-03、SYH-06。生产服务器数据是唯一事实源；`server/` 只用于契约、转换规则、mock 与本地联调，不能部署成第二套生产数据源。

## 服务器字段直接复用

| 服务器字段 | 小程序字段 | 处理方式 |
|---|---|---|
| `course.id` | `source_id` | 原样保留，并派生稳定 API `id` |
| `course.title` | `name` | 原样复用 |
| `course.group` | `category_name`、`scope` | 原样复用，如“通识选修课”“专业必修课” |
| `course.term` | `term`、`recommended_stage` | 原样复用，如“大一上”“E课” |
| `course.tags` | `tags` | 原样复用、仅去重，不由小程序覆盖 |
| `course.summary` | `description` | 原样复用 |
| `section.title` | `Resource.source_section` | 原样保留；`type` 只是便于筛选的派生值 |
| `resourceRoot/basePath/path` | `Resource.share_url` | 每个路径段 URL 编码，只接受受控 HTTPS 域名 |
| `review.rating` | `Review.rating` | 原样复用单一 1–5 分，不生成多维评分 |
| `review.content` | `Review.body` | 原样复用 |

人工补充字段必须与服务器字段分开保存。例如补充标签放在 `extra_tags`，不能覆盖 `tags`。旧客户端需要的 `category_code` 可暂时作为可选兼容字段，但不能要求服务器课程必须填写 A–E，也不能用“必修/选修”推导 A–E。

## 已确认的结构冲突

| 冲突 | 当前处理 | 后续决策点 |
|---|---|---|
| 小程序旧稿使用 A–E；服务器使用课程组 | 展示、筛选均优先 `category_name`；`category_code` 可选 | 若产品仍要 A–E，应作为额外维度单独评审 |
| 小程序旧稿使用四维评价；服务器只有单一评分 | API 与页面改用 `rating`；旧 seed 的 `recommend` 仅作读取兼容 | 不把单一分复制到难度、负担、收获 |
| 网站课程没有教师主数据 | 从已公开评价的教师名临时派生 Teacher/Offering | 同名教师、无评价课程需要独立主数据方案 |
| 20 条公开评价的课程名不在 68 门课程中 | 报告 `REVIEW_COURSE_UNMATCHED`，不生成孤立评价 | 管理员确认别名、补课程或保留为历史评价 |
| 网站没有 Guide 数据源 | `guides` 为空 | 另定生产内容源，禁止从课程简介臆造 |
| 网站缺学年、校区等开课字段 | 保持空值并保留 `source_term` | 有权威数据后再补 |

## 服务器核验结果

2026-08-14 只读核验生产服务器：68 门课程、787 个资源文件、71 条公开评价。适配器可生成全部 68 门课程和 787 个资源且无稳定 ID 冲突；51 条评价能关联现有课程，20 条进入未匹配 warning。数字只说明核验时点，运行时不得把快照写死进小程序。

## 校验与生产边界

适配器位于 `server/src/website-adapter.js`，输出 `report.contract_notes` 明示上述兼容处理。严格模式只阻止会造成安全或主键错误的问题，例如资源根地址不是受控 HTTPS 域名、源主键冲突；字段模型不同只报告，不擅自覆盖服务器数据。

```bash
npm --prefix server run check:website-data -- \
  --manifest /path/to/src/data/manifest.json \
  --reviews /path/to/src/data/reviews.json \
  --metadata /path/to/catalog-metadata.json
```

覆盖表示例见 `server/data/catalog-metadata.example.json`。生产部署必须在网站代码仓库内实时读取 JSON 并挂载 `/api/v1`。小程序不得访问 `/admin-api/*`，写操作仍须经过登录、限流、审核与日志脱敏。
