function createRequestGeneration() {
  let queryGeneration = 0
  let requestGeneration = 0

  return {
    begin({ newQuery = false } = {}) {
      if (newQuery) queryGeneration += 1
      requestGeneration += 1
      return { queryGeneration, requestGeneration }
    },
    isLatest(token) {
      return token?.queryGeneration === queryGeneration && token?.requestGeneration === requestGeneration
    }
  }
}

module.exports = { createRequestGeneration }
