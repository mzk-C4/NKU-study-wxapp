const { registerPage: registerThemedPage } = require('../../utils/theme')
const { createCatalogPage } = require('../../features/learning-compass/catalog-page')
registerThemedPage(createCatalogPage('documents'))

