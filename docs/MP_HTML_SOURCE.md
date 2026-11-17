# 手册阅读组件来源

- 上游：[jin-yufeng/mp-html](https://github.com/jin-yufeng/mp-html)，固定版本 [v2.5.2](https://github.com/jin-yufeng/mp-html/tree/v2.5.2/dist/mp-weixin)。
- 使用原生微信组件，位于 `miniprogram/pages/guide-detail/components/mp-html`；上游运行时代码保持原样，MIT 许可证随组件保留。
- 无 Markdown 插件。输入由网站离线脚本 `scripts/compile-feishu-handbook.py` 将归档的飞书 DocxXML 编译为白名单 HTML；作者姓名保留，用户 ID、私有联系方式和原始管理字段不进入 HTML。
- 图片继续使用已归档的 6 张原图；文档附件入口指向原飞书文档。组件负责原生富文本、嵌套列表、表格横向滚动、图片预览和锚点定位；页面负责主题与来源标注。
- 正文组件放在指南详情分包，保留 `/pages/guide-detail/index` 路由，避免富文本组件占用主包。
- `feishu2html` 的运行环境为 Kotlin/JVM/Node，未直接引入；未找到可直接接入本项目的完整飞书原生小程序适配器，因此保留薄转换层与成熟小程序渲染组件分工。
