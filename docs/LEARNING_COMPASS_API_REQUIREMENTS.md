# NKUStudy“学习指南针”新增接口需求（后端交接版）

> 版本：v0.1 草案
>
> 日期：2026-08-21
>
> 用途：交给 `NKUStudy.top` 后端负责人评审和实现
>
> 当前状态：**不是正式 API 契约**，未授权部署、未授权修改生产服务
>
> 当前公开契约：[`docs/API.md`](./API.md)
>
> 方案与本地先行计划：[`LEARNING_COMPASS_IMPLEMENTATION_PLAN.md`](./LEARNING_COMPASS_IMPLEMENTATION_PLAN.md)

## 一、交接结论

当前小程序已有指南列表、指南详情和搜索索引读取接口，但缺少：

1. 多章节、多来源、引用定位的指南详情字段；
2. 面向 AI 问答的公开接口；
3. 知识文件导入、脱敏、审核、发布和撤回的管理接口。

本需求只描述“后端需要补充什么”。阶段一先在本地使用同样的请求/响应形状验证，不要求后端立即导入真实文件或部署 AI。

## 二、必须保持的现有接口

以下接口继续作为基础能力，不能被 AI 替代：

- `GET /api/v1/guides`
- `GET /api/v1/guides/{guideId}`
- `GET /api/v1/search-index`

AI 不可用、超时、限流或没有答案时，客户端仍能使用上述接口浏览、搜索和查看来源。

## 三、公共接口需求

### 3.1 指南详情扩展：多章节、多来源

现有 `GET /api/v1/guides/{guideId}` 保持兼容，增加以下可选字段：

```json
{
  "sections": [
    {
      "id": "stable-section-id",
      "title": "章节标题",
      "body": "正文",
      "citation_ids": ["source-1"]
    }
  ],
  "sources": [
    {
      "id": "source-1",
      "title": "来源名称",
      "url": "https://公开原文地址",
      "location_label": "第 12 页 / 第三章"
    }
  ]
}
```

约束：

- `steps`、`source_title`、`source_url` 暂时保留，旧客户端不能被破坏；
- `sections[].id`、`sources[].id` 在发布后保持稳定；
- 公开响应只允许安全的 HTTPS 地址，不返回内部路径、对象存储密钥、审核字段、私有片段 ID 或模型信息；
- 内容被撤回后，相关 section/source 不得继续出现在公共响应；
- `location_label` 可以是页码、章节或“无法精确定位”，不要求第一阶段自动跳页。

这不是新增路径，而是现有指南详情的兼容扩展。

### 3.2 AI 问答接口

建议路径：

```text
POST /api/v1/guide-assistant/answers
```

请求：

```json
{
  "question": "退补选时需要注意什么？",
  "history": [
    { "role": "user", "content": "上一轮问题" },
    { "role": "assistant", "content": "上一轮回答" }
  ],
  "profile": {
    "admission_year": 2025,
    "major": "用户主动填写的专业"
  }
}
```

请求校验：

- `question` 必填，最多 1000 字；
- `history` 可选，最多 9 轮已完成问答；
- `role` 只允许 `user`、`assistant`；
- `profile.admission_year` 为可选四位年份；
- `profile.major` 为用户主动填写的文本，长度按服务端统一上限校验；
- 不因缺少 `profile` 阻塞普通问答；
- 服务端重新检索当前问题，不能把历史 assistant 文本当成事实来源；
- 只允许检索 `published` 内容。

成功响应：

```json
{
  "code": 0,
  "data": {
    "answer": "直接回答用户问题。",
    "applicable_scope": "2025 级某专业；以当前收录文件为依据",
    "freshness_notice": "如与后续通知冲突，以最新官方文件为准。",
    "citations": [
      {
        "id": "source-1",
        "marker": "来源 1",
        "title": "来源名称",
        "url": "https://公开原文地址",
        "location_label": "第 12 页 / 退补选章节",
        "excerpt": "与回答直接相关的原文片段"
      }
    ]
  }
}
```

回答约束：

- 有事实性结论时至少返回一个有效 citation；
- 没有足够依据时返回明确的“不确定/无法确认”，不能编造校内规则；
- 正式文件、课程知识、同学经验必须能在引用或适用范围中区分；
- 年级、专业、学院或时间范围存在差异时分别说明，不替用户做身份判断；
- `freshness_notice` 应提示知识库收录范围和时效风险；
- 公共响应不得包含模型密钥、内部提示词、私有路径、内部检索分数或诊断堆栈。

失败响应：

| HTTP | `code` | 客户端行为 |
|---|---|---|
| 400 | `INVALID_AI_QUESTION` | 显示输入限制提示，不发起重试 |
| 429 | `RATE_LIMITED` | 显示限流提示，同时保留知识库和搜索入口 |
| 503 | `AI_UNAVAILABLE` | 显示知识库入口和搜索入口，不影响基础浏览 |

服务端策略：

- 单次请求最长等待 30 秒；
- 超时或异常自动重试 1 次；
- 若仍失败，返回普通知识库入口和搜索入口，不影响基础浏览功能；
- 正式公开后默认每用户每日 20 次；内部开发限制通过服务端配置控制，不在客户端写入绕过密钥；
- 未登录阶段使用服务端认可的匿名标识并叠加 IP 滥用控制，后续有账号时再按账号限流；
- 私有日志记录实际失败原因，公共响应只返回稳定错误码和安全提示。

这里的“返回入口”指：服务端返回稳定的 `AI_UNAVAILABLE`，小程序根据该错误码展示本地已知的“浏览知识库”和“去搜索”按钮；不要求服务端返回小程序页面路径，也不允许服务端控制客户端任意跳转。

## 四、管理接口需求

以下接口均为管理员 Cookie 权限，仅在生产后端实现；本地阶段可使用本地文件和脚本模拟相同状态，不调用生产管理接口。

| 方法与路径 | 作用 | 最低要求 |
|---|---|---|
| `POST /admin-api/knowledge-imports` | 上传文件或登记公开 URL，创建 `draft` | 校验文件类型、大小、来源 URL 和公开确认 |
| `GET /admin-api/knowledge-documents` | 按状态查看知识文件 | 不返回密码、Token、私有路径和原始敏感字段 |
| `GET /admin-api/knowledge-documents/{id}` | 查看解析、脱敏、范围和引用定位 | 仅管理员可用；显示 revision |
| `POST /admin-api/knowledge-documents/{id}` | 保存整理结果和最小元数据 | 使用 revision/CAS，避免覆盖他人修改 |
| `POST /admin-api/knowledge-documents/{id}/submit-review` | `draft → review` | 服务端检查必需来源和脱敏状态 |
| `POST /admin-api/knowledge-documents/{id}/publish` | `review → published` | 人工审核通过后原子更新公开指南和 AI 索引 |
| `POST /admin-api/knowledge-documents/{id}/unpublish` | 撤回、纠错或投诉 | 立即退出公共响应和 AI 检索索引 |

状态规则：

- `draft`：正在导入/整理，不能公共读取或 AI 检索；
- `review`：等待人工审核，不能公共读取或 AI 检索；
- `published`：可进入指南、搜索和 AI 索引；
- 撤回后保留内部审计记录，但不再向用户展示。

## 五、暂不要求后端建设

第一阶段不要求：

- 服务端会话保存接口：会话先保存在小程序本机 30 天；
- 个人专业/入学年份同步接口：第一阶段只保存在本机；
- 独立知识搜索接口：先复用 `/guides` 和 `/search-index`；
- 独立来源详情接口：优先使用公开文件 URL 或受控资源地址；
- 缓存管理、向量模型选择或页面视觉字段：等本地原型有证据后再决定。

## 六、生产实现边界

- 生产知识文件、解析、脱敏、审核、索引和模型全部属于 `NKUStudy.top` 后端 owner；
- 本小程序仓库不保存生产原始文件、不保存模型密钥、不调用管理员接口；
- 本地参考 `server/` 只能用于契约和行为验证，不得成为第二套生产服务；
- 后端确认实现后，需先更新正式 API 文档，再由小程序接入；
- 若后端选择不同路径或字段，必须提供迁移映射和错误码对照，不直接修改客户端猜测兼容。

## 七、后端交付与验收清单

- [ ] 确认生产知识文件存储位置、备份和回滚方式；
- [ ] 确认 PDF、Word、网页和脱敏副本的解析能力；
- [ ] 确认 `sections/sources` 是否采用，或提供等价兼容字段；
- [ ] 提供 AI 接口正式路径、请求/响应 JSON 和错误码；
- [ ] 证明只检索 `published` 内容；
- [ ] 证明 30 秒超时、自动重试 1 次、20 次/日限流和 503 降级；
- [ ] 证明撤回后不再出现在公共指南、搜索和 AI 引用中；
- [ ] 更新生产 API 文档并提供非敏感部署版本、健康检查和回滚说明；
- [ ] 不向小程序或交接文档提供任何密码、Token、OpenID、AppSecret 或对象存储密钥。
