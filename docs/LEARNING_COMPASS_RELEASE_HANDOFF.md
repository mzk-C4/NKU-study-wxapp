# 学习指南针客户端集成交接

更新时间：2026-08-25

## 本次 GitHub 变更范围

- 以 `origin/main@d30fe15` 为基线，保留远端课程、搜索、评价、资料、登录、收藏、反馈和五个 Tab 的现状。
- 更新学习指南针首页、五分类列表、指南详情和 AI 助手页面。
- 增加本机学习信息：入学年份和专业。该信息使用独立版本化存储，不随微信账号同步。
- 增加学习指南针独立客户端适配器、学院 variant 按需加载、原文件打开器和 AI 客户端状态机。
- production profile 在真实生产契约启用前拦截 AI 请求；reference profile 可联调本地服务。

## 不进入本次 GitHub 变更的内容

- 学生手册、选课通知、转专业材料等 Markdown 与 PDF/DOC/DOCX 原件。
- 本地生成知识数据、reference server、Qwen provider 配置和任何密钥。
- 生产部署、生产数据写入、正式 AI 接口启用和 R2 文件上传。

这些材料已独立打包为 `learning-compass-backend-handoff-20260825.zip`，交由后端负责人实施，不与小程序客户端提交混在一起。

## 后端接入完成条件

后端负责人应以压缩包中的契约、来源清单和本地参考实现为依据，至少提供：

1. 五分类指南列表与详情：`GET /api/v1/guides`、`GET /api/v1/guides/{guideId}`。
2. 转专业学院差异：`GET /api/v1/guides/{guideId}/variants/{variantId}`。
3. AI 回答：`POST /api/v1/guide-assistant/answers`，模型密钥只保存在服务端，客户端不得接触。
4. 原件 HTTPS 地址：生产客户端只接受约定的公开资源域名，不接受本机路径或回环地址。
5. 认证、限流、30 秒预算、错误码、日志脱敏和 provider 运维由生产后端负责。

正式契约完成前，客户端的 production AI 门禁不得移除。

## 最短本地验收

1. 启动后端交接包中的 reference 服务。
2. 在微信开发者工具的 develop 环境设置本地存储 `nkustudy_api_profile=reference` 并重新编译。
3. 检查指南首页五分类，分别打开分类列表与指南详情。
4. 打开转专业指南，切换学院并查看学院原文件。
5. 在“我的”填写入学年份和专业，再进入 AI 助手提问；回答应显示来源，生产 profile 则应在网络请求前明确拦截。

微信开发者工具、真机、体验版与生产环境仍需要人工验收，本地 Node 测试不能替代这些结果。
