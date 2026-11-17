# 指南针 AI 反馈修复与验收记录

日期：2026-11-02。状态：本地实现和自动化验证完成；未部署、未上传小程序、未提交或推送。真实 GLM 和手机验收仍待执行。本轮未修改飞书机器人或其部署，未读取、复制或更改真实 Key。

## 已修改的实际 owner

| 仓库与文件 | 作用 |
| --- | --- |
| 小程序 `miniprogram/features/guide-assistant/controller.js`、新增 `response.js` | 响应结果和正文分离；只提交完整问答对；归一化实时响应及旧历史的内部拒答标志；保留回答种类和可靠追问 |
| 小程序 `miniprogram/pages/guide-assistant/index.js`、`index.wxml` | 发送前保存账号内 pending 问题、时间和本地ID；重进/选历史恢复待重试问题及完整轮次；隐藏无依据的固定三问；异常页展示保留的问题 |
| 小程序 `miniprogram/features/learning-compass/api.js` | 兼容可选 answer_kind、follow_up_questions；仅明确的回顾/能力说明允许无引用，事实问答仍严格检查来源 |
| 网站 `server/guide-assistant-service.mjs`、新增 `guide-assistant-context.mjs` | 从用户历史补全检索主题与条件；显式新主题切换；确定性对话节选回顾和能力说明；原文支持的追问；结构化/旧标志拒答统一处理 |
| 网站 `server/learning-compass-service.mjs` | 给私有检索块补齐学院、适用范围、时间状态；排除显式草稿和无法映射原件的块，不扩大公开DTO |
| 网站 `server/qwen-provider.mjs` | 仅接收正常完成文本，拒绝截断、过滤及工具响应；禁止请求重定向；模型、Key及供应商配置未改 |

实际网站工作目录是 `D:/NKU platform/NKU-study-resources`，小程序目录是 `D:/NKU platform/NKU-study-wxapp`。没有修改整理目录的副本，也没有用小程序 `integrations/` 参考实现替代实际后端。网站相关源码基于本地 `8ddcdc53`；通过 GitHub 连接器核对 main 的三个原有后端文件 blob 与修改前一致，不代表整仓或线上部署提交已经核验。

## 六类反馈的自动化结果

| 反馈 | 本地验证结果 |
| --- | --- |
| 推荐追问串题/无效 | PASS：原来的三个通用追问在AI作业历史下均重新命中SRC-004，不串到转专业；新建议由命中主题和原文位置生成，逐条追问仍命中同主题；无可靠建议时隐藏 |
| 无法总结上文 | PASS：已完成对话可回顾为标明“此前消息”的节选汇总，不错误触发校园知识缺失，不将旧答案当成新制度证据；自我介绍同样无需校园检索 |
| 历史上下文恢复不稳定 | PASS：完成两轮、离页重进后，下一问携带四条历史；pending追问重进与历史选择均保留完整历史，手动重试只增加一次请求 |
| 已收录知识召回不足 | PASS：本地18个指南标题全部命中所属主题；ABCD等级制/挂科重修/复查成绩等常见表述通过；学院追问限制目标学院，明确新年度不套用旧年度安排 |
| 生成中退出丢提问 | PASS：第一问和后续问发送时已保存pending，退出后问题、已完成轮次和手动重试入口仍在；迟到成功/失败均不覆盖新页面或已完成重试 |
| 边回答边拒答/内部标志 | PASS：结构化拒答及REFUSE标志丢弃混合正文、引用和建议，前端和旧历史恢复均只显示受控拒答；未完成provider输出不入正常上下文 |

原有行为继续通过：最多10轮、账号隔离、重复发送阻止、旧账号迟到200/401不覆盖新会话、失败及断网不增加轮次、登录/网络恢复不自动重发。

## 数据接线核验

- 只读生产 `GET /api/v1/guides?page_size=100`：code=0，18篇，数据日期2026-08-25；`GET /api/v1/guides/transfer-major-2026`：29个学院版本。未调用生产问答或管理写接口。
- 网站当前原文快照：18篇、205块、35份原件；学院版本均可映射原件。检索先确定主题，再限定学院原文；校级问法不混用29个学院的具体条件。
- 本次没有扩充知识库。标题召回测试验证检索路径，不等于所有校园知识已收录或真实模型事实正确率已通过；未收录、来源冲突及不适用年份继续拒答。

## 已运行验证

在小程序根目录：

```powershell
npm.cmd test
python scripts/check-wxml.py miniprogram
node artifacts/guide-assistant-cross-repo-20261102.cjs
```

PASS：406项测试、静态30页面/5Tab；本地源码2001.7/2048KiB（非微信实际编译包大小）；39份WXML零错误。跨仓测试经过实际客户端adapter、controller、网站检索服务和已发布快照，provider为确定性测试桩，无真实模型调用。

在网站根目录：

```powershell
node --test test/guide-assistant.test.mjs test/guide-assistant-context.test.mjs test/learning-compass.test.mjs test/qwen-provider-mapping.test.mjs test/public-api-router.test.mjs test/public-api.test.mjs
```

PASS：44/44。修改的JS语法检查、两仓相关diff空白检查通过。未运行网站整仓测试。

本地日志在小程序 `artifacts/guide-assistant-fixes-20261102-test.log`、`guide-assistant-backend-20261102-test.log`、`guide-assistant-cross-repo-20261102.json`；artifacts保持未跟踪，文档记录可复现命令和结果。

## 后续最短人工验收

在服务端owner审核并发布网站补丁、客户端编译后执行，当前均为 NOT_RUN：

1. 问“本科课程作业中如何规范使用AI工具？”，逐条点推荐追问，确认答案和来源仍属于AI作业规范。再问“计算机学院转专业有哪些条件？”，确认明确切换主题和学院。
2. 完成两轮后发“总结一下上文”，确认能回顾两轮且不误判资料不足；另开话题问“你是谁”。回顾为节选，不承诺重新核验历史事实。
3. 完成两轮、退出重进、从历史选择同一会话后追问，检查主题、学院条件、轮次和来源。
4. 用ABCD等级制、挂科重修和成绩复核分别检查召回；再问未收录问题和未来年份，确认不编造。
5. 生成中退出或关闭后重进，确认已发送问题还在，显示尚未完成，并能手动重试；检查断网及模型失败恢复。
6. 在测试环境使用混合正文+REFUSE、结构化拒答、截断响应等桩响应，确认正常答案与拒答不会同时出现，内部标志不显示；补做10轮、切号、连点和迟到响应回归。

接口仍为整段返回。离页恢复的是本机问题和已完成历史，没有新增服务端任务查询、服务器幂等或后台续传；因此重进时提示手动重试，不声称能找回服务器已经生成但未送达的答案。两个可选响应字段及边界已同步两仓 `docs/API.md`，本任务状态以小程序 `docs/COLLABORATION_PLAN.md` 为准。
