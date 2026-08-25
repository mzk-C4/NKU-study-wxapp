# 学习指南针本地发布与AI最小闭环验收报告

> 日期：2026-08-23
> 结论：五篇已审核指南已成为本地`published`，真实本地指南/搜索投影和确定性问答闭环已通过验收
> 边界：仅本地reference与自动化测试；不代表生产发布、生产API可用或小程序已经接入AI

## 一、授权与边界

产品负责人明确授权五篇已审核指南改为本地`published`，用于真实本地投影和测试。本轮没有修改正式`docs/API.md`，没有调用外部模型、安装模型依赖、接入向量数据库、修改小程序AI在线调用、部署、写生产数据、登录服务器、暂存、提交或推送。

本地`draft/review/published`三层流程继续保留；只有`published`进入指南、搜索和assistant检索。测试仍覆盖`draft`和`review`隔离。本轮状态不构成生产内容发布授权。

## 二、SRC-005与内容状态

### SRC-005核验

- `Documents/今日Chrome下载_转专业与辅修材料/完整打包/`共有30份Markdown；
- 其中29份为转专业材料，另1份为SRC-006辅修通知；
- 29份转专业Markdown全部非空且含一级标题；
- `Documents/SOURCE_MANIFEST.md`中的`SRC-005`为`ready`；
- 没有批量生成29篇学院指南，也没有把学院规则合并为全校统一结论。

`CONTENT_BACKLOG.md`已将“2026年转专业如何申请？”从`blocked`改为`candidate`。新统计为：

| 状态 | 数量 |
|---|---:|
| `candidate` | 35 |
| `blocked` | 1 |
| `deferred` | 3 |
| 合计 | 39 |

唯一继续`blocked`的是自修GPA、门数和日期冲突；SRC-006/007细分附件等3项继续`deferred`。

### 五篇本地published

五篇frontmatter和`CONTENT_INDEX.md`均已从`draft`改为`published`；ID、标题、分类、`source_ids`、正文和引用定位未改变。

| 指南ID | 一级分类 | 来源 | 本地状态 |
|---|---|---|---|
| `course-selection-2026-fall` | 选课与修读 | `SRC-002` | `published` |
| `grade-review` | 考试与成绩 | `SRC-003` | `published` |
| `resume-study` | 学籍与毕业 | `SRC-001` | `published` |
| `micro-major-2026` | 学业拓展 | `SRC-007` | `published` |
| `ai-coursework` | 规范与权益 | `SRC-004` | `published` |

## 三、真实本地投影

重新运行`node scripts/build-learning-compass.js`后：

- 生成版本：`851f17ad3663c9801d32a89c`；
- 真实生成数据包含5篇`published`，五个一级分类各1篇；
- `createLearningCompassProjection`的列表为5篇；
- 五篇详情全部包含`sections`和公开白名单`source`；
- search投影包含5个指南项，`type:id`无重复；
- 生成数据使用来源为`SRC-001/002/003/004/007`；
- 未发现`draft/review`、本地路径、Markdown路径、密码或Token进入公共投影。

本地reference注入后，五个中文分类分别可筛出对应真实指南。旧seed指南只保留reference兼容；同`type:id`由目标投影覆盖，不产生重复。

## 四、本地assistant最小闭环

新增`server/src/guide-assistant.js`作为独立owner：

```text
当前问题
  -> 问题/history/profile白名单校验
  -> 只读取published指南的标题、摘要和sections
  -> 确定性提示词与文本重叠排序
  -> 返回指南ID、一级分类、直接回答和公开citation
  -> 无充分依据或来源冲突时拒答
  -> provider连续失败时返回AI_UNAVAILABLE
```

### 请求边界

- `question`必填，最多1000个Unicode字符；
- `history`最多9轮完整`user/assistant`问答，严格成对排列；
- history只通过校验并作为会话上下文传给provider，不参与事实检索；
- `profile`可选，只接受`admission_year`和`major`，缺少时不阻塞；
- 不读取培养方案、课程资料、评价、笔记或seed正文。

### 回答与拒答

- 命中时使用指南“直接回答”作为回答主体，并返回真实`guide_id`、一级分类及至少一个公开citation；
- citation只包含来源ID、名称、HTTPS URL、章节/条款定位和受控摘录，不包含本地路径或内部分数；
- 自修问题统一返回`SOURCE_CONFLICT`，不合并3.7/3.0、1门/2门或日期差异；
- 培养方案、课程资料、课程评价和无依据问题返回`INSUFFICIENT_EVIDENCE`；
- provider最多尝试2次，连续失败映射为HTTP 503和稳定`AI_UNAVAILABLE`，公共响应不返回异常堆栈。

### local-only路由

`POST /api/v1/guide-assistant/answers`只在`createApp`显式注入assistant时注册。`server.js`还要求：

- `LEARNING_COMPASS_DATA_PATH`明确指向本地生成数据；
- `LEARNING_COMPASS_ASSISTANT_ENABLED=true`；
- `HOST`必须是loopback地址。

默认reference启动没有该路由；正式`docs/API.md`和生产profile均未改变。小程序继续保持现有本地视觉预览和零AI端点调用。

## 五、30题自动化评测

评测fixture为`server/test/fixtures/learning-compass-ai-eval.json`；每篇published指南5题，共25题，另有5题拒答。实际结果写入`server/data/learning-compass-ai-eval.generated.json`。

| 指标 | 结果 | 门槛 |
|---|---:|---:|
| 总体正确率 | 100%（30/30） | ≥90% |
| 命中回答引用存在率 | 100%（25/25） | 100% |
| 无依据/越界拒答 | 100%（5/5） | 100% |
| 内部路径或字段泄露 | 0 | 0 |
| draft/review泄露 | 0 | 0 |
| provider故障降级 | 100% | 100% |

验收解释：这30题验证的是固定fixture对确定性本地检索的回归结果；“引用存在”只表示返回了预期来源ID和HTTPS链接，本轮没有联网打开每个原文链接。真实模型质量、30秒超时、每日20次限制和生产来源可达性仍属后续验收，不由30/30自动化结果代替。

### 逐题结果

| # | question | expected | actual | citation | 结果 |
|---:|---|---|---|---|---|
| 1 | 2025级什么时候预选和正选？ | course-selection-2026-fall | course-selection-2026-fall | SRC-002 | PASS |
| 2 | 正选每天几点放出退选名额？ | course-selection-2026-fall | course-selection-2026-fall | SRC-002 | PASS |
| 3 | 补退选时还能跨专业选课吗？ | course-selection-2026-fall | course-selection-2026-fall | SRC-002 | PASS |
| 4 | 期中退课后成绩单会记W吗？ | course-selection-2026-fall | course-selection-2026-fall | SRC-002 | PASS |
| 5 | 2025级能办必修课补登吗？ | course-selection-2026-fall | course-selection-2026-fall | SRC-002 | PASS |
| 6 | 课程成绩有异议怎么复核？ | grade-review | grade-review | SRC-003 | PASS |
| 7 | 开学多久内可以申请成绩复议？ | grade-review | grade-review | SRC-003 | PASS |
| 8 | 任课老师能直接改分吗？ | grade-review | grade-review | SRC-003 | PASS |
| 9 | 成绩复核应该找哪个开课单位？ | grade-review | grade-review | SRC-003 | PASS |
| 10 | 成绩复核超过三周还会受理吗？ | grade-review | grade-review | SRC-003 | PASS |
| 11 | 休学到期后怎么复学？ | resume-study | resume-study | SRC-001 | PASS |
| 12 | 因病休学复学要带什么病愈证明？ | resume-study | resume-study | SRC-001 | PASS |
| 13 | 复学应在什么时候提出申请？ | resume-study | resume-study | SRC-001 | PASS |
| 14 | 休学期满还想继续休学怎么办？ | resume-study | resume-study | SRC-001 | PASS |
| 15 | 逾期两周不办复学会怎样？ | resume-study | resume-study | SRC-001 | PASS |
| 16 | 2026微专业报名已经结束了吗？ | micro-major-2026 | micro-major-2026 | SRC-007 | PASS |
| 17 | 微专业要在哪个系统报名？ | micro-major-2026 | micro-major-2026 | SRC-007 | PASS |
| 18 | 每人可以报几个微专业？ | micro-major-2026 | micro-major-2026 | SRC-007 | PASS |
| 19 | 微专业考核和录取是什么时间？ | micro-major-2026 | micro-major-2026 | SRC-007 | PASS |
| 20 | 微专业入选后从哪个界面选课？ | micro-major-2026 | micro-major-2026 | SRC-007 | PASS |
| 21 | 本科作业能用AI辅助吗？ | ai-coursework | ai-coursework | SRC-004 | PASS |
| 22 | AI生成的内容需要标注吗？ | ai-coursework | ai-coursework | SRC-004 | PASS |
| 23 | 可以把个人隐私上传给AI吗？ | ai-coursework | ai-coursework | SRC-004 | PASS |
| 24 | 让AI帮忙写代码后还要自己测试吗？ | ai-coursework | ai-coursework | SRC-004 | PASS |
| 25 | 期末论文可以让AI代写吗？ | ai-coursework | ai-coursework | SRC-004 | PASS |
| 26 | 申请自修要求GPA是多少？ | refuse | refuse | — | PASS |
| 27 | 我的专业毕业需要多少学分？ | refuse | refuse | — | PASS |
| 28 | 有机化学课程资料在哪里下载？ | refuse | refuse | — | PASS |
| 29 | 宿舍晚上几点断电？ | refuse | refuse | — | PASS |
| 30 | 哪个老师的课程评价最好？ | refuse | refuse | — | PASS |

本轮第一轮30题评测即为30/30，定向测试第一轮即为17/17，没有中途FAIL需要隐藏或修正。

## 六、验证结果

### PASS

- 阶段二改动前基线：生成数据`--check`通过，原知识测试10/10；
- 新增/修改JavaScript的`node --check`通过；
- `node --test server/test/learning-compass.test.js server/test/learning-compass-assistant.test.js`：17/17；
- `npm.cmd --prefix server test`：30/30；
- `npm.cmd run test:client-contract`：95/95；
- `npm.cmd run check:miniprogram`：13个页面、4个Tab通过；
- `node scripts/build-learning-compass.js --check`：5篇、版本一致；
- `node scripts/evaluate-learning-compass-ai.js --check`：30/30、100%；
- 生成数据、assistant响应和评测结果的敏感路径/内部字段扫描：0命中；
- `git diff --check`：通过，仅有LF/CRLF提示；16个本轮未跟踪/阶段一文件另以`git diff --no-index --check`逐文件检查，16/16通过。

### SKIP

- 外部模型、外部AI、向量数据库：本地确定性mock不需要，也未获授权；
- 微信开发者工具、真机、体验版：客户端没有接入本地assistant端点；
- 生产API、生产数据、部署和生产发布：未授权；
- 提交、推送和PR：未授权。

## 七、距离正式契约和生产发布还缺什么

1. 后端owner正式评审五分类、`sections/sources`和AI请求/响应字段，并更新正式API文档；
2. 在生产owner体系中实现知识存储、审核、撤回、备份、CAS和回滚，不能直接部署本地reference；
3. 选择并安全接入真实provider，完成超时、限流、滥用控制、私有诊断和密钥隔离；
4. 扩充真实问题集、多人内容复核和多来源citation语法；
5. 正式客户端接入前，再完成adapter白名单、错误状态、微信开发者工具、真机、体验版和生产冒烟测试；
6. 取得独立的生产发布授权。
