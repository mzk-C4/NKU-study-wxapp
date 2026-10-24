const publicApi = require('../learning-compass/api')
const auth = require('./auth-bridge')
const { createGuideAssistantController } = require('./controller')
const { isMock } = require('./settings')
const { createMockApi } = require('./mock')

function createController(options = {}) {
  const mock = isMock()
  return createGuideAssistantController({
    api: options.api || (mock ? createMockApi() : publicApi),
    auth: options.auth || (mock ? { getSessionIdentity: () => isMock() ? 'mock' : '' } : auth)
  })
}

module.exports = { createController, isMock }
