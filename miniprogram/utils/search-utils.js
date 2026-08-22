const DEFAULT_SEARCH_TEXT_MAX_LENGTH = 80

function normalizeSearchText(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:()（）【】\[\]{}《》<>"'“”‘’_\-—/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeBoundedSearchText(value, maxLength = DEFAULT_SEARCH_TEXT_MAX_LENGTH) {
  return normalizeSearchText(value).slice(0, Math.max(0, maxLength)).trim()
}

function getSearchTokens(keyword) {
  const normalizedKeyword = normalizeSearchText(keyword)
  return normalizedKeyword ? normalizedKeyword.split(' ').filter(Boolean) : []
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, '')
}

function scatteredIncludes(searchPool, token) {
  const compactPool = compactSearchText(searchPool)
  const compactToken = compactSearchText(token)

  if (!compactToken) return true

  let tokenIndex = 0
  for (const char of compactPool) {
    if (char === compactToken[tokenIndex]) {
      tokenIndex += 1
      if (tokenIndex === compactToken.length) return true
    }
  }

  return false
}

function fuzzyIncludes(searchPool, keyword) {
  const tokens = getSearchTokens(keyword)
  if (!tokens.length) return true

  const normalizedPool = normalizeSearchText(searchPool)
  return tokens.every(token => normalizedPool.includes(token) || scatteredIncludes(searchPool, token))
}

module.exports = {
  DEFAULT_SEARCH_TEXT_MAX_LENGTH,
  normalizeSearchText,
  normalizeBoundedSearchText,
  getSearchTokens,
  scatteredIncludes,
  fuzzyIncludes
}
