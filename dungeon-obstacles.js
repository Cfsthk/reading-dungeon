/* Nearby controls change the far side of the room before the explorer leaves. */
(function (root, factory) {
  'use strict';
  const obstacles = factory();
  if (typeof module === 'object' && module.exports) module.exports = obstacles;
  else root.DungeonObstacles = obstacles;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const titles = { feeding: '守門獸的晚餐', floodgate: '退水石道', cart:'礦車讓道' };
  const terms = ['前者', '後者', '分別', '同時符合'];
  const colours = { red: '紅', blue: '藍' };
  const positions = { left: '左邊', middle: '中間', right: '右邊' };
  const definitions = {
    前者: '先提到的那一種', 後者: '後提到的那一種',
    分別: '按先後次序逐一配對', 同時符合: '兩項要求都要符合'
  };

  function makePlan(base, random, pick, shuffle) {
    const [opener, station] = base;
    const chest = base.find(room => room.type === 'chest');
    const fork = base.find(room => room.type === 'fork');
    const gate = base.at(-1);
    const blocked = { type: pick(random, ['feeding', 'floodgate']), card: 0 };

    // Protect the early obstacle even when the incoming gate promised a vault.
    // A six-room visit leaves the old station as the fork's ordinary destination.
    if (base.length === 6) return [opener, blocked, chest, fork, station, gate];
    const early = shuffle(random, [station, blocked]);
    const extra = shuffle(random, base.slice(2, -1).filter(room => room !== fork && room !== chest))
      .slice(0, base.length - 6);
    const tail = shuffle(random, [chest, ...extra]);
    const before = pick(random, tail.filter(room => room !== chest));
    tail.splice(tail.indexOf(before), 0, fork);
    const plan = [opener, ...early, ...tail, gate];
    if (base.length === 9 && random() < .4) {
      // Leave at least one ordinary room between the two blocked paths.
      const late = plan.slice(4, -1).filter(room => room !== fork && room !== chest);
      const index = plan.indexOf(pick(random, late));
      plan[index] = { type: blocked.type === 'feeding' ? 'floodgate' : 'feeding', card: 0 };
    }
    return plan;
  }

  // Direct instructions remain in the mix even for an experienced reader.
  // Untargeted story rooms let pupils infer cause and effect without marking a word.
  function mode(band, roll) {
    if (roll >= .55) return 'word';
    return band === 1 || roll < .33 ? 'simple' : 'story';
  }

  function simpleInstruction(feeding, sideDetail, colour) {
    if (feeding) return sideDetail ? '守門獸怕鈴聲。把魚放在沒有鈴鐺的食盤裏。' :
      '守門獸餓了。把魚放在牠的' + colour + '色食盤裏。';
    return sideDetail ? '石路被水淹了。拉下接着空水池的拉桿。' :
      '石路被水淹了。拉下' + colour + '色拉桿放水。';
  }

  function storyInstruction(feeding, band, colour, other) {
    if (feeding && band === 2) return '守門獸只肯用自己的' + colour + '色食盤。鈴聲會嚇得牠守在門前。把魚放到合適的盤裏。';
    if (feeding) return '上次餵食，守門獸聞過' + other + '盤裏的魚，仍守着門口。飼養員改用' + colour +
      '盤，牠才走到盤旁吃魚。今天牠好不容易才安靜下來，千萬別讓盤上的鈴鐺響起。把魚放在哪裏好？';
    if (band === 2) return colour + '色拉桿控制淹着石路的水渠。要把渠裏的水引進空池，該拉哪一支？';
    return '水從石階上方湧下來。上方水渠由' + colour + '色拉桿控制，' + other +
      '色拉桿管的是另一條渠。水池若已盛滿，排出的水只會溢回石路。拉哪一支才可以過去？';
  }

  function wordInstruction(feeding, term, band, colour, other, secondDetail, reverse) {
    let instruction;
    const unit = feeding ? '盤' : '色拉桿';
    if (term === '前者' || term === '後者') {
      const pair = term === '前者' ? [colour, other] : [other, colour];
      instruction = feeding ? '飼養員備有' + pair[0] + '色和' + pair[1] + '色兩種食盤。守門獸慣用' + term + '。' :
        '水渠有' + pair[0] + '柄和' + pair[1] + '柄兩種拉桿。' + term + '控制石路的排水口。';
    } else if (term === '分別') {
      const pair = reverse ? [other, colour] : [colour, other];
      const jobs = feeding ? ['守門獸', '巡夜犬'] : ['石路', '庫房'];
      if (reverse) jobs.reverse();
      instruction = pair[0] + unit + '和' + pair[1] + unit + '分別' +
        (feeding ? '留給' : '控制') + jobs.join('和') + (feeding ? '。' : '的排水渠。');
    } else {
      instruction = feeding ? '守門獸只肯用自己的' + colour + '盤。' : colour + '色拉桿控制石路的排水渠。';
    }
    if (secondDetail) {
      instruction += feeding ? '守門獸怕鈴聲。' : '水要排到空池裏。';
    }
    if (band === 3) instruction = (feeding ? '北門被守門獸擋住了。飼養員留下了一頁餵食記錄。' :
      '水淹過石路，門前只露出最上面的一級。守渠人留下了操作記錄。') + instruction;
    const required = term === '同時符合' ? '同時符合這兩項要求' : '合適';
    return instruction + (feeding ? '把魚放進' + required + '的食盤。' : '拉下' + required + '的拉桿。');
  }

  function cartRoom({band,style,target,random,pick,shuffle}) {
    const colour=pick(random,['red','blue']),other=colour==='red'?'blue':'red';
    const direction=pick(random,['left','right']),opposite=direction==='left'?'right':'left';
    const side=d=>d==='left'?'左':'右';
    const compound=!!target && (band>1||target==='同時符合') || !target && style==='story';
    const arrowOnly=!target&&!compound&&random()<.5;
    const requiredColour=colours[colour]+'色拉桿',requiredArrow='箭頭向'+side(direction);
    const conditions=arrowOnly?[requiredArrow]:compound?[requiredColour,requiredArrow]:[requiredColour];
    let prompt='礦車擋住了路。';
    if(target==='前者'||target==='後者'){
      const pair=target==='前者'?[colour,other]:[other,colour];
      prompt+=colours[pair[0]]+'柄和'+colours[pair[1]]+'柄的拉桿排在軌旁。'+target+'控制這輛礦車。';
    }else if(target==='分別'){
      const reverse=random()<.5, pair=reverse?[other,colour]:[colour,other];
      prompt+=colours[pair[0]]+'柄和'+colours[pair[1]]+'柄的拉桿分別控制'+(reverse?'吊機和礦車':'礦車和吊機')+'。';
    }else if(compound){
      prompt+=requiredColour+'控制礦車。';
    }
    if(compound)prompt+=side(direction)+'邊的路軌暢通，另一邊正在維修。'+
      (target==='同時符合'?'拉下同時符合這兩項要求的拉桿。':'拉下合適的拉桿，讓車沿暢通的路軌開走。');
    else if(arrowOnly)prompt+='拉下'+requiredArrow+'的拉桿，讓車開走。';
    else if(target)prompt+='拉下控制礦車的拉桿。';
    else prompt+='拉下'+requiredColour+'，讓車開走。';
    const traits=[{colour,direction}];
    if(!arrowOnly)traits.push({colour:other,direction});
    if(arrowOnly||compound)traits.push({colour,direction:opposite});
    const slots=traits.length===2?['left','right']:['left','middle','right'];
    const options=shuffle(random,traits).map((t,i)=>{
      const same=t.colour===colour,direct=t.direction===direction,correct=same&&direct;
      const matches=arrowOnly?[direct]:compound?[same,direct]:[same];
      return { id:'cart-'+(i+1),position:slots[i],traits:t,correct,route:'safe',matches,
        label:colours[t.colour]+'色拉桿，箭頭向'+side(t.direction)+'；位置：'+positions[slots[i]],
        response:correct?'roll':same?'brake':'clank',
        targetEvidence:!target?'neutral':correct?'correct':!same||target==='同時符合'?'miss':'neutral' };
    });
    return {title:titles.cart,prompt,options,obstacle:{kind:'cart',band,direction},concept:target||'控制礦車',
      hint:target?'「'+target+'」即是'+definitions[target]+'。再讀一次線索。':
        compound?'先看拉桿的顏色，再看箭頭指向哪邊。':arrowOnly?'看看軌旁的箭頭指向哪邊。':'看看拉桿的顏色。',
      ...(target?{lesson:{target,level:band,situation:'調度橫越通道的礦車',conditions}}:{})};
  }

  function build({ type, band, style, target, random, pick, shuffle }) {
    if(type==='cart')return cartRoom({band,style,target,random,pick,shuffle});
    const feeding = type === 'feeding';
    const colour = pick(random, ['red', 'blue']);
    const other = colour === 'red' ? 'blue' : 'red';
    const simple = !target && style !== 'story';
    const sideOnly = simple && random() < .45;
    const double = !simple && (band > 1 || target === '同時符合');
    const noun = feeding ? '食盤' : '拉桿';
    const colourCondition = colours[colour] + '色' + noun;
    const detailCondition = feeding ? '食盤沒有掛鈴鐺' : '拉桿連着空水池';
    const correctResponse = feeding ? 'fed' : 'drain';
    const candidates = [{ colour, detail: true }];
    if (!sideOnly) candidates.push({ colour: other, detail: true });
    if (double || sideOnly) candidates.push({ colour, detail: false });

    const slots = candidates.length === 2 ? ['left', 'right'] : ['left', 'middle', 'right'];
    const conditions = sideOnly ? [detailCondition] : double ? [colourCondition, detailCondition] : [colourCondition];
    const options = shuffle(random, candidates).map((candidate, i) => {
      const rightColour = candidate.colour === colour;
      const correct = rightColour && candidate.detail;
      const traits = feeding ? { colour: candidate.colour, bell: !candidate.detail } :
        { colour: candidate.colour, basin: candidate.detail ? 'empty' : 'full' };
      const detail = feeding ? (traits.bell ? '掛着鈴鐺' : '沒有掛鈴鐺') :
        (traits.basin === 'empty' ? '接着空水池' : '接着已滿的水池');
      let response = correctResponse;
      if (!rightColour) response = feeding ? 'sniff' : 'trickle';
      else if (!candidate.detail) response = feeding ? 'bell' : 'surge';
      const matches = sideOnly ? [candidate.detail] : double ? [rightColour, candidate.detail] : [rightColour];
      const focalMiss = !rightColour || target === '同時符合';
      return { id: type + '-' + (i + 1), position: slots[i], traits, correct, route: 'safe', response, matches,
        label: colours[candidate.colour] + '色' + noun + '，' + detail + '；位置：' + positions[slots[i]],
        targetEvidence: !target ? 'neutral' : correct ? 'correct' : focalMiss ? 'miss' : 'neutral' };
    });
    const prompt = target ? wordInstruction(feeding, target, band, colours[colour], colours[other], double, random() < .5) :
      simple ? simpleInstruction(feeding, sideOnly, colours[colour]) : storyInstruction(feeding, band, colours[colour], colours[other]);
    const room = { title: titles[type], prompt, options, concept: target || (simple ? '照指示行動' : '判斷行動的後果'),
      hint: target ? '「' + target + '」即是' + definitions[target] + '。再讀一次線索。' :
        simple ? '再看看' + (sideOnly ? (feeding ? '盤上有沒有鈴鐺。' : '哪個水池還是空的。') : noun + '的顏色。') :
          feeding ? '先找牠慣用的食盤，再看看盤上有沒有鈴鐺。' : '先找石路的排水拉桿，再看看水池能否盛水。',
      obstacle: { kind: type, band, ...(feeding ? { food: 'fish' } : {}) } };
    if (target) room.lesson = { target, level: band, situation: feeding ? '餵食引開守門獸' : '排走石路積水', conditions };
    return room;
  }
  return Object.freeze({ titles, terms, makePlan, mode, build });
}));
