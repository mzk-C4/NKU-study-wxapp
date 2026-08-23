# 学习指南针 AI 不可用降级状态视觉设计提示词

> 页面：学习指南针 AI 问答
> 状态：请求等待并自动重试后仍不可用
> 已批准视觉参考：`图片和附件/learning-compass-home-approved-20260823.png`
> 内容合同：[`LEARNING_COMPASS_UI_CONTENT_CONTRACT.md`](./LEARNING_COMPASS_UI_CONTENT_CONTRACT.md)

## 可直接复制的视觉设计提示词

```text
You are the principal UI/UX and visual designer for NKUStudy.

Using the supplied, product-owner-approved “学习指南针” home screen as the authoritative Style DNA reference, design one high-fidelity mobile UI screen for the AI-unavailable fallback state of the “学习指南针 AI 问答” subpage.

This is a safe recovery state after one request waited up to 30 seconds, the system automatically retried once, and the AI or retrieval service still did not return a usable answer.

The purpose of this page is not to dramatize an error. It must calmly explain that AI is temporarily unavailable, preserve the user’s context, and provide immediate paths to the ordinary guide library and ordinary search. The rest of the Learning Compass remains usable.

OUTPUT

- One single portrait mobile screen, approximately 9:19.5, suitable for 1080×2400.
- No phone frame, annotations, measurements, or multi-state collage.
- Production-ready WeChat Mini Program subpage with a clear back affordance.
- Do not add a fifth AI tab and do not force the main bottom tab bar onto this subpage.
- Show only this AI-unavailable fallback state. Do not include a successful answer, loading spinner, empty guide list, permission error, or network-debug screen.
- All visible UI text is clear Simplified Chinese.

PAGE POSITIONING

Page name:
“学习指南针 AI 问答”

Core task:
Explain that AI cannot answer right now and help the student continue through the ordinary guide library or ordinary search without losing the current question or prior local conversation.

HARD PRODUCT TRUTHS

1. A request can wait up to 30 seconds and automatically retry once.
2. After the retry still fails, the UI must stop automatic retries and offer recovery paths.
3. Ordinary guides, guide details, source documents, and ordinary search still work independently of AI.
4. Do not fabricate an answer, partial answer, citation, success state, or fake cached result.
5. Do not expose raw provider errors, stack traces, request IDs, model names, internal codes, or diagnostics.
6. Existing completed local conversation history must not be cleared because of this failure.
7. The current question or input draft should be preserved or visibly recoverable.
8. A controlled manual retry may be offered, but the design must not imply infinite automatic retry.
9. NKUStudy is student-built and not an official university AI service.

PRESERVED QUESTION

“我对一门课程的成绩有异议，应该怎么申请复核？”

PRIMARY ERROR COPY

Title:
“暂时无法使用 AI 问答”

Body:
“本次请求已自动重试，仍未获得回答。普通指南和搜索可以继续使用，你的问题和已有会话不会被清除。”

PRIMARY RECOVERY ACTIONS

- “浏览知识库”
- “去普通搜索”

OPTIONAL CONTROLLED ACTION

- “重新尝试”

Supporting note:
“如需立即确认重要事项，请查看对应官方文件。”

P0 — MUST BE CLEARLY PRESENT

- Clear AI-unavailable explanation.
- The preserved current question or a clear statement that it is retained.
- “浏览知识库” action.
- “去普通搜索” action.
- Reassurance that ordinary guide functions remain available and existing local conversation is not cleared.

P1 — IMPORTANT BUT MAY BE VISUALLY SUBORDINATE

- A controlled manual “重新尝试” action.
- Short explanation that automatic retry has stopped.
- Reminder to check official documents for urgent or high-stakes matters.

P2 — SUPPORTING

- Quiet student-built/non-official identity.
- A concise “稍后再试” suggestion without promising a recovery time.

MOBILE EXPERIENCE REQUIREMENTS

- Make the recovery choices obvious and comfortably tappable.
- Avoid a dead end: the student must have an immediate next step.
- Preserve a calm, concise, non-blaming tone.
- Do not use color alone to communicate failure.
- Keep the preserved question readable without making it look like a successful answer.
- Respect safe areas, keyboard behavior, large text, and narrow-screen wrapping.
- The page should feel recoverable, not catastrophic.

BRAND & APPROVED STYLE DNA

- Match the approved Learning Compass home screen’s Nankai purple, warm-white and pale-lilac surfaces, restrained gold, clear Chinese typography, gentle borders, and polished student-built academic character.
- The approved AI speech-bubble icon may appear in a quiet, subdued error-state treatment, but do not use a sad robot, broken robot, warning siren, or dramatic illustration.
- Use soft, trustworthy hierarchy. Error color can be a minor supporting signal, not the dominant page identity.
- Do not copy the home screen structure or show its categories and guide list inside this subpage.

DESIGN FREEDOM

Freely decide the fallback-state composition, relationship between preserved question and error explanation, action hierarchy, optional manual retry placement, use of illustration or icon, spacing, surfaces, and visual rhythm.

You may combine or simplify P1/P2 content. Do not remove the two ordinary recovery paths, hide the retained-context meaning, or make manual retry the only available action.

NEGATIVE CONSTRAINTS

- Do not show a fake AI answer or citation.
- Do not show raw technical errors, “500”, provider names, stack traces, request IDs, logs, or debug controls.
- Do not blame the user or say their question is invalid unless that is the actual state; this image represents service unavailability.
- Do not use a full-screen alarming red treatment, destructive visual language, or panic-inducing copy.
- Do not add auxiliary tags, categories, “培养方案”, course materials, reviews, or uploaded student content.
- Do not add customer service, teacher chat, membership, points, social sharing, or other nonexistent business.
- Do not use neon AI, glassmorphism, robot mascots, sci-fi dashboards, or marketing composition.
- Do not include normal answer, loading, empty, or permission states in the same image.

FINAL QUALITY BAR

At first glance, the student should understand:

1. AI is temporarily unavailable.
2. The system already stopped after its controlled retry.
3. Their question and prior local conversation are not lost.
4. They can immediately browse the ordinary knowledge base or use ordinary search.
5. Important matters should still be checked against official documents.

The result must feel calm, honest, helpful, mobile-native, and unmistakably part of the approved NKUStudy Learning Compass design family.
```

## 评审重点

- [ ] 清楚说明AI暂不可用，但没有暴露技术错误；
- [ ] 用户原问题或保留语义清楚；
- [ ] “浏览知识库”和“去普通搜索”均为明显可达入口；
- [ ] “重新尝试”不是唯一出路，也没有无限重试暗示；
- [ ] 没有伪造回答、来源或成功状态；
- [ ] 视觉平静、可信，与批准首页属于同一产品家族。
