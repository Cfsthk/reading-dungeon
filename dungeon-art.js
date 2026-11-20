/* Pixel-art targets occupy alcoves; navigation keeps the full hero body clear. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DungeonArt=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SPRITES={stone:0,iron:1,wood:2,cracked:3,stairs:4,moss:5,torch:6,unlit:7,red:12,blue:13,gold:14,green:15,chest:16,openChest:17,back:18,front:19,guardian:20,pursuer:21,heart:22,coin:23,ward:24,lantern:25,treasure:23,skull:27,scroll:28,portal:29};
const AREAS={crypt:0,tide:1,fungus:2,forge:3,archive:4,glacier:5,amber:6,astral:7},NORTH_WALL_Y=224,PLAYER={x:480,y:600,width:138,height:158};
// The doorway opening ends six displayed pixels before its transparent cell ends.
const DOOR_SILL_INSET=6;
const RIBBONS=['red','blue','gold','green'],PROJECTILE_SIZE=224,CONTACT_MARGIN=1.5;
const DEFAULT_FLIGHT_SECONDS=2,MISS_EXIT_SPEED=310,MISS_ACCELERATION_SECONDS=.3;
const FLOOR_SLOTS={left:[130,450],right:[830,450],'upper-left':[130,350],'lower-left':[130,570],'upper-right':[830,350],'lower-right':[830,570]};
const MECHANISMS=['sluice','cart','signal'];
const BLOCKED_ROOMS=['feeding','floodgate'];
function blocked(scene,type){return BLOCKED_ROOMS.includes(type)||(type==='cart'&&scene.obstacle?.kind==='cart');}
// Left/right safe floor columns measured from the three stone-dungeon backgrounds.
const CRYPT_COLUMNS=[178,252,306];
const RAIL_CROSSING={x:480,top:306,height:38,turnY:361};
const MACHINE_LANES={
 2:{left:300,right:660},
 3:{left:208,middle:480,right:752},
 4:{'far-left':211,'inner-left':345,'inner-right':615,'far-right':749}
};
// The background cells are 768 × 512. These landmarks are measured in source
// rows. The last two rows put the usable ends on solid ground beyond both lips.
const LANDMARKS={
 gap:[[178,229,365],[178,229,365],[178,229,365],[178,229,365],
      [187,264,416],[187,264,416],[185,262,414],[185,262,414]],
 ledge:[[187,237,359],[187,237,359],[161,212,334],[161,212,334],
        [216,267,397],[216,267,397],[216,266,397],[216,266,397]]
};
const WALL_ROWS={rooms:[116,116,116,116],roomsA:[188,188,163,163],roomsB:[190,190,185,185],
 newRooms:[188,188,187,187],newRoomsA:[190,190,189,189]};
// Opaque bounds of each 384 × 512 atlas cell. Cropping keeps a broken rail
// in the same lane as its intact counterpart despite their different padding.
const CROSSING_FRAMES=[
 [80,46,294,441],[75,45,291,442],[44,44,294,443],[22,44,293,443],
 [123,27,197,446],[101,27,197,446],[85,27,209,445],[64,27,210,445]
];
function worldRow(row){return Math.round(row*640/512);}
function terrainRows(scene){return LANDMARKS[scene.terrain]?.[AREAS[scene.area]??0];}
function threshold(scene,position){
 if(scene.guardian||scene.targetType==='arena'||scene.backgroundRole==='arena')return position==='middle'?199:215;
 const rows=terrainRows(scene);return rows?worldRow(rows[0]):NORTH_WALL_Y;
}
function crossingPlacement(scene,type){
 const terrain=type==='bridge'?'gap':'ledge';
 const [,far,near]=LANDMARKS[terrain][AREAS[scene.area]??0];
 const upper=worldRow(far),lower=worldRow(near);
 // The far deck begins at row 83. The socket of the top ladder rung is
 // at row 67; its posts continue a short distance onto the upper landing.
 const bridge=type==='bridge',scale=(lower-upper)/(bridge?477-83:471-67);
 const top=Math.round(upper-(bridge?37:40)*scale);
 const y=bridge?Math.round(lower+9*scale):lower;
 return{top,y,h:y-top,w:bridge?145:99,upper,lower};
}
function rectangle(x,y,w,h){return{x:x-w/2,y:y-h,w,h};}
// Widen the playing floor in occupied rooms while preserving the character scale.
// Map dynamic rails and water edges to the same wall faces as the room painting.
function questScreenX(x){
 if(x>750)return 960-questScreenX(960-x);
 return x<210?x*114/210:114+(x-210)*732/540;
}
function dispatch(scene){return scene.targetType==='dispatch'||(scene.targetType==='cart'&&!blocked(scene,'cart'));}
function wideFloor(scene){return scene.chain||dispatch(scene);}
function wallSpan(scene,span){return wideFloor(scene)?span.map(x=>Math.round(questScreenX(x))):span;}
function consoleTarget(type){return type==='item'||type==='console';}
const YARD_LANES={
 2:{left:[300,365],right:[660,365]},
 3:{left:[210,417],middle:[480,315],right:[750,417]},
 4:{'far-left':[205,417],'inner-left':[345,315],'inner-right':[615,315],'far-right':[755,417]}
};
function ordinaryLayout(scene){
 if(scene.targetType==='entrance')return [];
 const arena=scene.targetType==='arena',n=scene.options.length,counters={door:0,person:0,item:0};
 return scene.options.map((option,index)=>{
  const type=option.targetType||scene.targetType||'door',i=arena?counters[type]++:index;
  let x,y,w,h,position=option.position;
  if(arena){
   if(type==='door'){position||=['left','middle','right'][i];x=({left:150,middle:480,right:810})[position];y=threshold(scene,position)+DOOR_SILL_INSET;w=180;h=174;}
   else{position||=(type==='person'?['upper-left','middle-left','lower-left']:['upper-right','middle-right','lower-right'])[i];const row=position.startsWith('upper')?0:position.startsWith('middle')?1:2;x=type==='person'?110:850;y=(type==='person'?[355,485,615]:[345,480,615])[row];w=type==='person'?112:110;h=type==='person'?122:110;}
  }else if(type==='person'||consoleTarget(type)){
   position||=(n===2?['left','right']:n===3?['upper-left','lower-left','right']:['upper-left','lower-left','upper-right','lower-right'])[i];
   [x,y]=FLOOR_SLOTS[position]||FLOOR_SLOTS[i%2?'right':'left'];w=type==='person'?158:140;h=type==='person'?178:140;
   if(AREAS[scene.area]>=4||option.traits?.type==='specimen')x=x<480?210:750;
   if(option.traits?.type==='specimen'){
    w=177;h=161;
    y=position.startsWith('upper')?398:position.startsWith('lower')?578:471;
   }
   if(scene.area==='crypt'){
    const inset=CRYPT_COLUMNS[scene.backgroundVariant??0]||CRYPT_COLUMNS[0];
    x=x<480?inset:960-inset;
    y=position.startsWith('upper')?398:position.startsWith('lower')?582:471;
   }
  }else if(blocked(scene,type)){
   const slots=n===2?{left:284,right:676}:{left:196,middle:480,right:764};
   position||=Object.keys(slots)[i];x=slots[position];y=position==='middle'?433:481;
   w=type==='feeding'?117:138;h=type==='feeding'?65:85;
   // The centre station fits between the rail apron and the hood at spawn.
   if(type==='cart'&&position==='middle'){y=436;h=67;}
  }else if(dispatch(scene)){
   const lanes=YARD_LANES[n];position||=Object.keys(lanes)[i];
   [x,y]=lanes[position];w=n===2?163:132;h=n===2?103:84;
  }else if(MECHANISMS.includes(type)){
   const lanes=MACHINE_LANES[n];
   position||=Object.keys(lanes)[i];
   x=lanes[position];y=type==='cart'?409:398;w=n===2?152:n===3?122:116;h=143;
  }else{
   position||=(n===2?['left','right']:n===3?['left','middle','right']:['far-left','inner-left','inner-right','far-right'])[i];
   const slots=n===2?{left:295,right:665}:n===3?{left:225,middle:480,right:735}:{'far-left':165,'inner-left':375,'inner-right':585,'far-right':795};
   x=slots[position]??480;
   if(type==='door'){y=threshold(scene,position)+DOOR_SILL_INSET;w=180;h=174;}
   else{({y,w,h}=crossingPlacement(scene,type));}
  }
  const top=y-h,bounds=rectangle(x,y,type==='door'?170:w,h);
  return{id:option.id,x,y,w,h,top,type,position,...(option.step?{step:option.step}:{}),bounds};
 });
}
// Sources stand on the near side of the room. The middle stays wide enough to
// carry a clue from either station to the machinery without crossing a sprite.
function questGroups(scene){
 const c=scene.chain;
 return {
  source:{...scene,targetType:c.sourceType,options:c.sourceOptions,obstacle:null,taskAction:c.sourceType==='person'?'witness':null,chestRoom:false},
  action:{...scene,targetType:c.actionType,options:c.actionOptions,obstacle:c.actionObstacle,taskAction:c.actionTaskAction,chestRoom:c.actionChestRoom}
 };
}
function moved(p,x,y,w,h){
 return {...p,x,y,w,h,top:y-h,bounds:rectangle(x,y,w,h)};
}
const QUEST_AISLE_Y=592;
function questSourceLayout(source){
 return source.options.map((option,i)=>{
  const left=(option.position||['left','right'][i])==='left',type=source.targetType;
  const w=type==='person'?112:99,h=type==='person'?122:99;
  const inset=consoleTarget(source.chain.actionType)?259:176;
  return moved({id:option.id,position:left?'left':'right',type},left?inset:960-inset,580,w,h);
 });
}
function questActionLayout(action){
 return ordinaryLayout(action).map(p=>{
  if(blocked(action,p.type)){
   const middle=p.position==='middle';
   const h=p.type==='cart'?Math.min(p.h,75):p.type==='floodgate'?80:p.h;
   return moved(p,p.x,middle&&p.type!=='floodgate'?417:425,p.w,h);
  }
  if(consoleTarget(p.type)){
   const side=p.position.includes('left'),upper=p.position.startsWith('upper'),lower=p.position.startsWith('lower');
   return moved(p,side?263:697,upper?325:lower?452:394,117,113);
  }
  return p;
 });
}
function layout(scene){
 if(!scene.chain)return ordinaryLayout(scene);
 const {source,action}=questGroups(scene);
 return scene.chain.step===1?questSourceLayout(source):questActionLayout(action);
}
function sourceStop(p){const inset=p.x<480?p.x:960-p.x;return {x:p.x<480?inset+135:960-inset-135,y:QUEST_AISLE_Y};}
function questAnchor(scene){
 if(!scene.chain)return null;
 const p=questSourceLayout(questGroups(scene).source).find(p=>p.id===scene.chain.sourceId);
 return p?sourceStop(p):null;
}
function compact(points){return points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);}
function navigation(scene,id,from){
 const start=from??(scene.chain?.step===2?questAnchor(scene):null)??PLAYER;
 if(!scene.chain)return ordinaryNavigation(scene,id,start);
 const position={x:start.x,y:start.y};
 const {source,action}=questGroups(scene);
 if(scene.chain.step===1){
  const p=questSourceLayout(source).find(option=>option.id===id);if(!p)return null;
  const stop=sourceStop(p),corner={x:position.x,y:stop.y};
  return {stop,approach:compact([corner,stop]),return:compact([corner,position]),exit:[]};
 }
 const p=questActionLayout(action).find(option=>option.id===id);if(!p)return null;
 const bottom={x:position.x,y:QUEST_AISLE_Y},centre={x:480,y:QUEST_AISLE_Y};
 const sill=threshold(action,p.position);
 let stop,approach,exit;
 if(p.type==='door'){
  stop={x:p.x,y:400};approach=[{x:position.x,y:407},{x:p.x,y:407},stop];
  exit=[{x:p.x,y:sill},{x:p.x,y:sill-34}];
 }else if(consoleTarget(p.type)){
  const lane=p.x<480?395:565;
  stop={x:lane,y:p.y};approach=[bottom,{x:lane,y:QUEST_AISLE_Y},stop];
  exit=[{x:480,y:stop.y},{x:480,y:sill}];
 }else if(blocked(action,p.type)||dispatch(action)){
  const nav=ordinaryNavigation(action,id,centre,questActionLayout(action));
  stop=nav.stop;approach=[bottom,centre,...nav.approach];exit=nav.exit;
 }else{
  const lane=action.options.length===3?(p.x<=480?344:616):480;
  stop={x:Math.max(306,Math.min(654,p.x)),y:p.y+PLAYER.height+10};
  approach=[bottom,{x:stop.x,y:QUEST_AISLE_Y},stop];
  exit=[{x:lane,y:stop.y},{x:lane,y:p.top-5},{x:480,y:p.top-5},{x:480,y:sill}];
 }
 approach=compact(approach);
 return {stop,approach,exit:compact(exit),return:compact([...approach.slice(0,-1).reverse(),position])};
}
function ordinaryNavigation(scene,id,from,positions=ordinaryLayout(scene)){
 const p=positions.find(target=>target.id===id);if(!p)return null;
 const start={x:from.x??PLAYER.x,y:from.y??PLAYER.y},arena=scene.targetType==='arena',crossing=p.type==='bridge'||p.type==='ladder';
 const sill=threshold(scene,p.position);
 let stop,approach,exit,crossingMidpoint;
 if(p.type==='person'||consoleTarget(p.type)){
  const side=p.x<480,sideX=arena?(side?260:700):p.x+(side?170:-170);
  stop={x:sideX,y:arena?Math.max(400,p.y):p.y};
  approach=[{x:start.x,y:620},{x:sideX,y:620},stop];
  exit=arena?[{x:sideX,y:620},{x:480,y:620}]:[{x:480,y:stop.y},{x:480,y:sill}];
 }else if(crossing){
  const {upper,lower}=crossingPlacement(scene,p.type);
  stop={x:p.x,y:lower};crossingMidpoint={x:p.x,y:Math.round((upper+lower)/2)};
  approach=[{x:start.x,y:620},{x:p.x,y:620},stop];exit=[{x:p.x,y:upper},{x:480,y:upper},{x:480,y:sill}];
 }else if(blocked(scene,p.type)){
  const triple=scene.options.length===3;
  const aisle=triple?(p.x<=480?338:622):(p.x<480?437:523);
  stop={x:aisle,y:p.y+62};
  approach=[{x:aisle,y:start.y},stop];
  // Pass the feeding beast before turning toward the central doorway.
  const turnY=p.type==='feeding'?286:p.type==='cart'?(scene.chain?347:RAIL_CROSSING.turnY):338;
  exit=[{x:aisle,y:turnY},{x:480,y:turnY},{x:480,y:sill}];
 }else if(dispatch(scene)){
  // Stand on the near side of the car and cross through the central aisle.
  // The three-car upper siding holds its single car in that aisle until dispatched.
  const n=scene.options.length,near=n>2&&p.y>400;
  const aisle=n===3?(p.x<=480?345:615):480;
  const x=near?(p.x<480?342:618):Math.max(307,Math.min(653,p.x));
  stop={x,y:p.y+PLAYER.height+9};
  approach=[{x:480,y:QUEST_AISLE_Y},{x,y:QUEST_AISLE_Y},stop];
  exit=[{x:aisle,y:stop.y},{x:aisle,y:sill},{x:480,y:sill}];
 }else if(MECHANISMS.includes(p.type)){
  // The operator stands on the near side of the controls. Keep the full hood
  // and lantern clear of the machine as the explorer leaves through the aisle.
  const aisle=scene.options.length===3?(p.x<=480?344:616):480;
  stop={x:p.x,y:p.y+PLAYER.height+7};
  approach=[{x:p.x,y:start.y},stop];
  exit=[{x:aisle,y:stop.y},{x:aisle,y:p.top-5},{x:480,y:p.top-5},{x:480,y:sill}];
 }else if(arena){
  const lane=p.x>480?645:315;stop={x:lane,y:400};approach=[{x:start.x,y:620},{x:lane,y:620},stop];
  // The lanes pass between the guardian and doorframes, then enter only the selected doorway.
  exit=[{x:lane,y:sill},{x:p.x,y:sill},{x:p.x,y:sill-30}];
 }else{stop={x:p.x,y:400};approach=[{x:start.x,y:620},{x:p.x,y:620},stop];exit=[{x:p.x,y:sill},{x:p.x,y:sill-34}];}
 approach=compact(approach);exit=compact(exit);
 return{approach,stop,exit,...(crossingMidpoint?{crossingMidpoint}:{}),return:compact([...approach.slice(0,-1).reverse(),start])};
}
function encounterIndex(type,t){if(type==='person')return(t.carrying==='scroll'?4:0)+(t.facing==='back'?2:0)+(t.hood==='red'?1:0);return 8+['bottle','key','book','gem'].indexOf(t.type)*2+(t.color==='blue'?1:0);}
function peopleIndex(t){const row=['red','blue','green','gold'].indexOf(t.hood);return Math.max(0,row)*4+(t.facing==='back'?2:0)+(t.carrying==='scroll'?1:0);}
function itemIndex(t){const row=['wood','iron','ceramic','copper'].indexOf(t.material),column=['none','red','blue','green'].indexOf(t.decoration);return row<0||column<0?-1:row*4+column;}
function crossingIndex(type,t,collapsed=false){return(type==='ladder'?4:0)+(t.material==='iron'?2:0)+(collapsed?1:0);}
function heroOrigin(visual={}){return{x:Math.round((visual.x??PLAYER.x)-PLAYER.width/2),y:Math.round((visual.y??PLAYER.y)-PLAYER.height+(visual.walkOffset||0))};}
function hoodRow(points){const top=points.reduce((y,p)=>Math.min(y,p.y),Infinity);return points.filter(p=>p.y===top);}
// Aim at the highest visible hood row, never the chest or carried lantern.
// The immutable result describes one launch; later player motion cannot steer it.
function contactGeometry(points,front,visual={},size=PROJECTILE_SIZE){
 const origin={x:480,y:330},base=heroOrigin(visual),hood=hoodRow(points),middle=hood[Math.floor(hood.length/2)]||{x:PLAYER.width/2,y:0},target={x:base.x+middle.x,y:base.y+middle.y},dx=target.x-origin.x,dy=target.y-origin.y,distance=Math.hypot(dx,dy)||1,ux=dx/distance,uy=dy/distance;
 let first=Infinity,contact=target;
 for(const p of hood){const x=base.x+p.x,y=base.y+p.y,ax=x-origin.x,ay=y-origin.y,row=Math.floor(-ax*uy+ay*ux+size/2);
  if(row<0||row>=front.length||!Number.isFinite(front[row]))continue;
  const t=ax*ux+ay*uy-front[row];if(t>=0&&t<first){first=t;contact={x,y};}}
 if(!Number.isFinite(first))first=Math.max(0,distance-size/2);
 // Rotated nearest-neighbour pixels can extend past their sample centres.
 // Keep a sub-two-pixel contact margin so damage precedes visible penetration.
 first=Math.max(0,first-CONTACT_MARGIN);
 return Object.freeze({origin:Object.freeze(origin),end:Object.freeze({x:origin.x+ux*first,y:origin.y+uy*first}),contact:Object.freeze(contact),angle:Math.atan2(dy,dx),size});
}
function projectilePosition(geometry,progress,flightSeconds=DEFAULT_FLIGHT_SECONDS){
 const {origin,end,angle}=geometry;
 const dx=end.x-origin.x,dy=end.y-origin.y;
 const x=origin.x+dx*progress,y=origin.y+dy*progress;
 if(progress<=1)return{x,y};
 const extraSpeed=MISS_EXIT_SPEED-Math.hypot(dx,dy)/flightSeconds;
 if(extraSpeed<=0)return{x,y};
 const seconds=(progress-1)*flightSeconds,ramp=Math.min(1,seconds/MISS_ACCELERATION_SECONDS);
 // Integrate a smoothstep speed ramp so crossing the miss point keeps the same
 // position and velocity, then speeds up until the bolt leaves the room.
 const extraDistance=extraSpeed*(MISS_ACCELERATION_SECONDS*ramp**3*(1-ramp/2)+
  Math.max(0,seconds-MISS_ACCELERATION_SECONDS));
 return{x:x+extraDistance*Math.cos(angle),y:y+extraDistance*Math.sin(angle)};
}
function create(rooms,sprites,guardians,extras={}){
 const sw=sprites.width/6,sh=sprites.height/5,makeCanvas=extras.createCanvas||(typeof document!=='undefined'?((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;}):null);let outlineCache=null;
 function sprite(ctx,key,x,y,w,h=w,alpha=1){const i=typeof key==='string'?SPRITES[key]:key;if(!Number.isInteger(i)||i<0||i>29)return;ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha*=alpha;const crop=i===6||i===7?[70,30,100,199]:i===22?[48,65,145,130]:i===23?[40,55,155,145]:[0,0,sw,sh];ctx.drawImage(sprites,Math.round(i%6*sw+crop[0]),Math.round(Math.floor(i/6)*sh+crop[1]),Math.floor(crop[2]),Math.floor(crop[3]),Math.round(x),Math.round(y),Math.round(w),Math.round(h));ctx.restore();}
 function drawCell(ctx,atlas,column,row,columns,rows,x,y,w,h){
  const cw=atlas.width/columns,ch=atlas.height/rows;
  ctx.drawImage(atlas,Math.floor(column*cw),Math.floor(row*ch),Math.floor(cw),Math.floor(ch),Math.round(x),Math.round(y),w,h);
 }
 // The regional cast shares a crimson hood dye. Preserve the lighting on
 // each fold as well as the colours of the skin, equipment and district uniform.
 const costumes=new Map(),hoodPalette={blue:[0,.49,1],green:[.18,.86,.24],gold:[1,.72,.06]};
 function castMember(ctx,traits, district,x,y,w,h){
  const atlas=extras.newCast,pose=(traits.facing==='back'?2:0)+(traits.carrying==='scroll'?1:0),palette=hoodPalette[traits.hood];
  if(!palette||!makeCanvas){drawCell(ctx,atlas,pose,district,4,4,x,y,w,h);return;}
  const key=district+':'+pose+':'+traits.hood;
  if(!costumes.has(key)){
   const cw=Math.floor(atlas.width/4),ch=Math.floor(atlas.height/4),c=makeCanvas(cw,ch),m=c.getContext('2d');drawCell(m,atlas,pose,district,4,4,0,0,cw,ch);
   if(m.getImageData&&m.putImageData){
    const pixels=m.getImageData(0,0,cw,ch),data=pixels.data;
    for(let i=0;i<data.length;i+=4){
     const r=data[i],g=data[i+1],b=data[i+2],chroma=r-Math.min(g,b);
     if(!data[i+3]||r-Math.max(g,b)<18||g-b>chroma*.32||chroma<r*.35)continue;
     const base=Math.min(g,b);for(let channel=0;channel<3;channel++)data[i+channel]=Math.round(base+chroma*palette[channel]);
    }
    m.putImageData(pixels,0,0);
   }
   costumes.set(key,c);
  }
  const c=costumes.get(key);ctx.drawImage(c,0,0,c.width,c.height,Math.round(x),Math.round(y),w,h);
 }
 function itemRibbon(ctx,decoration,x,y,w,h){
  const color=RIBBONS.indexOf(decoration);if(color<0||!extras.ribbons)return;
  drawCell(ctx,extras.ribbons,color%2,Math.floor(color/2),2,2,x+w*.54,y+h*.18,Math.round(w*.43),Math.round(h*.43));
 }
 function encounter(ctx,type,traits,x,y,w,h,area='crypt'){
  const modernItem=type==='item'&&itemIndex(traits)>=0;
  const district=(AREAS[area]??0)-4;
  if(district>=0&&type==='person'&&extras.newCast){castMember(ctx,traits,district,x,y,w,h);return;}
  if(district>=0&&modernItem&&extras.newItems){
   drawCell(ctx,extras.newItems,Math.floor(itemIndex(traits)/4),district,4,4,x,y,w,h);
   itemRibbon(ctx,traits.decoration,x,y,w,h);return;
  }
  const atlas=type==='person'&&extras.people?extras.people:modernItem&&extras.items?extras.items:extras.encounters;if(!atlas)return;
  const i=atlas===extras.people?peopleIndex(traits):atlas===extras.items?itemIndex(traits):encounterIndex(type,traits);if(i<0)return;
  const cw=atlas.width/4,ch=atlas.height/4;ctx.drawImage(atlas,Math.floor(i%4*cw),Math.floor(Math.floor(i/4)*ch),Math.floor(cw),Math.floor(ch),Math.round(x),Math.round(y),w,h);
  if(atlas===extras.encounters&&type==='item'&&traits.marked)sprite(ctx,'gold',x+w*.52,y+h*.51,w*.34,w*.34);
 }
 const silhouettes=new Map();
 function alphaPoints(key,width,height,paint,minAlpha=24){
  if(silhouettes.has(key))return silhouettes.get(key);
  const c=makeCanvas?.(width,height),m=c?.getContext('2d');let pixels;
  if(m){m.imageSmoothingEnabled=false;paint(m);pixels=m.getImageData?.(0,0,width,height).data;}
  const points=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const alpha=pixels?pixels[(y*width+x)*4+3]:(x>width*.2&&x<width*.8&&y>height*.15&&y<height*.9?255:0);
   if(alpha>=minAlpha)points.push({x:x+.5,y:y+.5,alpha});
  }
  silhouettes.set(key,points);return points;
 }
 function heroPixels(visual){const pose=visual.returning||visual.hurt?'front':'back';return alphaPoints(pose,PLAYER.width,PLAYER.height,m=>sprite(m,pose,0,0,PLAYER.width,PLAYER.height));}
 const projectileMasks=new Map();
 const projectileBounds=new WeakMap();
 function projectileMask(area){
  const index=(AREAS[area]??0)%4,key='projectile-'+index;if(projectileMasks.has(index))return projectileMasks.get(index);
  const pixels=alphaPoints(key,PROJECTILE_SIZE,PROJECTILE_SIZE,m=>{const a=extras.projectiles;if(a)m.drawImage(a,Math.floor(index*a.width/4),0,Math.floor(a.width/4),Math.floor(a.height/2),0,0,PROJECTILE_SIZE,PROJECTILE_SIZE);},1);
  const front=Array(PROJECTILE_SIZE).fill(-Infinity),opaque=new Uint8Array(PROJECTILE_SIZE*PROJECTILE_SIZE),rows=[];
  for(const p of pixels){
   const row=Math.floor(p.y),x=Math.floor(p.x);
   if(!rows[row])rows[row]={left:x,right:x+1};
   else rows[row].right=x+1;
   if(p.alpha<24)continue;
   front[row]=Math.max(front[row],p.x-PROJECTILE_SIZE/2);
   opaque[row*PROJECTILE_SIZE+x]=1;
  }
  const mask={front,opaque,rows};projectileMasks.set(index,mask);return mask;
 }
 function projectileGeometry(visual={},area='crypt'){
  const mask=projectileMask(area);
  const geometry=contactGeometry(heroPixels(visual),mask.front,visual);
  const cos=Math.cos(geometry.angle),sin=Math.sin(geometry.angle),halfSize=geometry.size/2;
  const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  // A rotated row's ends give its visible bounds, even with transparent gaps.
  mask.rows.forEach(({left,right},row)=>{
   const x=(left+right)/2-halfSize,y=row+.5-halfSize,halfWidth=(right-left)/2;
   const dx=x*cos-y*sin,dy=x*sin+y*cos;
   const hx=Math.abs(cos)*halfWidth+Math.abs(sin)*.5;
   const hy=Math.abs(sin)*halfWidth+Math.abs(cos)*.5;
   bounds.left=Math.min(bounds.left,dx-hx);
   bounds.right=Math.max(bounds.right,dx+hx);
   bounds.top=Math.min(bounds.top,dy-hy);
   bounds.bottom=Math.max(bounds.bottom,dy+hy);
  });
  if(mask.rows.length)projectileBounds.set(geometry,bounds);
  return geometry;
 }
 function projectileInFrame(geometry,progress,flightSeconds){
  if(!geometry||!Number.isFinite(progress))return false;
  const {x,y}=projectilePosition(geometry,progress,flightSeconds);
  const bounds=projectileBounds.get(geometry);
  if(bounds){
   const margin=1;
   return x+bounds.right+margin>0&&x+bounds.left-margin<960&&
    y+bounds.bottom+margin>0&&y+bounds.top-margin<640;
  }
  const half=geometry.size/2*(Math.abs(Math.cos(geometry.angle))+Math.abs(Math.sin(geometry.angle)));
  return x+half>0&&x-half<960&&y+half>0&&y-half<640;
 }
 function projectileHits(geometry,visual={},area='crypt',progress=1){
  if(!geometry||visual.hidden||visual.fade===0)return false;
  const q=Math.max(0,Math.min(1,progress)),size=geometry.size,cx=geometry.origin.x+(geometry.end.x-geometry.origin.x)*q,cy=geometry.origin.y+(geometry.end.y-geometry.origin.y)*q,ux=Math.cos(geometry.angle),uy=Math.sin(geometry.angle),base=heroOrigin(visual),points=heroPixels(visual),top=points.reduce((y,p)=>Math.min(y,p.y),Infinity),mask=projectileMask(area).opaque;
  // Only the visible crown of the hood can be struck. At the scheduled endpoint,
  // absorb the same tiny raster margin that prevents early visual penetration.
  const tolerance=q===1?CONTACT_MARGIN+.75:0,radius=Math.ceil(tolerance),scale=PROJECTILE_SIZE/size;
  for(const p of points){if(p.y>top+4)continue;const dx=base.x+p.x-cx,dy=base.y+p.y-cy,x=(dx*ux+dy*uy+size/2)*scale,y=(-dx*uy+dy*ux+size/2)*scale,px=Math.floor(x),py=Math.floor(y);
   for(let yy=py-radius;yy<=py+radius;yy++)for(let xx=px-radius;xx<=px+radius;xx++){
    if(xx<0||yy<0||xx>=PROJECTILE_SIZE||yy>=PROJECTILE_SIZE||!mask[yy*PROJECTILE_SIZE+xx])continue;
    if((xx===px&&yy===py)||Math.hypot(xx+.5-x,yy+.5-y)<=tolerance*scale)return true;
   }}
  return false;
 }
 function drawProjectile(ctx,atlas,column,geometry,progress,flightSeconds){
  const {x,y}=projectilePosition(geometry,progress,flightSeconds);
  const cw=atlas.width/4,ch=atlas.height/2,size=geometry.size;
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(geometry.angle);
  ctx.drawImage(atlas,Math.floor(column*cw),0,Math.floor(cw),Math.floor(ch),-size/2,-size/2,size,size);
  ctx.restore();
 }
 // Each inner opening is measured on its original 152 × 174 rendered arch.
 const leaves={stone:[5,48,55,66,110],cracked:[5,41,51,65,114],
  iron:[6,46,52,70,113],wood:[4,50,52,57,113]};
 function railPart(ctx,cell,x,y,w,h){drawCell(ctx,extras.railGates,cell%4,Math.floor(cell/4),4,2,x,y,w,h);}
 function drawDoor(ctx,option,p,progress=0){
  const t=option.traits,frame=t.cracked?'cracked':t.material,x=p.x-76,y=p.y-174;
  sprite(ctx,frame,x,y,152,174);
  const q=Math.min(1,Math.max(0,progress));
  const [cell,dx,dy,w,h]=leaves[frame]||leaves.stone;
  // Swing each half about its own outside jamb, revealing the existing dark opening.
  const face=Math.cos(q*Math.PI/2),width=Math.round(w/2*face);
  if(extras.railGates&&width>0){
   const atlas=extras.railGates,cw=atlas.width/4,ch=atlas.height/2,sx=(cell%4)*cw;
   ctx.drawImage(atlas,sx,ch,cw/2,ch,x+dx,y+dy,width,h);
   ctx.drawImage(atlas,sx+cw/2,ch,cw/2,ch,x+dx+w-width,y+dy,width,h);
  }
  if(t.rune&&q<1)sprite(ctx,t.rune,p.x-26-(1-face)*23,p.y-113,52*face,52,face);
  for(let i=0;i<t.torches;i++)sprite(ctx,i<t.lit?'torch':'unlit',p.x+(i===0?-85:55),p.y-118,30,56);
 }
 function specimen(ctx,area,t,p,operation,reduced){
  const district=AREAS[area]??0,left=p.x-p.w/2,top=p.top;
  drawCell(ctx,extras.lessonBases,district%4,Math.floor(district/4),4,2,left,top,p.w,p.h);
  const mount=['inlaid','clasped','wrapped','tied'].indexOf(t.attachment);
  if(mount>=0){
   const rope=mount>=2,width=p.w*(rope?.68:.31),height=p.h*(rope?.26:.31);
   drawCell(ctx,extras.lessonMounts,mount%2,Math.floor(mount/2),2,2,p.x-width/2,top+p.h*.18,width,height);
  }
  let pattern=['crossed','parallel','alternating','grouped','symmetric','asymmetric'].indexOf(t.pattern);
  if(t.pattern==='grid')pattern=8+(t.crossed?0:2)+(t.symmetric?0:1);
  if(pattern>=0){
   const w=p.w*.65,h=p.h*.35,x=p.x-w/2,y=top+p.h*.48;
   drawCell(ctx,extras.lessonPatterns,pattern%4,Math.floor(pattern/4),4,4,x,y,w,h);
   if(t.pattern==='alternating'||t.pattern==='grouped'){
    // Shade the bronze bars of the engraved plate. The light and dark runs
    // stay legible after reducing the playfield to a phone screen.
    const darkRows=t.pattern==='alternating'?[35,67]:[51,67];
    ctx.fillStyle='#231a24ad';
    for(const row of darkRows)ctx.fillRect(Math.round(x+w*18/144),Math.round(y+h*row/96),Math.round(w*108/144),Math.max(2,Math.round(h*11/96)));
   }
  }
  if(t.rune)sprite(ctx,t.rune,left+p.w*.70,top+p.h*.065,p.w*.26,p.h*.28);
  // The brass plunger is separate from both the test engraving and its mount.
  // Split this atlas prop at its spring so only the cap travels on a press.
  const a=extras.mechanisms;if(!a)return;
  const cw=a.width/3,ch=a.height/3,sx=2*cw,sy=ch;
  const bw=Math.round(p.w*.29),bh=Math.round(p.h*.24),bx=Math.round(left+p.w*(p.x<480?.68:.03)),by=Math.round(p.y-bh);
  const q=clamp(operation?.progress||0);
  const depth=operation?(operation.correct?span(q,.04,.32):Math.sin(Math.PI*q)):0;
  const press=Math.round(bh*.22*(reduced?Number(depth>.5):depth));
  const cap=Math.round(bh*.40),cut=Math.round(ch*.40);
  ctx.drawImage(a,sx,sy+cut,cw,ch-cut,bx,by+cap+press,bw,bh-cap-press);
  ctx.drawImage(a,sx,sy,cw,cut,bx,by+press,bw,cap);
  const lit=operation&&q>.15&&(operation.correct||q<.85);
  const faceX=bx+Math.round(bw*.24),faceY=by+press+Math.round(cap*.08),faceW=Math.round(bw*.52);
  ctx.fillStyle='#362a29';ctx.fillRect(faceX-2,faceY-1,faceW+4,Math.round(cap*.75));
  ctx.fillStyle=lit?(operation.correct?'#82d5a1':'#ec765d'):'#c3bcb0';
  ctx.fillRect(faceX,faceY,faceW,Math.round(cap*.48));
  ctx.fillStyle=lit?'#f3ecc9':'#eee4cc';ctx.fillRect(faceX+2,faceY,faceW-4,2);
 }
 function machinePart(ctx,cell,x,y,w,h){
  drawCell(ctx,extras.mechanisms,cell%3,Math.floor(cell/3),3,3,x,y,w,h);
 }
 let darkLamp;
 function lamp(ctx,x,y,w,h,lit){
  // Fit the glass and metal housing, excluding the mostly empty atlas cell.
  const source=[sw*(1+55/229),sh*(4+19/229),sw*105/229,sh*182/229];
  if(!lit&&makeCanvas){
   if(!darkLamp){
    darkLamp=makeCanvas(52,91);const m=darkLamp.getContext('2d');m.imageSmoothingEnabled=false;
    m.drawImage(sprites,...source,0,0,52,91);
    if(m.getImageData&&m.putImageData){
     const pixels=m.getImageData(0,0,52,91),a=pixels.data;
     for(let py=45;py<71;py++)for(let px=4;px<48;px++){
      const i=4*(py*52+px);
      if(a[i]<=54||a[i]<a[i+2]*1.25)continue;
      const shade=Math.round(a[i]*.10);
      a[i]=15+shade;a[i+1]=25+shade;a[i+2]=34+shade;
     }
     m.putImageData(pixels,0,0);
    }
   }
   ctx.drawImage(darkLamp,0,0,52,91,x,y,w,h);
  }else{
   ctx.drawImage(sprites,...source,x,y,w,h);
   if(!lit){ctx.fillStyle='#29363e';ctx.fillRect(x+w*.15,y+h*.52,w*.70,h*.21);}
  }
 }
 function fittings(ctx,t,cx,base,w,h){
  // Fixed positions leave space to count each hanging lamp, even when the
  // gold ribbon and a gold rune appear on the same machine.
  if(t.rune)sprite(ctx,t.rune,cx-w*.24,base-h*.65,w*.43,h*.38);
  if(t.banded)drawCell(ctx,extras.ribbons,0,1,2,2,cx+w*.16,base-h*.86,w*.40,h*.34);
  for(let i=0;i<2;i++){
   lamp(ctx,Math.round(cx+w*(i===0?-.51:.29)),Math.round(base-h*.36),
    Math.round(w*.22),Math.round(h*.33),i<(t.count||0));
  }
 }
 function mechanism(ctx,option,p,operation,reduced){
  const t=option.traits,q=Math.max(0,Math.min(1,operation?.progress||0));
  const good=Boolean(operation?.correct),active=good?q:0;
  const clunk=!good&&!reduced?Math.sin(q*Math.PI*4)*(1-q)*5:0;
  const x=p.x+clunk,w=p.w*.91,h=p.h*.90,y=p.y;
  if(p.type==='sluice'){
   if(active>.10){
    const stream=reduced?1:Math.min(1,(active-.10)*1.7);
    machinePart(ctx,2,x-w*.185,y-10,w*.37,Math.max(1,stream*66));
    if(!reduced){
     ctx.fillStyle='#c6fff3';
     for(let i=0;i<3;i++)ctx.fillRect(Math.round(x+(i-1)*w*.053),Math.round(y+3+stream*((active*96+i*14)%44)),3,4);
    }
   }
   machinePart(ctx,active>.10?1:0,x-w/2,y-h,w,h);
   fittings(ctx,t,x,y,w,h);
  }else{
   const turn=Math.max(0,Math.min(1,(active-.12)/.43));
   const turnWidth=reduced?1:1-.20*Math.sin(turn*Math.PI);
   machinePart(ctx,turn>.47?7:6,x-w*turnWidth/2,y-h*.84,w*turnWidth,h*.84);
   fittings(ctx,t,x,y,w,h*.84);
   if(good&&q>0&&q<.49&&!reduced){
    const strike=Math.sin(q/.49*Math.PI);
    ctx.save();ctx.translate(x+w*.47,y-h*.45);
    ctx.rotate(-.18-strike*1.32);machinePart(ctx,8,-w*.08,-h*.36,w*.20,h*.40);ctx.restore();
   }
   if(active>.25){
    const q=(active-.25)/.75;
    ctx.save();ctx.globalAlpha*=reduced?.85:1-q*.65;
    for(let wave=0;wave<3;wave++){
     const phase=reduced?(wave+1)/4:(q+wave/3)%1,r=7+phase*29;
     ctx.fillStyle=wave===1?'#ffcb6b':'#ffe8a6';
     for(const dir of [-1,1]){
      ctx.fillRect(Math.round(x+dir*r)-2,Math.round(y-h*.87-r*.42),4,7);
      ctx.fillRect(Math.round(x+dir*(r-3))-2,Math.round(y-h*.9-r*.42),4,4);
     }
    }
    if(!reduced&&q<.95){
     const dx=x+(480-x)*q,dy=y-h*.88+(NORTH_WALL_Y-y+h*.88)*q;
     ctx.fillStyle='#ffe1a0';
     for(let step=-2;step<=2;step++)ctx.fillRect(Math.round(dx+step*5),Math.round(dy+Math.abs(step)*3),5,4);
    }
    ctx.restore();
   }
  }
 }
 const OB={sleep:0,walk:2,fish:3,bell:4,redBowl:5,blueBowl:6,empty:7,full:8,redLever:9,blueLever:11};
 const RIVER={top:247,height:84};
 // World-space ends of the channel on the floor art. The archive bookcases,
 // glacier buttresses and other foreground walls project by different amounts.
 const riverSpan={
  crypt:[[66,895],[144,816],[128,828]],tide:[[116,824],[130,812],[135,819]],
  fungus:[[82,879],[120,846],[101,869]],forge:[[129,833],[131,825],[136,827]],
  archive:[[139,824],[143,819]],glacier:[[126,832],[137,826]],
  amber:[[133,829],[129,828]],astral:[[128,827],[122,837]]
 };
 const clamp=q=>Math.min(1,Math.max(0,q));
 const span=(q,from,to)=>clamp((q-from)/(to-from));
 function obstacleSprite(ctx,part,cx,bottom,w,h){
  if(extras.obstacleProps)drawCell(ctx,extras.obstacleProps,part%4,Math.floor(part/4),4,4,cx-w/2,bottom-h,w,h);
 }
 function terrainPart(ctx,part,x,y,w,h){
  if(extras.obstacleTerrain)drawCell(ctx,extras.obstacleTerrain,part%2,Math.floor(part/2),2,2,x,y,w,h);
 }
 function sparkleWater(ctx,x,y,scale){
  for(const [dx,dy] of [[-16,0],[-11,-7],[0,-12],[10,-8],[15,-1]]){
   ctx.fillStyle=dy%2?'#a0e8d3':'#77c7c6';
   ctx.fillRect(Math.round(x+dx*scale),Math.round(y+dy*scale),4,4);
  }
 }
 function obstacleStation(ctx,option,p,operation,reduced){
  const t=option.traits,red=t.colour==='red',q=clamp(operation?.progress||0);
  if(p.type==='feeding'){
   const bowlX=p.x-(t.bell?6:0),bowlW=90;
   obstacleSprite(ctx,red?OB.redBowl:OB.blueBowl,bowlX,p.y,bowlW,51);
   if(t.bell){
    const swing=operation&&!operation.correct&&!reduced?Math.sin(q*22)*(1-q)*.32:0;
    ctx.save();ctx.translate(bowlX+37,p.y-59);ctx.rotate(swing);
    obstacleSprite(ctx,OB.bell,0,40,33,42);ctx.restore();
   }
   return;
  }
  const pulled=operation&&(operation.correct?q>.06:q>.08&&q<.80);
  if(p.type==='cart'){
   obstacleSprite(ctx,(red?OB.redLever:OB.blueLever)+(pulled?1:0),p.x-28,p.y,69,Math.min(82,p.h-2));
   railPart(ctx,t.direction==='right'?2:3,p.x+5,p.y-60,58,60);
   return;
  }
  const basinX=p.x+29,basinY=p.y;
  obstacleSprite(ctx,pulled?(red?OB.redLever:OB.blueLever)+1:(red?OB.redLever:OB.blueLever),
    p.x-34,p.y-1,62,77);
  const filling=operation?.correct&&q>.63;
  obstacleSprite(ctx,t.basin==='full'||filling?OB.full:OB.empty,basinX,basinY,69,56);
  if(operation&&!operation.correct&&q>.16&&q<.83&&option.response==='surge'){
   sparkleWater(ctx,basinX,basinY-40,reduced?.7:1+Math.sin(q*15)*.4);
  }
 }
 function floodRoom(ctx,scene,state,reduced){
  const {top,height}=RIVER;
  const spans=riverSpan[scene.area]||riverSpan.crypt;
  const [left,right]=wallSpan(scene,spans[scene.backgroundVariant??0]||spans[0]);
  const q=clamp(state?.progress||0),good=state?.correct;
  const surge=!good&&state?.response==='surge'?Math.sin(q*Math.PI):0;
  const trickle=!good&&state?.response==='trickle'?Math.sin(q*Math.PI)*.12:0;
  const clear=good?(reduced?Number(q>.44):span(q,.12,.88)):trickle;
  const tile=(right-left)/2;
  for(let n=0;n<2;n++){
   const x=left+tile*n;
   terrainPart(ctx,1,x,top,tile+1,height);
   if(clear<1){
    ctx.save();ctx.globalAlpha*=1-clear;
    terrainPart(ctx,0,x,top,tile+1,height+(reduced?0:Math.round(surge*12)));ctx.restore();
   }
  }
  if(good)for(let i=0;i<3;i++){
   const rise=reduced?Number(q>.44):span(q,.23+i*.125,.51+i*.125);
   if(!rise)continue;
   const x=480+[0,-4,1][i],y=top+4+i*27;
   ctx.save();ctx.globalAlpha*=rise;
   terrainPart(ctx,2,x-39,y+(1-rise)*11,78,31);ctx.restore();
   if(rise<.93&&!reduced)sparkleWater(ctx,x,y+23,.65);
  }
 }
 // Clamp the buffers to this backdrop's actual wall faces; wheels sit on the near rail.
 function horizontalTrack(ctx,left,right,top,height){
  const a=extras.railGates;if(!a)return;
  const cw=a.width/4,ch=a.height/2,segment=(right-left)/5;
  for(let i=0;i<5;i++){
   const x=Math.round(left+i*segment),end=Math.round(left+(i+1)*segment);
   ctx.drawImage(a,cw*1.068,0,cw*.859,ch,x,top,end-x+1,height);
  }
 }
 function sidingSpan(scene){
  const spans=riverSpan[scene.area]||riverSpan.crypt;
  return wallSpan(scene,spans[scene.backgroundVariant??0]||spans[0]);
 }
 function yardCar(ctx,scene,option,p,operation,reduced){
  const a=extras.railGates;if(!a)return;
  const [left,right]=sidingSpan(scene),q=clamp(operation?.progress||0);
  const moving=operation?.correct?(reduced?Number(q>.68):span(q,.10,.86)):0;
  const travel=moving*moving*(3-2*moving);
  const out=p.x<480?left-p.w*.55:right+p.w*.55;
  const x=p.x+(out-p.x)*travel,w=p.w,h=p.h,y=p.y;
  ctx.save();ctx.beginPath();ctx.rect(left,0,right-left,640);ctx.clip();
  railPart(ctx,0,x-w/2,y-h,w,h);
  const wheel=w*.177,wheelY=y-h*.175;
  for(const dx of [-.274,.262]){
   ctx.save();ctx.translate(x+w*dx,wheelY);
   if(moving&&!reduced)ctx.rotate((x-p.x)/(wheel/2));
   railPart(ctx,7,-wheel/2,-wheel/2,wheel,wheel);ctx.restore();
  }
  // On this shallow hopper each readable fitting has its own proportions.
  // The round rune is bolted to the front; a lamp hangs from either side.
  const t=option.traits,badge=Math.round(h*.72),lampW=Math.round(w*.185),lampH=Math.round(h*.47);
  if(t.rune)sprite(ctx,t.rune,x-badge/2,y-h*.82,badge,badge);
  if(t.banded)drawCell(ctx,extras.ribbons,0,1,2,2,x+w*.13,y-h*.99,w*.42,w*.42);
  for(let i=0;i<2;i++){
   const lx=Math.round(x+(i===0?-w*.49:w*.31)),ly=Math.round(y-h*.66);
   lamp(ctx,lx,ly,lampW,lampH,i<t.count);
   // Keep the lens visible above the wheels on a small screen.
   ctx.fillStyle=i<t.count?'#ffcd59':'#344659';
   ctx.fillRect(lx+Math.round(lampW*.23),ly+Math.round(lampH*.52),Math.round(lampW*.54),Math.round(lampH*.24));
   if(i<t.count){ctx.fillStyle='#fff0b3';ctx.fillRect(lx+Math.round(lampW*.42),ly+Math.round(lampH*.54),Math.max(2,Math.round(lampW*.13)),Math.round(lampH*.18));}
  }
  if(operation&&!operation.correct&&q>.13&&q<.80){
   ctx.fillStyle='#ed7c59';ctx.fillRect(Math.round(x-w*.08),Math.round(y-h*.26),Math.round(w*.16),3);
  }
  ctx.restore();
 }
 function railRoom(ctx,scene,state,reduced){
  const spans=riverSpan[scene.area]||riverSpan.crypt;
  const [left,right]=wallSpan(scene,spans[scene.backgroundVariant??0]||spans[0]),railTop=RAIL_CROSSING.top;
  // A single stone crossing passes beneath both running rails. The north
  // and south paving lips distinguish it from the perpendicular timber ties.
  const crossingLeft=RAIL_CROSSING.x-49;
  for(let row=0;row<3;row++)terrainPart(ctx,2,crossingLeft,railTop-17+row*24,98,31);
  horizontalTrack(ctx,left,right,railTop,RAIL_CROSSING.height);
  const q=state?.progress||0,goingRight=scene.obstacle.direction==='right';
  const t=state?.correct?(reduced?Number(q>=.50):span(q,.12,.94)):0;
  const eased=t*t*(3-2*t);
  const buffer=goingRight?right-96:left+96,x=480+(buffer-480)*eased;
  const w=188,h=109,bottom=railTop+31;
  railPart(ctx,0,x-w/2,bottom-h,w,h);
  const wheelY=bottom-20;
  for(const offset of [-.274,.262]){
   ctx.save();ctx.translate(x+w*offset,wheelY);
   if(t&&!reduced)ctx.rotate((x-480)/18);
   railPart(ctx,7,-18,-18,36,36);ctx.restore();
  }
 }
 function feedingRoom(ctx,state,reduced,time){
  const guard={x:480,y:271},q=clamp(state?.progress||0);
  const breath=reduced?0:Math.round((1+Math.sin(time/580))*1.5);
  if(!state?.correct||q<.23){
   obstacleSprite(ctx,OB.sleep,guard.x,guard.y,172,106+breath);
   return;
  }
  const bowl=state.placement,feedingFromLeft=bowl.x<480;
  const targetX=bowl.x+(feedingFromLeft?-46:46),targetY=bowl.y-9;
  // Stay above the adventurer's lane until the short walk down to the bowl.
  const turn=bowl.position==='middle'?.43:.56;
  const across=reduced?Number(q>=.55):span(q,.25,turn);
  const down=reduced?across:span(q,turn,.76);
  const x=guard.x+(targetX-guard.x)*across,y=guard.y+(targetY-guard.y)*down;
  const parked=down===1;
  const paws=!parked&&!reduced?Math.abs(Math.sin((across+down)*4*Math.PI))*4:0;
  const nod=parked&&!reduced?Math.round(Math.sin(time/115)*1.5):0;
  const facingLeft=q<turn?feedingFromLeft:!feedingFromLeft;
  ctx.save();
  if(facingLeft){ctx.translate(x*2,0);ctx.scale(-1,1);}
  obstacleSprite(ctx,OB.walk,x,y-paws,142,108+nod);
  ctx.restore();
 }
 function personAction(ctx,scene,positions,visual){
  const action=scene.taskAction;
  if(!action||visual.hidden)return;
  const meeting=visual.interaction,recipient=meeting&&positions.find(p=>p.id===meeting.id);
  const q=meeting?.progress||0;
  if(action==='return'){
   const hand=meeting?.from||visual;
   const startX=(hand.x??PLAYER.x)-40,startY=(hand.y??PLAYER.y)-55;
   const endX=recipient?recipient.x+(recipient.x<480?24:-24):startX;
   const endY=recipient?recipient.y-51:startY;
   const travel=visual.reduced?Number(q>.5):q;
   encounter(ctx,'item',{type:'book',color:'blue'},startX+(endX-startX)*travel-27,startY+(endY-startY)*travel-23,54,46);
  }else if(recipient&&action!=='guide'&&q<1){
   // The explorer speaks; contacts who know the password or witnessed the delivery reply.
   const reply=action!=='deliver'&&q>.45;
   const x=Math.round(reply?recipient.x:meeting.from.x),y=Math.round(reply?recipient.top+12:meeting.from.y-136);
   const sign=x<480?1:-1;
   ctx.fillStyle='#ffe6a5';
   ctx.fillRect(x+sign*24,y,6,5);
   ctx.fillRect(x+sign*33,y-5,6,5);
   if(q>.20)ctx.fillRect(x+sign*42,y-10,6,5);
  }
 }
 function fishDelivery(ctx,visual,state){
  const hand={x:(visual.x??PLAYER.x)-33,y:(visual.y??PLAYER.y)-55},reduced=visual.reduced;
  if(!state){
   if(!visual.hidden)obstacleSprite(ctx,OB.fish,hand.x,hand.y,52,32);
   return;
  }
  const p=state.placement,q=clamp(state.progress),dish={x:p.x-(state.traits.bell?6:0),y:p.y-23};
  if(state.correct&&q>=.90)return;
  const drop=reduced?Number(q>=.19):span(q,0,.22);
  const recover=state.correct?0:reduced?Number(q>=.86):span(q,.80,1);
  const travel=drop*(1-recover);
  const x=hand.x+(dish.x-hand.x)*travel;
  const y=hand.y+(dish.y-hand.y)*travel-(reduced?0:15*Math.sin(travel*Math.PI));
  obstacleSprite(ctx,OB.fish,x,y,52,32);
 }
 function paintTarget(ctx,scene,option,p,collapsed=false,operation=null,reduced=false,doorProgress=0){
  const type=option.targetType||scene.targetType;
  if(type==='door')return drawDoor(ctx,option,p,doorProgress);
  if(blocked(scene,type))return obstacleStation(ctx,option,p,operation,reduced);
  if(dispatch(scene))return yardCar(ctx,scene,option,p,operation,reduced);
  if(MECHANISMS.includes(type))return mechanism(ctx,option,p,operation,reduced);
  if(option.traits.type==='specimen')return specimen(ctx,scene.area,option.traits,p,operation,reduced);
  if(type==='bridge'||type==='ladder'){
   const atlas=extras.crossings;if(!atlas)return;
   const i=crossingIndex(type,option.traits,collapsed),[sx,sy,sw,sh]=CROSSING_FRAMES[i],cw=atlas.width/4,ch=atlas.height/2;
   ctx.drawImage(atlas,(i%4+sx/384)*cw,(Math.floor(i/4)+sy/512)*ch,sw*cw/384,sh*ch/512,p.x-p.w/2,p.top,p.w,p.h);
   if(!collapsed&&extras.ribbons){const a=extras.ribbons,i=Math.max(0,RIBBONS.indexOf(option.traits.trim||option.traits.rune)),cw=a.width/2,ch=a.height/2;ctx.drawImage(a,Math.floor(i%2*cw),Math.floor(Math.floor(i/2)*ch),Math.floor(cw),Math.floor(ch),p.x+p.w*.37-38,p.top+p.h*.12,76,84);}
   return;
  }
  if(type==='person'&&['cart','dispatch'].includes(scene.chain?.actionType)&&extras.newCast){
   // The rail crew has a coiled line, a tool belt and a mallet at the left hip.
   // The hood, facing and clue-bearing right hand remain fully visible.
   castMember(ctx,option.traits,1,p.x-p.w/2,p.top,p.w,p.h);
   if(extras.mechanisms)machinePart(ctx,8,p.x-p.w*.44,p.top+p.h*.51,p.w*.29,p.h*.30);
   return;
  }
  encounter(ctx,type,option.traits,p.x-p.w/2,p.top,p.w,p.h,scene.area);
 }
 // Reveal the trap with the same coloured box, decoration and metal/wood grain
 // the pupil chose. Only its lid is separated; no replacement chest flashes in.
 function openBox(ctx,option,p,opening,mimic,area,record=false){
  const district=(AREAS[area]??0)-4,regional=district>=0&&extras.newItems;
  const a=regional?extras.newItems:extras.items,i=itemIndex(option.traits);if(!a||i<0||i>=8)return false;
  const material=Math.floor(i/4),col=regional?material:i%4,row=regional?district:material,cw=Math.floor(a.width/4),ch=Math.floor(a.height/4),sx=Math.floor(col*a.width/4),sy=Math.floor(row*a.height/4);
  const cutRatio=regional?[.53,.47,.45,.48][district]:material?.51:.57;
  const cut=Math.round(ch*cutRatio),x=Math.round(p.x-p.w/2),y=Math.round(p.top),dy=Math.round(cut/ch*p.h),seam=y+dy;
  const gap=Math.max(1,Math.round(p.h*(mimic?.29:.19)*opening)),inset=Math.round(p.h*.08*opening);
  const left=Math.round(x+p.w*(regional?.12:[.204,.15,.115,.083,.201,.134,.096,.073][i])),right=Math.round(x+p.w*(regional?.88:[.903,.877,.845,.81,.912,.893,.868,.836][i])),mw=right-left;
  ctx.drawImage(a,sx,sy+cut,cw,ch-cut,x,seam,p.w,p.h-dy);
  const block=(color,bx,by,bw,bh)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(bx),Math.round(by),Math.max(1,Math.round(bw)),Math.max(1,Math.round(bh)));};
  block(mimic?'#281823':'#392819',left,seam-gap,mw,gap+2);
  block(mimic?'#552437':'#77502a',left+3,seam-gap+3,mw-6,gap-5);
  if(mimic){
   block('#311a2a',left+7,seam-gap+5,mw-14,gap*.68);
   block('#a7474e',left+mw*.35,seam-6,mw*.37,5);
   const tooth=(tx,ty,height,invert)=>{const h=Math.min(height,gap*.55),u=Math.max(1,Math.round(h/3));for(let j=0;j<3;j++){const w=(3-j)*u;block(j===0?'#bc9978':'#fae4b2',tx-w/2,ty+(invert?-j-1:j)*u,w,u);}};
   for(let j=0;j<5;j++)tooth(left+mw*(.1+.2*j),seam-gap+1,p.h*(j%2?.058:.095),false);
   for(let j=0;j<4;j++)tooth(left+mw*(.20+.2*j),seam,p.h*.065,true);
  }else if(!record)for(const [off,up] of [[.18,.37],[.42,.62],[.66,.37]])sprite(ctx,'coin',left+mw*off,seam-gap*up-2,p.w*.18);
  // Foreshorten the upper part as the lid swings back on its hinge.
  ctx.drawImage(a,sx,sy,cw,cut,x,y-gap+inset,p.w,dy-inset);
  if(regional)itemRibbon(ctx,option.traits.decoration,x,y-gap+inset,p.w,p.h);
  if(record&&opening>.18){
   const reveal=span(opening,.18,.76);
   sprite(ctx,'scroll',p.x-p.w*.23,seam-p.h*(.08+.32*reveal),p.w*.46,p.h*.40,reveal);
  }
  if(mimic&&opening>.18){for(const eye of [.23,.76]){
   const ex=left+mw*eye,ey=seam-gap-Math.round(p.h*.085),u=Math.max(2,Math.round(p.h/34));
   block('#281729',ex-2*u,ey-u,4*u,3*u);block('#f7a74c',ex-u,ey,2*u,u);block('#ffdf86',ex,ey,u,u);
  }}
  return true;
 }
 function spark(ctx,x,y,k,curse=false){
  const u=k<.5?3:2,dist=2+k*4;
  for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1],[0,-1],[1,0],[-1,0]]){ctx.fillStyle=curse?'#ab8bd5':'#cc834e';ctx.fillRect(Math.round(x+dx*dist*u),Math.round(y+dy*dist*u),u*2,u*2);}
  ctx.fillStyle=curse?'#ddc3ff':'#fff1b5';ctx.fillRect(Math.round(x)-u,Math.round(y)-3*u,2*u,6*u);ctx.fillRect(Math.round(x)-3*u,Math.round(y)-u,6*u,2*u);
 }
 function showReaction(ctx,scene,option,p,rx,visual){
  const q=Math.max(0,Math.min(1,rx.progress)),heroX=visual.x??PLAYER.x,heroY=visual.y??PLAYER.y,dir=p.x<480?1:-1;
  if(rx.type==='ladder'||rx.type==='bridge'){
   paintTarget(ctx,scene,option,p,true);
   // Falling parts are cut from this crossing's intact sprite, matching its
   // actual rung/plank texture. Its neighbouring routes stay untouched.
   const a=extras.crossings;if(!a)return;const idx=crossingIndex(p.type,option.traits),cw=a.width/4,ch=a.height/2,isLadder=p.type==='ladder',iron=option.traits.material==='iron';
   const [sx,sy,sw,sh]=CROSSING_FRAMES[idx];
   const centre=isLadder?(iron?.49:.58):(iron?.50:.60),width=isLadder?.26:.33,height=isLadder?.052:.060;
   for(let j=0;j<2;j++){
    if(visual.reduced&&q>.55)continue;
    const fx=centre-width/2,fy=(isLadder?.418:.455)+(isLadder?.13:.08)*j,dw=width*384/sw*p.w,dh=height*512/sh*p.h;
    const x=p.x-p.w/2+((fx+width/2)*384-sx)/sw*p.w+(j?1:-1)*q*12,y=p.top+((fy+height/2)*512-sy)/sh*p.h+q*q*(isLadder?82:40);
    ctx.save();ctx.globalAlpha*=1-q;ctx.translate(Math.round(x),Math.round(y));if(!visual.reduced)ctx.rotate((j?1:-1)*q*(isLadder?1.5:.8));
    ctx.drawImage(a,cw*(idx%4+fx),ch*(Math.floor(idx/4)+fy),cw*width,ch*height,-dw/2,-dh/2,dw,dh);ctx.restore();
   }
   return;
  }
  const lunge=q<.24?-Math.sin(Math.PI*q/.24)*.10:q<.48?(q-.24)/.24:q<.60?1:Math.max(0,(1-q)/.40);
  const dx=dir*Math.max(0,Math.abs(heroX-p.x)-46)*lunge,dy=(heroY-p.y-12)*lunge,hop=visual.reduced?0:Math.max(0,lunge)*10;
  const reach={...p,x:p.x+(visual.reduced?dx*.10:dx),top:p.top+(visual.reduced?0:dy-hop),y:p.y+(visual.reduced?0:dy-hop)};
  if(rx.type==='mimic'){
   const opening=q<.32?q/.32:q<.46?1:q<.57?1-(q-.46)/.11*.38:q<.80?.62:Math.max(0,(1-q)/.20)*.62;
   if(openBox(ctx,option,reach,Math.max(0,opening),true,scene.area))return;
  }
  if(rx.type==='person'){
   ctx.save();if(!visual.reduced){ctx.translate(Math.round(reach.x),Math.round(reach.y));ctx.rotate(dir*(q<.24?-.06:.10)*Math.abs(lunge));ctx.translate(-Math.round(reach.x),-Math.round(reach.y));}
   const face=q>=.22&&q<=.8?{...option,traits:{...option.traits,facing:'front'}}:option;
   paintTarget(ctx,scene,face,reach);ctx.restore();
   if(q>=.35&&q<.66){
    const t=(q-.35)/.31,hx=heroX-dir*22,hy=heroY-67;
    // The swing reads from the attacking hand toward the contact spark.
    for(let j=0;j<5;j++){const a=j/4;ctx.fillStyle=j<2?'#cc834e':'#f7db97';ctx.fillRect(Math.round(hx-dir*(1-a)*42),Math.round(hy-14+14*a*a+8*t),7,3);}
   }
   return;
  }
  // A sealed urn or legacy item releases a curse; it never turns into a box.
  paintTarget(ctx,scene,option,p);
  if(q>.18&&q<.66){const t=Math.min(1,(q-.18)/.30),x=p.x+(heroX-p.x)*t,y=p.y-p.h*.6+(heroY-67-p.y+p.h*.6)*t;spark(ctx,x,y,t,true);}
 }
 function outline(ctx,scene,option,p,collapsed){
  if(!makeCanvas)return;const key=scene.id+':'+p.id+':'+!!collapsed;
  if(!outlineCache||outlineCache.key!==key){const x=Math.floor(p.x-p.w/2-10),y=p.top-24,c=makeCanvas(p.w+20,p.h+60),m=c.getContext('2d');m.imageSmoothingEnabled=false;m.save();m.translate(-x,-y);paintTarget(m,scene,option,p,collapsed);m.restore();m.globalCompositeOperation='source-in';m.fillStyle='#ffe4a1';m.fillRect(0,0,c.width,c.height);outlineCache={key,c,x,y};}
  const {c,x,y}=outlineCache;ctx.save();ctx.globalAlpha*=.9;for(const [dx,dy] of [[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[-2,2],[2,-2],[2,2]])ctx.drawImage(c,x+dx,y+dy);ctx.restore();
 }
 function background(ctx,scene){
  if(scene.targetType==='entrance'&&extras.entrance){ctx.drawImage(extras.entrance,0,0,extras.entrance.width,extras.entrance.height,0,0,960,640);return;}
  if((scene.guardian||scene.backgroundRole==='arena')&&extras.arena){ctx.drawImage(extras.arena,0,0,extras.arena.width,extras.arena.height,0,0,960,640);return;}
  const district=AREAS[scene.area]??0,area=district%4,regional=district>=4;
  const terrain=scene.terrain==='gap'?((regional&&extras.newGaps)||extras.gaps):scene.terrain==='ledge'?((regional&&extras.newLedges)||extras.ledges):null;
  if(terrain){drawCell(ctx,terrain,area%2,Math.floor(area/2),2,2,0,0,960,640);return;}
  const variant=scene.backgroundVariant??0;
  const key=regional&&extras.newRooms?(variant===1&&extras.newRoomsA?'newRoomsA':'newRooms'):
   variant===1&&extras.roomsA?'roomsA':variant===2&&extras.roomsB?'roomsB':'rooms';
  const atlas=key==='rooms'?rooms:extras[key],rw=atlas.width/2,rh=atlas.height/2,sx=area%2*rw,sy=Math.floor(area/2)*rh;
  const wall=WALL_ROWS[key][area]*rh/512;
  const strips=wideFloor(scene)?[0,210,750,960]:[0,960];
  for(let i=1;i<strips.length;i++){
   const left=strips[i-1],right=strips[i],x=wideFloor(scene)?questScreenX(left):left;
   const width=(wideFloor(scene)?questScreenX(right):right)-x,sourceX=sx+rw*left/960,sourceW=rw*(right-left)/960;
   ctx.drawImage(atlas,sourceX,sy,sourceW,wall,x,0,width,NORTH_WALL_Y);
   ctx.drawImage(atlas,sourceX,sy+wall,sourceW,rh-wall,x,NORTH_WALL_Y,width,640-NORTH_WALL_Y);
  }
 }
 // Foreshorten the painted door leaves inside their existing stone arch.
 // The six horizontal spans follow the pixel steps at the arch's crown.
 function openEntrance(ctx,progress){
  if(!extras.entrance||!progress)return;
  const atlas=extras.entrance,u=atlas.width/960,v=atlas.height/640;
  const t=Math.min(1,progress*1.48),swing=t*t*(3-2*t),hinge=1-.78*swing;
  const spans=[[97,8,19],[105,9,36],[114,12,53],[126,12,65],[138,15,75],[153,172,82]];
  for(const [y,h,r] of spans){
   const left=480-r,right=480+r,leaf=Math.max(1,Math.round(r*hinge));
   ctx.fillStyle='#141425';ctx.fillRect(left,y,r*2,h);
   if(y===153){
    for(const [step,color] of [[288,'#272132'],[303,'#3f2c32'],[315,'#735034'],[322,'#c98640']]){
     ctx.fillStyle=color;ctx.fillRect(left,step,r*2,325-step);
    }
   }
   ctx.drawImage(atlas,left*u,y*v,r*u,h*v,left,y,leaf,h);
   ctx.drawImage(atlas,480*u,y*v,r*u,h*v,right-leaf,y,leaf,h);
  }
 }
 function room(ctx,scene,visual={},time=0){
  const groups=scene.chain?questGroups(scene):null;
  const roomScene=groups?.action||scene,positions=groups?questActionLayout(roomScene):ordinaryLayout(scene);
  const sources=groups?questSourceLayout(groups.source):[];
  const activeSources=scene.chain?.step===1;
  const district=AREAS[scene.area]??0,area=district%4,type=roomScene.targetType||'door';
  ctx.save();ctx.imageSmoothingEnabled=false;background(ctx,roomScene);
  if(type==='entrance')openEntrance(ctx,visual.entryProgress);
  if(scene.guardian){ctx.fillStyle='#140e2440';ctx.fillRect(0,0,960,640);}
  if(type!=='door'&&type!=='arena'&&type!=='entrance'){
   const powered=dispatch(roomScene)||type==='console';
   const ready=!powered||(visual.operation?.correct&&visual.operation.progress>=.76&&positions.some(p=>p.id===visual.operation.id));
   drawDoor(ctx,{traits:{material:'stone',torches:0,lit:0}},{x:480,y:threshold(scene,'middle')+DOOR_SILL_INSET},
    !activeSources&&ready?(visual.exitProgress||0):0);
  }
  if(dispatch(roomScene)){
   const [left,right]=sidingSpan(roomScene),rows=new Set(positions.map(p=>p.y));
   for(const y of rows)horizontalTrack(ctx,left,right,y-17,26);
  }
  let obstacleState=null;
  if(blocked(roomScene,type)){
   if(visual.operation&&!activeSources){
    const option=roomScene.options.find(choice=>choice.id===visual.operation.id);
    if(option)obstacleState={...visual.operation,traits:option.traits,response:option.response,placement:positions.find(p=>p.id===option.id)};
   }
   if(type==='cart'&&extras.railGates)railRoom(ctx,roomScene,obstacleState,visual.reduced);
   else if(type==='feeding')feedingRoom(ctx,obstacleState,visual.reduced,time);
   else floodRoom(ctx,roomScene,obstacleState,visual.reduced);
  }
  const allPositions=groups?[...positions,...sources]:positions;
  const reaction=visual.reaction,showing=reaction&&allPositions.find(p=>p.id===reaction.id);
  for(const p of allPositions){
   const isSource=groups&&sources.includes(p),targetScene=isSource?groups.source:roomScene;
   const option=targetScene.options.find(o=>o.id===p.id),enabled=!groups||Boolean(isSource)===activeSources;
   const selected=enabled&&(visual.hover===p.id||visual.selected===p.id),collapsed=visual.collapsedId===p.id||visual.collapsedIds?.includes(p.id),opened=visual.openChestId===p.id;
   if(p===showing||(visual.collectedId===p.id&&!opened))continue;
   ctx.save();if(scene.completedOptionIds?.includes(p.id))ctx.globalAlpha*=.45;
   const isRecord=isSource&&p.type==='item'&&p.id===scene.chain.sourceId;
   const reading=isRecord?(activeSources?(visual.interaction?.id===p.id?visual.interaction.progress:0):1):0;
   const open=reading||Number(opened);
   if(!open||!openBox(ctx,option,p,open,false,scene.area,isRecord)){
    const operation=visual.operation?.id===p.id?visual.operation:null;
    if(selected&&!operation)outline(ctx,targetScene,option,p,collapsed);
    if(scene.taskAction==='guide'&&visual.interaction?.id===p.id){
     const stride=visual.reduced?Number(visual.interaction.progress>.5):visual.interaction.progress;
     ctx.translate(Math.sign(480-p.x)*26*stride,-20*stride);
    }
    paintTarget(ctx,targetScene,option,p,collapsed,enabled?operation:null,visual.reduced,enabled&&visual.exitId===p.id?visual.exitProgress:0);
   }
   ctx.restore();
  }
  if(showing){const option=scene.options.find(o=>o.id===showing.id);showReaction(ctx,scene,option,showing,reaction,visual);}
  if(visual.pursuit&&!scene.guardian&&!blocked(roomScene,type)){
   const yy=574+(visual.reduced?0:Math.sin(time/220)*3);
   for(const [x,y,w,h] of [[110,yy,110,90],[740,yy+3,100,84]]){
    const occupied=allPositions.some(({bounds:b})=>x<b.x+b.w&&x+w>b.x&&y<b.y+b.h&&y+h>b.y);
    if(!occupied)sprite(ctx,'pursuer',x,y,w,h,.8);
   }
  }
  if(scene.guardian&&visual.attackUrgent&&!visual.reduced){ctx.fillStyle='#e86b4a50';const x=(visual.x??480)-42,y=(visual.y??600)-4;ctx.fillRect(x,y,84,4);ctx.fillRect(x,y-23,4,23);ctx.fillRect(x+80,y-23,4,23);}
  if(scene.guardian){const entrance=visual.bossEntrance??1,gx=390,gy=225-(1-entrance)*140,atlas=(district>=4&&extras.newGuardians)||guardians;ctx.save();ctx.globalAlpha*=entrance;if(atlas){drawCell(ctx,atlas,area%2,Math.floor(area/2),2,2,gx,gy+(visual.reduced?0:Math.sin(time/450)*2),180,180);}else sprite(ctx,'guardian',gx,gy,180,180);ctx.restore();}
  if(!visual.hidden){const fall=Math.max(0,Math.min(1,visual.fall||0)),ladder=reaction?.type==='ladder',scale=1-fall*(ladder?.10:.65),walk=visual.moving&&!visual.reduced?Math.sin(time/55)*3:0,w=PLAYER.width*scale,h=PLAYER.height*scale,x=visual.x??PLAYER.x,y=(visual.y??PLAYER.y)+fall*(ladder?(visual.fallDistance??85):50);ctx.fillStyle='#0006';ctx.fillRect(Math.round(x)-27*scale,Math.round(y)-7,60*scale,10*scale);sprite(ctx,visual.hurt||visual.returning?'front':'back',x-w/2,y-h+walk,w,h,(visual.fade??1)*(ladder?1:1-fall));}
  if(type==='feeding'&&!activeSources)fishDelivery(ctx,visual,obstacleState);
  if(activeSources&&groups.source.targetType==='person')personAction(ctx,groups.source,sources,visual);
  else if(type==='person')personAction(ctx,roomScene,positions,visual);
  if(showing&&['person','mimic','item'].includes(reaction.type)&&reaction.progress>=.44&&reaction.progress<.71)spark(ctx,(visual.x??PLAYER.x)+(showing.x<480?-22:22),(visual.y??PLAYER.y)-67,(reaction.progress-.44)/.27,reaction.type==='item');
  if(scene.guardian&&extras.projectiles){
   const atlas=extras.projectiles,cw=atlas.width/4,ch=atlas.height/2,shot=visual.projectile;
   const fixed=visual.projectileGeometry||((shot?.phase==='flight'||visual.projectileImpact)?projectileGeometry(PLAYER,scene.area):null);
   for(const {geometry,progress,flightSeconds} of visual.projectileMisses||[]){
    if(projectileInFrame(geometry,progress,flightSeconds))drawProjectile(ctx,atlas,area,geometry,progress,flightSeconds);
   }
   if(shot?.phase==='flight')drawProjectile(ctx,atlas,area,fixed,clamp(shot.progress));
   if(visual.projectileImpact){const q=visual.projectileImpact,size=PROJECTILE_SIZE+(1-q)*90,p=visual.impactContact||fixed.contact;ctx.save();ctx.globalAlpha*=q;ctx.drawImage(atlas,Math.floor(area*cw),Math.floor(ch),Math.floor(cw),Math.floor(ch),p.x-size/2,p.y-size/2,size,size);ctx.restore();}
  }
  if(visual.damage){ctx.fillStyle='#bd343219';ctx.fillRect(0,0,960,640);}
  ctx.restore();return activeSources?sources:positions;
 }
 return{sprite,room,encounter,projectileGeometry,projectileHits,projectileInFrame};
}
return{SPRITES,AREAS,NORTH_WALL_Y,PLAYER,PROJECTILE_SIZE,layout,navigation,questAnchor,create,encounterIndex,peopleIndex,itemIndex,crossingIndex,contactGeometry};
});
