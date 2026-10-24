# NKUStudy 小程序公开 API 契约

生产 API 前缀为 `https://nkustudy.top/api/v1`。成功响应统一为：

```json
{ "code": 0, "data": {} }
```

失败响应使用 `{ "code": "ERROR_CODE", "message": "说明" }`。网络失败与服务端错误由请求层转换为受控提示，页面不得直接展示 provider、路径、Token 或堆栈细节。

## 2026-10-24 社区贡献计数：正式 v1 契约

用户于2026-10-24追加要求：全社区以现有资料数/公开评价数作为初始花币，不补个人。维护方通过 `COMMUNITY_SUPPORT_BASELINE_RESULT_20261024.md` 回交生产版本 `20261024-community-baseline-r3`，迁移标识 `community-baseline-20261024-v1` 已应用。本轮独立无凭据GET确认/home=200、no-store，公共鲜花991、硬币1477、revision=1，三个能力开关均true。客户端直接显示已含基数的最终公共量，不额外叠加常数。实施和核验见 [历史基数交接](./COMMUNITY_SUPPORT_BASELINE_HANDOFF.md)。

此前版本 `20261024-community-ui11-r2` 首次上线时，已无凭据核验health=200、home=200、me/community-support=401/AUTH_REQUIRED，公共量和revision当时为0；该0值是迁移前历史证据。最新基数以r3及上方独立读取为准。公开读取不等同真实账号下载或评价审核联调。

`/home.data.community_support` 为 `{version:1, enabled:true, revision, flowers, coins, review_rule:"approved", download_reporting:true, personal_stats:true}`；数字为非负安全整数。关闭返回 `{version:1, enabled:false}`，缺失、失败或不可用显示“—”，不能补零；客户端保持 revision 高水位并拒绝迟到旧快照。

`POST /community-support/downloads` 只提交 `{event_id,kind,resource_id,course_id,attribution}`，JSON≤4096字节、无查询参数。event_id 为16～96位 `[A-Za-z0-9_-]`；kind=resource 要求稳定资料ID及对应课程ID，kind=guide_source 使用公开指南来源ID且课程ID为空。内置学生 PDF 未在后台目录注册，暂不上报。仅 HTTP 200 且取得本地路径后上报，同事件复用ID/正文/归属；无持久化自动重试，超时不能断定未入账。

attribution=account 必须 Bearer；community 禁止 Authorization。游客后登录不补个人归属；下载中切换到另一个账号按 community，原账号已失效/退出则停止该次上报，不静默转匿名。401/429不自动重发；503/SUPPORT_UNAVAILABLE 清除可用统计。响应 `data={event_id,recorded:true,community_support:完整能力统计}`；仅匹配事件回执可说已记花，显示数字取服务器快照。错误码：INVALID_SUPPORT_EVENT、AUTH_REQUIRED、RESOURCE_NOT_FOUND、EVENT_CONFLICT、RATE_LIMITED、SUPPORT_UNAVAILABLE。

`GET /me/community-support` 必须 Bearer、无参数，返回 `{flowers,coins}`，仅本人可见；客户端计算 `1 + floor(min(flowers, coins) / 10)`。有效公开评价由服务端审核流程计币，无额外加币接口、无提交即到账回执约定。公共鲜花含固定991条资料沉淀基数并叠加成功下载事件，公共硬币含历史与新增评价的有效公开贡献；旧评价隐藏/恢复仍调整公共有效数。历史贡献不补个人，个人统计/等级规则保持；个人有效贡献冲正可降级。注销清除个人归属，公共有效总量保留。

后端报告评价JSON和SQLite统计采用可恢复一致性，异常时关闭统计能力，不能宣称为原生跨存储事务。支持入口仍复用网站。限额、验证边界与人工验收见 [社区贡献接线记录](./COMMUNITY_SUPPORT_HANDOFF.md)。

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
| POST | `/community-support/downloads` | 下载完成记花；按账号/游客归属，能力门禁 |
| GET | `/me/community-support` | 登录本人花币统计及等级计算 |
| GET | `/search-index` | 同一版本的课程、教师、资料和指南搜索快照 |
| GET | `/guides` | 指南分类、列表和分页 |
| GET | `/guides/{guideId}` | 指南详情、相关课程、来源和纠错入口 |
| GET | `/guides/{guideId}/variants/{variantId}` | 转专业等多学院指南的学院正文与来源 |
| POST | `/guide-assistant/answers` | 指南AI开发接线；要求登录，当前生产可用性待核验 |
| GET | `/courses` | 课程列表、搜索、筛选和分页 |
| GET | `/courses/{courseUid}` | 课程详情 |
| GET | `/courses/{courseUid}/resources` | 课程资源与 R2 下载地址 |
| GET | `/review-groups` | 网站评价分组；未匹配分组正常保留 |
| GET | `/review-groups/{groupKey}` | 评价分组详情 |
| POST | `/auth/wechat` | `wx.login` code 换取 30 天 Bearer Token |
| POST | `/auth/logout` | 注销当前 Bearer Token |
| POST | `/auth/phone-verify` | 既有客户端手机号验证入口，发送微信授权 code 并要求 Bearer Token；不表示本轮已核验生产或主体配置 |
| GET | `/me` | 当前小程序用户信息 |
| POST | `/me/avatar` | Bearer 鉴权，multipart 上传头像文件，返回已审核 HTTPS 地址 |
| POST | `/me/profile` | 部分更新昵称与本人已审核头像地址 |
| GET | `/me/favorites` | 我的收藏课程列表 |
| GET | `/me/reviews` | 我的评价与审核状态 |
| GET | `/me/feedback` | 我的反馈与处理状态 |
| POST | `/me/web-password` | 设置网站登录密码 |
| POST | `/me/delete-account` | 注销当前账号绑定关系 |
| POST | `/favorites` | 收藏课程 |
| DELETE | `/favorites/{courseUid}` | 取消收藏课程 |
| POST | `/reviews` | 强制登录后按课程 ID、目录课程 ID 或历史课程名投稿；用户已确认生产鉴权部署，真机待验收 |

所有动态路径参数必须 URL 编码。通用业务页面通过 `miniprogram/services/public-api.js` 调用公开接口；学习指南针通过 feature-local 的 `miniprogram/features/learning-compass/api.js` 调用指南接口，两者都复用统一请求层与认证会话。

### 学习指南针 AI（2026-10-23 恢复开发接线）

此前2026-09-26停用的客户端入口、页面注册及请求现已恢复。**本节描述本轮客户端与待集成服务模块约定，不证明当前生产后端已重新启用或已配置真实模型。** 现有网站后端须由沈弋皓核验并挂载后才能正式联调；不得用旧报告替代当前生产验证。

`POST /guide-assistant/answers`：统一 Bearer Token，非流式，客户端预算30秒。成功与业务拒答均返回 `{ "code": 0, "data": ... }`，示例：

```json
{
  "question": "课程成绩有异议，如何申请复核？",
  "history": [
    {"role": "user", "content": "成绩复核的问题"},
    {"role": "assistant", "content": "请补充适用年级。"}
  ],
  "profile": {"admission_year": 2025, "major": "计算机科学与技术"}
}
```

`question`为1～1000字；`history`为最多9个已完成轮次，按user/assistant成对排列，每条最多1000字。`profile`可选，入学年份为四位整数、专业最多100字。服务器独立验证；用户身份只从Bearer会话取得，不接受正文身份。客户端最多10轮；本机回答最多保留12000字，回传history时保留开头、末尾条件和适用范围。

响应`data`包含`answer`、`refused`、`reason`、`guide_id`、`applicable_scope`、`freshness_notice`及`citations`。正常回答必须有已核验的引用；引用对象沿用指南的`id/title/document_no/publisher/published_at/file_type/file_name/file_url/official_page_url/location_label`等公开字段，原文打开沿用现有来源打开器；官方网页仅接受南开大学官网域，文件继续限制为既有资源域。

业务拒答`refused:true`，`reason`只允许`INSUFFICIENT_EVIDENCE`、`SOURCE_CONFLICT`或`OUT_OF_SCOPE`，并有可读说明，可继续补充条件。没有证据时不调用模型。正常回答缺少来源、空回答或非法拒答原因按服务不可用处理，不增加完成轮次。

传输错误统一为`400 INVALID_AI_QUESTION`、`401 AUTH_REQUIRED`、`429 RATE_LIMITED`、`503 AI_UNAVAILABLE`。登录恢复、网络恢复和服务恢复均不自动重发原问题。客户端不显示服务端原始报错、provider信息或堆栈。

只有develop环境显式设置`nkustudy_guide_assistant_mode=mock`才使用本地模拟；trial/release/未知环境忽略该键和视觉preview参数。模拟会话与真实账号会话分离，页面有开发演示标识；真实会话按稳定用户ID保存在本机30天，不迁入旧版无账号标记的记录。

指南原件沿用公开HTTPS资源域限制，reference回环原件不进入生产响应。详细接线、环境变量、人工验收及交付边界见[AI交接](./GUIDE_ASSISTANT_HANDOFF.md)。

## 课程与评价

2026-10-11 列表样式更新：客户端可条件展示课程/评价分组的可选 `view_count`（非负安全整数，含真实 0），文案为“次浏览”；缺失或非法值隐藏，不用全站总量替代。评价分组可选 `tag_counts: [{tag, count}]` 表示公开评价标签汇总，客户端校验正整数频次不超过分组评价总数、去重并展示最高的两个标签。本轮只预留读取与展示兼容，已只读核对当前生产 `/courses` 和 `/review-groups`，它们未提供这些新增字段；不表示后端已上线，不发起逐卡详情请求或新增埋点。

课程类别标签来自既有 `tags/group/category_name`，“资料较多”只在 `resource_count >= 10` 时展示；不推测课程内容或学生主观评价。

`GET /courses` 只发送 `page`、`page_size`、`q`、`term`、`group`、`tag`、`assessment`。客户端不发送旧 `category`、`sort`、学年或校区；`page_size` 不超过 100。

课程 `id` 是服务器不可变 UUID。简称和别名分别来自 `short_name` 与 `aliases`，客户端不自行猜测。页面使用服务端 `teacher_groups`，不建立第二套教师或开课安排模型。

评价提交正文使用三种课程标识之一：正式课程使用 `course_id`，目录课程使用 `catalog_course_id`，已有历史评价组使用精确 `course_title`。客户端不会同时设置多个有效课程标识。完整字段示例：

```json
{
  "course_id": "immutable-course-uuid",
  "catalog_course_id": "",
  "course_title": "",
  "teacher": "教师姓名",
  "rating": 5,
  "tags": ["网站已有评价标签"],
  "body": "评价正文",
  "anonymous": false
}
```

目录课程投稿将 `catalog_course_id` 设为服务器目录 ID，并把另外两个课程标识置空；历史评价组投稿将 `course_title` 设为服务器返回的精确课程名，并把两个 ID 置空。页面不得自行猜测目录 ID 或改写历史课程名。

评价只使用单一 `rating`、`body` 和 `tags`，不恢复旧多维评分。

2026-09-26 评价登录整改：小程序页面进入、重新显示和提交时检查有效会话；`submitReview` 使用 `auth: 'required'`，缺失或过期 Token 时不发出请求。客户端固定发送 `anonymous: false`，不再提供匿名开关；401 清除会话并要求重新登录，不自动重发评价。

**服务端强制要求（待当前生产 owner 核验，非已上线声明）**：`POST /reviews` 必须在任何入队/落盘之前验证 Token，缺失、无效、过期或撤销的 Token 返回 401；用户 ID 只能从服务端认证会话取得，不信任正文提供的身份。认证服务不可用时必须拒绝写入，不能降级为匿名。`anonymous: false` 不是认证手段，也不保证后端已支持公开昵称展示。本机旧网站源码快照允许 `userId: authUser?.id || null`，并未传递 anonymous 字段到写入服务；它不能证明当前线上行为，需在后端测试环境补齐并验证后再提交审核。

2026-09-27 核验更新（覆盖前述旧快照疑虑）：公开后端 main 提交 `6352c94b892615fbb4145d4683ec4e5dc29d3783` 的 `server/public-api-router.mjs:335–350` 已对评价请求强制检查有效登录身份，未登录返回 401，并在 `isPhoneVerified` 方法存在时拒绝未验证手机号的账号（403 `PHONE_VERIFY_REQUIRED`）。作者 ID 从会话取得。已确认源码实现，不代表已确认当前生产部署或通过真机投稿测试。

## 微信登录与个人数据

2026-09-27 部署状态补充：用户确认线上已部署上节所述评价登录校验逻辑；这属于用户提供的部署确认，不代表助手已实测生产投稿、核对精确部署提交或完成微信审核。

微信登录本身使用 `wx.login()` 获取一次性 code，再提交 `{ "code": "..." }` 到 `/auth/wechat`，不把手机号授权当作登录。当前客户端另有手机号验证入口，公开后端源码也对评价发布设置了手机号验证检查，原“个人主体不使用手机号授权”的描述已过时；是否可用需结合当前主体配置和真机核验。服务器登录返回：

```json
{ "token": "...", "expires_in": 2592000, "user": { "id": 1, "nickname": "", "avatar_url": "" } }
```

Token 仅保存于微信本地存储，受保护请求使用 `Authorization: Bearer <token>`；过期或收到 401 时立即清除。openid 与 AppSecret 不进入响应、日志或客户端仓库。昵称最多 32 字符，头像只接受公开 HTTPS 地址。

`GET /me/favorites` 与 `GET /me/reviews` 使用 `page/page_size`，`page_size` 不超过 100。收藏正文为 `{ "course_id": "immutable-course-uuid" }`。当前小程序提交评价必须携带 Token，可在“我的评价”查看审核状态。公开作者展示方式仍由后端公开 DTO 决定，不得公开手机号、学号、OpenID 或 Token。

### 用户头像上传与保存（2026-09-29 正式契约接线）

后端来源：[shview/NKU-study-resources@39aeb72 的 API 文档](https://github.com/shview/NKU-study-resources/blob/39aeb72a392c7cb8fefb493a67d1455a77bddd15/docs/API.md)，功能提交 `a2df36c5b75e693257e8ddfea3674563c44d7114`。本机已只读核对该提交的路由、上传服务和资料更新实现。后端负责人回交生产 release `20260928-avatar1` 已部署、216 项测试通过；这是后端提供的部署/验证报告，本机未复跑后端测试或向生产上传图片。

1. `POST /me/avatar`：`Authorization: Bearer <现有会话 Token>`；multipart 单文件字段 `file`，无其他必填字段。前端使用 `wx.uploadFile`，由微信生成 multipart boundary，不设置 JSON Content-Type；超时 60 秒，不自动重试。
2. 约定输入 JPEG/PNG，文件 ≤2,097,152 字节，宽/高分别 ≤4096 像素。客户端先检查本地文件大小及解码信息再上传，检查期间切换账号则停止。服务端仍应独立验证限制。
3. 上传成功为 `{ "code": 0, "data": { "avatar_url": "https://resources.nkustudy.top/avatars/<opaque-id>.jpg" } }`。上传不自动绑定；后端重编码为 256×256 JPEG，剥离元信息，微信同步图片审核通过后存储。前端同时检查整数 HTTP 2xx、JSON 业务码及 URL，不能仅凭 uploadFile success 回调认定成功。
4. URL 校验按源码的 avatars 前缀及 `[A-Za-z0-9_-]{16,64}.jpg`；不接受其他域、其他目录、端口、查询串或片段。实际 ID 由 16 随机字节转 base64url（通常 22 字符）生成，回交文字中的“32 位”不能作为前端硬编码限制。
5. 上传后 `POST /me/profile` 仅发送 `{ "avatar_url": "上传结果" }`，不补空昵称；成功读取完整 `data.user`。后端省略字段保留原值，`GET /me` 和重新登录返回保存后的头像。后端允许显式空串清空头像，但本次小程序不提供清空功能，也不发送空串。
6. 上传次数由后端按用户限制为每 24 小时 5 次；413 `AVATAR_TOO_LARGE`、400 `AVATAR_INVALID_IMAGE`、403 `AVATAR_CONTENT_REJECTED` / `AVATAR_NOT_OWNED`、429 `RATE_LIMITED`、503 `AVATAR_UPLOAD_UNAVAILABLE` 均用受控提示。仅 HTTP 401 清理对应上传会话，迟到的 401 不清理新会话；普通失败保留有效登录。
7. 已上传但绑定失败时，当前页面在 24 小时内重试只重发资料保存，避免重复占用上传额度；未绑定地址仅内存暂存。取消、更换选择、退出/切号或卸载清除该暂存；过期/归属拒绝后重新上传。旧头像在确认保存前保持为 user 中的有效值，不持久化临时文件路径。

当前 production adapter 已接入真实上传；reference 仍禁用认证上传。平台域名和隐私指引由微信执行校验，客户端未关闭域名检查；平台配置与真机验收按下方注明的用户确认记录。

2026-09-29 接线时的待办与源码核对记录：公众平台负责人添加 `https://nkustudy.top` 为 **uploadFile 合法域名**、确认头像隐私声明生效；随后真机验收保存、重启恢复、失败重试与昵称/登录保持。源码核对发现后端 `processImage` 当前未显式限制 `metadata.format`，需后端补齐 JPEG/PNG 校验和有效 GIF/WebP 拒绝测试；前端预检不能替代此项。孤立资源实际在后续成功上传时触发 24 小时阈值的惰性回收，并非保证到点定时删除。

2026-09-29 后续状态：用户明确确认上传域名、头像隐私声明及后端格式限制三项已完成。按用户确认进入真机验收；本机未另行核对新增后端修复提交，以上问题保留为此前源码核对记录。随后在 2026-09-30，用户对所提供验收清单整体反馈“一切正确”，头像保存、重进/重新登录恢复、取消和失败重试据此记录为用户验收通过；本机未独立执行真机测试。本次头像功能提交包含上述实现、测试与文档；小程序版本尚未由本任务上传发布，调用契约不变。

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

2026-09-24 展示分组：指南首页改为“新生入学 / 学海无涯 / 在校生活 / 学长焚决”，这是客户端导航分组，不是新增的 API category 枚举。旧分类深链接仍可访问：前四个旧分类归入“学海无涯”，“规范与权益”归入“在校生活”；标题、摘要可补充新生或生活标签；已收录 PDF 同时进入“学长焚决”，明确标注学生经验。

指南专用搜索及分类页通过现有 `GET /guides?page=…&page_size=100` 加载完整目录，按稳定 ID 去重；不发送新分组值，不新增端点。与本机已收录 PDF 目录合并后，按标题、摘要、PDF 介绍、展示分组进行本地相关性排序、近义词扩展与组合词筛选，每次展示 20 条。搜索不包含 PDF 全文。读取失败时明确告知学校指南未加载，并允许搜索本机 PDF 目录和重试，不冒充完整结果。PDF 子页目录无需网络，打开原件仍需下载。

本次无数据库迁移，不改变正式指南正文、来源和校级/学院 variant 边界；未向 AI 知识库自动注入学生 PDF。

转专业概览只展示校级章节，学院正文必须通过 variant 接口按需获取，不得在学院间复用内容。旧 `steps/source_title/source_url` 已退出正式生产契约，客户端不得依赖这些字段恢复正文。

生产来源 `file_url` 必须位于 `https://resources.nkustudy.top/guide-sources/`；客户端使用 `downloadFile → openDocument` 打开 PDF、DOC 和 DOCX。公共响应不得包含仓库路径、服务器路径、chunk、审核字段、提示词或检索分数。

## 资源下载

资源仅读取 `id`、`course_id`、`course_name`、`title`、`size`、`size_label`、`description`、`section`、`type`、`term_label`、`extension`、`download_url`。

`download_url` 只接受 HTTPS 且主机严格等于 `resources.nkustudy.top`。客户端不拼接 `basePath`、内部文件路径或 R2 地址。

2026-09-27 客户端下载处理：课程资源使用 120 秒超时，显示进度并阻止重复下载；仅 PDF、DOC/DOCX、XLS/XLSX、PPT/PPTX 调用 `openDocument`。其他格式或预览失败时，由用户选择 `shareFileMessage` 转发文件或复制原始下载链接；不再调用 `saveFile` 后声称能从微信文件管理中找到文件。已知大小超过微信单次 200MB 上限时直接提供浏览器下载提示；老版本微信、网络失败也保留显式复制链接出口。依据：[downloadFile](https://developers.weixin.qq.com/miniprogram/dev/api/network/download/wx.downloadFile.html)、[openDocument](https://developers.weixin.qq.com/miniprogram/dev/api/file/wx.openDocument.html)、[shareFileMessage](https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html)。

`downloadFile` 合法域名必须配置 `https://resources.nkustudy.top`，不是 `web-view` 的业务域名，也不能只配置 `https://nkustudy.top`。本轮未修改后台配置或关闭合法域名校验；网站可下载不能代替小程序真机验收。指南原件的 source-opener 流程本轮未改。

## 资料投稿、原生反馈与公告（2026-09-28，2.0.1 要求修正）

- 用户澄清：资料投稿仍由网站完成，只有意见反馈在小程序内提交。“我的 → 资料投稿”打开固定 `https://nkustudy.top/participate/` 的 web-view；原生 `submit-resource` 页已取消注册并排除打包，源码与本机已有草稿不删除。真机打开网站仍需 nkustudy.top 业务域名配置。
- 模拟器补验实际出现“不支持打开该网页”，参与页已增加加载错误后的固定链接复制、手动选择和重试入口，并实看回退界面；该回退不代表域名已放行，网站投稿仍由用户在网站完成。
- “我的 → 意见反馈”继续进入原生 `feedback` 页，通过既有 `POST https://nkustudy.top/feedback-api/submit` 提交标题、正文、类型、可选联系方式与投诉上下文；使用既有会话凭证，鉴权与手机号验证由服务端执行。保留公开反馈、本人反馈及管理员回复；本轮不改变该接口或提交逻辑，不向生产发送测试内容。
- 后续反馈可靠性补验：重新读取公开后端 `handleFeedbackSubmit`，确认成功正文为 `{ok:true}`。原生反馈页现要求整数 2xx 状态码且 `ok === true` 才清空表单；异常响应、401/403/429 及网络失败保留本页内容，使用受控提示，不直出服务端内部错误。提交期间锁定输入与类型、防重复；网络结果不确定时提示先核对“我的反馈”，不自动重发。链接预填容忍错误 URL 编码并限制长度。未改变接口、登录和服务端验证规则，未进行真实生产写入。
- 首页继续读取 `/home` 的 `announcement` 字符串；2026-10-08 增加客户端固定的 HiNKU 合作公告，与远程正文共同展示，分别记录已读版本（沿用远程公告键，新增合作公告键）。首次或任一正文更新自动弹出，关闭后相同内容不再自动弹出；远程请求失败仍可显示合作公告，也不因在线/离线切换重复提醒已读合作。首页顶部保留入口；非首页前台恢复或冷启动通过原生弹窗提醒，可选择留在原页面或查看首页全文。合作卡片和按钮只跳转固定 `wxbd7dc59babb6d536` 正式版首页，服务包括课表、班车、校园卡余额、电费、学校公告与场地预约；未提供具体页面路径，不宣称直达功能页。公开 API 响应格式未变。
- 分享链接冷启动直达非首页时使用 App 入口 path 启动公告检查，等待页面挂载后再提示（最多 20 次、100ms 间隔的本地检查，不重复请求网络）。进入后台取消等待，前后台轮次标识阻止过期请求显示旧公告；未能及时挂载时不阻塞页面，后续恢复/进入首页可再次检查。
- 2026-10-08 合作公告进一步增加固定本地联合主视觉，图片路径计入合作已读版本，更新后提示一次。首页四个服务按钮都调用固定 HiNKU 首页跳转，原服务界面图片可展开查看，关闭公告时恢复收起。非首页原生提醒仍使用可读文字，不尝试在 `wx.showModal` 中嵌入图片；点「查看全文」进入首页图文公告。
- 同日公告增加本地飞书内测群说明和既有原始二维码；入群内容纳入合作已读版本，非首页文字提醒同步加入群说明。弹窗扩为 88vh，正文占据剩余可用空间；HiNKU 主按钮移入正文，底部仅固定关闭按钮。公告二维码展示沿用原图的白色二维码区域视窗，点击调用 `wx.previewImage` 显示完整原图并允许保存，不改二维码原文件；说明保留飞书及组织内部成员限制。
- 公告只为已知 `NKUCS.ICU` 文本绑定固定 `https://nkucs.icu/#/?id=nkucsicu`，不执行任意远程 HTML 或导航。web-view 真机需要 `nkucs.icu` 业务域名配置与对方校验文件，目前未确认；加载失败提供复制原链接提示。
- 微信头像（2026-09-29）：已按正式后端回交接入上传 → 资料保存两步流程，支持文件预检、受控失败提示及资料保存重试复用上传结果；仅保存成功后更新缓存并提示成功。详见上文“用户头像上传与保存”和 [头像交接记录](./AVATAR_UPLOAD_BACKEND_HANDOFF.md)。用户已确认平台 uploadFile 域名、隐私声明和后端格式限制完成，并于 2026-09-30 整体确认头像验收通过；真机结论来自用户反馈，不以本地模拟测试代替。代码与文档纳入本次头像功能提交，前端发布单独安排。

## 公开站点访问统计（接口）

首页通过独立于 `/api/v1` 的公开站点统计接口展示运行时长与累计访问量：

- `POST https://nkustudy.top/visit-api/hit` 只发送 `{ "path": "/mp/<page>" }`，页面名限制为小写字母、数字和中划线；响应中的公开统计可用于首页展示。
- `GET https://nkustudy.top/visit-api/stats` 只读取 `total`、`today`、`updatedAt` 和可选的 `startedAt`；客户端不读取访客明细或身份字段。

统计请求不携带 Token、OpenID 或设备标识，失败时静默降级，不得阻塞首页业务内容。生产接口尚未返回 `startedAt` 时，客户端使用已核验的网站启用时间兼容展示；字段上线后以服务端值为准。

## 明确不调用

2026-09-27：按用户要求移除小程序内的打赏、赞助与支付功能。客户端已删除捐助数据读取和支付下单方法，不再调用 `GET /donate` 或 `POST /donate/pay`，仅提供固定网站首页链接复制入口；网站端接口和数据未修改。

仍不调用：

- `/auth/phone`
- `/resource-submissions`
- `/resources/{id}`
- `/resources/{id}/reports`
- `/courses/{id}/reviews`
- 任何 `/admin-api/*`

request 合法域名为 `https://nkustudy.top`，downloadFile 合法域名为 `https://resources.nkustudy.top`。
