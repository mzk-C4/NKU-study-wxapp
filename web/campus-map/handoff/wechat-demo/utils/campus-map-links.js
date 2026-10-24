const { MAP_ORIGIN, MAP_PATH } = require('../config/map-config')
const CAMPUS_MAP_URL = MAP_ORIGIN.replace(/\/$/, '') + MAP_PATH
function validMapBuildingId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : ''
}
function campusMapUrl(value='') {
  const id=validMapBuildingId(value)
  return `${CAMPUS_MAP_URL}?embed=wechat${id?`&buildingId=${encodeURIComponent(id)}`:''}`
}
function sharedMapBuildingId(url) {
  if(typeof url!=='string'||!url.startsWith(CAMPUS_MAP_URL+'?'))return ''
  const match=url.match(/[?&]buildingId=([^&#]*)/)
  try{return match?validMapBuildingId(decodeURIComponent(match[1])):''}catch{return ''}
}
module.exports={CAMPUS_MAP_URL,validMapBuildingId,campusMapUrl,sharedMapBuildingId}
