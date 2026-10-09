const SEEN_KEY = 'nkustudy_announcement_seen_v1'
const PARTNER_SEEN_KEY = 'nkustudy_hinku_notice_seen_v1'
const NKUCS_URL = 'https://nkucs.icu/#/?id=nkucsicu'
const HINKU_NOTICE = {
  title: 'NKUStudy × HiNKU',
  image: '/assets/home/nkustudy-hinku-cooperation.jpg',
  intro: '我们与 HiNKU 开始合作啦！两个小程序互加友链，让学习资料与校园服务更容易找到。',
  services: ['课表查询', '班车查询', '校园卡余额', '电费查询'],
  detail: '在 HiNKU 查询课表、班车、校园卡余额、电费，也可查看学校公告和场地预约。',
  note: '服务入口会打开 HiNKU 首页，再选择所需服务。',
  group: {
    title: '加入 NKUStudy 内测群',
    image: '/assets/home/beta-group.jpg',
    intro: '体验新功能、反馈使用问题，和同学一起完善 NKUStudy。',
    note: '飞书群 · 仅限组织内部成员。点击二维码保存原图，再到飞书扫一扫从相册识别。'
  }
}

function homeAnnouncementView(value) {
  const remote = announcementView(value)
  return {
    revision: JSON.stringify([remote ? remote.revision : '', HINKU_NOTICE]),
    remoteRevision: remote ? remote.revision : '',
    partnerRevision: JSON.stringify(HINKU_NOTICE),
    parts: remote ? remote.parts : [],
    partner: HINKU_NOTICE,
    preview: 'NKUStudy × HiNKU 合作上线 · 课表、班车、校园卡余额、电费查询'
  }
}

function announcementText(notice) {
  return [notice.partner && [notice.partner.title, notice.partner.intro, notice.partner.detail, notice.partner.note,
    notice.partner.group.title, notice.partner.group.intro, notice.partner.group.note].join('\n'),
    notice.parts.map(part => part.text).join('')].filter(Boolean).join('\n\n')
}

function announcementView(value) {
  const content = typeof value === 'string' ? value.trim() : ''
  if (!content) return null
  // Render text as text, never arbitrary HTML or a server-supplied navigation URL.
  const parts = content.split(/(\[NKUCS\.ICU\]\(https:\/\/nkucs\.icu\/#\/\?id=nkucsicu\)|NKUCS\.ICU)/g)
    .filter(Boolean).map((text, id) => ({ id, text: text.startsWith('[NKUCS.ICU](') ? 'NKUCS.ICU' : text,
      link: text === 'NKUCS.ICU' || text.startsWith('[NKUCS.ICU](') }))
  const plain = parts.map(part => part.text).join('')
  return { revision: content, parts, preview: plain.replace(/\s+/g, ' ').slice(0, 64) }
}

function createAnnouncementReader(storage) {
  const dismissed = new Map()
  const failedWrites = new Set()
  const revisions = notice => notice.partner
    ? [[PARTNER_SEEN_KEY, notice.partnerRevision], ...(notice.remoteRevision ? [[SEEN_KEY, notice.remoteRevision]] : [])]
    : [[SEEN_KEY, notice.revision]]
  return {
    isUnread(notice) {
      if (!notice) return false
      return revisions(notice).some(([key, revision]) => {
        if (failedWrites.has(key) && dismissed.get(key) === revision) return false
        try { return storage.getStorageSync(key) !== revision }
        catch (_) { return dismissed.get(key) !== revision }
      })
    },
    dismiss(notice) {
      if (!notice) return
      for (const [key, revision] of revisions(notice)) {
        dismissed.set(key, revision)
        try { storage.setStorageSync(key, revision); failedWrites.delete(key) }
        catch (_) { failedWrites.add(key) }
      }
    }
  }
}

module.exports = { SEEN_KEY, NKUCS_URL, announcementView, homeAnnouncementView, announcementText, createAnnouncementReader }
