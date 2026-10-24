import type { Building, BuildingCategory, CampusSeed, Point } from './data/jinnan-seed'

export type PlaceKind = 'academic' | 'library' | 'food' | 'residence' | 'sport' | 'landmark' | 'park' | 'water' | 'shop' | 'medical' | 'bank' | 'transport'
export interface MapPlace extends Building {
  placeKind: PlaceKind
  position: Point
  buildingId?: string
  labelPriority: number
  labelVisible: boolean
  sourceNote: string
}
type Annotation = { name?: string; aliases?: string[]; kind?: PlaceKind; priority?: number }
// Display/search annotations only. Never replace the model's names, materials or footprints.
const annotations: Record<string, Annotation> = {
  '616829077': { name:'中心图书馆', aliases:['图书馆','津南图书馆','中图','tushuguan','tsg','library'], priority:100 },
  '616829078': { name:'综合业务楼西楼', aliases:['综合业务西楼','西楼','西楼报告厅','业务西楼'], kind:'landmark', priority:75 },
  '616829079': { name:'综合业务楼东楼', aliases:['综合业务东楼','东楼','业务东楼'], kind:'landmark', priority:75 },
  '616829080': { name:'大通学生中心', aliases:['大通','大通学生活动中心','学生中心','datong','dt'], kind:'landmark', priority:95 },
  '954128563': { name:'津南校区医院', aliases:['校医院','医院','医务室','yiyuan'], kind:'medical', priority:85 },
  '1412230608': { name:'第二食堂', aliases:['学二食堂','二食堂','二食','二餐','学2食堂','shitang','est'], kind:'food', priority:85 },
  '1412230609': { name:'第一食堂', aliases:['学一食堂','一食堂','一食','一餐','学1食堂','shitang','yst'], kind:'food', priority:85 },
  '1430904058': { name:'公共教学楼A区', aliases:['公教A','公教A区','公共教学楼A','公共教学楼A座','A教学楼'], priority:80 },
  '1430904059': { name:'公共教学楼B区', aliases:['公教B','公教B区','公共教学楼B','公共教学楼B座','B教学楼'], priority:80 },
  '1433084261': { name:'公共教学楼C区', aliases:['公教C','公教C区','公共教学楼C','公共教学楼C座','C教学楼'], priority:80 },
  '1436478222': { name:'公共教学楼D区', aliases:['公教D','公教D区','公共教学楼D','公共教学楼D座','D教学楼'], priority:80 },
  '1430918551': { aliases:['木斋','mzh','muzhai'], priority:75 },
  '1430918553': { name:'信息与传播学院', aliases:['秀山堂','新闻与传播学院','信息传播','传播学院','信传','xxcb'], priority:75 },
  '1434881536': { name:'医学院', aliases:['医学','yxy'], priority:75 },
  '1434881537': { aliases:['药学','yxy','yaoxue'], priority:75 },
  '1434881538': { aliases:['环科','环境学院','环境科学','环工','hjxy'], priority:75 },
  '1450306650': { aliases:['汉院','汉语言','汉语学院','hyy'], priority:75 },
  '1450306651': { kind:'academic', aliases:['法学','法学楼','fxy'], priority:75 },
  '1450306652': { aliases:['金融','金院','jrxy'], priority:75 },
  '1450306656': { aliases:['哲学','哲院','zx'], priority:75 },
  '1450306657': { aliases:['马院','马克思','mks'], priority:75 },
  '1451035702': { aliases:['历史','史院','lsxy'], priority:75 },
  '1456224120': { name:'综合实验楼D区', aliases:['实验楼D','D实验楼','实验楼D区','综实D'], priority:80 },
  '1456224121': { name:'综合实验楼C区', aliases:['实验楼C','C实验楼','实验楼C区','综实C'], priority:80 },
  '1456224123': { name:'综合实验楼B区', aliases:['实验楼B','B实验楼','实验楼B区','综实B'], priority:80 },
  '1456224124': { name:'综合实验楼A区', aliases:['实验楼A','A实验楼','实验楼A区','综实A'], priority:80 },
  '1456224126': { name:'前沿交叉学科研究院', aliases:['前沿交叉学科中心','前沿院','交叉学科','qyjc'], priority:90 },
  '1456224127': { aliases:['篮球馆','体育馆篮球馆','体育中心','tyg','tiyuguan'], priority:90 },
  '1474145904': { kind:'sport', aliases:['主体育场主席台','主体育场看台','文科体育场看台','主席台'], priority:70 },
  '1530053723': { name:'人工智能学院北楼', aliases:['人工智能学院','人工智能','智能学院','智能北楼','AI学院','ai','rgzn'], priority:75 },
  '1530053724': { aliases:['电光','电光学院','电子信息','光学工程','dgxy'], priority:75 },
  '1530053725': { aliases:['材料','材料学院','材院','clxy'], priority:75 },
  '1530053726': { name:'计算机学院', aliases:['信息东楼','计算机','计院','软件学院','计算机科学','jsj','cs'], priority:75 },
  'reference-building-tourism': { aliases:['旅服','旅游学院','旅游','lfxy'], priority:75 },
  'reference-building-government': { aliases:['政管','政府管理学院','周恩来','周政','社会学院','zggy'], priority:75 },
  'reference-building-dormitory-1': { name:'文科学生宿舍1', aliases:['学生宿舍1','文科宿舍1','学1','学一','1A座','1B座','1C座'], priority:80 },
  'reference-monument-zhou-enlai': { aliases:['周总理','周恩来雕像','周恩来总理塑像','周总理塑像','总理像','我是爱南开的','zel'], priority:95 },
}
export function getPlaceKind(building: Building): PlaceKind {
  if ('placeKind' in building) return (building as MapPlace).placeKind
  if (/食堂|餐厅/.test(building.name)) return 'food'
  if (/医院/.test(building.name)) return 'medical'
  if (/车站|校区站/.test(building.name)) return 'transport'
  return building.category === 'service' ? 'shop' : building.category
}
export function placePosition(building: Building): Point {
  if ('position' in building) return (building as MapPlace).position
  const xs=building.footprint.map(p=>p[0]),zs=building.footprint.map(p=>p[1])
  return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2]
}
export function placeTypeLabel(building: Building) {
  return {academic:'教学科研',library:'图书馆',food:'餐饮食堂',residence:'宿舍公寓',sport:'体育运动',landmark:'校园地标',park:'公园绿地',water:'湖泊水体',shop:'商店快递',medical:'医疗',bank:'银行',transport:'交通'}[getPlaceKind(building)]
}
export function createPlaceCatalog(model: CampusSeed): MapPlace[] {
  const places: MapPlace[] = model.buildings.map(building=>{
    const note=annotations[building.id.replace('osm-building-','')] ?? {}
    const kind=note.kind ?? getPlaceKind(building)
    const name=note.name ?? building.name.replace(/^南开大学[（(]?津南校区[）)]?/, '').replace(/^南开大学/,'')
    const aliases=[...building.aliases,...(note.aliases??[])]
    if (kind==='residence') {
      const number=name.match(/(?:宿舍|学)(\d+[A-D]?)/i)?.[1]
      if(number) aliases.push(`学${number}`,`学生宿舍${number}`,`${number}号楼`,`${number}座`,`${number}宿舍`)
    }
    return {...building,name,aliases:[...new Set(aliases)],category:kind==='academic'?'academic':building.category,placeKind:kind,position:placePosition(building),buildingId:building.id,labelPriority:note.priority??50,labelVisible:!/^未命名建筑/.test(name)&&!/连廊/.test(name),sourceNote:note.name?'名称按用户参考图整理；建筑位置沿用现有模型，待核验。':'沿用现有地图名称与位置，待核验。'}
  })
  const add=(id:string,name:string,kind:PlaceKind,position:Point,aliases:string[],priority=60,polygon?:Point[],sourceNote='根据用户截图相对位置估位，待实地核验，不用于精确导航。')=>{
    const [x,z]=position
    const category:BuildingCategory=kind==='sport'?'sport':kind==='park'||kind==='water'||kind==='landmark'?'landmark':'service'
    places.push({id,name,aliases,category,height:0,footprint:polygon??[[x-8,z-8],[x+8,z-8],[x+8,z+8],[x-8,z+8]],zone:'津南校区',verified:'user-reference',placeKind:kind,position,labelPriority:priority,labelVisible:true,sourceNote})
  }
  const area=(id:string,name:string,kind:PlaceKind,aliases:string[],priority:number)=>{
    const source=model.greens.find(a=>a.id===id);if(!source)return
    const xs=source.polygon.map(p=>p[0]),zs=source.polygon.map(p=>p[1])
    add(`place-${id}`,name,kind,[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2],aliases,priority,source.polygon,'标签位于已有场地或水体轮廓中心；名称按用户参考图整理，待核验。')
  }
  area('osm-area-1328585387','主体育场','sport',['文科主体育场','文科操场','主操场','足球场','田径场'],95)
  area('osm-area-1328585384','理科操场','sport',['理科体育场','理科足球场','理科跑道','田径场','足球场'],90)
  area('osm-area-768657102','马蹄湖','water',['马蹄','西区湖','湖边','湖'],75)
  area('osm-area-669743710','南开湖','water',['大通湖','大通旁的湖','东区湖','湖'],75)
  const courts=[['文科网球场','网球场',true],['文科篮球场','篮球场',true],['文科排球场','排球场',true],['理科网球场','网球场',false],['理科篮球场','篮球场',false],['理科排球场','排球场',false]] as const
  for(const [name,term,east] of courts){
    const parts=model.greens.filter(a=>a.name===term&&(a.polygon[0][0]>1000)===east)
    const points=parts.flatMap(a=>a.polygon);if(!points.length)continue
    const xs=points.map(p=>p[0]),zs=points.map(p=>p[1])
    add(`place-${east?'humanities':'science'}-${term==='网球场'?'tennis':term==='篮球场'?'basketball':'volleyball'}`,name,'sport',[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2],[term,`${east?'文科':'理科'}运动场`],65,undefined,'依据现有球场组范围标注，名称按用户参考图整理，待核验。')
  }
  add('place-lakeside-pavilion','湖畔四柱亭','landmark',[632.13,-656.18],['湖心亭','湖边亭子','四柱亭','马蹄湖亭子'],60,undefined,'沿用已建四柱亭的模型坐标。')
  add('place-wumei','物美超市','shop',[765,-1277],['物美','超市','便利店'],55)
  add('place-mcdonalds','麦当劳','food',[772,-1246],['麦当佬','麦门','mcdonalds','mcd','金拱门'],55)
  add('place-yunjin-noodles','芸锦拉面','food',[792,-1204],['拉面','面馆'],50)
  add('place-bank-communications','交通银行','bank',[681,-399],['交行','银行','ATM','取款机'],55)
  add('place-yipin-dumplings','一品粥铺饺子馆','food',[690,-335],['一品粥铺','饺子馆','饺子','粥铺'],50)
  add('place-cainiao','菜鸟驿站','shop',[630,-218],['菜鸟','快递','驿站','快递站'],60)
  return places
}
