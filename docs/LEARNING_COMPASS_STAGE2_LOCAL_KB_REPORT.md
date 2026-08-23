# 学习指南针阶段二本地知识库报告

> 日期：2026-08-23
> 结论：本地解析、校验、状态隔离、引用映射和指南/搜索投影闭环已完成
> 边界：仅本地reference与测试；没有AI、生产API、生产数据或部署变化

## 一、实现结果

本地数据流已经成立：

```text
Documents/SOURCE_MANIFEST.md
  + Documents/学习指南针内容草稿/guides/*.md
  -> server/src/learning-compass.js 解析与校验
  -> server/data/learning-compass.generated.json 确定性生成数据
  -> createLearningCompassProjection 状态过滤与公共白名单投影
  -> 可选注入本地reference的/guides、/guides/{id}和/search-index
```

真实五篇指南全部成功解析，生成版本：`6b2ee20ae676d958f76ca5ea`。

| 指南 | 分类 | 状态 | sections | citations |
|---|---|---|---:|---:|
| `ai-coursework` | 规范与权益 | `draft` | 3 | 1 |
| `course-selection-2026-fall` | 选课与修读 | `draft` | 3 | 1 |
| `grade-review` | 考试与成绩 | `draft` | 4 | 1 |
| `micro-major-2026` | 学业拓展 | `draft` | 4 | 1 |
| `resume-study` | 学籍与毕业 | `draft` | 4 | 1 |

真实内容没有被改为`review`或`published`，因此目标知识库的真实公共投影为0条。

## 二、分层与文件作用

### 新增

- `server/src/learning-compass.js`
  - 解析SOURCE_MANIFEST；
  - 解析指南最小frontmatter；
  - 生成稳定section ID；
  - 校验五分类、状态、来源、引用和HTTPS；
  - 提供只含published的列表、详情和搜索投影；
  - 加载后的生成JSON再次校验，防止文件被手工篡改后绕过构建校验。
- `scripts/build-learning-compass.js`
  - 从Markdown确定性生成本地JSON；
  - `--check`检测生成文件缺失或过期。
- `server/data/learning-compass.generated.json`
  - 标记`generated:true`；
  - 保存5篇draft、5个实际使用来源和五分类；
  - 不包含本地路径、Markdown路径、密码、Token或生产秘密。
- `server/test/learning-compass.test.js`
  - 使用真实五篇draft和独立临时fixture验证本地闭环。

### 修改

- `server/src/app.js`
  - 增加可选`learningCompass`注入；
  - 默认未注入时旧reference行为不变；
  - 注入后，published目标指南可以进入本地列表、详情和search-index；
  - 同`type:id`搜索项由目标投影覆盖旧fixture，避免重复。
- `server/src/server.js`
  - 仅在设置`LEARNING_COMPASS_DATA_PATH`时加载本地生成数据；
  - 默认不启用，不改变现有reference启动行为。

## 三、验证的策略规则

- 五个一级分类只允许：选课与修读、考试与成绩、学籍与毕业、学业拓展、规范与权益；
- 状态只允许`draft/review/published`；
- draft与review不进入公共指南、详情或搜索；
- published必须有有效来源和章节/条款定位；
- 未知source ID、重复guide ID、重复section ID、非法状态、非法分类、缺引用均失败关闭；
- 官方URL必须是无账号信息的HTTPS；
- 生成JSON加载时再次验证，篡改后的不安全来源不能进入投影；
- 公共数据不包含本地文件路径、Markdown路径、内部诊断和审核字段；
- 真实五篇始终保持draft；published行为只使用测试目录中的临时副本证明。

## 四、测试结果

### PASS

- 新增/修改JavaScript `node --check`：通过；
- `node scripts/build-learning-compass.js`：生成5篇、版本`6b2ee20ae676d958f76ca5ea`；
- `node scripts/build-learning-compass.js --check`：通过；
- `node --test server/test/learning-compass.test.js`：最终`10/10`；
- `npm.cmd --prefix server test`：最终`23/23`；
- `npm.cmd run test:client-contract`：`91/91`；
- `git diff --check`：通过，仅有LF/CRLF提示；
- 生成JSON敏感路径/字段扫描：未发现`Documents`、`markdown_path`、`original_path`、password或token。

### 中途失败及修正

新增“生成JSON被篡改”测试第一次为`9/10`：测试直接修改被冻结的source对象，实际没有改变URL，因此没有触发预期异常。随后改为深拷贝模拟磁盘JSON被篡改，最终测试通过；校验逻辑和失败记录均保留在本报告中。

### SKIP

- `verify:external`：涉及外部生产读取，本阶段不需要；
- 微信开发者工具、真机、体验版：本阶段没有客户端UI改动；
- 生产API、部署、生产数据导入：未授权且不属于阶段二；
- AI问答、模型或RAG测试：属于后续阶段。

## 五、如何本地使用

生成或更新数据：

```powershell
node scripts/build-learning-compass.js
```

检查生成数据是否与Markdown一致：

```powershell
node scripts/build-learning-compass.js --check
```

如需在本地reference显式加载生成数据，可设置：

```text
LEARNING_COMPASS_DATA_PATH=server/data/learning-compass.generated.json
```

当前真实内容全为draft，因此目标知识公共投影仍为空；这正是状态隔离的预期结果。不要为了看到列表而修改真实草稿状态。

## 六、剩余风险和后续边界

- 当前引用来自每篇指南末尾的guide级“原文依据”；首批均为单来源，因此投影到各section没有歧义。未来多来源指南需要更细的section/段落引用语法；
- SOURCE_MANIFEST解析依赖当前Markdown表格结构，修改列顺序时必须同步解析器和测试；
- generated JSON需要在源Markdown变化后重新构建，`--check`可阻止使用过期结果；
- local reference仍保留旧seed指南以兼容现有页面；目标知识通过可选注入补充，不表示生产已升级为五分类；
- 当前没有内容状态写入流程或管理员界面；阶段二只读取Markdown状态并隔离投影；
- SRC-005、辅修/微专业细分附件和自修差异继续按既有状态处理，不阻塞本地框架；
- 阶段二没有实现AI，也没有授权任何真实指南发布。

## 七、进入后续阶段前还需要什么

1. 产品负责人决定何时把某篇内容从`draft`提交到`review`；
2. 后端owner评审五分类及`sections/sources`正式契约；
3. 多来源内容出现后，确定更细粒度citation语法；
4. AI阶段只能检索`published`内容，并继续沿用本阶段的公共投影和来源白名单；
5. 生产实现前完成存储、审核、撤回、备份和回滚方案。
