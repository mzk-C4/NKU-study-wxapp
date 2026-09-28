// 图片只作插画背景；可读文字由 WXML 渲染，便于无障碍阅读与后续修改。
const HOME_SLIDES = [
  { id: 'resources', image: '/assets/home/resources.jpg', kicker: '同学共建 · 课程资料', title: '资料随手查', description: '按课程查找学习资料', action: '进入资料库', url: '/pages/courses/index' },
  { id: 'reviews', image: '/assets/home/reviews.jpg', kicker: '选课之前 · 多一份参考', title: '听听同学怎么说', description: '查看课程与教师评价', action: '查看评价', url: '/pages/reviews-tab/index' },
  { id: 'guides', image: '/assets/home/guides.jpg', kicker: '学习生活 · 找到方向', title: '下一步，有指南', description: '查流程、读经验、找原文', action: '浏览指南', url: '/pages/guides/index' },
  { id: 'beta', image: '/assets/home/resources.jpg', qrImage: '/assets/home/beta-group.jpg', kicker: '一起体验 · 一起改进', title: '加入内测同学圈', description: '飞书内测群 · 仅限组织内部成员', action: '查看入群二维码', url: '/pages/beta-group/index', kind: 'page' }
]

module.exports = { HOME_SLIDES }
