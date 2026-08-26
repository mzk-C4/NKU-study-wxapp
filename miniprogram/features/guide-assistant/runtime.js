const publicApi = require('../learning-compass/api')
const auth = require('./auth-bridge')
const { createGuideAssistantController } = require('./controller')

function createController(options = {}) {
  return createGuideAssistantController({ api: options.api || publicApi, auth: options.auth || auth })
}

module.exports = { createController }
