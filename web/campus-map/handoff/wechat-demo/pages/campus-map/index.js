const { campusMapUrl, sharedMapBuildingId, validMapBuildingId } = require('../../utils/campus-map-links')
Page({
  data:{url:'',failed:false},
  initialBuildingId:'',
  onLoad(options={}) {
    this.initialBuildingId=validMapBuildingId(options.buildingId)
    this.setData({url:campusMapUrl(this.initialBuildingId),failed:false})
  },
  onError(){this.setData({failed:true})},
  retry(){this.setData({failed:false})},
  goBack(){wx.navigateBack({fail:()=>wx.reLaunch({url:'/pages/home/index'})})},
  onShareAppMessage(options={}) {
    const id=options.webViewUrl?sharedMapBuildingId(options.webViewUrl):this.initialBuildingId
    return {title:'津南校区校园地图',path:`/pages/campus-map/index${id?`?buildingId=${encodeURIComponent(id)}`:''}`}
  },
})
