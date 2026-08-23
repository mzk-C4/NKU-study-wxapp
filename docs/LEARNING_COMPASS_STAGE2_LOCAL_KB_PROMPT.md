# 学习指南针阶段二：本地知识库闭环提示词

> 用途：阶段一内容经产品负责人明确审核后，再复制到同一个新聊天框继续执行。
> 本阶段实现本地解析、校验、状态隔离、引用映射和指南/搜索投影，不实现AI，不修改生产。
> 如果阶段一尚未获批，必须停止。

## 可直接复制的提示词

```text
你现在负责 NKUStudy“学习指南针”的阶段二：基于已经批准的阶段一草稿，建立本地知识库最小闭环。

工作目录：`E:\AI项目集合\NKU-study-wxapp`

## 零、强制前置门槛

先确认用户在当前对话中明确写出类似：

`阶段一内容已审核通过，可以执行阶段二。`

如果没有这项明确批准，立即停止，只报告“等待阶段一人工审核”，不得修改任何文件。

即使阶段一获批，五篇内容仍保持`draft`或人工指定状态；本阶段不得自行把内容改成`published`。

## 一、开始前必须读取和定向

完整读取：

1. `AGENTS.md`
2. 根目录 `API.md`
3. `NKUStudy-handoff.md`（不得输出或使用其中的生产凭据）
4. `docs/COLLABORATION_PLAN.md`
5. `docs/API.md`
6. `docs/LEARNING_COMPASS_UI_CONTENT_CONTRACT.md`
7. `docs/LEARNING_COMPASS_API_REQUIREMENTS.md`
8. `Documents/SOURCE_MANIFEST.md`
9. `Documents/学习指南针内容草稿/CONTENT_INDEX.md`
10. `Documents/学习指南针内容草稿/CONTENT_BACKLOG.md`
11. `Documents/学习指南针内容草稿/STAGE1_CONTENT_REPORT.md`
12. 五篇阶段一指南草稿。

先运行`git status --short --branch`，所有已有改动视为用户工作。

检查以下现有owner和相邻模式：

- `server/src/app.js`
- `server/src/model.js`
- `server/data/seed.json`
- `server/data/runtime.json`
- `server/test/api.test.js`
- `server/test/search-behavior.test.js`
- `scripts/check-miniprogram.js`
- `package.json`中的验证命令。

运行任何仓库脚本前先检查脚本副作用。不要覆盖现有seed，不把本地server变成生产服务。

## 二、阶段二目标

建立以下本地数据流：

```text
SOURCE_MANIFEST + 已批准指南Markdown
  -> 解析器
  -> 结构与引用校验
  -> 本地知识记录（含draft/review/published）
  -> 公共投影（只含published）
  -> 本地指南列表/详情与search-index行为验证
```

本阶段不做：

- AI模型、RAG、向量数据库或模型API；
- AI问答端点；
- 小程序AI页面；
- 生产部署、生产导入或管理接口；
- 真实用户登录、云端会话或个人信息同步；
- `docs/API.md`生产契约修改；
- 将任何草稿自动发布。

## 三、分层职责

根据仓库现有模式选择最窄owner，不为了抽象而重构：

- 内容Markdown：内容事实owner，只读；
- `Documents/SOURCE_MANIFEST.md`：来源身份owner，只读；
- 构建脚本：解析Markdown、生成确定性本地数据；
- 服务端model/helper：状态过滤、来源投影、稳定ID和分类校验；
- 本地reference路由：只负责请求、参数、稳定响应，不承载解析流程；
- 测试：使用独立fixture验证published隔离和引用错误，不修改真实草稿状态；
- 生成数据：明确标注generated，禁止手工维护第二份事实。

不要让页面或路由直接读取源Markdown；不要把解析、状态策略和响应映射混在一个路由文件中。

## 四、最小知识结构

阶段一内容只要求最小字段：

- `id`
- `title`
- `category`
- `status`
- `source_ids`
- `sections`
- `citations`

五分类只允许：

- 选课与修读
- 考试与成绩
- 学籍与毕业
- 学业拓展
- 规范与权益

年级、学院、专业和时间不是必填结构字段。原文确有限制时保留在正文或可选使用提醒中，不为了数据模型强行制造空字段。

每个section生成稳定ID；citation至少包含：

- `source_id`
- `location_label`（章节/条款；无可靠页码时不用页码）

公开source投影至少包含：

- 稳定source ID；
- 标题；
- 官方HTTPS URL；
- location label。

不得向公共数据暴露本地文件路径、内部Markdown路径、审核备注、哈希、模型信息或私有诊断。

## 五、必须实现的行为

### 5.1 解析与构建

- 读取五篇指南Markdown最小头部和章节；
- 读取SOURCE_MANIFEST中的SRC ID与官方URL；
- 构建确定性本地知识数据；
- 同样输入应生成字节稳定或语义稳定的结果；
- 不修改源Markdown。

### 5.2 校验

遇到以下问题失败关闭并给出私有诊断：

- 重复guide ID；
- 未知一级分类；
- 非法status；
- 未知source ID；
- section ID重复；
- citation缺来源或定位；
- published内容没有有效引用；
- 官方URL非HTTPS或包含账号信息；
- 草稿中出现培养方案、seed、课程资料或同学经验作为来源。

### 5.3 状态隔离

- `draft`：内部可读取，不进入公共指南、搜索或AI投影；
- `review`：内部可读取，不进入公共指南、搜索或AI投影；
- `published`：才允许进入公共指南和search-index；
- 本阶段不得把真实五篇草稿改为published；
- 使用test-only fixture验证published行为。

### 5.4 本地指南和搜索投影

- 本地模型能够输出目标五分类；
- 指南详情能够表达`sections/sources`及citation关联；
- 只把published指南投影到列表、详情和search-index；
- 保留旧接口兼容边界，不破坏当前测试；
- 如果正式接口尚未支持五分类，使用明确的local-only/target fixture边界，不修改正式`docs/API.md`冒充已上线。

## 六、建议交付物

具体文件位置以仓库相邻模式为准，但至少交付：

1. 一个内容构建/校验脚本；
2. 一个本地知识模型或helper；
3. 明确标记的生成数据或内存投影；
4. 独立测试fixture；
5. 定向自动化测试；
6. `docs/LEARNING_COMPASS_STAGE2_LOCAL_KB_REPORT.md`；
7. 同步`docs/COLLABORATION_PLAN.md`的真实状态。

禁止：

- 新建第二套生产server；
- 添加模型密钥或环境秘密；
- 修改生产数据；
- 登录服务器；
- 部署；
- 暂存、提交、推送或创建PR；
- 删除或移动用户文件；
- 无关重构、依赖升级和批量格式化。

## 七、测试要求

至少覆盖：

- 五分类合法值；
- 五篇真实draft全部被解析；
- draft/review不出现在公共投影；
- test-only published指南进入列表、详情和search-index；
- published无citation时失败；
- 未知source ID失败；
- 重复ID失败；
- 非HTTPS官方URL失败；
- section/source稳定ID；
- 不泄露本地路径或内部字段；
- 现有指南与搜索测试不回归。

按风险运行：

- 新增/修改JavaScript的`node --check`；
- 定向本地知识库测试；
- 相关server测试；
- 相关客户端契约或`verify:quick`（仅在接口投影影响客户端时）；
- `git diff --check`。

没有运行的验证必须标为`SKIP`，失败必须如实保留。

## 八、完成定义

阶段二只有同时满足以下条件才算完成：

- 五篇draft可被解析并通过来源校验；
- SOURCE_MANIFEST引用均能解析；
- 状态隔离有自动化证据；
- test-only published内容可以完成本地指南/详情/search投影；
- 真实草稿没有被发布；
- 没有修改生产契约、生产数据或生产服务；
- 报告记录文件、命令、PASS/FAIL/SKIP、风险和下一步。

最终回复需要列出：

- 实际修改文件；
- 本地数据流；
- 测试结果；
- 未运行项；
- 剩余风险；
- 后续进入AI阶段和后端交接前还需要什么。
```

## 使用顺序

只有阶段一结果经我们审核并明确批准后，才执行本提示词。推荐继续使用同一个新聊天框，以便它保留阶段一文件和审查上下文。
