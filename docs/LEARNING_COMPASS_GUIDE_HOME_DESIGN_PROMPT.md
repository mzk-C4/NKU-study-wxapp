# 学习指南针首页正常状态视觉设计提示词

> 日期：2026-08-23
> 状态：产品负责人已批准对应首页视觉方案
> 页面：微信小程序“学习指南针”首页
> 主要状态：正常、有已发布指南内容
> 已批准视觉：`图片和附件/learning-compass-home-approved-20260823.png`
> 内容基线：[`LEARNING_COMPASS_UI_CONTENT_CONTRACT.md`](./LEARNING_COMPASS_UI_CONTENT_CONTRACT.md)
> 说明：本提示词只生成视觉探索图，不代表页面、接口或生产能力已经实现

> 内容勘误：批准图首条指南显示“更新于 2025-08-17”，正式选课通知日期应为“2026-08-17”；视觉方案批准不等于批准该错误日期，工程实现或最终出图必须修正。

## 使用方式

1. 如条件允许，同时提供当前 NKUStudy 首页截图和 `miniprogram/assets/brand.png` 作为风格参考；
2. 要求模型只继承参考图的 Style DNA，不复制首页 Hero、快捷宫格或课程卡片骨架；
3. 复制下方完整提示词；
4. 一次只生成一张独立的手机页面图，不要在同一画布中放多个版本；
5. 生成结果先按本文末尾的评审清单检查，再决定是否迭代或批准。

## 可直接复制的视觉设计提示词

```text
You are the principal UI/UX and visual designer for NKUStudy, a student-built WeChat Mini Program for Nankai University undergraduate learning information.

Design one polished, high-fidelity mobile UI screen for the normal populated state of the “学习指南针” home page.

This is a real product screen, not a marketing landing page, product poster, wireframe, mood board, or feature presentation. The output should look like a production-ready WeChat Mini Program page captured directly from a phone.

OUTPUT

- One single portrait mobile screen, approximately 9:19.5, suitable for a 1080×2400 presentation.
- No phone hardware frame, no hand holding the phone, no floating annotations, no arrows, no design measurements, no multi-screen collage.
- Use crisp, readable Simplified Chinese UI text.
- Show only the normal state with real guide content. Do not include loading, empty, error, permission, or AI-unavailable states in this image.
- Respect the WeChat safe areas and the existing four-tab bottom navigation.

PAGE POSITIONING

Page name: 学习指南针

Page type: public discovery, browsing, and navigation screen inside the NKUStudy Mini Program.

Core users: Nankai University undergraduate students who need to find reliable learning rules, procedures, and current notices.

Core task: help a student find the right published guide through ordinary keyword search, first-level category browsing, or an AI question entry, while making it clear that information can be traced back to real source documents.

The page must represent the whole learning guide module, not merely course selection.

HARD PRODUCT TRUTHS

1. The page has five and only five first-level categories. Use these exact visible Chinese labels:
   - 选课与修读
   - 考试与成绩
   - 学籍与毕业
   - 学业拓展
   - 规范与权益

2. Do not show auxiliary tags, secondary tags, cross-category tags, tag clouds, or extra category labels. Auxiliary tagging is deliberately deferred.

3. “培养方案” is not a category and must not appear as a guide section, shortcut, feature, or content card. For individual curriculum requirements, the product will later direct users to their own teaching management system; this page does not maintain curriculum plans.

4. The first-stage guide knowledge base uses only reviewed student handbooks, official notices, and formal institutional documents supplied by the product owner.

5. Do not imply that course notes, uploaded study materials, course reviews, teacher reviews, exam papers, or student experiences are AI evidence sources. The existing course-resource library is separate from this guide knowledge base.

6. Ordinary search, category browsing, and guide reading must remain useful without AI. AI is an enhancement, not the prerequisite for using this page.

7. AI opens as a separate page inside the Guide module. Do not create a fifth bottom tab for AI.

8. Only published guides are visible. Do not show review queues, draft status, admin controls, internal paths, moderation metadata, confidence percentages, or system diagnostics.

9. NKUStudy is student-built and is not an official Nankai University platform. Do not visually impersonate an official university administration system.

EXISTING NAVIGATION

Preserve the existing four bottom navigation destinations with these exact labels:

- 首页
- 课程
- 指南
- 我的

“指南” is the selected destination. Do not add an AI tab or any new top-level destination.

P0 — CORE CONTENT THAT MUST BE CLEARLY PRESENT

- The module identity “学习指南针”.
- A concise explanation that this page helps students find Nankai undergraduate learning rules and procedures.
- An ordinary keyword-search entry.
- A clearly discoverable entry to ask the guide AI.
- All five first-level categories.
- A browsable set of published guide entries.
- Each visible guide entry needs a clear title, concise summary, and understandable applicable scope.
- It must be visually obvious that a guide entry can be opened for details.

P1 — IMPORTANT CONTENT THAT MUST EXIST BUT MAY BE VISUALLY SUBORDINATE OR PLACED BELOW THE FIRST FOCAL AREA

- At least one genuinely time-sensitive current item, such as the current semester course-selection schedule.
- Guide update date or applicable year/semester where relevant.
- Scope distinctions such as university-wide, undergraduate, specific grade, or specific semester.
- A recent-updates or currently-relevant content signal, using real content rather than fabricated statistics.
- A subtle optional AI context reminder such as “2025级 · 专业未设置” if it fits the composition. It must not look like a required form or block ordinary browsing.

P2 — SUPPORTING CONTENT THAT MAY BE QUIET, COMBINED, OR PLACED LOWER

- A concise statement that the knowledge comes from reviewed official materials.
- A reminder: “如有冲突，以最新官方文件为准”.
- Data update time or list completion information, only if it improves trust and does not clutter the screen.

VISIBLE CHINESE COPY

Use the following interface copy or very close wording. Keep the terminology consistent and do not replace it with marketing slogans.

Page title:
“学习指南针”

Page description:
“查找南开本科学习规则与办事流程”

Search placeholder:
“搜索选课、成绩、学籍、AI规范等问题”

AI entry title:
“问问学习指南针”

AI entry explanation:
“基于已审核的学校文件回答，并附原文来源”

AI action:
“开始提问”

Trust reminder:
“学生共建 · 重要事项以最新官方文件为准”

REALISTIC GUIDE CONTENT

Use a believable subset of the following real-content examples. The page must feel populated, but do not cram all five full entries above the fold if that harms hierarchy. It is acceptable to show a few complete entries and imply vertical continuation.

Example 1
Category: 选课与修读
Title: “2026—2027第一学期2025级选课时间安排”
Summary: “查看预选、正选、补退选与期中退课安排”
Scope: “适用：2025级 · 2026—2027第一学期”
Updated: “更新于 2026-08-17”

Example 2
Category: 考试与成绩
Title: “对课程成绩有异议，如何申请复核？”
Summary: “了解申请时间、受理单位与复议流程”
Scope: “适用：南开本科生”

Example 3
Category: 学籍与毕业
Title: “休学期满后如何申请复学？”
Summary: “查看办理条件、时间与必要材料”
Scope: “适用：全日制本科生”

Example 4
Category: 学业拓展
Title: “2026年微专业如何申请？”
Summary: “查看招生入口、项目范围与申请提醒”
Scope: “适用：2026年度本科生”

Example 5
Category: 规范与权益
Title: “本科课程作业中如何规范使用AI工具？”
Summary: “了解允许范围、标注要求与禁止事项”
Scope: “适用：南开本科教学”

These examples are content inputs, not instructions for card count, order, or layout. You may choose the subset and visual grouping that best supports a credible mobile page while keeping all five category navigation options present.

MOBILE EXPERIENCE REQUIREMENTS

- Design for touch, vertical scrolling, short interrupted sessions, and a narrow phone viewport.
- Use a clear mobile reading rhythm and progressive disclosure.
- Keep all important interactive controls comfortably tappable.
- Do not rely on hover.
- Long Chinese titles, summaries, scope text, and update labels must wrap or truncate intentionally without breaking the layout.
- Do not use dense desktop tables or a multi-column dashboard.
- Respect large text and accessibility: maintain readable contrast, clear hierarchy, and do not use color as the only status signal.
- The five categories must be discoverable without tiny, cramped text. You are free to choose the best mobile interaction and visual treatment; do not create additional categories or tags.
- The screen should have one clear focal point rather than many equally loud modules.

BRAND & STYLE DNA

Inherit NKUStudy’s confirmed visual DNA, not the page skeleton of an existing screenshot:

- Deep Nankai purple as the main brand identity, used with restraint rather than filling every surface.
- Warm ivory and soft pale-lilac surfaces.
- Muted academic gold used sparingly for important emphasis.
- Deep plum-black primary text and calm grey secondary text.
- Young, trustworthy, student-built, academically grounded, friendly, and suitable for frequent use.
- Soft rounded geometry, subtle thin borders, restrained shadows, and strong Chinese text readability.
- Content-first composition with a mature real-product feeling.
- If an NKUStudy logo or current screenshot is supplied, inherit its color relationships, typography mood, border/rounding character, and overall brand tone. Do not copy its Hero, quick-action grid, course-card structure, or module order.

DESIGN FREEDOM

You are the main UI/UX designer. Freely decide:

- overall composition;
- information grouping;
- the relationship between ordinary search and the AI entry;
- the visual treatment of the five categories;
- list, summary-row, card, or mixed content forms;
- what appears above or below the fold;
- hierarchy, spacing, rhythm, icon usage, and emphasis;
- how P1 and P2 information is combined, quieted, or progressively disclosed.

You may merge, compress, group, or visually subordinate supporting information. Do not delete P0 content, change business meaning, add new business features, or make AI dominate the whole page.

NEGATIVE CONSTRAINTS

- Do not make a marketing landing page.
- Do not use a giant decorative Hero that pushes the core task below the fold.
- Do not create a feature-icon grid copied from the NKUStudy home page.
- Do not turn every item into an isolated floating card or create a repetitive card wall.
- Do not use neon AI gradients, cyberpunk visuals, glassmorphism, holograms, robot mascots, star fields, or futuristic data-dashboard styling.
- Do not add VIP, membership, points, ranking, streaks, badges, followers, social feeds, or gamification.
- Do not add “培养方案”, “资料库”, “课程评价”, “学习笔记”, “教师评价”, or uploaded student materials as guide categories or AI sources.
- Do not add auxiliary tags, tag clouds, multi-select tags, or secondary categories.
- Do not fabricate usage counts, guide counts, popularity rankings, official endorsements, or AI confidence scores.
- Do not show loading, empty, error, or unavailable states in this image.
- Do not render multiple design variants or device frames in one image.

FINAL QUALITY BAR

The result should feel like a natural extension of the existing NKUStudy Mini Program: visually consistent, mobile-native, academically credible, friendly, content-rich without being crowded, and clearly broader than course selection alone.

The first glance should answer:

1. What is this page? — A learning guide for Nankai undergraduate rules and procedures.
2. What can I do now? — Search, browse one of five categories, open a guide, or ask AI.
3. Why should I trust it? — Content is based on reviewed school documents and can be traced to original sources.
```

## 生成结果评审清单

### 业务正确性

- [ ] 页面名称是“学习指南针”，不是“选课指南”；
- [ ] 五个一级分类全部正确，没有“培养方案”；
- [ ] 没有辅助标签、二级标签或标签云；
- [ ] 普通搜索、分类浏览、指南内容和AI入口都存在；
- [ ] AI没有成为第五个TabBar；
- [ ] 没有暗示课程资料、评价、笔记或同学经验是AI来源；
- [ ] 使用了真实、合理的指南内容，没有虚构数据和业务。

### 移动端体验

- [ ] 一眼能理解页面用途和当前可做的事情；
- [ ] 首屏有清晰重点，没有巨大装饰Hero；
- [ ] 五分类在手机上可发现且不拥挤；
- [ ] 中文长标题、摘要和适用范围可读；
- [ ] 主要操作适合触控，底部导航和安全区合理；
- [ ] 没有桌面表格、密集多栏或卡片墙。

### Style DNA

- [ ] 与现有NKUStudy的南开紫、暖白/浅灰紫、低比例金色一致；
- [ ] 整体年轻、可信、有校园学术气质；
- [ ] 圆角、边框和阴影克制；
- [ ] 没有霓虹AI、玻璃拟态、机器人或营销页风格；
- [ ] 继承视觉DNA但没有照抄首页骨架。

### 权威边界

- [ ] 这张图只作为视觉探索证据；
- [ ] 未经产品负责人明确批准，不自动成为正式Style DNA或工程实现依据。
