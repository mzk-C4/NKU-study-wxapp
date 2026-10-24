const HOME = 'pages/home/index'
const DURATION = 1800
const FADE_DURATION = 240

// In-memory, per App instance. A shared/detail entry must never play later
// when the user visits Home; warm resumes must not arm another introduction.
function createLaunchIntroGate() {
  let pending = false
  return {
    launch(options = {}) {
      pending = String(options.path || HOME).replace(/^\//, '') === HOME
    },
    consume() { const play = pending; pending = false; return play },
    cancel() { pending = false }
  }
}

function createIntroController(page, platform, clock = { setTimeout, clearTimeout }) {
  let active = false
  let timers = []
  function tab(name, success) {
    try {
      if (platform && typeof platform[name] === 'function') platform[name]({ animation: false, success, fail() {} })
    } catch (_) { /* Visual enhancement must not block navigation. */ }
  }
  function finish() {
    if (!active) return
    active = false
    timers.forEach(timer => clock.clearTimeout(timer))
    timers = []
    page.setData({ introVisible: false, introLeaving: false })
    tab('showTabBar')
  }
  return {
    start() {
      if (active) return
      active = true
      page.setData({ introVisible: true, introLeaving: false })
      tab('hideTabBar', () => { if (!active) tab('showTabBar') })
      timers.push(clock.setTimeout(() => {
        if (active) page.setData({ introLeaving: true })
      }, DURATION - FADE_DURATION))
      // Not tied to animationend, a network request, or an asset load.
      timers.push(clock.setTimeout(finish, DURATION))
    },
    finish
  }
}

module.exports = { HOME, DURATION, FADE_DURATION, createLaunchIntroGate, createIntroController }
