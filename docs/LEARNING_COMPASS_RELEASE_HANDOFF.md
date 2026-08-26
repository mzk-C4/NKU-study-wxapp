# 学习指南针客户端生产交接

更新时间：2026-08-25

## 本次 GitHub 变更范围

- 以 `origin/main@d30fe15` 为基线，保留远端课程、搜索、评价、资料、登录、收藏、反馈和五个 Tab 的现状。
- 更新学习指南针首页、五分类列表、指南详情和 AI 助手页面。
- 增加本机学习信息：入学年份和专业。该信息使用独立版本化存储，不随微信账号同步。
- 增加学习指南针独立客户端适配器、学院 variant 按需加载、原文件打开器和 AI 客户端状态机。
- 生产后端已于2026-08-25正式回交 variant 与 AI 契约；客户端 production profile 使用统一 Bearer 会话调用正式 AI 接口，reference profile 继续用于本地回归。

## 不进入 GitHub 的内容

- 学生手册、选课通知、转专业材料等 Markdown 与 PDF/DOC/DOCX 原件。
- 本地生成知识数据、reference server、Qwen provider 配置和任何密钥。
- DashScope Key、微信 AppSecret、R2 密钥、管理后台凭据和任何生产秘密。

这些材料已独立交给生产后端负责人实施，不与小程序客户端提交混在一起。

## 正式生产契约

1. 五分类指南列表与详情：`GET /api/v1/guides`、`GET /api/v1/guides/{guideId}`。
2. 转专业学院差异：`GET /api/v1/guides/{guideId}/variants/{variantId}`。
3. AI 回答：`POST /api/v1/guide-assistant/answers`，必须使用小程序 Bearer Token。
4. 原件 HTTPS 地址：只接受 `https://resources.nkustudy.top/guide-sources/`。
5. 认证、持久限流、30秒预算、错误码、日志脱敏和 provider 运维由生产后端负责。

上述正式契约和生产部署已由后端负责人回交；客户端已移除 production AI 门禁。后端仍须在管理页安全配置 DashScope Key，将模型明确设为 `qwen3.7-plus`，完成测试连接和30题真实评测后再允许正式发布。

## 2026-08-25 客户端只读生产证据

- `GET /guides`：18篇，五分类数量3/3/4/5/3。
- 转专业指南：29个variant，抽查两个学院正文哈希不同。
- `GET /search-index`：18个顶层指南项，转专业恰好一次。
- R2 PDF与DOCX来源HEAD均为200，Content-Type分别正确。
- AI无Token请求：401 `AUTH_REQUIRED`，未触发模型。

## 最短生产验收

1. 清除 develop 环境本地存储中的 `nkustudy_api_profile` 并重新编译，确认使用 `https://nkustudy.top/api/v1`。
2. 检查18篇指南、五分类3/3/4/5/3、转专业29个学院variant及原件打开。
3. 在“我的”填写入学年份和专业，进入AI助手；未登录时应显示微信登录恢复。
4. 登录后手动再次发送，正常回答应含适用范围、时效提醒和R2来源。
5. 验证两类业务拒答、429限流、503降级和断网恢复均不影响普通指南。
6. 在微信后台确认request域名`https://nkustudy.top`与downloadFile域名`https://resources.nkustudy.top`。

微信开发者工具、真机、体验版与生产环境仍需要人工验收，本地Node测试不能替代这些结果。
