'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Art = require('./dungeon-art.js');
const Content = require('./dungeon-content.js');
function image(name) {
  const data = fs.readFileSync(path.join(__dirname, 'assets/dungeon', name + '.png'));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), alpha: data[25] === 6, name };
}
const names = ['rooms','sprites','guardians','rooms-a','rooms-b','encounters','gaps','ledges','crossings','arena','projectiles','people','items','ribbons',
  'entrance','rooms-new','rooms-new-alt','gaps-new','ledges-new','annex-cast','annex-items','annex-guardians',
  'lesson-bases','lesson-mounts','lesson-patterns','mechanisms','obstacle-props','obstacle-terrain','rail-gates'];
const assets = Object.fromEntries(names.map(name => [name,image(name)]));
const {rooms,sprites,guardians,encounters,gaps,ledges,crossings,arena,projectiles,people,items,ribbons} = assets;
function context() {
  const stack = [];
  return {
    calls:[],drawStates:[],fills:[],transforms:[],rotations:[],scales:[],globalAlpha:1,globalCompositeOperation:'source-over',fillStyle:'',
    save(){stack.push({globalAlpha:this.globalAlpha,globalCompositeOperation:this.globalCompositeOperation,fillStyle:this.fillStyle});},
    restore(){Object.assign(this,stack.pop());},
    beginPath(){},rect(){},clip(){},
    translate(x,y){this.transforms.push([x,y]);}, rotate(angle){this.rotations.push(angle);}, scale(x,y){this.scales.push([x,y]);},
    fillRect(...args){this.fills.push({args,operation:this.globalCompositeOperation,color:this.fillStyle});},
    drawImage(...args){this.calls.push(args);this.drawStates.push({alpha:this.globalAlpha,operation:this.globalCompositeOperation});}
  };
}
function harness() {
  const masks=[];
  const createCanvas=(width,height)=>{const ctx=context(),canvas={width,height,mask:true,ctx,getContext:()=>ctx};masks.push(canvas);return canvas;};
  return {masks,art:Art.create(rooms,sprites,guardians,{roomsA:assets['rooms-a'],roomsB:assets['rooms-b'],encounters,gaps,ledges,crossings,arena,projectiles,people,items,ribbons,createCanvas,
    entrance:assets.entrance,newRooms:assets['rooms-new'],newRoomsA:assets['rooms-new-alt'],newGaps:assets['gaps-new'],newLedges:assets['ledges-new'],
    newCast:assets['annex-cast'],newItems:assets['annex-items'],newGuardians:assets['annex-guardians'],
    lessonBases:assets['lesson-bases'],lessonMounts:assets['lesson-mounts'],lessonPatterns:assets['lesson-patterns'],mechanisms:assets.mechanisms,obstacleProps:assets['obstacle-props'],obstacleTerrain:assets['obstacle-terrain'],railGates:assets['rail-gates']})};
}
function spriteIndex(args){return args.length===9&&args[0]===sprites?Math.floor(args[2]/(sprites.height/5))*6+Math.floor(args[1]/(sprites.width/6)):null;}
function assertCrops(calls){
  for(const args of calls){
    assert.ok(args.length===9||args.length===3);
    if(args.length===3){assert.equal(args[0].mask,true);continue;}
    const[source,sx,sy,w,h,x,y,dw,dh]=args;
    assert.ok([sx,sy,w,h,x,y,dw,dh].every(Number.isFinite));
    assert.ok(sx>=0&&sy>=0&&w>0&&h>0&&dw>0&&dh>0);
    assert.ok(sx+w<=source.width+.00001&&sy+h<=source.height+.00001,'Atlas crop stays within '+source.name);
  }
}
function overlaps(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function hero(point){return{x:point.x-Art.PLAYER.width/2,y:point.y-Art.PLAYER.height-3,w:Art.PLAYER.width,h:Art.PLAYER.height+6};}
function assertPath(points,targets,contextLabel,ignoreId,boss){
  for(let segment=1;segment<points.length;segment++){
    const a=points[segment-1],b=points[segment],steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/2));
    for(let n=0;n<=steps;n++){
      const q=n/steps,body=hero({x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q});
      for(const target of targets)if(target.id!==ignoreId&&!['bridge','ladder'].includes(target.type))
        assert.equal(overlaps(body,target.bounds),false,`${contextLabel}: hero overlaps ${target.id} in segment ${segment} at ${q}`);
      if(boss)assert.equal(overlaps(body,boss),false,contextLabel+': hero overlaps guardian');
    }
  }
}
function normal(seed,stage,area='crypt'){return Content.createScene({seed,index:stage,area,storyState:{areaSteps:{[area]:stage}},difficulty:seed%2?'safe':'pursuit'});}
function targetDraw(ctx,p){const atlases=p.type==='door'?[sprites]:p.type==='person'?[people,assets['annex-cast']]:[items,assets['annex-items']];return ctx.calls.find(args=>args.length===9&&(atlases.includes(args[0])||args[0].ctx?.calls[0]?.[0]===assets['annex-cast'])&&args[5]===Math.round(p.x-(p.type==='door'?152:p.w)/2)&&args[6]===p.top&&args[7]===(p.type==='door'?152:p.w)&&args[8]===p.h);}
function guardianAtlas(area){return Art.AREAS[area]>=4?assets['annex-guardians']:guardians;}

test('all gameplay art loads, including the separate entrance and regional sprite atlases',()=>{
  assert.equal(names.length,29);
  for(const name of names.filter(n=>!n.startsWith('lesson-')&&!n.startsWith('obstacle-')&&n!=='rail-gates'))assert.ok(assets[name].width>=512&&assets[name].height>=512);
  for(const atlas of [sprites,guardians,encounters,crossings,projectiles,people,items,ribbons,assets['annex-cast'],assets['annex-items'],assets['annex-guardians']])assert.equal(atlas.alpha,true,atlas.name+' needs transparency');
  for(const [name,width,height] of [['lesson-bases',768,384],['lesson-mounts',256,256],['lesson-patterns',576,384],['mechanisms',576,576],['obstacle-props',720,720],['obstacle-terrain',576,384],['rail-gates',1024,384]]){
    assert.deepEqual([assets[name].width,assets[name].height,assets[name].alpha],[width,height,true]);
  }
  assert.deepEqual(Art.PLAYER,{x:480,y:600,width:138,height:158});
});

test('new people and material/item atlases map every visible combination to its own cell',()=>{
  const {art}=harness(),personCells=new Set(),itemCells=new Set();
  for(const hood of ['red','blue','green','gold'])for(const facing of ['front','back'])for(const carrying of ['lantern','scroll']){
    const traits={hood,facing,carrying},index=['red','blue','green','gold'].indexOf(hood)*4+(facing==='back'?2:0)+(carrying==='scroll'?1:0),ctx=context();
    assert.equal(Art.peopleIndex(traits),index);art.encounter(ctx,'person',traits,0,0,158,178);
    assert.equal(ctx.calls[0][0],people);assert.deepEqual(ctx.calls[0].slice(1,5),[Math.floor(index%4*people.width/4),Math.floor(Math.floor(index/4)*people.height/4),Math.floor(people.width/4),Math.floor(people.height/4)]);
    personCells.add(index);assertCrops(ctx.calls);
  }
  for(const material of ['wood','iron','ceramic','copper'])for(const decoration of ['none','red','blue','green']){
    const traits={type:['wood','iron'].includes(material)?'box':'jug',material,decoration},index=['wood','iron','ceramic','copper'].indexOf(material)*4+['none','red','blue','green'].indexOf(decoration),ctx=context();
    assert.equal(Art.itemIndex(traits),index);art.encounter(ctx,'item',traits,0,0,140,140);assert.equal(ctx.calls[0][0],items);assert.equal(ctx.calls.length,1,'Ribbon is part of the large item sprite, not a tiny overlay');itemCells.add(index);assertCrops(ctx.calls);
  }
  assert.equal(personCells.size,16);assert.equal(itemCells.size,16);
  const old=context();art.encounter(old,'item',{type:'key',color:'blue',marked:false},0,0,124,124);assert.equal(old.calls[0][0],encounters,'Old saved plan items retain their original atlas');
});

test('the entrance has one painted gateway, with opening leaves and a clear approach',()=>{
 const {art}=harness(),scene={targetType:'entrance'},idle=context(),opening=context();
 assert.deepEqual(art.room(idle,scene),[]);
 assert.equal(idle.calls.length,2);
 assert.equal(idle.calls[0][0],assets.entrance);assert.equal(spriteIndex(idle.calls[1]),Art.SPRITES.back);
 art.room(opening,scene,{entryProgress:.7,x:480,y:335,reduced:true});
 const leaves=opening.calls.filter(c=>c[0]===assets.entrance&&c[7]<960);
 assert.equal(leaves.length,12);
 for(let i=0;i<leaves.length;i+=2)assert.ok(leaves[i][5]+leaves[i][7]<leaves[i+1][5],'A real gap appears between the two door leaves');
 assertCrops(opening.calls);
});

test('each new district draws its own crew, containers, and appropriate room or obstacle background',()=>{
 const {art}=harness(),areas=['archive','glacier','amber','astral'];
 for(const [row,area] of areas.entries()){
  for(const facing of ['front','back'])for(const carrying of ['lantern','scroll']){
   const ctx=context(),pose=(facing==='back'?2:0)+(carrying==='scroll'?1:0);
   art.encounter(ctx,'person',{hood:'red',facing,carrying},0,0,158,178,area);
   const a=assets['annex-cast'];assert.deepEqual(ctx.calls[0].slice(0,3),[a,pose*a.width/4,row*a.height/4]);
  }
  for(const [col,material] of ['wood','iron','ceramic','copper'].entries())for(const decoration of ['red','blue','green','none']){
   const ctx=context(),a=assets['annex-items'];art.encounter(ctx,'item',{material,decoration},0,0,140,140,area);
   assert.deepEqual(ctx.calls[0].slice(0,3),[a,col*a.width/4,row*a.height/4]);
   assert.equal(ctx.calls.filter(c=>c[0]===ribbons).length,decoration==='none'?0:1);assertCrops(ctx.calls);
  }
  for(const [terrain,variant,sheet] of [[null,0,'rooms-new'],[null,1,'rooms-new-alt'],['gap',0,'gaps-new'],['ledge',0,'ledges-new']]){
   const ctx=context(),a=assets[sheet];art.room(ctx,{targetType:'door',options:[],area,terrain,backgroundVariant:variant},{hidden:true});
   assert.deepEqual(ctx.calls[0].slice(0,3),[a,(row%2)*a.width/2,Math.floor(row/2)*a.height/2]);assertCrops(ctx.calls);
  }
  const ctx=context(),scene={id:'district-mimic',area,targetType:'item',options:[{id:'decoy',position:'left',traits:{type:'box',material:'wood',decoration:'green'}}]};
  art.room(ctx,scene,{reaction:{id:'decoy',type:'mimic',progress:.5}});
  assert.equal(ctx.calls.filter(c=>c[0]===assets['annex-items']&&c[4]<assets['annex-items'].height/4).length,2);
  assert.equal(ctx.calls.filter(c=>c[0]===ribbons).length,1);assertCrops(ctx.calls);
 }
});

test('the three alternate hood dyes preserve skin, equipment and transparency',()=>{
 const original=[200,42,53,255,222,153,93,255,150,151,152,255,200,42,53,0];
 const memo=[];
 const createCanvas=(width,height)=>{
  const g=context();g.getImageData=()=>({data:Uint8ClampedArray.from(original)});
  g.putImageData=im=>memo.push(Array.from(im.data));
  return{width,height,getContext:()=>g};
 };
 const art=Art.create(rooms,sprites,guardians,{newCast:assets['annex-cast'],createCanvas});
 for(const [hood,expected] of [['blue',[42,119,200,255]],['green',[70,178,80,255]],['gold',[200,156,51,255]]]){
  for(let i=0;i<2;i++)art.encounter(context(),'person',{hood,facing:'front',carrying:'scroll'},0,0,140,140,'glacier');
  assert.deepEqual(memo.at(-1).slice(0,4),expected);
  assert.deepEqual(memo.at(-1).slice(4),original.slice(4));
 }
 assert.equal(memo.length,3,'Repainting the same NPC reuses its dyed costume');
});

test('seeded layouts in all eight areas keep every approach, pause, return and exit clear',()=>{
  const {art}=harness(),types=new Set(),variants=new Map();
  for(const area of Object.keys(Content.AREAS))for(let seed=0;seed<15;seed++)for(let stage=0;stage<10;stage++){
    const scene=normal(seed,stage,area),positions=Art.layout(scene);types.add(scene.targetType);
    const shuffled={...scene,options:[...scene.options].reverse()};
    assert.deepEqual(Art.layout(shuffled).sort((a,b)=>a.id.localeCompare(b.id)),[...positions].sort((a,b)=>a.id.localeCompare(b.id)),'Array order cannot change the meaning of a spatial clue');
    if(!variants.has(area))variants.set(area,new Set());if(!scene.terrain)variants.get(area).add(scene.backgroundVariant);
    for(const p of positions){
      assert.ok(p.bounds.x>=0&&p.bounds.x+p.bounds.w<=960&&p.bounds.y>=0&&p.bounds.y+p.bounds.h<=640);
      for(const q of positions)if(p.id!==q.id)assert.equal(overlaps(p.bounds,q.bounds),false,'Targets have separate alcoves or lanes');
      const nav=Art.navigation(scene,p.id),start={x:480,y:600};
      assert.deepEqual(nav.approach.at(-1),nav.stop);
      assertPath([start,...nav.approach],positions,'ordinary approach');
      assertPath([nav.stop,...nav.return],positions,'ordinary return');
      assertPath([nav.stop,...nav.exit],positions,'ordinary exit',p.type==='door'?p.id:null);
      if(['person','item'].includes(p.type)){
        const cryptInset=[178,252,306][scene.backgroundVariant??0];
        const sideColumns=area==='crypt'?[cryptInset,960-cryptInset]:Art.AREAS[area]>=4?[210,750]:[130,830];
        assert.ok(sideColumns.includes(p.x));assert.equal(Math.abs(nav.stop.x-p.x),170);
        assert.equal(overlaps(hero(nav.stop),p.bounds),false,'Pause beside the target, not on it');
        assert.deepEqual(nav.exit,[{x:480,y:nav.stop.y},{x:480,y:224}],'Correct choices continue through the open central corridor');
      }
      if(p.type==='door'){assert.equal(p.y-6,Art.NORTH_WALL_Y);assert.equal(p.top,p.y-174);}
    }
    const ctx=context();art.room(ctx,scene,{x:480,y:600});assertCrops(ctx.calls);
    assert.ok(ctx.calls.every(args=>![8,9,10,11,16,17,23,24,...(scene.targetType==='dispatch'?[]:[25])].includes(spriteIndex(args))),'No floor marks, reward miniatures or buff decorations are painted in ordinary rooms');
  }
  assert.deepEqual([...types].sort(),['bridge','dispatch','door','item','ladder','person']);for(const set of variants.values())assert.deepEqual([...set].sort(),[0,1,2]);
});

test('arena navigation from every previous stop avoids all other targets and the upper-centre guardian',()=>{
  const {art}=harness(),boss={x:390,y:223,w:180,h:184};
  for(const area of Object.keys(Content.AREAS))for(let seed=0;seed<4;seed++){
    const entry=Content.createBossScene({seed,area,round:1}),positions=Art.layout(entry);
    assert.equal(positions.length,9);
    const starts=[{x:480,y:600},...positions.map(p=>Art.navigation(entry,p.id).stop)];
    for(const target of positions){
      assert.equal(overlaps(target.bounds,{x:390,y:225,w:180,h:180}),false);
      for(const other of positions)if(target.id!==other.id)assert.equal(overlaps(target.bounds,other.bounds),false);
      for(const from of starts){
        const nav=Art.navigation(entry,target.id,from);
        assertPath([from,...nav.approach],positions,'arena approach '+target.id,null,boss);
        assertPath([nav.stop,...nav.return],positions,'arena return '+target.id,null,boss);
        assertPath([nav.stop,...nav.exit],positions,'arena exit '+target.id,target.type==='door'?target.id:null,boss);
      }
    }
    for(let round=1;round<=3;round++){
      const scene=Content.createBossScene({seed,area,round}),ctx=context();assert.deepEqual(Art.layout(scene),positions);
      art.room(ctx,scene,{x:480,y:600,reduced:true,bossEntrance:1});assert.deepEqual(ctx.calls[0],[arena,0,0,arena.width,arena.height,0,0,960,640]);
      const guardian=ctx.calls.find(args=>args[0]===guardianAtlas(area));assert.deepEqual(guardian.slice(5),[390,225,180,180]);
      for(const p of positions){const draw=targetDraw(ctx,p);assert.ok(draw,'All nine targets stay visible');assert.equal(ctx.drawStates[ctx.calls.indexOf(draw)].alpha,scene.completedOptionIds.includes(p.id)?.45:1);}
      assertCrops(ctx.calls);
    }
  }
});

test('crossings start intact regardless of old damage traits and reveal a broken cell only after explicit collapse',()=>{
  const {art}=harness();
  for(const type of ['bridge','ladder'])for(const material of ['wood','iron'])for(const trim of ['red','blue','gold','green']){
    const traits={material,trim,damaged:true},scene={id:type+material+trim,area:'crypt',targetType:type,terrain:type==='bridge'?'gap':'ledge',options:[{id:'a',position:'left',traits},{id:'b',position:'right',traits}]};
    const normalIndex=(type==='ladder'?4:0)+(material==='iron'?2:0),ctx=context();art.room(ctx,scene,{hidden:true});
    assert.equal(Art.crossingIndex(type,traits),normalIndex);
    const draws=ctx.calls.filter(args=>args[0]===crossings);assert.equal(draws.length,2);assert.ok(draws.every(args=>Math.floor(args[1]*4/crossings.width)===normalIndex%4));
    const bows=ctx.calls.filter(args=>args[0]===ribbons);assert.equal(bows.length,2,'Every intact crossing has an image-generated ribbon');
    const ri=['red','blue','gold','green'].indexOf(trim);assert.ok(bows.every(args=>args[1]===Math.floor(ri%2*ribbons.width/2)&&args[2]===Math.floor(Math.floor(ri/2)*ribbons.height/2)));
    assert.ok(ctx.fills.every(fill=>fill.args[2]!==106),'No flat rectangular cloth overlays remain');
    assert.ok(ctx.calls.every(args=>![12,13,14,15].includes(spriteIndex(args))),'Crossings have no tiny rune sticker');
    const collapsed=context();art.room(collapsed,scene,{hidden:true,collapsedIds:['a']});
    const after=collapsed.calls.filter(args=>args[0]===crossings);assert.equal(Math.floor(after[0][1]*4/crossings.width),(normalIndex+1)%4);assert.equal(Math.floor(after[1][1]*4/crossings.width),normalIndex%4);
    assert.equal(collapsed.calls.filter(args=>args[0]===ribbons).length,1);
    const one=context();art.room(one,scene,{hidden:true,collapsedId:'a'});assert.deepEqual(one.calls,collapsed.calls);
    assertCrops(ctx.calls);assertCrops(collapsed.calls);
  }
});

test('door sills and both usable ends of every crossing meet the painted surfaces',()=>{
 const {art}=harness();
 // Independent measurements at the centre of the illustrated floor lips
 // in each original atlas cell (rows out of 512, before the display scale).
 const edges={
  bridge:[[236,354],[236,354],[236,354],[236,354],[275,406],[275,406],[273,404],[273,404]],
  ladder:[[244,353],[244,353],[220,327],[220,327],[279,390],[279,390],[279,390],[279,390]]
 };
 const walls={bridge:[177,177,177,177,186,186,185,185],ladder:[187,187,161,161,216,216,216,216]};
 const baseRows=[[116,116,116,116,188,188,187,187],[188,188,163,163,190,190,189,189],[190,190,185,185,188,188,187,187]];
 const basicDoors=['left','middle','right'].map((position,j)=>({id:position,position,traits:{material:['stone','wood','iron'][j],torches:0}}));
 for(const [area,i] of Object.entries(Art.AREAS)){
  for(let variant=0;variant<3;variant++){
   const scene={id:area+variant,area,targetType:'door',backgroundVariant:variant,options:basicDoors};
   const ctx=context();art.room(ctx,scene,{hidden:true});
   const [wall,floor]=ctx.calls;
   assert.ok(Math.abs(wall[4]*1024/wall[0].height-baseRows[variant][i])<=1,'The sampled cut follows the base of the painted masonry');
   assert.equal(wall[2]+wall[4],floor[2]);assert.equal(wall[6]+wall[8],floor[6]);
   for(const p of Art.layout(scene)){const draw=targetDraw(ctx,p);assert.ok(Math.abs(draw[6]+draw[8]*222/229-floor[6])<=2);}
  }
  const scene=Content.createBossScene({area,round:1}),ctx=context();art.room(ctx,scene,{hidden:true});
  for(const p of Art.layout(scene).filter(p=>p.type==='door')){
   const draw=targetDraw(ctx,p),paintedSill=p.position==='middle'?199:215;
   assert.ok(Math.abs(draw[6]+draw[8]*222/229-paintedSill)<=2,'Arena arches follow the curved upper tier');
  }
 }
 for(const [area,i] of Object.entries(Art.AREAS))for(const type of ['bridge','ladder'])for(const count of [2,3,4]){
  const positions=count===2?['left','right']:count===3?['left','middle','right']:['far-left','inner-left','inner-right','far-right'];
  const scene={id:area+type+count,area,targetType:type,terrain:type==='bridge'?'gap':'ledge',
   options:positions.map((position,j)=>({id:position,position,traits:{material:j%2?'iron':'wood',trim:'blue'}}))};
  const ctx=context();art.room(ctx,scene,{hidden:true});
  const exit=ctx.calls.find(c=>spriteIndex(c)===Art.SPRITES.stone);
  const sill=exit[6]+exit[8]*222/229;
  assert.ok(Math.abs(sill-walls[type][i]*1.25)<=3,'The opaque doorway meets the painted wall/floor seam');
  const landings=edges[type][i].map(r=>r*1.25);
  for(const p of Art.layout(scene)){
   const nav=Art.navigation(scene,p.id),draw=ctx.calls.find(c=>c[0]===crossings&&c[5]===p.x-p.w/2);
   const sourceTop=draw[2]%512;
   const sourceFar=type==='bridge'?83:67,sourceNear=type==='bridge'?477:471;
   const far=draw[6]+(sourceFar-sourceTop)*draw[8]/draw[4],near=draw[6]+(sourceNear-sourceTop)*draw[8]/draw[4];
   assert.ok(far<=landings[0]-4&&near>=landings[1]+4,'Both the top deck/rung and bottom deck/feet reach solid ground');
   assert.ok(Math.abs(far-nav.exit[0].y)<2&&Math.abs(near-nav.stop.y)<2,'Movement meets the usable ends of the painted sprite');
   assert.equal(nav.crossingMidpoint.x,p.x);assert.ok(Math.abs(nav.crossingMidpoint.y-(far+near)/2)<2);
  }
 }
});

test('hover retains eight-offset alpha silhouettes for ordinary and mixed arena targets',()=>{
  const scenes=[...[0,1,3,6,7].map(stage=>normal(8,stage)),Content.createBossScene({seed:8,round:1})];
  for(const scene of scenes)for(const p of Art.layout(scene)){
    const {art,masks}=harness(),ctx=context();art.room(ctx,scene,{hover:p.id,hidden:true,reduced:true});
    const outlines=masks.filter(c=>c.ctx.fills.at(-1)?.operation==='source-in');assert.equal(outlines.length,1);const mask=outlines[0],x=Math.floor(p.x-p.w/2-10),y=p.top-24;
    assert.deepEqual([mask.width,mask.height],[p.w+20,p.h+60]);assert.deepEqual(mask.ctx.transforms[0],[-x,-y]);
    assert.deepEqual(mask.ctx.fills.at(-1),{args:[0,0,mask.width,mask.height],operation:'source-in',color:'#ffe4a1'});
    const blits=ctx.calls.filter(args=>args.length===3);assert.equal(blits.length,8);assert.deepEqual(blits.map(args=>[args[1]-x,args[2]-y]),[[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[-2,2],[2,-2],[2,2]]);
    const count=masks.length;art.room(context(),scene,{selected:p.id,hidden:true,reduced:true});assert.equal(masks.length,count);
    assertCrops(ctx.calls);assertCrops(mask.ctx.calls);
  }
});

test('reward and carried flags add no miniature objects, while return and collapse have distinct hero poses',()=>{
  const {art}=harness(),scene=normal(3,0),base=context(),flagged=context();
  art.room(base,scene,{x:480,y:600,reduced:true});art.room(flagged,scene,{x:480,y:600,reduced:true,reward:true,shield:true,carried:{type:'key',color:'blue'}});
  assert.deepEqual(flagged.calls,base.calls,'Legacy reward/carry/shield flags must not create tiny floating objects or buffs');
  const returning=context();art.room(returning,scene,{x:480,y:600,reduced:true,returning:true});
  assert.ok(returning.calls.some(args=>spriteIndex(args)===Art.SPRITES.front));assert.ok(returning.calls.every(args=>spriteIndex(args)!==Art.SPRITES.back));
  const falling=context();art.room(falling,scene,{x:480,y:395,reduced:true,fall:.5});
  const actor=falling.calls.find(args=>spriteIndex(args)===Art.SPRITES.back);assert.ok(actor[7]<Art.PLAYER.width&&actor[8]<Art.PLAYER.height);assert.equal(falling.drawStates[falling.calls.indexOf(actor)].alpha,.5);
});

test('guardian anchoring and projectile atlas selection stay central for every area and legacy boss target type',()=>{
  const {art}=harness();
  for(const area of Object.keys(Content.AREAS))for(const legacy of [false,true]){
    const scene=Content.createBossScene({seed:42,area,round:1});if(legacy)scene.targetType='person';
    const ctx=context();art.room(ctx,scene,{x:480,y:600,reduced:true,bossEntrance:1,projectile:{phase:'flight',progress:.5}});
    assert.equal(ctx.calls[0][0],arena);assert.deepEqual(ctx.calls.find(args=>args[0]===guardianAtlas(area)).slice(5),[390,225,180,180]);
    const shot=ctx.calls.find(args=>args[0]===projectiles);assert.equal(shot[1],Math.floor(Art.AREAS[area]%4*projectiles.width/4));assert.equal(shot[7],224);assert.equal(shot[8],224);assert.equal(ctx.transforms.length,1);assert.ok(Math.abs(ctx.transforms[0][0]-480)<2);assert.ok(ctx.transforms[0][1]<430,'The shot aims for the visible hood, before the player centre');assertCrops(ctx.calls);
  }
});

// Known silhouettes exercise contact geometry independently of rendering calls.
test('frozen 224px shots aim at the topmost opaque hood row, never a chest or lantern point',()=>{
 const front=Array(224).fill(20),points=[];
 for(let y=20;y<=40;y++)for(let x=55;x<=82;x++)points.push({x,y});
 for(let y=60;y<=140;y++)for(let x=25;x<=125;x++)points.push({x,y});
 const g=Art.contactGeometry(points,front,{x:480,y:600});
 assert.equal(g.contact.y,462);assert.equal(g.end.y,440.5);assert.equal(g.end.x,480);
 assert.ok(g.end.y<600-79);assert.equal(g.size,224);assert.equal(Art.PROJECTILE_SIZE,224);
 assert.ok(Object.isFrozen(g));for(const key of ['origin','end','contact'])assert.ok(Object.isFrozen(g[key]));
 assert.throws(()=>{g.end.x=700;},TypeError);
 for(const x of [260,480,700])for(const y of [400,485,615]){
  const hit=Art.contactGeometry(points,front,{x,y}),ux=Math.cos(hit.angle),uy=Math.sin(hit.angle);
  const along=(hit.contact.x-hit.end.x)*ux+(hit.contact.y-hit.end.y)*uy;
  const startsAtContact=hit.end.x===hit.origin.x&&hit.end.y===hit.origin.y;
  assert.ok((startsAtContact||along>=20-1e-8)&&along<=21.5+1e-8,'Projectile edge stops within the raster contact margin, clamped at the launch point for an adjacent silhouette');
  assert.ok(hit.contact.x>=x-69+55&&hit.contact.x<=x-69+82);
  assert.equal(hit.contact.y,y-158+20);
 }
 const offset=Art.contactGeometry(points,front,{x:480.2,y:600.4,walkOffset:2.8});
 assert.equal(offset.contact.y,465,'Geometry shares the rounded sprite placement and walking offset');
});

function pixelHarness(hollow=false){
 const createCanvas=(width,height)=>{
  const ctx=context();ctx.getImageData=()=>{
   const data=new Uint8ClampedArray(width*height*4),hero=width===Art.PLAYER.width;
   const pose=hero?spriteIndex(ctx.calls[0]):null,top=pose===Art.SPRITES.front?18:20;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const opaque=hero?((x>=54&&x<=83&&y>=top&&y<=40)||(x>=40&&x<=96&&y>=60&&y<=145)||(x>=112&&x<=125&&y>=85&&y<=109)):
      ((x-112)**2/90**2+(y-112)**2/60**2<=1&&(!hollow||(x-112)**2+(y-112)**2>24**2));
    if(opaque)data[(y*width+x)*4+3]=255;
   }
   return{data};
  };return{width,height,getContext:()=>ctx};
 };
 return Art.create(rooms,sprites,guardians,{projectiles,createCanvas});
}

test('alpha collision hits a stationary hood, allows a lateral dodge, and rejects body-only or transparent contact',()=>{
 const art=pixelHarness();
 for(const area of Object.keys(Content.AREAS))for(const returning of [false,true]){
  const launch={x:480,y:600,returning},g=art.projectileGeometry(launch,area);
  assert.equal(g.contact.y,600-158+(returning?18:20)+.5);
  assert.equal(art.projectileHits(g,launch,area),true,'Raster margin still allows a stationary endpoint hit');
  assert.equal(art.projectileHits(g,launch,area,.99),false,'The endpoint tolerance must not cause an early hit');
  assert.equal(art.projectileHits(g,{...launch,x:260},area),false);
  assert.equal(art.projectileHits(g,{...launch,x:700},area),false);
  assert.equal(art.projectileHits(g,{...launch,y:350},area),false,'A body inside the shot does not substitute for its hood');
  assert.equal(art.projectileHits(g,{...launch,hidden:true},area),false);
  assert.equal(art.projectileHits(g,{...launch,fade:0},area),false);
 }
 const centred={origin:{x:480,y:330},end:{x:480,y:330},contact:{x:480,y:330},angle:0,size:224},heroAtCentre={x:480,y:468};
 assert.equal(art.projectileHits(centred,heroAtCentre),true);
 assert.equal(pixelHarness(true).projectileHits(centred,heroAtCentre),false,'Transparent image holes never count as a hood collision');
});

test('moving the hero never retargets a stored flight or its impact',()=>{
 const {art}=harness(),scene=Content.createBossScene({seed:42}),g=art.projectileGeometry({x:480,y:600},scene.area),before=JSON.stringify(g);
 const render=(x,y,progress,impact=0)=>{const ctx=context();art.room(ctx,scene,{x,y,reduced:true,projectileGeometry:g,projectile:{phase:impact?'cooldown':'flight',progress},projectileImpact:impact});return ctx;};
 for(const progress of [0,.25,.5,.99,1]){
  const a=render(480,600,progress),b=render(260,400,progress),c=render(700,615,progress);
  assert.deepEqual(b.transforms,a.transforms);assert.deepEqual(c.transforms,a.transforms);
  assert.deepEqual(b.rotations,a.rotations);assert.deepEqual(c.rotations,a.rotations);
  assert.deepEqual(a.transforms[0],[g.origin.x+(g.end.x-g.origin.x)*progress,g.origin.y+(g.end.y-g.origin.y)*progress]);
  assert.deepEqual(a.calls.find(args=>args[0]===projectiles).slice(7),[224,224]);
 }
 for(const x of [260,480,700]){
  const ctx=render(x,600,1,.8),impact=ctx.calls.find(args=>args[0]===projectiles);
  assert.equal(impact[5]+impact[7]/2,g.contact.x);assert.equal(impact[6]+impact[8]/2,g.contact.y);
  assertCrops(ctx.calls);
 }
 assert.equal(JSON.stringify(g),before);
});

test('dodged shots accelerate along the original line and leave only after the painted edge clears',()=>{
 const art=pixelHarness(),scene=Content.createBossScene({seed:42,area:'crypt'});
 const down=art.projectileGeometry({x:480,y:600},scene.area);
 const diagonal=art.projectileGeometry({x:700,y:590},scene.area);
 const render=(misses,flight=null,hero={x:260,y:400})=>{
  const ctx=context();
  art.room(ctx,scene,{...hero,reduced:true,projectileMisses:misses,
   projectileGeometry:flight?.geometry,projectile:flight?{phase:'flight',progress:flight.progress}:{phase:'cooldown'}});
  assertCrops(ctx.calls);
  return ctx;
 };
 const expected=(g,q)=>[g.origin.x+(g.end.x-g.origin.x)*q,g.origin.y+(g.end.y-g.origin.y)*q];
 const flight=render([],{geometry:down,progress:1});
 const atDodge=render([{geometry:down,progress:1}]);
 assert.deepEqual(atDodge.transforms,flight.transforms,'No shift when the scheduled collision becomes a dodge');
 const justAfter=render([{geometry:down,progress:1.0001}]).transforms[0],unaccelerated=expected(down,1.0001);
 assert.ok(Math.hypot(justAfter[0]-unaccelerated[0],justAfter[1]-unaccelerated[1])<1e-6,
  'Velocity is continuous at the dodge point');
 let distance=0;
 for(const progress of [1.02,1.08,1.15,1.25,1.5]){
  const ctx=render([{geometry:diagonal,progress}]);
  const [x,y]=ctx.transforms[0],dx=x-diagonal.end.x,dy=y-diagonal.end.y;
  const along=dx*Math.cos(diagonal.angle)+dy*Math.sin(diagonal.angle);
  assert.ok(Math.abs(dx*Math.sin(diagonal.angle)-dy*Math.cos(diagonal.angle))<1e-8,'Acceleration stays on the launch line');
  assert.ok(along>distance,'Each new position is further down the line');
  distance=along;
  assert.equal(ctx.rotations[0],diagonal.angle);
  assert.deepEqual(render([{geometry:diagonal,progress}],null,{x:700,y:615}).transforms,ctx.transforms);
 }

 const settledAt=1.25,settled=render([{geometry:down,progress:settledAt}]).transforms[0];
 const next=render([{geometry:down,progress:1.35}]).transforms[0];
 assert.ok(Math.abs(Math.hypot(next[0]-settled[0],next[1]-settled[1])-62)<1e-8,'The settled speed is 310 pixels per second');
 const progressAtY=y=>settledAt+(y-settled[1])/(620*Math.sin(down.angle));
 const partlyVisible=progressAtY(725),beyondPaintedEdge=progressAtY(735);
 assert.ok((beyondPaintedEdge-1)*2<5,'The missed shot clears the room during the cooldown');
 assert.equal(art.projectileInFrame(down,partlyVisible),true);
 assert.equal(art.projectileInFrame(down,beyondPaintedEdge),false,
  'The alpha bounds of the rotated ellipse leave before its untrimmed square');
 const misses=[{geometry:down,progress:partlyVisible},{geometry:diagonal,progress:1.4}];
 const mixed=render(misses,
  {geometry:down,progress:.65});
 assert.deepEqual(mixed.transforms,[...render(misses).transforms,expected(down,.65)]);
 const shots=mixed.calls.filter(args=>args[0]===projectiles);
 assert.equal(shots.length,3);
 assert.ok(shots.every(args=>args[2]===0),'Dodges never draw an impact sprite');
 assert.equal(render([{geometry:down,progress:beyondPaintedEdge}]).calls.some(args=>args[0]===projectiles),false);
});

test('a point-blank dodge still travels off-screen along the frozen launch angle',()=>{
 const art=pixelHarness(),scene=Content.createBossScene({seed:42,area:'crypt'});
 const geometry={origin:{x:480,y:330},end:{x:480,y:330},angle:0,size:224};
 const ctx=context();
 art.room(ctx,scene,{x:480,y:600,projectileMisses:[{geometry,progress:1.15}]});
 const [x,y]=ctx.transforms[0];
 assert.ok(Math.abs(x-526.5)<1e-8);
 assert.equal(y,330);
 assert.equal(art.projectileInFrame(geometry,2.1),false);
});

test('a projectile already faster than the exit speed keeps its own velocity after a dodge',()=>{
 const art=pixelHarness(),scene=Content.createBossScene({seed:42,area:'crypt'});
 const geometry={origin:{x:0,y:330},end:{x:700,y:330},angle:0,size:224};
 const ctx=context();
 art.room(ctx,scene,{x:480,y:600,projectileMisses:[{geometry,progress:1.2,flightSeconds:1.5}]});
 assert.deepEqual(ctx.transforms[0],[840,330]);
});

test('only the chosen person winds up, faces the player and lunges into striking range',()=>{
 const {art}=harness(),scene={id:'ambush',area:'crypt',targetType:'person',options:['left','right'].map(position=>({id:position,position,traits:{hood:'red',facing:'back',carrying:'scroll'}}))};
 const pos=Art.layout(scene),stop=Art.navigation(scene,'left').stop;
 const targetCells=q=>{const ctx=context();art.room(ctx,scene,{...stop,reaction:{type:'person',id:'left',progress:q}});assertCrops(ctx.calls);return ctx;};
 const wind=targetCells(.12),strike=targetCells(.49),retreat=targetCells(.80);
 for(const ctx of [wind,strike,retreat])assert.ok(targetDraw(ctx,pos[1]),'The unchosen person stays put');
 const moving=ctx=>ctx.calls.filter(call=>call[0]===people).at(-1);
 assert.ok(moving(wind)[5]+pos[0].w/2<pos[0].x,'Wind-up steps away from the pupil');
 assert.ok(moving(strike)[5]+pos[0].w/2>stop.x-50,'Chosen attacker reaches the pupil at contact');
 assert.equal(moving(strike)[1],Math.floor(people.width/4),'Attacker turns around with the same hood and scroll');
 assert.ok(moving(retreat)[5]<moving(strike)[5]);assert.ok(strike.fills.some(f=>f.color==='#fff1b5'));
});

test('a box keeps its material and ribbon when its lid opens; only wrong boxes gain eyes and fangs',()=>{
 const {art}=harness();
 for(const material of ['wood','iron'])for(const decoration of ['none','red','blue','green']){
  const scene={id:'chests',area:'crypt',targetType:'item',options:['left','right'].map(position=>({id:position,position,traits:{type:'box',material,decoration}}))};
  const [p,other]=Art.layout(scene),stop=Art.navigation(scene,'left').stop;
  for(const wrong of [true,false]){
   const ctx=context();art.room(ctx,scene,{...stop,...(wrong?{reaction:{type:'mimic',id:'left',progress:.5}}:{collectedId:'left',openChestId:'left'})});
   assertCrops(ctx.calls);assert.ok(targetDraw(ctx,other),'Other boxes remain closed');
   const parts=ctx.calls.filter(c=>c[0]===items&&c[4]<Math.floor(items.height/4));
   assert.equal(parts.length,2,'The chosen box has an independently rendered lid and base');
   assert.equal(parts[0][1],Math.floor((Art.itemIndex(scene.options[0].traits)%4)*items.width/4));
   assert.equal(parts[1][1],parts[0][1]);assert.ok(parts[1][6]+parts[1][8]<parts[0][6],'Open space between jaws');
   assert.equal(ctx.fills.some(f=>f.color==='#fae4b2'),wrong,'Only mimics bare their teeth');
   assert.equal(ctx.calls.some(c=>spriteIndex(c)===Art.SPRITES.coin),!wrong,'Treasure shows only in a safe open chest');
   assert.equal(parts[0][5]===p.x-p.w/2,!wrong,'A harmless chest stays put');
  }
 }
 const s={id:'urn',area:'crypt',targetType:'item',options:['left','right'].map(position=>({id:position,position,traits:{type:'jug',material:'ceramic',decoration:'green'}}))};
 const ctx=context();art.room(ctx,s,{...Art.navigation(s,'left').stop,reaction:{type:'item',id:'left',progress:.5}});
 assert.equal(ctx.calls.filter(call=>call[0]===items).length,2,'The sealed urn remains intact');
 assert.ok(ctx.fills.some(f=>f.color==='#ddc3ff'),'A curse, not mimic jaws, strikes from a wrong urn');
});

test('broken bridges shed decking and swallow the player; snapped ladders shed rungs and leave a visible landing',()=>{
 const {art}=harness();
 for(const type of ['bridge','ladder'])for(const material of ['wood','iron']){
  const scene={id:type,area:'tide',targetType:type,terrain:type==='ladder'?'ledge':'gap',options:['left','right'].map(position=>({id:position,position,traits:{material,trim:'blue'}}))};
  const ctx=context(),[p]=Art.layout(scene);art.room(ctx,scene,{x:p.x,y:395,fall:.9,reaction:{type,id:p.id,progress:.9}});
  const fragments=ctx.calls.filter(c=>c[0]===crossings&&c[4]<crossings.height/4);assert.equal(fragments.length,2,'Two pieces fall from the selected route');
  assert.ok(fragments.every(c=>c[1]>=(material==='iron'?2:0)*crossings.width/4&&c[2]>=(type==='ladder'?crossings.height/2:0)));
  assert.equal(ctx.calls.filter(c=>c[0]===ribbons).length,1,'The other route remains intact');
  const player=ctx.calls.find(call=>spriteIndex(call)===Art.SPRITES.back),alpha=ctx.drawStates[ctx.calls.indexOf(player)].alpha;
  if(type==='ladder'){assert.equal(alpha,1);assert.ok(player[6]+player[8]>465);}
  else{assert.ok(alpha<.15);assert.ok(player[7]<65);}
  assertCrops(ctx.calls);
 }
});

test('regional specimens show independent attachments, patterns and runes on one local silhouette',()=>{
 const {art}=harness(),bases=assets['lesson-bases'],mounts=assets['lesson-mounts'],patterns=assets['lesson-patterns'];
 const surfaceCases=[...['crossed','parallel','alternating','grouped','symmetric','asymmetric'].map((pattern,index)=>({traits:{pattern},index})),
  ...[true,false].flatMap(crossed=>[true,false].map(symmetric=>({traits:{pattern:'grid',crossed,symmetric},index:8+(crossed?0:2)+(symmetric?0:1)})))];
 for(const [district,area] of Object.keys(Art.AREAS).entries()){
  for(const [m,attachment] of ['inlaid','clasped','wrapped','tied'].entries())for(const surface of surfaceCases){
   const traits={type:'specimen',attachment,...surface.traits,rune:'blue'};
   const s={id:area+'-specimen',area,targetType:'item',options:[{id:'case',position:'left',traits}]},ctx=context();
   art.room(ctx,s,{hidden:true});const src=a=>ctx.calls.find(d=>d[0]===a);
   assert.deepEqual(src(bases).slice(1,3),[(district%4)*192,Math.floor(district/4)*192]);
   assert.deepEqual(src(mounts).slice(1,3),[(m%2)*128,Math.floor(m/2)*128]);
   assert.deepEqual(src(patterns).slice(1,3),[(surface.index%4)*144,Math.floor(surface.index/4)*96]);
   assert.equal(ctx.calls.filter(d=>spriteIndex(d)===Art.SPRITES.blue).length,1);
   assertCrops(ctx.calls);
  }
 }
});

test('all three one-click mechanisms have safe operator aisles and preserve their written ordering',()=>{
 const {art}=harness();
 for(const area of Object.keys(Art.AREAS))for(const type of ['dispatch','sluice','signal'])for(const n of [2,3,4]){
  const slots=n===2?['left','right']:n===3?['left','middle','right']:['far-left','inner-left','inner-right','far-right'];
  const s={id:'operate-'+area+type+n,area,targetType:type,options:slots.map((position,i)=>({id:'slot-'+i,position,traits:{count:i%3,rune:'blue',banded:i===1}}))};
  const positions=Art.layout(s),ctx=context();art.room(ctx,s,{hidden:true});
  const lit=s.options.reduce((sum,o)=>sum+o.traits.count,0);
  assert.equal(ctx.calls.filter(d=>spriteIndex(d)===Art.SPRITES.lantern).length,lit);
  assert.equal(ctx.calls.filter(d=>d[0].ctx&&spriteIndex(d[0].ctx.calls[0])===Art.SPRITES.lantern).length,n*2-lit,
   'Every machine retains two physical lamps, including closed dark glass for each unlit lamp');
  assert.equal(ctx.calls.filter(d=>d[0]===ribbons).length,1);
  assert.equal(ctx.calls.filter(d=>spriteIndex(d)===Art.SPRITES.blue).length,n);
  assert.deepEqual(Art.layout({...s,options:s.options.slice().reverse()}).reverse(),positions);
  for(const p of positions){
   const nav=Art.navigation(s,p.id),start={x:480,y:600};assert.ok(p.top>=Art.NORTH_WALL_Y&&p.y<=640);
   assertPath([start,...nav.approach,...nav.exit],positions,'machine approach and exit');
   assertPath([nav.stop,...nav.return],positions,'machine retry');
   for(const other of positions)if(p!==other)assert.equal(overlaps(p.bounds,other.bounds),false);
  }
  assertCrops(ctx.calls);
 }
});

test('only the operated mechanism changes state and an incorrect setting cannot dispatch, open or relay',()=>{
 const {art}=harness();
 for(const type of ['sluice','dispatch','signal']){
  const scene={id:type,area:'forge',targetType:type,options:['left','right'].map(id=>({id,position:id,traits:{rune:'green',count:1,banded:false}}))};
  const frame=(progress,correct,reduced=false)=>{const ctx=context();art.room(ctx,scene,{hidden:true,reduced,operation:{id:'left',progress,correct}});return ctx;};
  const cells=(ctx,i)=>ctx.calls.filter(c=>c[0]===assets.mechanisms&&c[1]===(i%3)*192&&c[2]===Math.floor(i/3)*192);
  const idle=frame(0,true),on=frame(.65,true),wrong=frame(.65,false),accessible=frame(.65,true,true);
  if(type==='sluice'){
   assert.equal(cells(idle,0).length,2);assert.equal(cells(wrong,1).length,0);
   assert.equal(cells(on,1).length,1);assert.equal(cells(on,0).length,1);assert.equal(cells(on,2).length,1);assert.equal(cells(accessible,1).length,1);
  }else if(type==='dispatch'){
   const cars=ctx=>ctx.calls.filter(a=>a[0]===assets['rail-gates']&&a[1]===0&&a[2]===0);
   assert.ok(cars(on)[0][5]<cars(idle)[0][5]-22);
   assert.equal(cars(on)[0][6],cars(idle)[0][6]);assert.deepEqual(cars(on)[1],cars(idle)[1]);
   assert.deepEqual(cars(wrong),cars(idle));assert.ok(cars(frame(.84,true,true))[0][5]<cars(idle)[0][5]-22);
  }else{
   assert.equal(cells(idle,6).length,2);assert.equal(cells(wrong,7).length,0);
   assert.equal(cells(on,7).length,1);assert.equal(cells(on,6).length,1);assert.equal(cells(accessible,7).length,1);
   assert.equal(cells(frame(.24,true),8).length,1,'The mallet strikes the drum before the signal leaves');
  }
  for(const ctx of [idle,on,wrong,accessible])assertCrops(ctx.calls);
 }
});

function obstacleFixture(type,n=3,area='crypt',variant=0){
 const positions=n===2?['left','right']:['left','middle','right'];
 return {area,id:type+n,targetType:type,backgroundVariant:variant,obstacle:{kind:type,food:'fish'},options:positions.map((position,i)=>({
  id:'choice-'+i,position,correct:i===1,response:(type==='feeding'?['bell','fed','sniff']:['surge','drain','trickle'])[i],
  traits:{colour:i<2?'blue':'red',bell:i===0,basin:i===0?'full':'empty'}
 }))};
}
function obstacleCalls(ctx,key,index){
 const atlas=assets[key],count=key==='obstacle-props'?4:2;
 return ctx.calls.filter(c=>c[0]===atlas&&c[1]===(index%count)*atlas.width/count&&c[2]===Math.floor(index/count)*atlas.height/count);
}
test('feeding trays and flood controls fit below the obstacle with collision-free approaches, retries and a central exit',()=>{
 for(const area of Object.keys(Art.AREAS))for(const type of ['feeding','floodgate'])for(const n of [2,3]){
  const scene=obstacleFixture(type,n,area),pos=Art.layout(scene);
  assert.deepEqual(Art.layout({...scene,options:scene.options.slice().reverse()}).reverse(),pos);
  for(const p of pos){
   assert.ok(p.top>331);
   const nav=Art.navigation(scene,p.id);
   assertPath([Art.PLAYER,...nav.approach,...nav.exit],pos,'near controls');
   assertPath([nav.stop,...nav.return],pos,'retry');
   assert.deepEqual(nav.exit.slice(-2),[{x:480,y:type==='feeding'?286:338},{x:480,y:Art.NORTH_WALL_Y}]);
  }
 }
});
test('the beast stays at the chosen bowl while the hero passes, and ignores either kind of wrong bowl',()=>{
 const {art}=harness();
 const prop=(c,i)=>obstacleCalls(c,'obstacle-props',i);
 const beast=c=>[...prop(c,0),...prop(c,1),...prop(c,2)];
 const bowls=c=>[...prop(c,5),...prop(c,6)];
 const bounds=draw=>({x:draw[5],y:draw[6],w:draw[7],h:draw[8]});
 for(const count of [2,3])for(const chained of [false,true])for(let i=0;i<count;i++){
  const source=chained?pairedFixture('feeding',count,'person','right')[1]:null;
  const s=source||obstacleFixture('feeding',count);
  const options=s.options.map((o,j)=>({...o,correct:j===i,response:j===i?'fed':j===0?'bell':'sniff',
   traits:{...o.traits,bell:j!==i&&j===0}}));
  const scene={...s,options,...(source?{chain:{...source.chain,actionOptions:options}}:{})};
  const selected=options[i],p=Art.layout(scene).find(o=>o.id===selected.id);
  const nav=Art.navigation(scene,p.id);
  const draw=(option,q,time=0,reduced=false)=>{
   const c=context(),operation=option?{id:option.id,correct:option.correct,progress:q}:null;
   art.room(c,scene,{...nav.stop,hidden:true,reduced,operation},time);assertCrops(c.calls);return c;
  };
  const idle=draw(),loaded=draw(selected,.22),fed=draw(selected,.82),eaten=draw(selected,1,900);
  assert.equal(beast(idle).length,1);
  assert.equal(obstacleCalls(idle,'obstacle-terrain',3).length,0,'There is no separate serving ledge');
  assert.equal(prop(loaded,3)[0][5]+26,p.x,'The fish reaches the selected bowl before the beast moves');
  assert.deepEqual(beast(loaded),beast(idle));
  for(const wrong of options.filter(o=>!o.correct)){
   const rejected=draw(wrong,.62);
   assert.deepEqual(beast(rejected),beast(idle),'Wrong bowls leave the beast guarding the door');
   assert.deepEqual(bowls(rejected),bowls(idle));
  }
  assert.deepEqual(bowls(fed),bowls(idle),'Every bowl stays put throughout the room');
  assert.deepEqual(bowls(eaten),bowls(idle));
  assert.equal(prop(fed,2).length,1);assert.equal(prop(eaten,2).length,1);
  const feeding=beast(fed)[0],parked=beast(eaten)[0];
  assert.equal(feeding[5],parked[5]);assert.equal(feeding[6]+feeding[8],parked[6]+parked[8]);
  assert.ok(parked[5]<p.x&&parked[5]+parked[7]>p.x&&Math.abs(parked[6]+parked[8]-p.y)<12,'The beast eats at the original bowl position');
  assert.equal(prop(eaten,3).length,0,'The fish has been eaten');
  assert.deepEqual(eaten.scales,p.x<480?[]:[[-1,1]],'The beast faces its bowl');
  const accessible=beast(draw(selected,1,0,true))[0];
  assert.equal(accessible[5],parked[5]);assert.equal(accessible[6]+accessible[8],parked[6]+parked[8]);
  for(let step=24;step<=82;step++){
   assert.equal(overlaps(hero(nav.stop),bounds(beast(draw(selected,step/100))[0])),false,'The beast avoids the feeding point where the adventurer waits');
  }
  assertPath([nav.stop,...nav.exit],Art.layout(scene),'the path around the chosen bowl',null,bounds(parked));
 }
});
test('each flood lever changes pose while the cleared river exposes a continuous central row and fills the receiving basin',()=>{
 const {art}=harness();
 for(const area of Object.keys(Art.AREAS))for(const variant of [0,1,2]){
  const s=obstacleFixture('floodgate',3,area,variant),draw=(index,q)=>{
   const ctx=context(),operation=q?{id:'choice-'+index,correct:index===1,progress:q}:null;
   art.room(ctx,s,{hidden:true,operation});assertCrops(ctx.calls);return ctx;
  };
  const idle=draw(1,0),flood=draw(0,.55),trickle=draw(2,.55),clear=draw(1,1);
  const tiles=(c,i)=>obstacleCalls(c,'obstacle-terrain',i),prop=(c,i)=>obstacleCalls(c,'obstacle-props',i);
  assert.equal(tiles(idle,0).length,2);assert.equal(tiles(idle,2).length,0);
  if(area==='archive')assert.ok(tiles(idle,0)[0][5]>130&&tiles(idle,0)[1][5]+tiles(idle,0)[1][7]<827);
  assert.equal(prop(flood,12).length,1);assert.ok(tiles(flood,0)[0][8]>tiles(idle,0)[0][8]);
  assert.equal(tiles(trickle,2).length,0);assert.equal(tiles(trickle,0)[0][8],tiles(idle,0)[0][8]);
  assert.equal(tiles(clear,0).length,0);assert.equal(tiles(clear,2).length,3);
  assert.ok(tiles(clear,2).every(t=>t[5]<480&&t[5]+t[7]>480));
  assert.equal(prop(clear,8).length,prop(idle,8).length+1);assert.equal(prop(clear,12).length,1);
 }
});

test('minecart levers roll one broadside cart along continuous horizontal rails and leave the crossing clear',()=>{
 const {art}=harness(),atlas=assets['rail-gates'];
 for(const area of Object.keys(Art.AREAS))for(const variant of [0,1,2])for(const direction of ['left','right']){
  const scene=obstacleFixture('cart',3,area,variant);
  scene.obstacle={kind:'cart',direction};
  scene.options=scene.options.map((o,i)=>({...o,response:i===1?'roll':i?'brake':'clank',
   traits:{colour:i===1?'red':'blue',direction:i===2?(direction==='left'?'right':'left'):direction}}));
  for(const n of [2,3]){
   const board=n===3?scene:{...scene,options:scene.options.filter(o=>o.position!=='middle')};
   const controls=Art.layout(board),start={x:480,y:600};
   for(const p of controls){
    const path=Art.navigation(board,p.id);
    assertPath([start,...path.approach,...path.exit],controls,'rail controls');
    assertPath([path.stop,...path.return],controls,'rail retry');
    let crossings=0,previous=path.stop;
    for(const waypoint of path.exit){
     if(Math.min(previous.y,waypoint.y)<=344 && Math.max(previous.y,waypoint.y)>=306){
      assert.equal(previous.x,480);assert.equal(waypoint.x,480);
      assert.ok(previous.y>344&&waypoint.y<306);crossings++;
     }
     previous=waypoint;
    }
    assert.equal(crossings,1,'Turn completely off the rails then cross at the marked centre exactly once');
   }
  }
  const frame=(i,q)=>{const ctx=context();art.room(ctx,scene,{hidden:true,
   operation:q?{id:scene.options[i].id,correct:i===1,progress:q}:null});assertCrops(ctx.calls);return ctx;};
  const cartBox=ctx=>ctx.calls.filter(c=>c[0]===atlas&&c[1]===0&&c[2]===0&&c[3]===256);
  const track=ctx=>ctx.calls.filter(c=>c[0]===atlas&&c[1]>256&&c[1]<512&&c[2]===0);
  const idle=frame(1,0),mid=frame(1,.51),clear=frame(1,1);
  for(const ctx of [idle,mid,clear,frame(0,.51),frame(2,.51)])assert.equal(cartBox(ctx).length,1);
  const a=cartBox(idle)[0],b=cartBox(mid)[0],z=cartBox(clear)[0];
  assert.equal(a[5]+a[7]/2,480);assert.equal(a[6],b[6]);assert.equal(b[6],z[6]);
  assert.ok(direction==='right'?z[5]>b[5]&&b[5]>a[5]:z[5]<b[5]&&b[5]<a[5]);
  assert.ok(direction==='right'?z[5]>550:z[5]+z[7]<410);
  for(const i of [0,2])assert.deepEqual(cartBox(frame(i,.6))[0],a);
  const rails=track(idle);
  const paving=obstacleCalls(clear,'obstacle-terrain',2);
  assert.equal(paving.length,3);
  assert.ok(paving[0][6]<306&&paving.at(-1)[6]+paving.at(-1)[8]>344);
  assert.ok(paving.every(p=>p[5]+p[7]/2===480));
  assert.ok(clear.calls.indexOf(paving.at(-1))<clear.calls.indexOf(track(clear)[0]),'Rails remain continuous above the stone crossing');
  assert.equal(rails.length,5);assert.ok(rails[0][5]<300&&rails.at(-1)[5]+rails.at(-1)[7]>660);
  for(let n=1;n<rails.length;n++){assert.equal(rails[n][6],rails[0][6]);assert.ok(rails[n][5]<=rails[n-1][5]+rails[n-1][7]);}
  assert.ok(mid.rotations.some(angle=>Math.abs(angle)>.2));
 }
});

test('objective doors have solid material-specific leaves and only the cleared doorway opens',()=>{
 const {art}=harness(),atlas=assets['rail-gates'];
 const leafCalls=ctx=>ctx.calls.filter(c=>c[0]===atlas&&c[2]===192&&c[3]===128);
 function draw(scene,visual){const ctx=context();art.room(ctx,scene,{hidden:true,...visual});assertCrops(ctx.calls);return leafCalls(ctx);}
 const scene={id:'three-gates',area:'crypt',targetType:'door',options:['wood','stone','iron'].map((material,i)=>({
  id:'d'+i,position:['left','middle','right'][i],traits:{material,rune:'blue',torches:0,lit:0}}))};
 const shut=draw(scene,{}),half=draw(scene,{exitId:'d1',exitProgress:.6}),open=draw(scene,{exitId:'d1',exitProgress:1});
 assert.deepEqual(shut.map(d=>d[1]),[0,128,256,384,512,640]);
 assert.equal(half[2][7]<shut[2][7],true);
 assert.equal(open.length,4);assert.deepEqual(open,shut.filter(c=>c[1]<256||c[1]>=512));
 assert.deepEqual(draw(scene,{exitId:'d1',exitProgress:0}),shut);
 for(const type of ['person','item','bridge','ladder','sluice','cart','signal','feeding','floodgate']){
  const ordinary={id:type,area:'crypt',targetType:type,options:[],...(type==='cart'?{obstacle:{kind:'cart',direction:'left'}}:{})};
  assert.equal(draw(ordinary,{}).length,2);
  assert.equal(draw(ordinary,{exitProgress:1}).length,0);
 }
 const arena=Content.createBossScene({seed:'doors-closed',area:'crypt',encounter:1,round:1});
 const destination=arena.options.find(o=>o.targetType==='door');
 assert.equal(draw(arena,{}).length,6);
 assert.equal(draw(arena,{exitId:destination.id,exitProgress:1}).length,4);
});

test('chests, teaching objects and people use clear floor in every stone dungeon backdrop',()=>{
 const safeSpans=[[69,891],[150,810],[210,750]];
 for(let variant=0;variant<3;variant++)for(const type of ['person','chest','specimen']){
  const scene={area:'crypt',targetType:type==='person'?'person':'item',backgroundVariant:variant,
   options:['upper-left','upper-right','lower-left','lower-right'].map((position,i)=>({id:'t'+i,position,traits:{type:type==='chest'?'box':type}}))};
  const [left,right]=safeSpans[variant],items=Art.layout(scene),ctx=context();
  harness().art.room(ctx,scene,{hidden:true,pursuit:true});
  const pursuers=ctx.calls.filter(call=>spriteIndex(call)===Art.SPRITES.pursuer)
   .map(c=>({x:c[5],y:c[6],w:c[7],h:c[8]}));
  for(const p of items){
   assert.ok(pursuers.every(enemy=>!overlaps(enemy,p.bounds)),'Scenery pursuers cannot obscure the selectable object');
   assert.ok(p.bounds.x>=left&&p.bounds.x+p.bounds.w<=right);
   // People may stand a little higher because their heads can rise above the floor seam.
   if(type!=='person')assert.ok(p.top>224);
   for(const other of items)if(other!==p)assert.equal(overlaps(p.bounds,other.bounds),false);
   const nav=Art.navigation(scene,p.id);
   assertPath([Art.PLAYER,...nav.approach,...nav.exit],items,'crypt floor path');
  }
 }
});

function pairedFixture(type,count,sourceType,sourceSide,area='crypt',variant=2){
 const stations=['cart','feeding','floodgate'].includes(type);
 const slots=['item','console'].includes(type)&&count>2?(count===3?['upper-left','lower-left','right']:['upper-left','lower-left','upper-right','lower-right']):
  count===2?['left','right']:count===3?['left','middle','right']:['far-left','inner-left','inner-right','far-right'];
 const actionOptions=slots.map((position,i)=>({id:'action-'+i,position,correct:i===0,
  traits:type==='console'?{type:'specimen',rune:'red',attachment:'wrapped',pattern:'alternating'}:type==='item'?{type:'box',material:i%2?'iron':'wood',decoration:'blue'}:
   {colour:i%2?'red':'blue',direction:i%2?'right':'left',basin:'empty',bell:i===2,material:'iron',rune:'blue',torches:1,lit:1,count:1}}));
 const sourceOptions=['left','right'].map(position=>({id:'source-'+position,position,traits:sourceType==='person'?
  {hood:position==='left'?'red':'blue',facing:'front',carrying:'scroll'}:{type:'box',material:'wood',decoration:position==='left'?'blue':'red'}}));
 const chain={sourceId:'source-'+sourceSide,sourceType,sourceOptions,actionOptions,actionType:type,actionChestRoom:type==='item',
  actionObstacle:stations?{kind:type,direction:'left'}:undefined};
 const base={area,id:'paired-'+type+count+sourceSide,backgroundVariant:variant};
 return [{...base,targetType:sourceType,options:sourceOptions,chain:{...chain,step:1}},
  {...base,targetType:type,options:actionOptions,chestRoom:chain.actionChestRoom,obstacle:chain.actionObstacle,chain:{...chain,step:2}}];
}

test('both groups keep their positions; only the current group accepts input and every path clears both groups',()=>{
 for(const type of ['cart','feeding','floodgate','dispatch','sluice','signal','door','item','console']){
  const counts=['cart','feeding','floodgate'].includes(type)?[2,3]:[2,3,4];
  for(const n of counts)for(const sourceType of ['person','item'])for(const side of ['left','right']){
   const [a,b]=pairedFixture(type,n,sourceType,side),sources=Art.layout(a),actions=Art.layout(b),all=[...sources,...actions];
   const label=[type,n,sourceType,side].join(' ');
   for(const p of all)for(const other of all)if(p!==other)assert.equal(overlaps(p.bounds,other.bounds),false,label+' options intersect');
   const anchor=Art.questAnchor(b);assert.deepEqual(anchor,Art.questAnchor(a));
   assert.deepEqual(anchor,Art.navigation(a,a.chain.sourceId).stop);
   assert.equal(Art.navigation(a,actions[0].id),null);
   assert.equal(Art.navigation(b,sources[0].id),null);
   for(const s of sources){
    const nav=Art.navigation(a,s.id);
    assertPath([Art.PLAYER,...nav.approach,...nav.return],all,label+' ask or retry');
    assert.deepEqual(nav.exit,[],'A clue never walks through the exit');
   }
   for(const p of actions){
    const nav=Art.navigation(b,p.id);
    assert.deepEqual(nav,Art.navigation(b,p.id,anchor));
    assertPath([anchor,...nav.approach],all,label+' approach');
    assertPath([nav.stop,...nav.return],all,label+' retry');
    assert.deepEqual(nav.return.at(-1),anchor);
    assertPath([nav.stop,...nav.exit],all,label+' leave',p.type==='door'?p.id:null);
   }
  }
 }
});

test('a paired room retains its scenery and inactive targets; getting a clue cannot open a door or release the cart',()=>{
 const {art}=harness(),atlas=assets['rail-gates'];
 for(const area of Object.keys(Art.AREAS))for(const variant of [0,1,2])for(const type of ['cart','item','feeding','floodgate','door','sluice','signal']){
  const [a,b]=pairedFixture(type,3,type==='door'?'item':'person','right',area,variant);
  const draw=(s,visual)=>{const c=context();const rendered=art.room(c,s,{hidden:true,...visual},0);
   assert.deepEqual(rendered,Art.layout(s));assertCrops(c.calls);return c;};
  const source=draw(a,{}),action=draw(b,{}),guess=draw(a,{hover:'action-0',exitId:'action-0',exitProgress:1,
   operation:{id:'action-0',correct:true,progress:1}});
  const base=c=>c.calls.filter(d=>d[0].name?.startsWith('rooms'));
  assert.deepEqual(base(source),base(action));assert.equal(base(source).length,6);
  assert.deepEqual(guess.calls,source.calls,'An unrevealed control can neither glow nor move');
  for(const s of [source,action])for(const p of Art.layout(a)){
   if(s===action&&p.type==='item'&&p.id===a.chain.sourceId)assert.ok(s.calls.some(d=>spriteIndex(d)===Art.SPRITES.scroll));
   else assert.ok(targetDraw(s,p),'Both clue sources remain visible');
  }
  const doors=c=>c.calls.filter(d=>d[0]===atlas&&d[2]===192&&d[3]===128);
  assert.deepEqual(doors(source),doors(action));assert.ok(doors(source).length>=2);
  if(type==='cart'){
   const car=c=>c.calls.find(d=>d[0]===atlas&&d[1]===0&&d[2]===0);
   assert.equal(car(source)[5],car(action)[5]);assert.equal(car(source)[5]+car(source)[7]/2,480);
   const solved=draw(b,{operation:{id:'action-0',correct:true,progress:1},exitProgress:1});
   assert.ok(car(solved)[5]<car(source)[5]);assert.equal(doors(solved).length,0);
  }
 }
});

test('the mine crew retains a distinctive tool and rope uniform in all four clue poses and every district',()=>{
 const {art}=harness(),uniform=assets['annex-cast'],mallet=assets.mechanisms;
 for(const area of Object.keys(Art.AREAS))for(const facing of ['front','back'])for(const carrying of ['lantern','scroll']){
  const [s]=pairedFixture('cart',3,'person','left',area);
  for(const p of s.options)p.traits={hood:'red',facing,carrying};
  const c=context();art.room(c,s,{});
  const crew=c.calls.filter(call=>call[0]===uniform);
  assert.equal(crew.length,2);
  const pose=(facing==='back'?2:0)+(carrying==='scroll'?1:0);
  assert.ok(crew.every(call=>call[1]===pose*uniform.width/4&&call[2]===uniform.height/4));
  const tools=c.calls.filter(call=>call[0]===mallet&&call[1]===mallet.width*2/3&&call[2]===mallet.height*2/3);
  assert.equal(tools.length,2);
  for(const [i,source] of Art.layout(s).entries()){
   assert.ok(tools[i][5]+tools[i][7]<source.x);
   assert.ok(tools[i][6]>source.top+source.h*.48);
   assert.ok(source.y<=580,'Source feet stand before the painted foreground wall and its crystals');
  }
 }
});

test('the correct records box opens at contact, retains its document on reload, and never shows treasure',()=>{
 const {art}=harness();
 for(const area of Object.keys(Art.AREAS))for(const side of ['left','right']){
  const [a,b]=pairedFixture('floodgate',3,'item',side,area),id=a.chain.sourceId;
  const frame=(scene,visual)=>{const c=context();art.room(c,scene,{hidden:true,...visual});return c.calls;};
  const doc=c=>c.filter(d=>spriteIndex(d)===Art.SPRITES.scroll);
  const coin=c=>c.filter(d=>spriteIndex(d)===Art.SPRITES.coin);
  const idle=frame(a,{}),listen=q=>frame(a,{interaction:{id,progress:q}}),mid=listen(.47),read=listen(1),restored=frame(b,{});
  assert.equal(doc(idle).length,0);assert.equal(doc(listen(.04)).length,0);
  assert.equal(doc(mid).length,1);assert.equal(doc(read).length,1);
  assert.ok(doc(mid)[0][6]>doc(read)[0][6]);assert.deepEqual(doc(read),doc(restored));
  assert.equal(doc(frame(a,{interaction:{id:side==='left'?'source-right':'source-left',progress:1}})).length,0);
  assert.ok([idle,mid,read,restored].every(s=>coin(s).length===0));
 }
});

test('a dispatched car moves on its own horizontal siding, clears its neighbour before the exit, and carries full-size fittings',()=>{
 const {art}=harness(),atlas=assets['rail-gates'];
 for(const area of Object.keys(Art.AREAS))for(const n of [2,3,4]){
  const [,s]=pairedFixture('dispatch',n,'person','right',area);
  const placements=Art.layout(s),xs=placements.map(p=>p.x);
  assert.deepEqual(xs,[...xs].sort((a,b)=>a-b));assert.equal(new Set(xs).size,n);
  const frame=(op,progress=1)=>{const ctx=context();art.room(ctx,s,{hidden:true,operation:op,exitProgress:progress});return ctx;};
  const cars=c=>c.calls.filter(v=>v[0]===atlas&&v[1]===0&&v[2]===0),leaves=c=>c.calls.filter(v=>v[0]===atlas&&v[2]===192&&v[3]===128);
  const idle=frame(null),base=cars(idle),tracks=idle.calls.filter(v=>v[0]===atlas&&v[1]>256&&v[1]<300&&v[2]===0);
  assert.equal(new Set(tracks.map(v=>v[6])).size,n===2?1:2);
  assert.equal(base.length,n);assert.equal(leaves(idle).length,2);
  for(const p of placements){
   const wrong=frame({id:p.id,correct:false,progress:1});assert.deepEqual(cars(wrong),base);assert.equal(leaves(wrong).length,2);
   for(const progress of [.2,.55,.79,1]){
    const c=frame({id:p.id,correct:true,progress}),moved=cars(c);assert.equal(leaves(c).length,progress<.76?2:0);
    for(const [j,next] of moved.entries()){
     const prev=base[j];
     if(placements[j].id!==p.id){assert.deepEqual(next,prev);continue;}
     assert.equal(next[6],prev[6]);assert.deepEqual(next.slice(7),prev.slice(7));assert.notEqual(next[5],prev[5]);
     for(const [k,other] of moved.entries()){
      if(k===j)continue;
      assert.equal(overlaps({x:next[5],y:next[6],w:next[7],h:next[8]},{x:other[5],y:other[6],w:other[7],h:other[8]}),false);
     }
    }
   }
  }
  const badges=idle.calls.filter(d=>spriteIndex(d)===Art.SPRITES.blue);
  assert.equal(badges.length,n);assert.ok(badges.every(d=>d[7]===d[8]&&d[7]>=57),'A square rune is readable on the hopper');
  const indicators=idle.calls.filter(d=>spriteIndex(d)===Art.SPRITES.lantern);
  assert.ok(indicators.every(d=>d[7]>=24&&d[8]>=38));
 }
});

test('fixed directional machines reveal distinct engravings and depress only the selected inward-facing button',()=>{
 const {art}=harness(),metal=assets.mechanisms,atlas=assets['rail-gates'],bases=assets['lesson-bases'],patterns=assets['lesson-patterns'];
 for(const area of Object.keys(Art.AREAS)){
  const s={id:area+'-press',area,targetType:'console',options:['left','right'].map((position,i)=>({
   id:position,position,traits:{type:'specimen',pattern:i?'grouped':'alternating',rune:'gold',attachment:'clasped'}}))};
  const frame=op=>{const c=context();art.room(c,s,{hidden:true,exitProgress:1,operation:op});return c;},idle=frame(null);
  const plunger=c=>c.calls.filter(d=>d[0]===metal&&d[1]===384&&d[2]===192);
  const doors=c=>c.calls.filter(d=>d[0]===atlas&&d[2]===192&&d[3]===128);
  const consoleBases=c=>c.calls.filter(d=>d[0]===bases),plates=c=>c.calls.filter(d=>d[0]===patterns);
  const [a,b]=Art.layout(s),caps=plunger(idle);
  assert.equal(doors(idle).length,2);assert.equal(caps.length,2);
  assert.ok(caps[0][5]>a.x&&caps[1][5]+caps[1][7]<b.x);
  assert.ok(caps.every(d=>d[7]>48));
  assert.deepEqual(plates(idle).map(d=>d[1]),[288,432]);
  assert.equal(idle.fills.filter(f=>f.color==='#231a24ad').length,4,'Four recessed bronze bars receive the darker finish');
  for(const [i,p] of [a,b].entries()){
   const good=frame({id:p.id,correct:true,progress:.5}),bad=frame({id:p.id,correct:false,progress:.5}),done=frame({id:p.id,correct:true,progress:1});
   for(const c of [good,bad,done]){
    assert.deepEqual(consoleBases(c),consoleBases(idle));assert.deepEqual(plates(c),plates(idle));
    assert.ok(plunger(c)[i][6]>caps[i][6]);assert.deepEqual(plunger(c)[1-i],caps[1-i]);
   }
   assert.equal(doors(bad).length,2);assert.equal(doors(good).length,2);assert.equal(doors(done).length,0);
   assert.ok(frame({id:p.id,correct:false,progress:.99}).fills.every(f=>f.color!=='#ec765d'));
  }
 }
});
