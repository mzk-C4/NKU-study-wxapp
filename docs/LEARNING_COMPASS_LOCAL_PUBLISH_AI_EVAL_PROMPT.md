# 学习指南针本地发布、AI最小闭环与验收提示词

> 用途：阶段一、阶段二完成后，在原新聊天框继续执行。
> 本提示词合并本地published、AI检索mock和30题验收，减少不必要的阶段拆分。
> “published”只表示本地知识投影可见，不代表生产发布、部署或用户可见。

## 可直接复制的提示词

```text
你现在继续完成NKUStudy“学习指南针”的本地发布、AI最小闭环和本地验收。

工作目录：`E:\AI项目集合\NKU-study-wxapp`

## 一、已获得的明确授权

产品负责人已经确认：

1. 阶段一内容已批准；
2. 阶段二本地知识库闭环已完成；
3. 五篇已经审核的指南可以标记为“本地published”用于真实本地投影和测试；
4. 这不授权生产发布、部署、修改正式API、提交或推送；
5. `draft/review/published`三层继续作为长期流程保留，但本批五篇不再额外等待review状态。

如果实际文件或状态与上述事实不一致，先停止并报告，不自行修复来源内容。

## 二、开始前读取

完整读取：

- `AGENTS.md`
- 根目录`API.md`
- `NKUStudy-handoff.md`（不得输出或使用其中凭据）
- `docs/COLLABORATION_PLAN.md`
- `docs/API.md`
- `docs/LEARNING_COMPASS_UI_CONTENT_CONTRACT.md`
- `docs/LEARNING_COMPASS_STAGE2_LOCAL_KB_REPORT.md`
- `docs/LEARNING_COMPASS_API_REQUIREMENTS.md`
- `Documents/SOURCE_MANIFEST.md`
- `Documents/学习指南针内容草稿/`全部8个阶段一文件
- `server/src/learning-compass.js`
- `scripts/build-learning-compass.js`
- `server/test/learning-compass.test.js`
- `server/src/app.js`、`model.js`和现有测试。

先运行`git status --short --branch`，保护所有用户工作。不得清理、回滚、移动或批量格式化无关文件。

## 三、第一部分：同步SRC-005与本地published

### 3.1 SRC-005

确认：

- `Documents/今日Chrome下载_转专业与辅修材料/完整打包/`包含29份转专业Markdown；
- 文件均非空且有一级标题；
- `Documents/SOURCE_MANIFEST.md`中SRC-005已经是`ready`。

将`CONTENT_BACKLOG.md`中的“2026年转专业如何申请？”从`blocked`改为`candidate`，原因改为SRC-005材料已齐、学院规则需分别引用。

同步backlog统计：

- `candidate`从34改为35；
- `blocked`从2改为1；
- `deferred`保持3；
- 合计仍为39。

不要在本轮批量生成29篇学院指南，也不要把各学院规则合并成一条全校规则。

### 3.2 本地published

把阶段一五篇已审核指南的frontmatter从：

```yaml
status: draft
```

改为：

```yaml
status: published
```

同步`CONTENT_INDEX.md`五篇状态。

只修改状态，不改动已经批准的正文、标题、分类、ID、source_ids和引用定位。

重新运行构建脚本，确认真实生成数据中五篇均为published，五分类列表、详情和search-index真实投影均为5篇，而不是继续使用test-only published副本。

## 四、第二部分：本地AI最小闭环

本阶段只实现确定性的本地检索和回答mock，不接外部模型，不使用密钥，不做向量数据库。

建议数据流：

```text
用户问题
  -> 输入校验
  -> 仅检索published指南的标题、摘要和sections
  -> 稳定排序
  -> 命中时返回直接回答、适用提醒和citations
  -> 无可靠命中时明确拒答
  -> provider故障时返回AI_UNAVAILABLE
```

分层要求：

- `learning-compass.js`继续拥有知识解析、状态和公共投影；
- 新的本地assistant/provider模块拥有问题校验、检索、回答和拒答策略；
- `app.js`路由只负责请求、稳定响应和错误映射；
- 不把检索逻辑写进路由或小程序页面；
- 客户端本轮不接入AI端点，UI继续使用现有建设中/断网恢复边界。

### 请求边界

- 问题必填，最多1000字；
- history最多9轮，只作为会话上下文，不作为事实来源；
- profile可选，不要求年级、学院、专业或时间；
- 每次只检索当前published知识；
- 不读取培养方案、课程资料、评价、笔记或seed正文。

### 回答边界

- 命中时先返回直接回答；
- 返回实际指南ID、一级分类和至少一个有效citation；
- citation使用阶段二公共source白名单，不暴露本地路径；
- 没有足够依据时返回明确的无法确认，不生成校内规则；
- 自修GPA、门数和日期问题必须拒答或分别提示来源冲突；
- 不把历史assistant文本当成事实；
- provider异常映射为稳定`AI_UNAVAILABLE`，不返回内部堆栈。

AI路由只能作为local/reference可选能力；默认生产profile、正式`docs/API.md`和生产服务均不得改变。

## 五、第三部分：30题本地验收

建立至少30个真实测试问题，建议：

- 五篇published指南每篇5题，共25题；
- 5题无依据/越界问题，用于验证拒答；
- 自修冲突至少占1题；
- 培养方案或课程资料越界至少占1题；
- 问题覆盖同义表达和简短口语表达。

每题记录：

- question；
- expected guide ID或`refuse`；
- expected citation source ID；
- 实际结果；
- PASS/FAIL。

验收门槛：

- 总体正确率至少90%；
- 命中回答引用存在率100%；
- 无依据不编造100%；
- draft/review泄露为0；
- 本地路径和内部字段泄露为0；
- provider故障降级100%。

## 六、必须测试

- 真实五篇published进入五分类指南列表；
- 详情包含sections/sources；
- search-index包含五篇且无重复type:id；
- draft/review fixture仍被隔离；
- AI只检索published；
- 空问题、超长问题和非法history失败关闭；
- 命中返回citation；
- 无依据和自修冲突拒答；
- provider故障返回AI_UNAVAILABLE；
- 30题门槛；
- 现有server与客户端测试不回归；
- 构建`--check`和`git diff --check`通过。

必须保留中途FAIL及修正记录，不通过删除测试或修改无关功能掩盖失败。

## 七、交付物

至少交付：

- 五篇published状态与同步后的CONTENT_INDEX；
- 更新后的CONTENT_BACKLOG统计；
- 重新生成的learning-compass.generated.json；
- 本地AI检索/provider模块；
- local-only路由和稳定错误；
- 30题fixture与自动化评估；
- `docs/LEARNING_COMPASS_LOCAL_PUBLISH_AI_EVAL_REPORT.md`；
- 同步`docs/COLLABORATION_PLAN.md`。

## 八、禁止事项

- 不修改`docs/API.md`冒充正式契约；
- 不调用外部AI或安装模型依赖；
- 不实现生产RAG、向量数据库或模型密钥；
- 不修改小程序AI在线调用；
- 不部署、不写生产数据、不登录服务器；
- 不暂存、提交、推送或创建PR；
- 不删除或移动用户材料；
- 不把29份转专业规则强行合并；
- 不改变五篇已批准正文，除status外不得重写。

## 九、最终汇报

最终说明：

- 五篇是否已成为本地published；
- SRC-005与backlog统计；
- 本地指南/详情/search真实投影；
- AI检索和拒答边界；
- 30题准确率与硬门槛；
- PASS/FAIL/SKIP；
- 未运行的生产、真机和外部AI项；
- 距离后端正式契约和生产发布还差什么。
```

## 使用方式

推荐继续在完成阶段二的同一个新聊天框执行本提示词，以复用它对解析器、状态隔离和测试fixture的理解。
