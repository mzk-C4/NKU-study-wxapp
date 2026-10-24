import type { MapPlace } from './map-places'
export function normalizeSearch(value:string) {
  return value.normalize('NFKC').toLowerCase().replace(/第?([一二三四五六七八九十])(?=食|餐|号|宿|座|区|楼|$)/g,(_,n:string)=>String('一二三四五六七八九十'.indexOf(n)+1)).replace(/學/g,'学').replace(/館/g,'馆').replace(/棟/g,'栋').replace(/圖/g,'图').replace(/[\s·・,，。/\\_—\-（）()]+/g,'')
}
/** Optimal string alignment: tolerate one swapped, missing or mistaken character. */
function distance(a:string,b:string) {
  const rows=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0))
  for(let i=0;i<=a.length;i++)rows[i][0]=i
  for(let j=0;j<=b.length;j++)rows[0][j]=j
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1))
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+1)
  }
  return rows[a.length][b.length]
}
export function createPlaceSearch(places:MapPlace[]) {
  const index=places.map(place=>({place,fields:[place.name,...place.aliases].map(normalizeSearch).filter(Boolean),zone:normalizeSearch(place.zone)}))
  return (input:string,limit=50):MapPlace[]=>{
    const query=normalizeSearch(input.trim().slice(0,80));if(!query)return []
    const tokens=input.normalize('NFKC').trim().split(/\s+/).map(normalizeSearch).filter(Boolean)
    return index.map(({place,fields,zone})=>{
      let score=0
      for(let i=0;i<fields.length;i++){
        const field=fields[i]
        if(field===query)score=Math.max(score,i===0?1200:1100)
        else if(field.includes(query))score=Math.max(score,900-(field.length-query.length)*2+(i===0?20:0))
        else if(query.length>=2&&query.length<=16){
          let cursor=0;for(const c of field)if(c===query[cursor])cursor++
          if(cursor===query.length)score=Math.max(score,650-(field.length-query.length)*4)
          // Room/wing numbers and A/B/C/D suffixes are meaningful, not typos.
          if(query.length>=3&&(!/[a-z0-9]/.test(query)||/^[a-z]{5,}$/.test(query)&&/^[a-z]+$/.test(field))&&Math.abs(field.length-query.length)<=2){const d=distance(query,field);if(d<=(query.length>=6?2:1))score=Math.max(score,550-d*50-Math.abs(field.length-query.length)*4)}
        }
      }
      if(tokens.length>1&&tokens.every(t=>fields.some(f=>f.includes(t))||zone.includes(t)))score=Math.max(score,800)
      if(!score&&zone.includes(query))score=100
      return {place,score}
    }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||b.place.labelPriority-a.place.labelPriority||a.place.name.localeCompare(b.place.name,'zh-CN')).slice(0,limit).map(r=>r.place)
  }
}
