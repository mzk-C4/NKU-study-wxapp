# 学习指南针 AI 已有回答状态视觉设计提示词

> 页面：学习指南针 AI 问答
> 状态：产品负责人已批准最终视觉；批准图优先于本提示词中不同的探索性布局描述
> 已批准视觉：`图片和附件/learning-compass-ai-answer-approved-20260823.png`
> 已批准视觉参考：`图片和附件/learning-compass-home-approved-20260823.png`
> 内容合同：[`LEARNING_COMPASS_UI_CONTENT_CONTRACT.md`](./LEARNING_COMPASS_UI_CONTENT_CONTRACT.md)

## 可直接复制的视觉设计提示词

```text
You are the principal UI/UX and visual designer for NKUStudy.

Using the supplied, product-owner-approved “学习指南针” home screen as the authoritative Style DNA reference, design one high-fidelity mobile UI screen for the normal answered state of the “学习指南针 AI 问答” subpage in the NKUStudy WeChat Mini Program.

Inherit the approved home’s Nankai purple, warm-white and pale-lilac surfaces, restrained gold, clean Chinese typography, soft borders, rounded character, simple icon language, and friendly academically credible student-built tone. Do not copy the home page layout, five-category row, recent-update list, or bottom-tab composition.

OUTPUT

- One single portrait mobile screen, approximately 9:19.5, suitable for 1080×2400.
- No device frame, annotations, measurements, or collage.
- A production-ready WeChat Mini Program subpage with a clear back affordance.
- Do not add a fifth AI bottom tab and do not force the main tab bar onto this subpage.
- Show one normal state in which the user has asked a question and the AI has returned a complete answer with a real citation.
- Do not include loading, timeout, unavailable, empty, refusal, or network-error states in this image.
- All visible UI text is Simplified Chinese and must remain legible.

PAGE POSITIONING

Page name:
“学习指南针 AI 问答”

Core task:
Allow a Nankai undergraduate to ask one learning-rule question, receive a direct answer with applicable scope and source evidence, open the original document, and continue asking about the same topic.

This AI is a guide to a reviewed institutional knowledge base. It is not a general chatbot, not an official university assistant, and not a source of unsupported advice.

HARD PRODUCT TRUTHS

1. AI searches only the first-stage independent guide knowledge base built from reviewed student handbooks, official notices, and formal documents provided by the product owner.
2. AI does not read course notes, uploaded materials, course reviews, teacher reviews, exam papers, or student experiences.
3. One conversation focuses on one topic.
4. A user input is limited to 1000 Chinese characters; one conversation supports at most 10 completed question-answer rounds; local conversation history is kept for 30 days.
5. Entry year and major are optional local context. Missing major information must not block the question.
6. Factual answers require valid citations. A source marker near the answer and an actionable source item must be connected.
7. AI must state the answer’s applicable scope and time/version limits.
8. AI must not show internal model names, confidence percentages, retrieval logs, tokens, system prompts, secrets, or debug details.
9. Multiple versions or scopes must be shown separately rather than silently merged.
10. AI is not a bottom-tab destination.
11. The product-owner-approved image adds a shared local-conversation toolbar below the title: a list icon with “对话记录” and a circled plus icon with “新开话题”. This approved structure is required even though it was not part of the earlier exploratory prompt.
12. “对话记录” opens a left-side drawer rather than a bottom sheet. The drawer contains a conversation search field, pin/unpin controls, and groups for “置顶 / 今天 / 昨天 / 7天内 / 30天内”. It contains no user avatar or profile footer.
13. “查看原文” is a navigation action, never a copy action. Until the source library and route are ready, keep the visible control but show a truthful “原文跳转正在建设中” placeholder instead of copying a URL or simulating navigation.

CURRENT LOCAL CONTEXT

Show a quiet, editable context indicator:
“2025级 · 专业未设置”

It must look optional and non-blocking, not like an incomplete required form.

USER QUESTION

“我对一门课程的成绩有异议，应该怎么申请复核？”

AI DIRECT ANSWER

“你可以在下一学期开学3周内，向开课单位提出书面申请。开课单位受理后会组织人员复议，并给出复议意见；超过时限，开课单位可以不予受理。[来源1]”

FOLLOW-UP EXPLANATION

“如果复议后确需更改成绩，任课教师不能直接修改。应由任课教师填写成绩更改申请，经开课单位审批、系统提交并由教务部批准后完成更改。[来源1]”

APPLICABLE SCOPE

“适用：南开大学本科课程成绩”

TIME / VERSION NOTE

“依据教字〔2024〕2号；如后续发布新规定，以最新官方文件为准。”

SOURCE 1

Marker:
“来源1”

Title:
“《南开大学本科课程考试与成绩管理规定》”

Document number:
“教字〔2024〕2号”

Relevant location:
“第十四条、第十五条”

Action:
“查看原文”

Interaction meaning:
Navigate to the located original source when the source route is available. The current engineering preview only shows “原文跳转正在建设中”; it must not copy the source URL.

CONTINUATION INPUT

Visible input label or placeholder:
“继续追问这个问题”

Primary action:
“发送”

Optional conversation controls, if they fit without competing with the answer:

- “新开话题”
- “清除记录”
- “第1/10轮”

P0 — MUST BE CLEARLY PRESENT

- Page identity as the Learning Compass AI subpage.
- The user’s current question.
- The direct answer.
- Applicable scope.
- The source marker and the source document with “查看原文”.
- Version/official-priority reminder.
- A way to continue asking about the same topic.
- The visible “对话记录” and “新开话题” actions with their corresponding icons.
- The left conversation drawer with search, pinning and 30-day time grouping.

P1 — IMPORTANT BUT MAY BE VISUALLY SUBORDINATE

- Optional local context “2025级 · 专业未设置”.
- Follow-up explanation about formal grade changes.
- Conversation round, new-topic, clear-history, and 30-day-local-save semantics.
- A concise reminder that AI answers are based on reviewed documents.

P2 — SUPPORTING

- Short AI capability boundary.
- Quiet student-built/non-official identity.
- Non-blocking reminder to set a major later for more precise retrieval.

MOBILE EXPERIENCE REQUIREMENTS

- Design for a narrow touch screen and short mobile sessions.
- Keep the answer readable as long-form Chinese content, not as dense chat bubbles with tiny text.
- The user question and AI answer must be distinguishable without relying only on color.
- Citation and source access must be obvious but not visually louder than the answer.
- The input must remain reachable above the safe area and keyboard in a real implementation.
- Long source titles, document numbers, scope, and answer paragraphs must wrap naturally.
- Use comfortable touch targets and large-text accessibility.
- Restore the current topic, answer, round, and input draft when returning from the source document.

BRAND & APPROVED STYLE DNA

- Match the approved Learning Compass home screen’s visual quality and family resemblance.
- Use the same deep-purple product identity, warm white, pale lilac, restrained gold, clean text hierarchy, gentle borders, and soft purposeful depth.
- The approved smiling speech-bubble AI icon may be reused or adapted as a subtle identity cue, but do not turn it into a robot mascot or large illustration.
- Keep the experience academically credible, calm, friendly, and content-first.
- Do not reproduce the home page’s header composition, search bar, category row, guide list, or bottom tab bar.

DESIGN FREEDOM

Freely decide the conversation composition, input treatment, visual distinction between question and answer, scope/version presentation, citation marker, source item, session controls, spacing, hierarchy, and whether to use cards, grouped surfaces, or a mixed reading structure.

You may compress or quiet P1/P2 information. Do not remove P0, fabricate a second source, or change the legal meaning of the supplied answer.

NEGATIVE CONSTRAINTS

- Do not show auxiliary tags, categories, or “培养方案”.
- Do not show course notes, reviews, teacher content, or uploaded student materials as sources.
- Do not add recommended questions, trending questions, social sharing, likes, ranking, points, membership, or gamification.
- Do not show AI confidence percentages, model names, token counts, or internal reasoning.
- Do not create a neon AI interface, cyberpunk gradient, glassmorphism, robot mascot, or sci-fi dashboard.
- Do not make every message, scope note, warning, and source an equal floating card.
- Do not show loading, retry, unavailable, refusal, or error states.
- Do not place multiple page states in one image.

FINAL QUALITY BAR

At first glance, the student should understand:

1. What they asked.
2. The direct answer and deadline.
3. Who the answer applies to.
4. Which official document supports it.
5. How to open the original source.
6. How to continue the same topic.

The result must feel like a natural subpage of the approved NKUStudy Learning Compass home: polished, trustworthy, mobile-native, readable, traceable, and useful without pretending to be an official university AI.
```

## 评审重点

- [ ] 用户问题、直接回答、适用范围、版本提醒和来源全部清楚；
- [ ] `[来源1]` 与来源条目、“查看原文”关系明确；
- [ ] “查看原文”表达跳转而非复制；当前未接资料库时只显示建设中提示；
- [ ] “对话记录”从左侧抽屉展开，支持搜索、置顶和30天内分组，且没有个人资料区；
- [ ] `2025级 · 专业未设置` 是可选上下文，不阻塞提问；
- [ ] 能继续同主题追问，但没有推荐问题或泛聊天功能；
- [ ] 与批准首页风格一致但没有复制首页结构；
- [ ] 没有课程资料、辅助标签、培养方案、模型内部信息或虚构功能。
