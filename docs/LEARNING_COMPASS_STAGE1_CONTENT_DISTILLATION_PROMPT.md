# 学习指南针阶段一：内容沉淀提示词

> 用途：复制本提示词到新的 Codex/AI 聊天框，在当前仓库中完成第一阶段内容沉淀。
> 本阶段只创建内容草稿和审查报告，不修改业务代码、API、服务端或生产数据。
> 完成后必须停止，等待产品负责人审核，再进入阶段二。

## 可直接复制的提示词

```text
你现在负责 NKUStudy“学习指南针”的阶段一：把已经准备好的正式源材料沉淀成五分类知识候选和首批指南草稿。

工作目录：`E:\AI项目集合\NKU-study-wxapp`

## 一、开始前必须读取

按顺序完整读取：

1. `AGENTS.md`
2. 根目录 `API.md`
3. `NKUStudy-handoff.md`（只了解背景；不得输出或使用其中的生产凭据）
4. `docs/COLLABORATION_PLAN.md`
5. `docs/LEARNING_COMPASS_UI_CONTENT_CONTRACT.md`
6. `docs/LEARNING_COMPASS_FIVE_CATEGORY_CONTENT_AUDIT.md`
7. `docs/LEARNING_COMPASS_SOURCE_MATERIAL_PREPARATION_CHECKLIST.md`
8. `Documents/SOURCE_MANIFEST.md`

运行 `git status --short --branch`，所有已有modified、staged和untracked内容均视为用户工作，不清理、不回滚、不覆盖无关改动。

## 二、允许使用的源材料

本阶段使用：

- `SRC-001` 学生手册完整Markdown；
- `SRC-002` 当前选课通知Markdown；
- `SRC-003` 考试与成绩管理规定Markdown；
- `SRC-004` AI工具使用规范Markdown；
- `SRC-006` 辅修通知Markdown；
- `SRC-007` 微专业通知Markdown；
- `Documents/SOURCE_MANIFEST.md`登记的独立官方原文链接。

`SRC-005`转专业仍在独立整理，本阶段不依赖它，也不因此停止其他内容。

禁止使用：

- 培养方案PDF/HTML；
- 课程资料、笔记、试题、评价和同学经验；
- `server/data/seed.json`或`runtime.json`中的示例正文；
- 模型记忆、搜索摘要或未经登记的网络材料；
- 南发字〔2026〕82号的猜测内容。

## 三、五个一级分类

只能使用UI合同确认的五类：

1. 选课与修读
2. 考试与成绩
3. 学籍与毕业
4. 学业拓展
5. 规范与权益

不要创建辅助标签、二级分类或跨分类字段。每篇指南只选择一个一级分类。

## 四、关于元数据的产品决定

不要把“年级、学院、专业、时间”设计成知识条目必填字段，也不要为了字段完整而猜测。

每篇草稿只使用以下最小头部：

```yaml
---
id: 稳定英文或拼音短ID
title: 中文标题
category: 五个中文一级分类之一
status: draft
source_ids:
  - SRC-xxx
---
```

只有原文明确限制且不说明会导致误解时，才在正文的“使用提醒”中说明适用对象或学期；不建立独立的年级、学院、专业、时间字段。

来源的发布主体、文号、日期、原始路径和官方URL继续由`Documents/SOURCE_MANIFEST.md`持有，不在每条知识中重复维护。

## 五、阶段一交付物

在 `Documents/学习指南针内容草稿/` 下创建：

```text
CONTENT_INDEX.md
CONTENT_BACKLOG.md
STAGE1_CONTENT_REPORT.md
guides/
  guide-course-selection-2026-fall.md
  guide-grade-review.md
  guide-resume-study.md
  guide-micro-major-2026.md
  guide-ai-coursework.md
```

### 5.1 CONTENT_INDEX.md

登记五篇草稿：ID、标题、一级分类、状态、来源ID和文件路径。

不要加入用户画像字段、搜索关键词、向量字段或API DTO。

### 5.2 CONTENT_BACKLOG.md

按五分类列出后续可整理的指南题目，并记录：

- 建议标题；
- 能回答的核心问题；
- 来源ID；
- 当前状态：`candidate / blocked / deferred`；
- 若blocked，写清具体原因。

至少覆盖UI合同中每个分类的全部内容范围，但本轮只写候选清单，不展开成全部正文。

### 5.3 首批五篇指南

1. 选课与修读：`2026—2027第一学期2025级选课时间安排`
2. 考试与成绩：`对课程成绩有异议，如何申请复核？`
3. 学籍与毕业：`休学期满后如何申请复学？`
4. 学业拓展：`2026年微专业如何申请？`
5. 规范与权益：`本科课程作业中如何规范使用AI工具？`

每篇正文统一采用：

```markdown
---
最小头部
---

# 标题

## 直接回答
用简洁中文直接回答用户问题。

## 具体内容
根据需要分章节或步骤。

## 使用提醒
只写原文明示且理解答案必须知道的限制；没有则省略。

## 原文依据
- `[SRC-xxx｜原文件章节/条款]`

## 尚未确认
只有确实存在未决问题时才保留；没有则省略。
```

事实性段落必须能回到一个或多个`SRC`来源及具体章节/条款。没有可靠页码时使用章节或条款，不编造页码。

### 5.4 STAGE1_CONTENT_REPORT.md

报告必须包含：

- 实际读取的源文件；
- 五篇草稿列表；
- 每篇来源覆盖情况；
- 发现的数字、日期、否定词和版本风险；
- 未纳入正文的内容及原因；
- 五分类backlog数量；
- 需要产品负责人决定的问题；
- 已运行的检查和真实结果。

## 六、内容规则

1. 先给直接答案，再解释步骤或规则。
2. 忠实概括，不整段复制制度，不扩大适用范围。
3. 学校规则和学期通知冲突时分别呈现，不能私自合并。
4. 自修GPA、门数和日期存在来源差异：首篇选课时间指南不涉及这些字段；backlog中标记为blocked，不尝试解决。
5. 培养方案不作为来源；涉及个人专业课程或毕业要求时，只能提醒用户查看本人教学管理信息系统。
6. 课程资料、评价和同学经验不能进入正文或来源。
7. 所有文件状态必须保持`draft`，不得改成`review`或`published`。
8. 不创建API字段，不修改`docs/API.md`。
9. 不修改源Markdown、原始PDF或`Documents/SOURCE_MANIFEST.md`。

## 七、检查要求

至少检查：

- 五篇文件和三个索引/报告文件均存在；
- 五个一级分类各有一篇草稿；
- 所有草稿`status: draft`；
- 所有`source_ids`都存在于SOURCE_MANIFEST；
- 每条关键事实都有章节/条款定位；
- 没有培养方案、seed、课程资料或同学经验来源；
- 没有强制年级/学院/专业/时间元数据字段；
- 没有把自修差异写成统一结论；
- `git diff --check`通过。

不要运行无关代码测试。不要提交、暂存、推送或创建PR。

## 八、停止门槛

阶段一完成后必须停止，不要继续实现解析器、数据库、接口、server、搜索或AI功能。

最终回复必须说明：

- 创建和修改的文件；
- 五篇草稿各自使用哪些来源；
- 检查结果；
- 仍存在的风险；
- 明确请求产品负责人审核阶段一结果。
```

## 使用顺序

1. 在新聊天框执行本提示词；
2. 将新聊天框的最终报告和创建文件清单反馈回来；
3. 我们审核并确认阶段一内容；
4. 明确批准后，再执行阶段二提示词。
