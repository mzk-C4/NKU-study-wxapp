# 学习指南针指南详情正常状态视觉设计提示词

> 页面：指南详情
> 状态：正常、多章节、带真实引用与多个来源
> 已批准视觉参考：`图片和附件/learning-compass-home-approved-20260823.png`
> 内容合同：[`LEARNING_COMPASS_UI_CONTENT_CONTRACT.md`](./LEARNING_COMPASS_UI_CONTENT_CONTRACT.md)

## 使用方式

向视觉模型同时提供已批准首页图片，并明确“继承 Style DNA，不复制首页骨架”。复制以下提示词，一次只生成一张指南详情竖屏图。

## 可直接复制的视觉设计提示词

```text
You are the principal UI/UX and visual designer for NKUStudy.

Using the supplied, product-owner-approved “学习指南针” home screen as the authoritative visual reference, design one high-fidelity mobile UI screen for the normal populated state of a Guide Detail page in the NKUStudy WeChat Mini Program.

Inherit the approved home screen’s Style DNA — its Nankai purple identity, warm white and pale-lilac surfaces, restrained academic gold, colored category accents, clean Chinese typography, subtle borders and shadows, friendly student-built credibility, icon character, and overall refinement.

Do not copy the home page skeleton, search block, AI home entry, five-category row, recent-update list, or bottom-tab layout. This is a focused long-form reading subpage with its own information architecture.

OUTPUT

- One single portrait mobile screen, approximately 9:19.5, suitable for 1080×2400.
- No phone frame, no annotations, no measurements, no multi-screen collage.
- Production-ready WeChat Mini Program subpage, not a poster or product presentation.
- Crisp, legible Simplified Chinese UI text.
- Show only the normal loaded state. Do not mix loading, 404, empty, source failure, or network error into this image.
- Use a standard mobile subpage navigation treatment with a clear back affordance. Do not add a fifth AI tab or force the main four-tab bar onto this detail subpage.

PAGE POSITIONING

Page name: 指南详情

Page type: long-form reading and source-verification page.

Core task: help a Nankai undergraduate understand a learning rule, know its applicable scope and limits, and open the real source documents supporting each important conclusion.

This is not a generic article reader. Traceability, scope, version risk, and source access are part of the product’s core value.

HARD PRODUCT TRUTHS

1. Only published guide content is visible.
2. The target page supports multiple content sections, paragraph-level citation markers, and multiple source documents.
3. Applicable scope, document date/version, review/update time, and any stricter course or department rule must be distinguishable.
4. Different sources must remain identifiable. Do not merge them into one vague “参考资料”.
5. A source marker near a conclusion and a source item that can open the original document must have a clear relationship.
6. Do not fabricate page numbers or exact anchors that are not provided.
7. “培养方案” and the course-resource library are not evidence sources in the first stage.
8. Related-course navigation, if used, is only navigation. It must not imply that course notes or reviews support the guide.
9. Use the existing correction/feedback path rather than inventing a second feedback system.
10. NKUStudy is student-built, not an official university platform.

GUIDE CONTENT FOR THIS DESIGN

Category:
“规范与权益”

Title:
“本科课程作业中如何规范使用AI工具？”

Direct summary:
“在任课教师或指导教师同意、且不替代作业核心内容和创新能力考查的前提下，可以合理使用AI工具辅助学习。使用AI生成的具体内容应明确说明并标注，同时保留完整使用记录。”

Applicable scope:
“适用：南开大学本科教学”

Scope reminder:
“学院、专业或课程可以制定更严格的具体要求，使用前请先确认任课教师要求。”

Content verification:
“内容核验：2026-08-23”

PRIMARY CONTENT SECTIONS

Section 1 title:
“哪些情况可以使用？”

Section 1 content:
“经任课教师或指导教师同意，可将AI用于文献检索、资料收集、关键词推荐、基础文字校对、格式排版、基于真实数据的辅助制图，以及程序代码的辅助编写、调试和纠错等非核心工作。[来源1]”

Section 2 title:
“使用后需要做什么？”

Section 2 content:
“对AI生成的具体内容，应在课程作业、实验报告或毕业论文（设计）中明确说明和标注，并保存输入指令、生成结果和筛选使用过程，以备核查。[来源1]”

Section 3 title:
“哪些行为禁止？”

Section 3 content:
“不得使用AI生成或篡改核心论点、实验数据和调研数据，不得生成虚假数据图表，也不得用于代写、抄袭或剽窃。期中、期末测试中原则上禁止使用AI；特殊情况应由任课教师提前说明。[来源1][来源2]”

Section 4 title:
“如果违反规定会怎样？”

Section 4 content:
“违规使用AI可能影响课程或毕业论文（设计）考核，构成学术不端的，按照学校相关规定处理。[来源1][来源2]”

SOURCE CONTENT

Source 1:
Title: “《南开大学本科教学人工智能工具使用规范（试行）》”
Document number: “教字〔2025〕5号”
Relevant location: “第八条至第十七条”
Action: “查看原文”

Source 2:
Title: “《南开大学预防与处理学生学术不端行为办法》”
Document number: “南发字〔2025〕27号”
Relevant location: “学术不端认定与处理相关条款”
Action: “查看原文”

Trust reminder:
“如课程要求与本指南不同，以任课教师和最新官方文件为准。”

Correction entry:
Title: “发现内容需要更新？”
Action: “提交纠错”

P0 — MUST BE CLEARLY PRESENT

- Guide title and first-level category.
- Direct summary or conclusion.
- Applicable scope and the stricter-course-rule reminder.
- The multi-section body content.
- Citation markers placed near the conclusions they support.
- Two clearly identifiable source documents with “查看原文” actions.
- Content verification/update information and the official-priority reminder.

P1 — IMPORTANT BUT MAY BE VISUALLY SUBORDINATE OR LOWER ON THE PAGE

- A useful long-content navigation or orientation method, if it improves mobile reading.
- Source document numbers and relevant clause locations.
- Correction entry.
- Optional related navigation only if it remains clearly separate from evidence sources.

P2 — SUPPORTING

- Short source-type explanations.
- Quiet student-built/non-official identity reminder.
- Minor supporting context that does not distract from reading.

MOBILE EXPERIENCE REQUIREMENTS

- Optimize for long-form Chinese reading on a narrow touch screen.
- Maintain a comfortable line length, clear section rhythm, and deliberate spacing.
- Avoid a stack of many disconnected cards. Related content may be grouped, combined, or expressed without cards.
- Citation markers must be visible and understandable without dominating the text.
- Source actions must be comfortably tappable and clearly associated with the correct source.
- Long document names, document numbers, scope text, and paragraph text must wrap naturally.
- Do not use a desktop side-by-side document viewer, dense table, or tiny footnotes.
- Do not rely on color alone for citations, warnings, or source relationships.
- Respect safe areas and large-text accessibility.

BRAND & APPROVED STYLE DNA

- Closely match the approved home screen’s visual quality and brand tone.
- Preserve the airy warm-white foundation, soft pale-lilac areas, deep purple hierarchy, restrained gold emphasis, and selective category color language.
- For this “规范与权益” guide, a restrained red or warm rose accent may support category recognition, but Nankai purple remains the product identity.
- Use crisp, mature Chinese typography and restrained rounded geometry.
- Reuse the approved icon/illustration character only where it serves reading. Do not place the home-page tower illustration or category navigation row here.
- The page should feel like the same product family, not a copy of the home page.

DESIGN FREEDOM

Freely decide the article composition, title treatment, summary and scope presentation, section grouping, citation styling, source presentation, long-content rhythm, and visual weight of correction/supporting information.

You may use cards, grouped surfaces, inline references, section dividers, subtle navigation, or a mixed structure. Do not change the content meaning, hide P0, or sever the relationship between conclusions and sources.

NEGATIVE CONSTRAINTS

- Do not add auxiliary tags, secondary categories, or a tag cloud.
- Do not show “培养方案” or course-material content.
- Do not add AI chat input, chatbot avatars, or an “ask AI” conversation inside the article.
- Do not turn all four sections and both sources into an equal-weight card wall.
- Do not use a huge Hero, marketing banner, neon AI gradient, glassmorphism, robot mascot, or data dashboard.
- Do not fabricate likes, reading counts, rankings, official certification, confidence scores, or social actions.
- Do not show internal IDs, moderation status, admin actions, file paths, or debug details.
- Do not show loading or error states.

FINAL QUALITY BAR

At first glance, the student should understand:

1. What question this guide answers.
2. Who and what situations it applies to.
3. The main allowed, required, and prohibited AI-use rules.
4. Which original documents support each conclusion.
5. How to open the source or report outdated content.

The result must feel calm, trustworthy, readable, mobile-native, academically grounded, and unmistakably part of the approved NKUStudy “学习指南针” design family.
```

## 评审重点

- [ ] 与批准首页属于同一产品家族，但没有复制首页骨架；
- [ ] 多章节长文清楚、可读，不是卡片墙；
- [ ] 适用范围、课程可能更严格、核验时间均清楚；
- [ ] `[来源1]`、`[来源2]` 与底部两个来源能建立关系；
- [ ] 两个“查看原文”入口清楚且适合触控；
- [ ] 没有辅助标签、培养方案、课程资料或AI聊天输入；
- [ ] 没有虚构统计、官方认证或社交功能。
