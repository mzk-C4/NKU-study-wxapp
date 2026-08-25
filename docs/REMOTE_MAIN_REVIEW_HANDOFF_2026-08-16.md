# 远端 `main` 差异审查交接（2026-08-16）

> 本文是一次性远端差异审查记录，供后续窗口判断整合方案。
>
> 本文不是新的项目状态或 API 契约 owner。当前任务状态仍以 [`COLLABORATION_PLAN.md`](./COLLABORATION_PLAN.md) 为准，当前客户端公开契约仍以 [`API.md`](./API.md) 为准。
>
> 本轮只执行了远端引用抓取、只读差异检查和三方合并模拟；没有执行 `pull`、`merge`、`rebase`、`checkout`，没有修改代码、暂存文件或解决冲突。

## 一、结论摘要

远端更新可以吸收，但不适合直接 `git pull` 或自动合并。

当前功能分支和远端 `main` 都从 `d690f60` 出发，随后分别完成了一套“生产公开 API 对齐”实现。两边对搜索、评价写入、本地参考服务、页面保留策略、错误处理和测试范围作出了不同选择，因此冲突不是单纯的相邻行编辑，而是架构和产品策略冲突。

三方合并模拟发现 42 个 Git 冲突。建议后续以“先确认产品与安全策略，再按模块人工移植”为原则，不要批量接受 `ours` 或 `theirs`，也不要把两个大提交直接硬合并后再逐个猜测。

## 二、已确认事实

### 2.1 本地状态

| 项目 | 当前值 |
|---|---|
| 当前分支 | `feat/syk-search-guide` |
| 当前 HEAD | `c92b7c3 feat: align mini program with public API` |
| HEAD 父提交 | `c63a497 fix(miniprogram): make course cards fill list width` |
| 共同基点 | `d690f60 feat: prepare mini program release flow (#9)` |
| 本地 `main` | `d690f60` |
| 分支 upstream | 未配置 |
| 暂存区 | 空 |

当前工作区已有 4 个未提交文档修改，均视为用户工作：

- `AGENTS.md`
- `README.md`
- `docs/COLLABORATION_PLAN-formatted.md`
- `docs/COLLABORATION_PLAN.md`

本交接文件完成后的最终状态复核还发现另一个窗口并发新增了未跟踪文件 `docs/SYK_API_HANDOFF.md`。该文件不属于本次远端审查，本轮没有读取、修改或覆盖它；后续操作同样必须将其视为用户/并发窗口工作并予以保护。

其中 `README.md`、`docs/COLLABORATION_PLAN-formatted.md` 和 `docs/COLLABORATION_PLAN.md` 也被远端修改。未先妥善保存这些改动时，直接合并很可能首先被 Git 的工作区保护中止。

`AGENTS.md` 是当前分支在共同基点之后新增的文件；远端没有对应文件。它不是三方合并冲突，但必须保留其项目安全与执行规则。

### 2.2 远端状态

本轮 `git fetch origin` 后确认：

- `origin/main`：`d690f60 -> f58d85c`
- 新出现的远端分支：
  - `origin/agent/dyx-review-profile`，指向 `a22d3a7`
  - `origin/feat/syh-course-api`，指向 `6a5e223`
- `origin/main` 最新提交：`f58d85c Merge pull request #13 from mzk-C4/feat/syh-course-api`
- `origin/main` 已包含 PR #12（评价/个人中心分支）和 PR #13（课程 API 分支）。

相对共同基点：

- 当前分支独有 2 个提交。
- 远端 `main` 独有 7 个提交（其中包括合并提交）。
- 当前分支提交 `c92b7c3` 的时间为 `2026-08-16 17:02 +08:00`。
- 远端合并提交 `f58d85c` 的时间为 `2026-08-16 14:11 +08:00`。

提交时间只能说明先后，不能自动决定哪一侧实现正确；当前状态 owner、正式生产契约和已验证行为仍需优先核对。

### 2.3 远端主要提交

| 提交 | 作用摘要 |
|---|---|
| `4a3a3bb` | 引入网站数据映射、生产课程字段适配和 `docs/DATA_MAPPING.md` 的早期版本 |
| `2f1d935` | 将评价模型改为网站单一评分模型，调整课程、资源和评价字段 |
| `a22d3a7` | 增加评价与个人中心相关流程；后续部分内容被课程 API 分支的方案覆盖 |
| `88b2937` | 小程序连接生产公开 API；删除本地 server/admin/Fuse 和部分页面；新增公开 API adapter、资源下载和精简测试 |
| `516019b` | 合并 PR #12 |
| `6a5e223` | 将当时的 `main` 合入课程 API 分支并处理少量样式冲突 |
| `f58d85c` | 合并 PR #13，成为当前 `origin/main` |

## 三、远端 `main` 实际修改范围

相对当前分支，远端最终状态涉及 92 个路径，整体差异约为 781 行新增、5570 行删除。大量删除来自 Fuse.js、本地 `server/`、旧测试和两个详情页面。

### 3.1 远端值得关注的新内容

- 新增生产公开 API adapter：`miniprogram/services/public-api.js`。
- 新增 latest-request-wins helper：`miniprogram/utils/request-generation.js`。
- 新增受控资源下载 helper：`miniprogram/utils/resource-download.js`。
- 新增生产字段映射说明：`docs/DATA_MAPPING.md`。
- 课程查询统一使用 `q/term/group/tag/assessment/page/page_size`。
- 课程、资源和评价改用网站公开 DTO，不再制造旧 A–E 分类和四维评分。
- 微信项目配置开启 `urlCheck: true`。
- 课程搜索直接调用 `/courses?q=`。
- 评价读取改用 `/review-groups` 与 `/review-groups/{groupKey}`。

### 3.2 远端删除或收缩的内容

- 删除整个 `server/` 本地参考服务及其测试。
- 删除 `admin/`。
- 删除 Fuse.js 和相关许可证。
- 删除 `guide-detail` 页面。
- 删除 `resource-detail` 页面。
- 删除本地搜索 helper、搜索展示 helper及大部分原有页面测试。
- 开发版不再连接本地参考服务，改为所有环境统一访问生产 API。
- CI 从完整本地验证收缩为两个精简测试文件加小程序静态检查。

### 3.3 远端新增或恢复的产品行为

- 搜索页新增“课程/评价”两个结果类型。
- 搜索时同时请求课程和全部评价分组，在客户端过滤评价名称。
- 写评价页启用 `POST /reviews` 匿名评价提交。
- 个人中心仍没有真实登录和个人数据，只显示建设中提示与本地浏览历史。
- 指南、资料投稿等未开放能力保持建设中。

## 四、三方合并证据

使用以下提交关系进行三方合并模拟：

```text
base:        d690f60
current:     c92b7c3 (feat/syk-search-guide)
remote main: f58d85c (origin/main)
```

结果：

| 指标 | 数量 |
|---|---:|
| 当前分支修改路径 | 68 |
| 远端修改路径 | 70 |
| 双方重叠路径 | 46 |
| Git 冲突总数 | 42 |
| 内容冲突 | 31 |
| modify/delete 冲突 | 10 |
| add/add 冲突 | 1 |

### 4.1 主要内容冲突

- `.github/workflows/ci.yml`
- `README.md`
- `docs/ACCEPTANCE.md`
- `docs/API.md`
- `miniprogram/services/public-api.js`（add/add）
- `miniprogram/utils/request.js`
- `miniprogram/pages/search/index.js|wxml|wxss`
- `miniprogram/pages/courses/index.js|wxml|wxss`
- `miniprogram/pages/course-overview/*`
- `miniprogram/pages/course-resources/*`
- `miniprogram/pages/course-reviews/*`
- `miniprogram/pages/write-review/*`
- `miniprogram/pages/profile/*`
- `miniprogram/pages/home/*`
- `miniprogram/pages/guides/*`
- `package.json`
- `project.config.json`
- `scripts/check-miniprogram.js`

### 4.2 主要 modify/delete 冲突

远端删除、当前分支修改的文件包括：

- `miniprogram/pages/guide-detail/index.js|wxml|wxss`
- `miniprogram/pages/resource-detail/index.js|wxml|wxss`
- `miniprogram/utils/auth.js`
- `server/data/seed.json`
- `server/src/model.js`
- `server/test/api.test.js`

这些冲突不能仅根据 Git 状态判断保留或删除，需要先决定页面数量、建设中页面策略、本地参考服务和鉴权边界。

## 五、两侧方案的关键差异

| 主题 | 当前功能分支 | 远端 `main` | 交接含义 |
|---|---|---|---|
| 课程搜索 | 服务端搜索，同时保留筛选、高亮、分页、加载更多、并发保护和安全展示 | 服务端搜索，结果页较精简，并增加评价类型 | 当前搜索已自动化和用户验收，不应被整页覆盖 |
| 搜索结果类型 | 只把课程作为正式结果；教师和标签是课程匹配字段 | 课程和评价两类结果 | 是否需要“评价搜索”是待确认的产品决定 |
| Fuse.js | 历史 helper/测试仍保留，但生产运行不使用 | 删除 Fuse.js | 若确认生产只用服务端搜索，可以清理；但不要连带删除有价值的回归测试 |
| 课程 API adapter | 更严格的白名单映射、兼容本地参考 mock、下载 URL 提前校验 | 较精简的生产-only adapter | 应逐函数比较，不宜接受整个文件某一侧 |
| 错误处理 | 清理服务端消息，区分 HTTP/网络错误，页面显示安全提示 | 多处直接展示 `payload.message` 或 `error.message` | 建议保留当前分支的安全错误边界 |
| 评价关联 | 先验证 `matched:true` 且 `course_id` 精确匹配，再取详情 | 主要根据 `teacher_groups.group_key` 直接取详情 | 远端可能把不匹配历史评价关联到当前课程，需要加强校验 |
| 评价写入 | 明确禁用，等待写入安全、限流、审核和稳定错误响应证据 | 已启用 `POST /reviews` | 必须由生产契约和安全证据决定，不能在冲突中默认启用 |
| 资源下载 | API adapter 先验证主机，再提供页面模型 | 下载 helper 在调用时验证资源域名 | 两侧都有限制；当前分支多一道 adapter 白名单防线 |
| 本地 `server/` | 仅作旧契约测试和本地参考，不是生产服务 | 整体删除，仓库定义为客户端-only | 需要明确是否继续保留参考 mock 和 12 个服务端测试 |
| 页面范围 | 保留 12 页和建设中页面，未开放端点零调用 | 删除指南详情、资料详情 | 与当前两周计划的 12 页目标存在冲突 |
| 开发环境 | develop 可使用本地参考 mock；trial/release 使用生产 HTTPS | develop/trial/release 全部使用生产 API | 需要决定开发联调方式；不能仅按配置冲突自动选择 |
| 自动化 | 客户端 48 项、服务端 12 项及 12 页/4 Tab 静态检查 | 两个精简测试文件加静态检查 | 远端直接覆盖会显著缩减回归保护 |
| 状态文档 | `COLLABORATION_PLAN.md` 是唯一当前状态 owner | 将协作计划标为早期归档 | 当前 `AGENTS.md` 已明确 owner，不能用远端两行说明覆盖 |

## 六、代码审查中的保留意见

以下是需要在整合前继续成立的风险，不是已经接受的合并决定。

### 6.1 评价写入不应因远端已合并而自动启用

当前本地 `docs/API.md` 明确记录：生产文档虽声明 `POST /reviews`，但客户端仍需等待服务端写入校验、限流、审核、隐私、并发和稳定错误响应证据。

远端代码只有客户端字段校验和提交成功提示，仓库内没有足够证据证明生产端已满足全部安全条件。因此，在正式证据补齐前，建议继续保持零写入调用。

### 6.2 评价分组必须保持精确课程关联

当前契约要求：评价分组必须同时满足 `matched:true` 和 `course_id === 当前课程 UUID`。远端 `getCourseReviewGroups(course)` 主要按课程返回的 `teacher_groups` 逐个取详情，没有再次验证详情返回值。

整合时应保留当前分支的精确关联检查，避免错误展示未匹配或属于其他课程的历史评价。

### 6.3 服务端错误不能未经清理直接展示

远端传输层允许使用服务器返回的 `payload.message`，多个页面直接把 `error.message` 放进界面。若生产服务意外返回内部路径、堆栈、Token 相关提示或其他诊断内容，客户端可能原样展示。

建议保留当前 `request.js` 的安全消息清理和错误分类，由页面使用稳定的用户提示。

### 6.4 搜索功能存在明显回退风险

当前搜索已经具备并验证：

- `q/term/group/tag/assessment` 正式参数；
- 服务端顺序保持；
- 安全匹配高亮；
- 初始、加载、空、错误、重试和分页状态；
- latest-request-wins；
- 全宽课程卡；
- 用户对“有机化学”搜索、高亮、清除按钮和卡片宽度的人工验收。

远端搜索实现没有完整保留这些行为。整合时应把当前搜索作为主要行为基线，再单独评估是否增加评价搜索。

### 6.5 自动化不能无说明缩减

远端删除了大部分页面、搜索、交互、组件和服务端测试。即使最终确认删除本地 `server/`，也应先识别仍覆盖生产 adapter、搜索和 UI 回归的测试，再迁移到新的测试结构。

## 七、可考虑从远端吸收的内容

以下项目具有复用价值，但仍需与当前实现逐项合并：

1. `request-generation.js` 的独立 latest-request-wins helper。
2. `resource-download.js` 的下载、打开和资源域名校验流程。
3. `docs/DATA_MAPPING.md` 中已经确认的公开字段映射；写入本仓库前需与生产 owner 的正式版本核验。
4. `project.config.json` 中 `urlCheck: true` 的合法域名校验设置。
5. 课程、资源和评价分组使用网站公开 DTO 的方向。
6. 对旧 A–E 分类、四维评分和不存在端点的清理方向。
7. 评价搜索入口——仅在产品 owner 明确接受“搜索结果包含评价”后引入。

## 八、待后续窗口裁决的问题

这些问题目前没有被用户或正式 owner 决定，不能在整合时自行假定：

1. 是否接受远端的“课程＋评价”两类搜索，还是继续保持课程-only 搜索？
2. 是否已经有足够生产证据启用匿名 `POST /reviews`？
3. 是否保留本地 `server/` 作为旧契约参考 mock，还是转为完全客户端-only 仓库？
4. 是否继续保留 12 页建设中骨架，尤其是 `guide-detail` 和 `resource-detail`？
5. develop 环境应连接本地参考 mock，还是与 trial/release 一样强制连接生产 API？
6. 哪些当前 48 个客户端测试和 12 个服务端测试需要迁移或保留？
7. 远端 `docs/DATA_MAPPING.md` 是否与生产 owner 的当前正式映射完全一致？
8. 远端把协作计划标为归档是否经过项目 owner 决定？当前 `AGENTS.md` 与本地状态文档明确相反。

## 九、建议的后续整合路径（尚未决定）

这是一项建议，不是本轮已经授权的操作：

1. 先保存当前 4 个未提交文档修改，并确认其内容归属。
2. 经用户明确授权后，从 `origin/main@f58d85c` 建立专门的集成分支。
3. 不整提交 cherry-pick `c92b7c3`，按模块移植：
   - 课程卡全宽修复；
   - 请求错误清理；
   - public API 白名单与评价精确关联；
   - 搜索筛选、高亮、分页和并发保护；
   - 对应自动化；
   - 当前状态 owner 文档。
4. 对评价写入、本地 server、页面数量和开发环境四项架构问题分别形成明确决定。
5. 先运行 scoped 测试，再运行完整本地验证、`git diff --check` 和小程序静态检查。
6. 最后进行微信开发者工具人工验收；本地测试不得替代真机、体验版或生产证据。

采用 `origin/main` 作为集成底座的理由是：它是团队已经合并的远端事实。采用“人工移植当前分支能力”而不是直接 merge 的理由是：当前分支包含时间更晚、已经验证且安全边界更严格的实现，不能在 42 个冲突中被整体覆盖。

## 十、本轮验证与未执行项

### 已执行

- `git fetch origin`：成功，更新远端跟踪引用；未触碰工作区。
- `git status --short --branch`：确认当前分支和 4 个原有未提交文件。
- `git log`、`git diff`、`git rev-list`、`git merge-base`：确认提交拓扑和路径差异。
- `git merge-tree --write-tree --messages HEAD origin/main`：退出码 1，确认 42 个冲突；未修改工作树或暂存区。
- 最终状态复核：暂存区为空，4 个原有未提交文件保持不变；另一个窗口并发新增的 `docs/SYK_API_HANDOFF.md` 未被本轮触碰。

### 未执行

- 未执行 pull、merge、rebase、checkout、stash、commit、branch 创建或 push。
- 未在远端代码树上运行测试，因为本轮没有切换或物化远端工作树。
- 未运行微信开发者工具、真机、体验版或生产 API 验证。
- 未修改 `docs/COLLABORATION_PLAN.md` 或 `docs/API.md`；本轮只新增本交接记录，不改变项目状态或契约事实。

## 十一、接手窗口的最短检查清单

1. 先读 `AGENTS.md`、`docs/COLLABORATION_PLAN.md`、`docs/API.md`。
2. 运行 `git status --short --branch`，保护现有 4 个未提交文档修改、本交接文件以及另一个窗口并发新增的 `docs/SYK_API_HANDOFF.md`。
3. 确认 `origin/main` 仍指向 `f58d85c`；若远端再次更新，需要重新计算本记录中的差异数字。
4. 不直接执行 merge；先回答第八节的开放问题。
5. 将搜索、评价写入、server/页面删除和测试策略作为四个独立整合块审查。
6. 只有在用户明确授权后，才创建集成分支、提交、合并或推送。
