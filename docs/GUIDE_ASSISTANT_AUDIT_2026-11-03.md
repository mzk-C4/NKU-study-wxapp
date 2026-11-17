# 指南针 AI 与飞书学习助手对照审计

> 同日后续：用户已授权修复，以下10类缺陷均已完成本地回归。原始审计结果及定位保留为修复前证据，当前修复映射和验证见文末“同日修复与验证”。未部署、未完成真实模型或真机验收。

2026-11-03。三个子代理分别审计检索、回答边界、会话恢复；主代理独立重跑关键探针，确认10类缺陷。此次仅新增审计记录和复现材料，没有修改业务代码、配置、Key或部署，没有向飞书发送消息、调用真实模型或读取用户聊天归档。

结论：上一轮修复仍有遗漏，当前不能以既有测试通过作为真实回答质量或“已经对齐飞书助手”的验收依据。优先处理学院/年份条件丢失及学院选错，再修复历史数据和回答终态。

## 确认的缺陷

P1表示可能将不适用的政策材料交给模型；P2表示功能、状态或协议处理错误。检索和本地状态缺陷已复现；涉及模型桩的结果不代表真实GLM已生成同样错误。

| 编号 | 级别 | 可复现输入或操作 | 实际结果与影响 |
| --- | --- | --- | --- |
| R1 | P1 | 先问2026年转专业，再补充“目标是计算机学院”，追问“转专业需要准备哪些材料？” | 再次提到主题便不再补历史，variantId变空，仅有校级SRC-001。历史改为2027年后问“转专业报名截止时间？”，仍会调用模型并附2026年适用范围，年份拦截被绕过 |
| R2 | P1 | “2026年转专业：目标是计算机学院，我现在在软件学院” | 只因软件学院最后出现就选软件细则，未选明确目标计算机学院。要求比较两学院时也只取最后一家 |
| R3 | P2 | 成绩复核后问“多久？”“什么时候交？”；AI作业后问“有啥限制？”或“具体到毕业论文呢？” | 前三者无命中、直接拒答；后者切去毕业结业指南，丢掉AI规范。已收录的时限/使用边界没有正确带入 |
| O1 | P2 | provider返回飞书固定拒答“这个问题我资料库里暂时没有，不敢瞎说。”；或返回数组JSON拒答 | 真实adapter/controller均判为answer，计1轮并附1份来源、2项追问。数组中的refused/reason原样显示；混合“可以直接修改，但没有相关资料，不能回答”也被保留 |
| O2 | P2 | 合法JSON正文含全角双引号：`{"answer":"请提交＂成绩复核申请＂。","refused":false,"reason":null}` | JSON解析前NFKC把全角引号变成未转义ASCII双引号，合法响应被破坏；调用两次后503 |
| O3 | P2 | “总结一下我们刚才聊了什么”“给我总结一下之前问过你的问题” | 未识别回顾意图，错误进入事实检索/模型链路；无provider时503。对照“总结一下上文”正常 |
| C1 | P2 | 同账号发送→生成中删除当前会话→旧请求成功 | 删除时history为0但pending仍true；迟到成功后history变1，已删除会话恢复 |
| C2 | P2 | 完成首问“同一个首问”→新话题再问同一句 | 用首问文本标识会话，旧历史被第二次答案覆盖，最终只有1条记录 |
| C3 | P2 | 已完成1轮→重新生成→超时 | 原答案在成功替换前被删除；UI和持久化messages均为0，轮次回0，非仅暂时隐藏 |
| C4 | P2 | 完成1轮→第二问断网→在断网页编辑问题并离线发送→重进 | 编辑问题保留，但前文messages=0、rounds=0、pending=null，上下文没有随问题恢复 |

R1和R2证明检索条件有误，并不等于真实模型必然输出错误政策；模型也可能再次拒答。但缺失或选错证据已经发生，应先修复检索，再检验最终答案。

## 定位与修复方向

- R1/R3：[上下文路由](<D:/NKU platform/NKU-study-resources/server/guide-assistant-context.mjs:70>)只在当前主题为空时合并历史；[追问词表](<D:/NKU platform/NKU-study-resources/server/guide-assistant-context.mjs:4>)遗漏自然短问。应区分“同主题补充”和“明确切换”，持续保留主题、目标学院及文件年份，不继续堆同义正则代替上下文状态。
- R2：[学院选择](<D:/NKU platform/NKU-study-resources/server/guide-assistant-context.mjs:84>)取最后匹配，未区分来源学院、目标学院和比较对象。应提取角色；多对象分别取证或请求澄清。
- O1：[服务端结果解析](<D:/NKU platform/NKU-study-resources/server/guide-assistant-context.mjs:146>)仅解析对象开头，其他正文放行；[客户端归一化](<D:/NKU platform/NKU-study-wxapp/miniprogram/features/guide-assistant/response.js:14>)依赖外层状态/内部标志。应明确结构化终态，拒绝异常容器和混合结果；不能仅以“有引用”认定正常答案。
- O2：[provider结果处理](<D:/NKU platform/NKU-study-resources/server/guide-assistant-service.mjs:187>)应先解析协议，再归一化正文。
- O3：[回顾识别](<D:/NKU platform/NKU-study-resources/server/guide-assistant-context.mjs:120>)应覆盖常见自然表达，同时保持“回顾历史”和“询问新事实”的区别。
- C1：[删除逻辑](<D:/NKU platform/NKU-study-wxapp/miniprogram/pages/guide-assistant/index.js:1043>)需要使对应请求失效，避免[迟到提交](<D:/NKU platform/NKU-study-wxapp/miniprogram/pages/guide-assistant/index.js:543>)重建记录。
- C2：[历史键](<D:/NKU platform/NKU-study-wxapp/miniprogram/pages/guide-assistant/index.js:91>)应改独立conversation ID，问题仅作标题。
- C3：[重新生成](<D:/NKU platform/NKU-study-wxapp/miniprogram/pages/guide-assistant/index.js:1227>)应暂存候选请求，成功后替换末轮，失败保留已完成答案和轮数。
- C4：[离线编辑](<D:/NKU platform/NKU-study-wxapp/miniprogram/pages/guide-assistant/index.js:1401>)应复用原会话ID、历史和pending保存路径。

## 对标飞书助手的结论

本次基准是本机`nku-feishu-bot`的NKU学习助手人设、知识加载/检索和会话处理代码，不是默认Markdown助手的人设，也不是对线上机器人进行盲测。

- 实际知识加载器读到1286个课程条目、220个文档片段；这是本机加载条目数，包含本地/云端数据，不是去重课程总数。小程序侧是18篇制度指南、205个逐字块。课评、保研、平台FAQ和校园经验的覆盖差异应独立记录，不直接判作指南首期范围的bug，也未自动导入这些资料。
- 飞书[学习助手人设](<D:/NKU platform/nku-feishu-bot/persona-nku.md>)明确禁止无依据补造、要求匹配学院，并限制技术内部、隐私、作弊代写、超范围及角色扮演。小程序提示词尚未完整表达这些范围约束。缺少规则是待测风险，不能据此声称已越狱。
- 可复用飞书[成功交付后成对提交历史](<D:/NKU platform/nku-feishu-bot/lib/nku-reply.js:29>)的约束，尤其用于重新生成、失败和离页。
- 飞书[当前句检索](<D:/NKU platform/nku-feishu-bot/bot.js:150>)和[空检索直接拒答](<D:/NKU platform/nku-feishu-bot/lib/nku-reply.js:23>)同样不能作为多轮理解金标准；不能照搬来修小程序短追问。
- 两边的“引用”目前主要证明检索命中，不等于逐句校验答案受到来源支持。故意注入无依据桩答案仍可获配SRC-003，应作为后续事实一致性评测项目，不将桩输出当作真实模型编造事件。
- 不直接搬飞书表情和纯文本格式。小程序已有Markdown、来源卡片和完整页面交互，应该对齐证据、学院、范围和上下文规则。

## 证据与边界

本轮重跑飞书离线测试42/42、网站相关测试27/27，均通过；这与上述新探针暴露的问题同时成立，说明既有用例没有覆盖这些自然表述与状态组合。未重复运行昨天的小程序全量406项，不将历史成绩写成本轮成绩。

主代理另外执行：22组同题检索对照、19条针对性探针（含正常回顾对照），所有模型输出均为确定性桩，客户端请求为本地注入。没有真实GLM回答正确率、延迟或两机器人线上胜率结论。

修复前在小程序根目录使用以下探针。原输出已保留；修复后请运行文末带断言的新版本，避免覆盖原始审计结果：

```powershell
node artifacts/guide-assistant-audit-20261103-probes.cjs
```

输入及输出分别保存在`artifacts/guide-assistant-audit-20261103-probes.cjs`和`guide-assistant-audit-20261103-probes.json`；同题检索结果在`artifacts/guide-assistant-benchmark-20261103.json`。审计材料保持本地未提交。

审计阶段建议先补这10类回归并修复，再用相同题集、相同已审核来源对两条真实模型链路做回答内容评测。飞书此前已验证的收发及合成卡片通过，不能替代真实答题评测。审计阶段未执行修复或部署；同日后续修复如下。

## 同日修复与验证

用户后续明确授权修复以上问题。已修改小程序和实际网站后端的本地源码，未修改飞书机器人、模型配置或Key，未部署、上传、暂存、提交、推送。项目现有其他改动保持。

| 原编号 | 修复后的行为 | 本地回归证据 |
| --- | --- | --- |
| R1 | 按当前主题累计用户条件；显式同主题问题保留学院和年份，新主题清空旧条件，用户修改条件只覆盖该字段 | 转专业材料追问保留计算机学院；2027年截止时间拒答且provider调用0次；明确改问2026年可正常检索 |
| R2 | 区分当前学院与转入目标；多目标或同名不同版本先要求补充，不按末次提及选学院 | 正反语序、从软件转到计算机、简称补充均取计算机细则；多学院比较/目标不明不调用模型 |
| R3 | 常用短追问继承当前主题；AI规范下具体到论文继续查AI原文，明确毕业条件仍切换主题 | “多久”“什么时候交”引用SRC-003；“有啥限制”“具体到毕业论文”引用SRC-004；无关问题仍拒答 |
| O1 | 飞书式资料不足及混合拒答归一为拒答，清空引用/追问；非法JSON结构为服务不可用，不显示原始JSON | backend→实际客户端adapter/controller的固定文案和混合正文均refusal；数组结果service-error且不新增完成轮次 |
| O2 | 先解析原始JSON，随后归一化正文，避免全角引号变成JSON分隔符 | 包含＂成绩复核申请＂的合法JSON一次调用即完成；损坏JSON仍不可用 |
| O3 | 补齐自然回顾表达，服务器直接回顾已完成对话；普通政策总结仍要来源 | 两条原遗漏表达及变体无需provider；回顾中引用旧拒答，保存和重进后仍是conversation_summary |
| C1 | 删除当前会话先取消请求并更换controller；删除其他会话保留当前请求 | 迟到成功/失败均不恢复已删除记录；删除后可新问；其他话题删除不影响在途答案 |
| C2 | 独立会话ID用于保存、恢复、列表key、置顶、重命名及删除；首问仅作标题 | 同首问新话题保留两份答案，各自操作互不覆盖；旧记录补ID后重进稳定 |
| C3 | 再生成暂存replace-last请求；旧末轮保留到新答案成功，再原位替换 | 失败/中途离页不丢旧答案；重进手动重试仍替换而非追加；第10轮再生成保持10轮 |
| C4 | 编辑未完成追问使用append并保存原会话ID、完整历史和新pending问题 | 断网编辑后重进保留1轮及新追问；联网修改并手动发送包含原上下文，完成后为2轮 |

修改owner：

- 小程序：`miniprogram/features/guide-assistant/{controller,response}.js`、`miniprogram/pages/guide-assistant/index.{js,wxml}`。回归位于`test/guide-assistant-integration.test.js`、`test/learning-compass-api.test.js`。
- 网站仓库`D:/NKU platform/NKU-study-resources`：`server/guide-assistant-context.mjs`、`server/guide-assistant-service.mjs`及`test/guide-assistant-context.test.mjs`。不是客户端仓库中的参考服务。
- 两仓`docs/API.md`同步行为边界；HTTP字段不增加，本机新增会话ID、activeConversationId及pending.mode。当前状态同步到`docs/COLLABORATION_PLAN.md`。

本地验证结果：

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 小程序`npm.cmd test` | PASS 415/415；静态30页面/5Tab | `artifacts/guide-assistant-fixes-20261103-test.log` |
| 网站guide/context/provider/公共契约检查 | PASS；Node测试33/33 | `artifacts/guide-assistant-backend-20261103-test.log` |
| 原审计跨模块复现探针，加修复后断言 | PASS 19/19 | `artifacts/guide-assistant-fixed-20261103-probes.cjs`及同名JSON |
| `python scripts/check-wxml.py miniprogram` | PASS 39份/0错误 | 本轮命令输出 |
| 本地源码预算 | PASS 2006.1/2048KiB | 已纳入npm test；不表示微信编译包大小 |

标准测试新增15项，包含参数化场景与正常/拒答反向校验。重跑方法：

```powershell
# 在 D:\NKU platform\NKU-study-wxapp
npm.cmd test
node artifacts/guide-assistant-fixed-20261103-probes.cjs
python scripts/check-wxml.py miniprogram

# 在 D:\NKU platform\NKU-study-resources
node --test test/guide-assistant-context.test.mjs test/guide-assistant.test.mjs test/learning-compass.test.mjs test/qwen-provider-mapping.test.mjs test/public-api-contract.test.mjs
```

以上均使用本地公开知识快照、合成会话和模型测试桩，不调用真实GLM或飞书。内容与引用的逐项支持度、复杂自然语言的覆盖率仍需真实模型同题评测；这些测试不能证明所有模型回答都正确，也不表示已复刻飞书的全部知识范围。

后续人工验收（真实接口和测试版本准备好后执行，本轮未执行）：

1. 按R1/R2的语序提问，再追问材料/时间，打开来源核对目标学院与年份；2027年问题不能拿2026年材料作结论。
2. 成绩复核后问“多久”，AI作业后问“具体到毕业论文呢”，随后总结已聊内容，检查来源与回顾状态。
3. 连续新开两个相同首问的话题，分别重命名/置顶/删除；生成中删除当前话题，等待迟到响应，记录应保持删除。
4. 已有答案后模拟断网重新生成、退出重进，旧答案仍可见；再联网手动重试，轮次不重复增加。
5. 已有一轮后断网追问并编辑，退出重进，再联网手动发送，确认原上下文和编辑内容均保留；同时验收iOS、安卓及账号切换。
