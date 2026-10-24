export type LabelRect={left:number;top:number;right:number;bottom:number}
export type LabelCandidate={id:string;x:number;y:number;width:number;priority:number;selected:boolean}
const overlaps=(a:LabelRect,b:LabelRect)=>a.left<b.right+5&&a.right+5>b.left&&a.top<b.bottom+5&&a.bottom+5>b.top
/** Every place competes by screen position, not catalog order or a fixed seven-place list. */
export function layoutMapLabels(candidates:LabelCandidate[],width:number,height:number,obstacles:LabelRect[]=[]) {
  const placed:LabelRect[]=[],result=new Map<string,{x:number;y:number;side:'left'|'right'}>()
  for(const c of [...candidates].sort((a,b)=>Number(b.selected)-Number(a.selected)||b.priority-a.priority||a.id.localeCompare(b.id))){
    for(const side of ['right','left'] as const){
      const left=side==='right'?c.x-13:c.x-c.width+13,top=c.y-30
      const rect={left,top,right:left+c.width,bottom:top+38}
      if(rect.left<4||rect.right>width-4||rect.top<4||rect.bottom>height-4)continue
      if(obstacles.some(o=>overlaps(rect,o))||placed.some(o=>overlaps(rect,o)))continue
      result.set(c.id,{x:left,y:top,side});placed.push(rect);break
    }
  }
  return result
}
