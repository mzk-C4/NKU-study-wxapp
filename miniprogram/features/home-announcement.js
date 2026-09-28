const SEEN_KEY = 'nkustudy_announcement_seen_v1'
const NKUCS_URL = 'https://nkucs.icu/#/?id=nkucsicu'

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
  let dismissed = ''
  let storageWriteFailed = false
  return {
    isUnread(notice) {
      if (!notice) return false
      if (storageWriteFailed && dismissed === notice.revision) return false
      try { return storage.getStorageSync(SEEN_KEY) !== notice.revision }
      catch (_) { return dismissed !== notice.revision }
    },
    dismiss(notice) {
      if (!notice) return
      dismissed = notice.revision
      try { storage.setStorageSync(SEEN_KEY, notice.revision); storageWriteFailed = false }
      catch (_) { storageWriteFailed = true }
    }
  }
}

module.exports = { SEEN_KEY, NKUCS_URL, announcementView, createAnnouncementReader }
