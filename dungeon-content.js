(function (root, factory) {
  'use strict';
  const commonJS = typeof module === 'object' && module.exports;
  const content = factory(commonJS ? require('./dungeon-lessons.js') : root.DungeonLessons,
    commonJS ? require('./dungeon-obstacles.js') : root.DungeonObstacles);
  if (typeof module === 'object' && module.exports) module.exports = content;
  else root.DungeonContent = content;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Lessons, Obstacles) {
  'use strict';

  const AREAS = Object.freeze({
    crypt: Object.freeze({ id: 'crypt', name: '石砌地牢', title: '石砌地牢', color: '#b79770', accent: '#e9bb72' }),
    tide: Object.freeze({ id: 'tide', name: '沉水墓穴', title: '沉水墓穴', color: '#64a9bd', accent: '#90e1ec' }),
    fungus: Object.freeze({ id: 'fungus', name: '螢菇洞窟', title: '螢菇洞窟', color: '#a582bd', accent: '#b2efb4' }),
    forge: Object.freeze({ id: 'forge', name: '熔火工坊', title: '熔火工坊', color: '#d18662', accent: '#ffc67b' }),
    archive: Object.freeze({ id: 'archive', name: '古印書庫', title: '古印書庫', color: '#b88b57', accent: '#f2ce87' }),
    glacier: Object.freeze({ id: 'glacier', name: '霜晶冰堡', title: '霜晶冰堡', color: '#85adcd', accent: '#c1f6ff' }),
    amber: Object.freeze({ id: 'amber', name: '琥珀蜂宮', title: '琥珀蜂宮', color: '#d89950', accent: '#ffde78' }),
    astral: Object.freeze({ id: 'astral', name: '星軌天文臺', title: '星軌天文臺', color: '#8b91ce', accent: '#d1cdff' })
  });

  const MATERIALS = ['stone', 'iron', 'wood'];
  const RUNES = ['red', 'blue', 'gold', 'green'];
  const MATERIAL_NAMES = { stone: '石', iron: '鐵', wood: '木', ceramic: '陶瓷', copper: '銅' };
  const RUNE_NAMES = { red: '紅色', blue: '藍色', gold: '金色', green: '綠色' };
  const NUMBERS = ['零', '一', '兩'];

  // Preserve the displayed room and accepted answers when resuming a pre-shuffle save.
  const STORIES = Object.freeze({
    crypt: {
      chapter: '沉默的警鐘', guardian: '石像守衛', material: 'stone',
      beats: [
        ['警鐘下的門', '石砌地牢的警鐘忽然停了。鐘座下的刻文說，出口被三重封印鎖住。第一塊路碑記下了通往鐘室的門紋。'],
        ['鐘室的引路人', '鐘室裡有幾位披着斗篷的巡守者。一張字條描述了知道舊水道入口的人；找到他，便能請他帶路。'],
        ['兩條舊水道', '舊水道在石柱後分岔。藍紋石門通向平整的巡守道；金紋木門通向狹窄密道。密道盡頭的箱子看起來都像寶箱，只有刻文描述的那個是真的。'],
        ['水道旁的失物', '巡守者把水道裡找到的物件放在矮台上。依照刻文拿起指定的物件，就能看見壓在下面的鐘樓路圖。'],
        ['鐘座前的回廊', '路圖把你帶到鐘座前的回廊。幾道門旁掛着火把，有些燃亮，有些已熄滅。依刻文核對門身和火光，找到通往壁畫室的路。'],
        ['讀懂壁畫的人', '鐘樓底部的壁畫畫着洪水與出口。幾位看守正在研究壁畫；刻文描述了能解釋封印原因的那一位。'],
        ['第一室・裂谷上的橋', '看守解釋：封印原本用來擋住洪水，如今卻堵住排水口。第一間封印室的地面已崩開，幾座橋伸向裂谷對岸。只有刻文所指的橋承得住人；其餘的會塌進深不見底的裂谷。選對橋，便能拉開第一道閘。'],
        ['第二室・鐘座高台', '第一道閘已開，排水槽開始流動。第二間封印室的機關在鐘座高台上，幾架梯子通往台邊。依刻文選梯，爬上高台便能鬆開第二道封印。'],
        ['第三室・開閘人', '水流開始退去。幾位巡守者在最後一道閘旁等候；刻文描述了知道開閘次序的人，找到他便能解開最後的封印。'],
        ['重新流動的水', '三間封印室的機關都已解開，出口亮了起來。警鐘再次響起，積水沿舊水道退去。']
      ]
    },
    tide: {
      chapter: '倒流的潮水', guardian: '潮汐守衛', material: 'iron',
      beats: [
        ['水面上的刻字', '沉水墓穴的潮水竟往高處流。墓道盡頭的三層水閘把水壓回墓室。入口石碑記下了通往觀潮室的門紋。'],
        ['石階上的巡潮者', '觀潮室的石階上站着幾位巡潮者。留言描述了知道高處渡口的人；仔細看他的斗篷、朝向和手裡的東西。'],
        ['水聲分岔處', '水聲在岔口分成兩股。藍紋石門後是高起的石堤；金紋木門後是一條低矮密道。密道盡頭的箱子看起來都像寶箱，只有刻文描述的那個是真的。'],
        ['退潮留下的物件', '退潮露出石台上的幾件物品。依照刻文拿起指定的一件，就能讀到壓在下面的水閘位置圖。'],
        ['水位表前的門', '路圖指向水位記錄室。幾道門旁的火把有明有暗；掛着多少支，與燃亮多少支，是兩回事。依刻文找到記錄員所在的房間。'],
        ['解讀水位的人', '水位表旁有幾位記錄員。留言描述了讀懂異常水位的人；找到他，就能知道潮水倒流的原因。'],
        ['第一閘・水渠斷口', '記錄員說，工坊送來的熱氣把水壓向上方。控制室前的水渠裂開了一道缺口，幾座橋連着對岸。水渠下方是深不見底的暗井，只有刻文所指的橋承得住人。過橋便能打開第一道閘。'],
        ['第二閘・高處的閘桿', '第一道水閘已開，積水降了一層。第二道閘的拉桿設在高處石台，幾架梯子靠着台邊。依刻文選梯，爬上石台便能放下閘桿。'],
        ['第三閘・值守者', '第二道水閘也開了，墓室露出地面。最後一間封印室有幾位值守者，刻文描述了保管開閘口令的人。'],
        ['潮水的去向', '三層水閘全部升起，倒流的潮水終於退去。水下露出的地圖，標出另一個出口。']
      ]
    },
    fungus: {
      chapter: '失去節奏的微光', guardian: '菌石守衛', material: 'wood',
      beats: [
        ['忽明忽暗的洞窟', '螢菇洞窟的光一陣亮、一陣暗，送風孔傳來沉重的喘息聲。洞口的告示說，三間封印室後有一條通風的路。'],
        ['螢菇下的採集者', '幾位採集者在螢菇下歇腳。木牌描述了熟悉根鬚小徑的人；找到他，就能繼續深入洞窟。'],
        ['根鬚之間', '根鬚把洞道分成兩條。藍紋石門後是寬闊岩道；金紋木門後是根鬚中的密道。密道盡頭的箱子看起來都像寶箱，只有刻文描述的那個是真的。'],
        ['岩台上的採集物', '採集者把物件排在乾燥的岩台上。依照木牌拿起指定的一件，就能讀到下面的通風井路圖。'],
        ['通風井的回廊', '你沿路圖來到通風井前。菇光照亮幾道門，卻不能當作門旁的火光。核對門身和火把，找到學者所在的房間。'],
        ['懂得菇光的人', '通風井旁有幾位觀察螢菇的學者。木牌描述了知道菇光變暗原因的人；他會告訴你封印室的位置。'],
        ['第一室・菇谷上的橋', '學者說，工坊的熱風堵在洞中，螢菇才會失去節奏。第一個進風口在裂谷對岸，幾座橋伸向發光的岩壁。谷底深不見底，只有木牌描述的橋承得住人。過橋便能打開進風口。'],
        ['第二室・根鬚高台', '冷風掠過螢菇。第二間封印室的根鬚機關在高處岩台，幾架梯子靠着岩壁。依木牌選梯，爬上岩台便能鬆開纏住風口的根鬚。'],
        ['第三室・護林人', '孢子開始順風飄動。幾位護林人在最後一間封印室等候；木牌描述了懂得打開風口的人。'],
        ['重新呼吸的洞窟', '三間封印室都已打開，螢菇的光恢復平穩。根鬚緩緩退開，露出通往別處的門。']
      ]
    },
    forge: {
      chapter: '停不下來的爐火', guardian: '鑄鐵守衛', material: 'iron',
      beats: [
        ['失控的工坊', '熔火工坊的爐火不斷升高。中央風箱被三重封印鎖住，熱氣只能湧入地底。值守牌標出前往爐心的門。'],
        ['爐前的學徒', '幾位學徒在爐前等候。值守牌描述了知道冷卻渠入口的人；找到他，他便會指路。'],
        ['冷卻渠旁', '冷卻渠旁出現兩條通道。藍紋石門後是寬闊工道；金紋木門後是堆着舊模具的密道。密道盡頭的箱子看起來都像寶箱，只有刻文描述的那個是真的。'],
        ['鐵砧上的物件', '冷卻的鐵砧上放着幾件物品。依照值守牌拿起指定的一件，就能看見下面的風箱位置圖。'],
        ['停爐室前的門', '路圖帶你來到停爐室前。爐光映亮幾道門，門旁的火把卻有些沒有燃燒。核對刻文中的門身和火把，找到值守工匠。'],
        ['保管停爐令的人', '風箱旁站着幾位值守工匠。刻文描述了保管停爐令的人；找到他，便能知道爐火為何遲遲沒有熄滅。'],
        ['第一室・爐溝上的橋', '工匠說，警鐘停下後，停爐令未能送達。風箱前的工道斷開，幾座橋跨過下面的爐溝。爐溝深不見底，只有值守牌描述的橋承得住人。走到對岸便能拉下減慢風箱的拉桿。'],
        ['第二室・冷卻高台', '風箱慢了下來。冷卻機關設在工坊高台上，幾架梯子沿着爐壁架起。依值守牌選梯，爬上高台便能開啟冷卻渠。'],
        ['第三室・停爐工匠', '爐火變成柔和的橘紅。最後一間封印室裡有幾位工匠；刻文描述了知道最後一步停爐程序的人。'],
        ['鐘聲傳遍地下', '三間封印室的程序全都完成，風箱停止推送熱氣。工坊漸漸冷卻，遠處的鐘聲從兩道門後傳來。']
      ]
    }
  });

  function hash(value) {
    let result = 2166136261;
    for (const ch of String(value)) {
      result ^= ch.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function randomSource(value) {
    let state = hash(value);
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      let n = Math.imul(state ^ (state >>> 15), 1 | state);
      n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(random, list) { return list[Math.floor(random() * list.length)]; }
  function shuffle(random, list) {
    const result = list.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function randomTraits(random) {
    const torches = Math.floor(random() * 3);
    const material = pick(random, MATERIALS);
    return {
      material, torches,
      lit: Math.floor(random() * (torches + 1)),
      rune: pick(random, RUNES.concat(null)),
      cracked: material === 'stone' && random() < 0.5
    };
  }

  function constrainTraits(traits) {
    if (traits.material !== 'stone') traits.cracked = false;
    traits.lit = Math.min(traits.lit, traits.torches);
    return traits;
  }

  function describeDoor(traits) {
    const flames = traits.torches === 0 ? '沒有火把' :
      NUMBERS[traits.torches] + '支火把，' + (traits.lit === 0 ? '都沒有燃亮' : NUMBERS[traits.lit] + '支燃亮');
    return [MATERIAL_NAMES[traits.material] + '門', flames,
      traits.rune ? RUNE_NAMES[traits.rune] + '符文' : '沒有符文',
      traits.cracked ? '門面有裂痕' : '門面完整'].join('；');
  }

  function rule(key, value, negative) { return { key, value, negative: Boolean(negative) }; }

  const ITEM_NAMES = { box: '箱子', jug: '壺', bottle: '瓶子', key: '鑰匙', book: '書本', gem: '寶石' };
  const TARGETS = ['door', 'person', 'door', 'item', 'door', 'person', 'bridge', 'ladder', 'person', 'door'];
  const POSITION_NAMES = { left: '左側', middle: '中間', right: '右側', 'far-left': '最左側', 'inner-left': '左側內側',
    'inner-right': '右側內側', 'far-right': '最右側', 'upper-left': '左上方', 'middle-left': '左側中間', 'lower-left': '左下方',
    'upper-right': '右上方', 'middle-right': '右側中間', 'lower-right': '右下方' };

  function describePerson(traits) {
    return RUNE_NAMES[traits.hood] + '兜帽；' + (traits.facing === 'front' ? '面朝你' : '背朝你') +
      '；手持' + (traits.carrying === 'lantern' ? '提燈' : '卷軸');
  }

  function describeItem(traits) {
    if (!traits.material) return RUNE_NAMES[traits.color] + ITEM_NAMES[traits.type] + '；' +
      (traits.marked ? '貼着金色星星貼紙' : '沒有金色星星貼紙');
    return MATERIAL_NAMES[traits.material] + '製' + ITEM_NAMES[traits.type] + '；' +
      (traits.decoration === 'none' ? '沒有緞帶' : '繫着' + RUNE_NAMES[traits.decoration] + '緞帶');
  }

  function describeObstacle(traits, targetType) {
    return MATERIAL_NAMES[traits.material] + (targetType === 'bridge' ? '橋' : '梯') + '；' +
      RUNE_NAMES[traits.trim] + '緞帶；結構完整';
  }

  function positionsFor(type, count, arena) {
    if (arena && type !== 'door') return type === 'person' ? ['upper-left', 'middle-left', 'lower-left'] : ['upper-right', 'middle-right', 'lower-right'];
    if (count === 2) return ['left', 'right'];
    if (type === 'person' || type === 'item') return count === 3 ? ['upper-left', 'lower-left', 'right'] : ['upper-left', 'lower-left', 'upper-right', 'lower-right'];
    return count === 3 ? ['left', 'middle', 'right'] : ['far-left', 'inner-left', 'inner-right', 'far-right'];
  }

  function positionMatches(position, value) {
    if (value === 'left-side') return position.includes('left');
    if (value === 'right-side') return position.includes('right');
    if (value === 'not-left') return position !== 'left';
    if (value === 'not-right') return position !== 'right';
    if (value === 'not-far-left') return position !== 'far-left';
    if (value === 'not-far-right') return position !== 'far-right';
    if (value === 'not-middle') return position !== 'middle' && !position.startsWith('middle-');
    if (value === 'not-upper-left') return position !== 'upper-left';
    if (value === 'not-lower-left') return position !== 'lower-left';
    if (value === 'not-upper') return !position.startsWith('upper-');
    if (value === 'not-lower') return !position.startsWith('lower-');
    return false;
  }

  function spatialRule(random, positions, correctPosition, broad) {
    // Four crossings leave room for a counterexample to each of their three
    // conditions when the location clause excludes only one end of the row.
    const wide = broad && positions.length === 4;
    const values = wide ? ['not-far-left', 'not-far-right'] :
      positions.some(position => position.startsWith('middle-')) ? ['not-upper', 'not-middle', 'not-lower'] :
      positions.includes('upper-left') && positions.includes('right') ? ['left-side', 'not-upper-left', 'not-lower-left'] :
      positions.includes('middle') ? ['not-left', 'not-middle', 'not-right'] : ['left-side', 'right-side'];
    const suitable = values.filter(value => positionMatches(correctPosition, value) && positions.filter(position => positionMatches(position, value)).length === (wide ? 3 : 2));
    return rule('position', pick(random, suitable));
  }

  function ruleText(item, targetType, chestRoom = false) {
    const v = item.value;
    if (item.key === 'position') {
      const subject = { door: '門', person: '那人', item: chestRoom ? '箱子' : '物品', bridge: '橋', ladder: '梯子' }[targetType];
      return subject + { 'left-side': '位於左側', 'right-side': '位於右側', 'not-left': '不在最左邊', 'not-right': '不在最右邊',
        'not-far-left': '不在最左邊', 'not-far-right': '不在最右邊',
        'not-middle': '不在中間', 'not-upper-left': '不在左上方', 'not-lower-left': '不在左下方', 'not-upper': '不在最上方', 'not-lower': '不在最下方' }[v];
    }
    if (targetType === 'bridge' || targetType === 'ladder') {
      const name = targetType === 'bridge' ? '橋' : '梯';
      if (item.key === 'material') return name + '身是' + MATERIAL_NAMES[v] + '造的';
      if (item.key === 'trim') return name + '上繫着' + RUNE_NAMES[v] + '緞帶';
    }
    if (targetType === 'item') {
      const noun = chestRoom ? '箱子' : '物品';
      if (item.key === 'material') return noun + '是' + MATERIAL_NAMES[v] + '製的';
      if (item.key === 'decoration') return v === 'none' ? noun + '沒有緞帶' : noun + (item.negative ? '沒有' : '繫着') + RUNE_NAMES[v] + '緞帶';
    }
    if (item.key === 'material') return '門身是' + MATERIAL_NAMES[v] + '造的';
    if (item.key === 'rune') return item.negative ? '符文不是' + RUNE_NAMES[v] + '的' : '門上刻着' + RUNE_NAMES[v] + '符文';
    if (item.key === 'torches') return v === 0 ? '門旁沒有火把' : '門旁共有' + NUMBERS[v] + '支火把';
    if (item.key === 'lit') return v === 0 ? '沒有火把燃亮' : '其中只有' + NUMBERS[v] + '支火把燃亮';
    if (item.key === 'cracked') return v ? '門面有裂痕' : '門面沒有裂痕';
    if (item.key === 'hood') return item.negative ? '那人的兜帽不是' + RUNE_NAMES[v] + '的' : '那人戴着' + RUNE_NAMES[v] + '兜帽';
    if (item.key === 'facing') return v === 'front' ? '那人面朝着你' : '那人背朝着你';
    if (item.key === 'carrying') return '那人手持' + (v === 'lantern' ? '提燈' : '卷軸');
    throw new Error('Unknown visible condition: ' + item.key);
  }

  function matches(traits, item, position) {
    if (item.key === 'position') return positionMatches(position, item.value);
    return item.negative ? traits[item.key] !== item.value : traits[item.key] === item.value;
  }

  function puzzleFor(stage, story, random, extraConditions, boss, positions, chestRoom = false) {
    const targetType = chestRoom ? 'item' : boss ? ['door', 'person', 'item'][stage - 1] : TARGETS[stage];
    const correctPosition = pick(random, positions);
    let rules;
    if (targetType === 'person') {
      rules = [rule('hood', pick(random, RUNES), random() < 0.35), rule('carrying', pick(random, ['lantern', 'scroll']))];
      if (boss || stage >= 5 || extraConditions > 0) rules.push(rule('facing', pick(random, ['front', 'back'])));
      if (!boss && ((stage === 8 && extraConditions > 0) || extraConditions > 1)) rules.push(spatialRule(random, positions, correctPosition));
    } else if (targetType === 'item') {
      const decoration = pick(random, ['none', 'red', 'blue', 'green']);
      rules = [rule('material', pick(random, chestRoom ? ['wood', 'iron'] : ['wood', 'iron', 'ceramic', 'copper'])), rule('decoration', decoration, decoration !== 'none' && random() < 0.35), spatialRule(random, positions, correctPosition)];
    } else if (targetType === 'bridge' || targetType === 'ladder') {
      rules = [rule('material', pick(random, ['wood', 'iron'])), rule('trim', pick(random, RUNES)), spatialRule(random, positions, correctPosition, true)];
    } else if (boss) {
      rules = [rule('material', story.material), rule('rune', pick(random, RUNES)), rule('lit', pick(random, [0, 1]))];
    } else {
      rules = [rule('material', story.material), rule('lit', pick(random, [0, 1]))];
      if (stage === 4 || extraConditions > 0) rules.push(rule('torches', 2));
      if ((stage === 4 && extraConditions > 0) || extraConditions > 1) rules.push(spatialRule(random, positions, correctPosition));
    }
    const hint = {
      door: '先分清火把總數與燃亮數目，再核對門身、位置和刻文提到的記號。',
      person: '把位置、兜帽、朝向和手持物件分開核對，再找同時符合刻文的人。',
      item: '把材質、緞帶和位置分開核對；「沒有紅色緞帶」不等於「沒有緞帶」。',
      bridge: '把橋身材質、緞帶顏色和位置分開核對，再找三項都相符的橋。',
      ladder: '把梯身材質、緞帶顏色和位置分開核對，再找三項都相符的梯子。'
    }[targetType];
    return { rules, correctPosition, targetType, chestRoom, hint, concept: rules.some(item => item.key === 'position') ? '特徵、位置與排除' : '多項可見條件' };
  }

  // Exhaustive visible variants keep every clue renderable and let distractors
  // miss exactly one condition. No hidden metadata determines an answer.
  function visibleVariants(targetType) {
    const variants = [];
    if (targetType === 'person') {
      for (const hood of RUNES) for (const facing of ['front', 'back']) for (const carrying of ['lantern', 'scroll']) {
        variants.push({ hood, facing, carrying });
      }
    } else if (targetType === 'item') {
      for (const material of ['wood', 'iron', 'ceramic', 'copper']) for (const decoration of ['none', 'red', 'blue', 'green']) {
        variants.push({ type: material === 'wood' || material === 'iron' ? 'box' : 'jug', material, decoration });
      }
    } else if (targetType === 'bridge' || targetType === 'ladder') {
      for (const material of ['wood', 'iron']) for (const trim of RUNES) variants.push({ material, trim, damaged: false });
    } else {
      for (const material of MATERIALS) for (const rune of RUNES.concat(null)) for (const torches of [0, 1, 2]) {
        for (let lit = 0; lit <= torches; lit += 1) {
          for (const cracked of material === 'stone' ? [false, true] : [false]) variants.push({ material, torches, lit, rune, cracked });
        }
      }
    }

    return variants;
  }

  const VARIANTS = Object.fromEntries(['door', 'person', 'item', 'bridge', 'ladder'].map(type => [type, visibleVariants(type)]));
  const DESCRIBE = {
    door: describeDoor, person: describePerson, item: describeItem,
    bridge: traits => describeObstacle(traits, 'bridge'), ladder: traits => describeObstacle(traits, 'ladder')
  };

  function readingOptions(random, puzzle, positions) {
    const { rules, targetType, correctPosition } = puzzle;
    const variants = puzzle.chestRoom ? VARIANTS.item.filter(t => t.type === 'box') : VARIANTS[targetType];
    const traitRules = rules.filter(item => item.key !== 'position');
    const correct = pick(random, variants.filter(traits => traitRules.every(item => matches(traits, item))));
    const slots = positions.filter(position => position !== correctPosition).map(position => {
      const pools = rules.map((_, failedRule) => ({ failedRule, variants: variants.filter(candidate =>
        rules.every((item, index) => matches(candidate, item, position) === (index !== failedRule))) }))
        .filter(pool => pool.variants.length);
      return { position, pools: shuffle(random, pools) };
    });
    const failures = rules.map(() => 0);
    const assigned = new Map();
    const used = new Set([correct]);
    // Reserve forced location failures first, then contrast an unused condition
    // wherever the slot permits it. Reuse a visible variant only if necessary.
    for (const slot of slots.sort((a, b) => a.pools.length - b.pools.length)) {
      const pool = slot.pools.reduce((best, candidate) => failures[candidate.failedRule] < failures[best.failedRule] ? candidate : best);
      const fresh = pool.variants.filter(candidate => !used.has(candidate));
      const traits = pick(random, fresh.length ? fresh : pool.variants);
      assigned.set(slot.position, traits);
      used.add(traits);
      failures[pool.failedRule] += 1;
    }
    let wrongIndex = 0;
    const options = positions.map(position => {
      const isCorrect = position === correctPosition;
      const traits = isCorrect ? correct : assigned.get(position);
      if (!isCorrect) wrongIndex += 1;
      return { id: targetType + '-' + (isCorrect ? 1 : wrongIndex + 1), position, traits: Object.assign({}, traits),
        label: DESCRIBE[targetType](traits) + '；位置：' + POSITION_NAMES[position], correct: isCorrect, route: 'safe' };
    });
    return shuffle(random, options);
  }

  function routeOptions(random, nextArea) {
    const doors = [
      { material: 'stone', rune: 'blue', route: 'safe' },
      { material: 'wood', rune: 'gold', route: 'vault' }
    ];
    return shuffle(random, doors.map((door, i) => {
      const traits = constrainTraits(Object.assign(randomTraits(random), { material: door.material, rune: door.rune }));
      return { id: 'door-' + (i + 1), position: i === 0 ? 'left' : 'right', traits, label: describeDoor(traits) + '；位置：' + (i === 0 ? '左側' : '右側'), correct: true,
        route: door.route, ...(nextArea ? { nextArea } : {}) };
    }));
  }

  function createLegacyScene(input) {
    const config = input || {};
    const area = Object.prototype.hasOwnProperty.call(STORIES, config.area) ? config.area : 'crypt';
    const story = STORIES[area];
    const state = config.storyState || {};
    const localStep = state.areaSteps && state.areaSteps[area];
    const fallback = Number.isFinite(config.index) ? Math.max(0, Math.floor(config.index)) : 0;
    const steps = Number.isFinite(localStep) ? Math.max(0, Math.floor(localStep)) : fallback;
    const stage = steps % 10;
    const cycle = Math.floor(steps / 10);
    // Legacy risk doors already paid on entry. Only a newly chosen vault door leads to unopened chests.
    const vault = (state.lastRoute || state.route) === 'vault';
    const chestRoom = vault && (stage === 3 || stage === 0);
    const risk = vault || state.lastRoute === 'risk' || state.route === 'risk';
    const depthComplex = ['deep', 'fatal', 'pursuit', 'overrun'].includes(config.difficulty) || Number(config.difficulty) >= 3;
    const extraConditions = Number(risk) + Number(depthComplex) + Number(config.difficulty === 'overrun');
    const difficult = extraConditions > 0;
    // Elapsed time intentionally does not change an already visible puzzle.
    const sceneSeed = String(config.seed == null ? 'dungeon' : config.seed) + ':' + area + ':' + steps + ':' + fallback + ':' + extraConditions + (chestRoom ? ':vault' : '');
    const random = randomSource(sceneSeed);
    const beat = story.beats[stage];
    const kind = stage === 2 || stage === 9 ? 'choice' : 'reading';
    const scene = {
      id: area + '-' + cycle + '-' + stage + '-' + hash('varied-v5:' + sceneSeed).toString(36),
      area, title: beat[0], chapter: story.chapter, prompt: beat[1],
      hint: '', concept: '', kind, targetType: TARGETS[stage], options: [],
      backgroundVariant: hash('background:' + sceneSeed) % 3,
      ...(stage === 6 ? { terrain: 'gap' } : stage === 7 ? { terrain: 'ledge' } : {}),
      backgroundRole: stage >= 6 && stage <= 8 ? 'seal' : stage === 9 ? 'exit' : TARGETS[stage] === 'person' ? 'meeting' : TARGETS[stage] === 'item' ? 'discovery' : 'passage',
      storyFlags: { [area + 'Stage']: stage }
    };
    if (stage === 0) {
      scene.storyFlags[area + 'Entered'] = true;
      if (cycle > 0 || state[area + 'Complete']) scene.prompt = '更深的一層，門紋已經改變。' + scene.prompt;
    }
    if (chestRoom) {
      const maps = { crypt: '鐘樓路圖', tide: '水閘位置圖', fungus: '通風井路圖', forge: '風箱位置圖' };
      scene.chestRoom = true;
      scene.targetType = 'item';
      scene.backgroundRole = 'discovery';
      scene.title = '密道藏箱室';
      const arrivals = {
        crypt: '地下密道通往鐘座下的藏箱室。頭頂的警鐘一聲不響，鐘座上的三重封印仍未鬆開。',
        tide: '密道把你帶到沉水墓穴的藏箱室。門外的潮水正沿着石級往上流。',
        fungus: '密道通向螢菇洞窟的藏箱室。洞裡的菇光忽明忽暗，風孔傳來喘息聲。',
        forge: '密道的盡頭是工坊的藏箱室。風箱仍在鼓動，爐火映紅了石壁。'
      };
      scene.prompt = (stage === 0 ? arrivals[area] : '你沿着密道走進藏箱室。') +
        '幾個箱子全都緊閉着。打開刻文描述的寶箱，取出' + maps[area] + '；其餘的箱子會張口咬人。';
    }
    if (stage === 5) scene.storyFlags[area + 'Revealed'] = true;
    if (stage === 2 || stage === 9) {
      const nextArea = stage === 9 ? pick(random, Object.keys(STORIES).filter(key => key !== area)) : null;
      scene.options = routeOptions(random, nextArea);
      scene.hint = '寬道通往下一間房；密道通往藏箱室。';
      scene.concept = '路線取捨';
      if (stage === 9) {
        scene.prompt += '兩道門都通往' + AREAS[nextArea].name + '。藍紋石門後是平整通道；金紋木門通往藏箱室。裏面的箱子全都緊閉着，只有刻文描述的那個是真的。';
        scene.ending = true;
        scene.storyFlags[area + 'Complete'] = true;
      }
    } else {
      const positions = positionsFor(scene.targetType, difficult ? 4 : 3, false);
      const puzzle = puzzleFor(stage, story, random, extraConditions, false, positions, chestRoom);
      scene.prompt += '\n刻文寫着：「' + puzzle.rules.map(item => ruleText(item, puzzle.targetType, chestRoom)).join('，而且') + '。」';
      if (risk && !chestRoom) scene.prompt += '\n密道的石版提醒你：每項條件都要核對。';
      scene.hint = puzzle.hint;
      scene.concept = puzzle.concept;
      scene.options = readingOptions(random, puzzle, positions);
      scene.spatialRules = puzzle.rules.filter(item => item.key === 'position').map(item => Object.assign({ targetType: scene.targetType }, item));
      if (stage >= 6) scene.storyFlags[area + 'Seals'] = stage - 5;
      if (chestRoom) {
        scene.options.find(option => option.correct).reward = 'chest';
        scene.successText = '箱蓋掀開，路圖和金幣安放在箱底。';
        scene.storyFlags[area + 'RecoveredMap'] = true;
      } else if (scene.targetType === 'item') {
        const chosen = scene.options.find(option => option.correct);
        scene.storyFlags[area + 'RecoveredMap'] = false;
        scene.collectItem = Object.assign({}, chosen.traits, { label: chosen.label });
        scene.storyFlags.collectedItemType = chosen.traits.type;
        scene.storyFlags[area + 'CollectedItemType'] = chosen.traits.type;
        scene.storyFlags[area + 'Collected' + chosen.traits.type[0].toUpperCase() + chosen.traits.type.slice(1)] = true;
        scene.successText = '你拿起了' + describeItem(chosen.traits).replace('；', '，') + '，看見下面的' + (stage === 3 ? '路圖' : '機關') + '。';
      } else if (scene.targetType === 'bridge') {
        scene.successText = '你沿着符合刻文的橋走到對岸，啟動了第一道機關。';
      } else if (scene.targetType === 'ladder') {
        scene.successText = '你沿着符合刻文的梯子爬上高台，啟動了第二道機關。';
      } else if (scene.targetType === 'person') {
        scene.successText = '你找到了刻文描述的人。他核對記錄後，帶你繼續前進。';
      }
      if (stage === 5 && state[area + 'RecoveredMap']) {
        scene.prompt += '\n在場的人看見你手上的路圖，認出了藏箱室的印記。';
      } else if (stage === 5 && Object.prototype.hasOwnProperty.call(ITEM_NAMES, state[area + 'CollectedItemType'])) {
        scene.prompt += '\n你帶來的' + ITEM_NAMES[state[area + 'CollectedItemType']] + '，讓在場的人認出了你走過的路。';
      }
    }

    return scene;
  }

  // A place supplies the local people, trade and hazards. Each card is a
  // complete encounter whose instructions stand on their own on any visit.
  const LOCALES = {
    crypt:   { place: '地牢鐘樓', crew: '巡夜人', cargo: '銅鐘的零件', hazard: '鐘井', upper: '鐘架', archive: '巡夜簿' },
    tide:    { place: '退潮碼頭', crew: '測潮員', cargo: '量水尺', hazard: '潮溝', upper: '量潮臺', archive: '潮汐表' },
    fungus:  { place: '菌光溫床', crew: '採菇人', cargo: '螢菇孢子', hazard: '地縫', upper: '育苗臺', archive: '採菇日誌' },
    forge:   { place: '鑄造間', crew: '鑄模師', cargo: '新鑄的模具', hazard: '爐溝', upper: '風箱平臺', archive: '鑄模簿' },
    archive: { place: '藏印室', crew: '校書員', cargo: '古籍拓本', hazard: '升降井', upper: '閣樓書架', archive: '藏書目錄', guardian: '銅印典守', material: 'wood' },
    glacier: { place: '冰堡哨站', crew: '攀冰嚮導', cargo: '登山繩索', hazard: '冰隙', upper: '觀雪臺', archive: '雪線紀錄', guardian: '霜晶衛士', material: 'stone' },
    amber:   { place: '育蜂室', crew: '養蜂人', cargo: '封好的蜂蠟', hazard: '蜂巢深井', upper: '集蜜臺', archive: '分蜂手冊', guardian: '琥珀蜂后', material: 'wood' },
    astral:  { place: '觀星室', crew: '星象官', cargo: '觀測鏡片', hazard: '轉軸深井', upper: '望遠鏡座', archive: '星軌圖冊', guardian: '星輪守望者', material: 'iron' }
  };

  const CARDS = {
    door: [
      ['夜班入口', p => p.place + '換了夜班入口。門房怕你走回舊路，留下了新入口的特徵。'],
      ['送貨通道', p => '載着' + p.cargo + '的車剛剛駛過。跟車的人留下便條，指明他們用的是哪道門。'],
      ['隔音門後', p => '你聽不清' + p.crew + '從門後說了甚麼，幸好值班牌上寫明了會面的入口。'],
      ['臨時借道', p => p.place + '的正門正在維修。工頭把今天可借用的側門記在告示上。'],
      ['最後入場', p => p.place + '快要關門了。值夜的人答應留一道門給遲到的旅客。']
    ],
    person: [
      ['認領失物', p => '有人遺下了一本' + p.archive + '。失物登記簿記下了物主的模樣，請這位物主前來認領。'],
      ['口信交給誰', p => '你要把「暫停運送' + p.cargo + '」的口信帶給當值的' + p.crew + '。交更表上寫着當值者的特徵。'],
      ['找嚮導', p => p.place + '的路剛改過。幾位' + p.crew + '都熟悉舊路，但只有今天巡過一遍的人知道新路。'],
      ['交換暗號', p => '幾位' + p.crew + '都在等人。接頭的同伴怕你認錯人，事先把自己的特徵留在紙條上。'],
      ['那位目擊者', p => p.cargo + '送到時，有人親眼看見收貨的經過。按記錄找到這位目擊者，打聽貨物的下落。']
    ],
    item: [
      ['借還登記', p => p.crew + '借出的用具已經送回。照着借用單的描述，取回屬於' + p.place + '的那一件。'],
      ['包裝工的考題', p => '實習生把' + p.place + '的樣品混在一起了。包裝工還記得原裝容器的樣子，請你把它取走。'],
      ['展品歸位', p => p.place + '要更換展品。從待選的器物中取出展品清單上指定的那一件。'],
      ['寄存憑據', p => '你代' + p.crew + '取回寄存的器物。收據上沒有寫物主姓名，卻把器物的特徵記得很清楚。'],
      ['行李混放', p => '送貨的人把幾件行李卸在' + p.place + '。照着提貨單找到寄給你的容器。']
    ],
    bridge: [
      ['承重試驗', p => '工匠在' + p.hazard + '上搭了幾座樣橋。只有通過承重試驗的那座可以過人，試驗結果寫在橋邊。'],
      ['巡橋筆記', p => '橫跨' + p.hazard + '的橋看來都完好。' + p.crew + '檢查過橋底，記下了唯一沒有鬆脫的那一座。'],
      ['運貨專線', p => '載運' + p.cargo + '的小車沿專用橋通過。其餘都是陷阱橋，人一踏上就會墜落。跟着運貨單選橋。'],
      ['夜歸渡口', p => '歸隊的人要渡過' + p.hazard + '。為了阻擋尾隨的怪物，守衛只讓一座橋保持穩固。'],
      ['橋樑驗收', p => p.hazard + '上的新橋仍在驗收。師傅已把唯一能站人的橋記在名冊，照着記錄過去。']
    ],
    ladder: [
      ['高處的出口', p => '出口通往' + p.upper + '。幾架梯子都靠得很穩，但固定在臺邊的只有記錄所指的那一架。'],
      ['登臺接更', p => p.upper + '傳來交更的鐘聲。值班員留下一張紙條，說明哪架梯子剛換上牢固的梯級。'],
      ['梯上的考驗', p => p.crew + '在' + p.upper + '等你。幾架梯子都是試製品，只有合格的樣本能承受一個人的重量。'],
      ['檢修通道', p => p.upper + '暫停升降運送。檢修單指明了哪架梯子可供人員攀爬。'],
      ['取捷徑', p => '要到' + p.upper + '，可以直接爬梯。裝配工只在其中一架裝好安全扣，並把它的樣子寫了下來。']
    ],
    chest: [
      ['失主的寶箱', p => p.crew + '在' + p.place + '藏起了一個錢箱。旁邊有會咬人的擬態怪，開箱前先讀失主的描述。'],
      ['驗箱人的留言', p => '驗箱人敲過' + p.place + '的每個箱蓋。只有一個箱子傳出金幣碰撞聲，其餘的都在磨牙。找出驗箱記錄所指的那一個。'],
      ['舊庫封條', p => p.archive + '的夾頁藏着一張庫存單。按單上的描述打開裝有金幣的寶箱，小心冒充木箱和鐵箱的怪物。'],
      ['怪物的模仿', p => '幾隻擬態怪混進了' + p.place + '，裝成閉緊的箱子。送貨人記得真正的錢箱長甚麼樣。'],
      ['清點庫存', p => '清點庫存時，' + p.crew + '發現多出了幾個會咬人的箱子。原來的錢箱只有一個，按清單驗明再打開。']
    ],
    fork: [
      ['兩條支路', p => p.place + '在這裏分岔。'],
      ['小徑與密道', p => p.crew + '在分岔口留下了兩段指路的話。'],
      ['舊路牌', p => '一塊舊路牌記着從' + p.place + '出發的兩種走法。']
    ],
    gate: [
      ['出境門', p => '你來到' + p.place + '的邊界。'],
      ['地下聯絡道', p => p.crew + '在出口標出了兩條通往外域的路。'],
      ['交界石碑', p => '交界的石碑記下了離開' + p.place + '的路。']
    ]
  };

  const TARGET_FOR = { door: 'door', person: 'person', item: 'item', bridge: 'bridge', ladder: 'ladder', chest: 'item', fork: 'door', gate: 'door' };

  // Build a small bag for this visit. Reserve a separate chest even for players
  // who skip every optional vault. The fork always has a room before the gate.
  function visitPlan(seed, area, start) {
    const random = randomSource(seed + ':visit:' + area + ':' + start);
    const total = pick(random, [6, 7, 8, 9]);
    const obstacle = pick(random, ['bridge', 'ladder']);
    const secondary = pick(random, ['person', 'item']);
    const extra = shuffle(random, [secondary === 'person' ? 'item' : 'person', obstacle === 'ladder' ? 'bridge' : 'ladder', 'person']);
    const bag = shuffle(random, ['door', 'fork', 'chest', obstacle, secondary, ...extra.slice(0, total - 6)]);

    function arrange(remaining, order) {
      if (remaining.length === 0) return TARGET_FOR[order[order.length - 1]] === 'door' ? null : order;
      const last = order[order.length - 1];
      for (let i = 0; i < remaining.length; i += 1) {
        const room = remaining[i];
        if (order.length === 0 && (start === 0 ? room !== 'door' : ['door', 'fork', 'chest'].includes(room))) continue;
        // An incoming vault replaces the first room. An internal vault replaces
        // the room after its fork. Neither can run straight into a second chest.
        if (room === 'chest' && ((start > 0 && order.length === 1) || order.at(-2) === 'fork')) continue;
        if (last && TARGET_FOR[room] === TARGET_FOR[last]) continue;
        if (last === 'fork' && TARGET_FOR[room] === 'item') continue;
        const next = arrange(remaining.filter((_, j) => j !== i), [...order, room]);
        if (next) return next;
      }
      return null;
    }

    const order = arrange(bag, []);
    order.push('gate');
    const indices = {};
    return order.map(type => {
      if (!indices[type]) indices[type] = shuffle(random, CARDS[type].map((_, i) => i));
      return { type, card: indices[type].pop() };
    });
  }

  function readingPuzzle(type, random, difficulty, positions) {
    const targetType = TARGET_FOR[type];
    const correctPosition = pick(random, positions);
    const position = () => spatialRule(random, positions, correctPosition, type === 'bridge' || type === 'ladder');
    const material = (choices) => rule('material', pick(random, choices));
    const coloredRibbon = () => {
      const color = pick(random, ['none', 'red', 'blue', 'green']);
      return rule('decoration', color, color !== 'none' && random() < 0.4);
    };
    let rules, hint;
    if (targetType === 'door') {
      const torches = pick(random, [rule('lit', pick(random, [0, 1])), rule('torches', pick(random, [0, 1, 2]))]);
      const details = shuffle(random, [rule('rune', pick(random, RUNES)), torches, position()]);
      rules = [material(MATERIALS), ...details.slice(0, 1 + difficulty)];
      hint = '先看門身用甚麼材料，再逐一核對其餘條件。';
    } else if (targetType === 'person') {
      const details = shuffle(random, [rule('hood', pick(random, RUNES), random() < 0.4), rule('carrying', pick(random, ['lantern', 'scroll'])), rule('facing', pick(random, ['front', 'back'])), position()]);
      rules = details.slice(0, 2 + difficulty);
      hint = '先縮小人選，再看紙條提到的衣着、動作或位置，逐項核對。';
    } else if (targetType === 'item') {
      rules = [material(type === 'chest' ? ['wood', 'iron'] : ['wood', 'iron', 'ceramic', 'copper']), coloredRibbon(), position()];
      rules = difficulty === 0 ? shuffle(random, rules).slice(0, pick(random, [2, 3])) : rules;
      hint = '先認清材料，再核對緞帶和位置。「沒有紅色緞帶」也可能繫着別的顏色。';
    } else {
      rules = [material(['wood', 'iron']), rule('trim', pick(random, RUNES)), position()];
      hint = '所有選項看來都完好。核對材料、緞帶顏色和所在位置，找出記錄中的那一個。';
    }
    return { targetType, correctPosition, rules: shuffle(random, rules), chestRoom: type === 'chest',
      hint, concept: rules.some(item => item.key === 'position') ? '位置與特徵' : '多項可見條件' };
  }

  function writtenClue(type, rules, random) {
    const subject = { door: '那道門', person: '那人', item: '那件器物', chest: '那個錢箱', bridge: '那座橋', ladder: '那架梯子' }[type];
    const target = TARGET_FOR[type];
    const terms = rules.map(({ key, value, negative }) => {
      if (key === 'position') {
        const sentence = ruleText({ key, value }, target, type === 'chest');
        return sentence.replace(/^(?:門|那人|物品|箱子|橋|梯子)/u, '');
      }
      if (key === 'material') return pick(random, ['以' + MATERIAL_NAMES[value] + '製成', '用的是' + ({ wood: '木材', stone: '石材' }[value] || MATERIAL_NAMES[value])]);
      if (key === 'rune') return pick(random, ['刻着' + RUNE_NAMES[value] + '符文', '門上的符文呈' + RUNE_NAMES[value]]);
      if (key === 'torches') return value ? '旁邊共掛了' + NUMBERS[value] + '支火把' : '旁邊連一支火把也沒有';
      if (key === 'lit') return value ? '旁邊只有一支火把亮着' : '旁邊沒有任何火把亮着';
      if (key === 'hood') return negative ? '兜帽並非' + RUNE_NAMES[value] : pick(random, ['戴着' + RUNE_NAMES[value] + '兜帽', '兜帽呈' + RUNE_NAMES[value]]);
      if (key === 'facing') return value === 'front' ? '面向你' : '背對着你';
      if (key === 'carrying') return '手裏拿着' + (value === 'lantern' ? '提燈' : '卷軸');
      if (key === 'decoration' && value === 'none') return '沒有繫上任何緞帶';
      return (negative ? '沒有繫上' : '繫着') + RUNE_NAMES[value] + '緞帶';
    });
    const first = terms[0], rest = terms.slice(1);
    const forms = [
      '「' + subject + first + '，' + rest.join('，') + '。」',
      '記錄列明：' + terms.join('；') + '。',
      '「' + subject + first + '。」下方又補了一句：「' + rest.join('，') + '。」',
      '先按這項特徵縮小範圍：' + first + '。再核對：' + rest.join('，') + '。'
    ];
    return pick(random, forms);
  }

  function newRouteOptions(random, nextArea) {
    const [safeMaterial, vaultMaterial] = shuffle(random, MATERIALS);
    const [safeRune, vaultRune] = shuffle(random, RUNES);
    const [safePosition, vaultPosition] = shuffle(random, ['left', 'right']);
    return shuffle(random, [
      { route: 'safe', material: safeMaterial, rune: safeRune, position: safePosition },
      { route: 'vault', material: vaultMaterial, rune: vaultRune, position: vaultPosition }
    ].map(({ route, material, rune, position }, i) => {
      const traits = constrainTraits({ ...randomTraits(random), material, rune });
      return { id: 'door-' + (i + 1), position, traits, label: describeDoor(traits) + '；位置：' + POSITION_NAMES[position],
        correct: true, route, ...(nextArea ? { nextArea } : {}) };
    }));
  }

  // The second slot is always a hands-on mechanism. Placing the fork in the
  // remaining bag keeps even an incoming vault from replacing that first activity.
  function curriculumPlan(seed, area, start) {
    const random = randomSource(seed + ':workrooms:' + area + ':' + start);
    const total = pick(random, [6, 7, 8, 9]);
    const mechanism = pick(random, ['sluice', 'cart', 'signal']);
    const opener = start === 0 ? 'door' : pick(random, ['door', 'person', 'item']);
    const extra = shuffle(random, ['person', 'item', 'bridge', 'ladder']);
    const tail = ['chest', 'fork', ...extra.slice(0, total - 5)];
    if (total === 9 && random() < .5) {
      tail[tail.length - 1] = pick(random, ['sluice', 'cart', 'signal'].filter(type => type !== mechanism));
    }
    // All bags have a solution with the chest first and the fork second.
    const order = shuffle(random, tail);
    const fork = order.indexOf('fork'), chest = order.indexOf('chest');
    if (fork === order.length - 1 || chest === fork + 1 || chest === fork + 2) {
      order.splice(chest, 1);
      order.unshift('chest');
      if (order.at(-1) === 'fork') [order[1], order[order.length - 1]] = [order[order.length - 1], order[1]];
    }
    return [opener, mechanism, ...order, 'gate'].map(type => ({
      type, card: CARDS[type] ? Math.floor(random() * CARDS[type].length) : 0
    }));
  }

  const questDeck = ['door', 'person', 'item', 'bridge', 'ladder', 'sluice', 'signal', 'cart', 'feeding', 'floodgate', 'chest', 'fork'];
  const safeOpeners = ['door', 'sluice', 'signal', 'cart', 'feeding', 'floodgate'];
  const gateTerms = ['兩者皆', '同時符合'];
  function questAt(seed, cursor, simpleStart) {
    const cycle = Math.floor(cursor / questDeck.length);
    const deckAt = n => shuffle(randomSource(seed + ':quests:' + n), questDeck);
    const deck = deckAt(cycle);
    // All swaps leave the final card untouched so one look back suffices across bags.
    const previous = cycle ? deckAt(cycle-1).at(-1) : null;
    const canOpen = type => previous ? type!==previous && !(previous==='fork' && type==='chest') : safeOpeners.includes(type);
    if (!canOpen(deck[0])) {
      const first=deck.findIndex((type,i)=>i<deck.length-1 && canOpen(type));
      [deck[0],deck[first]]=[deck[first],deck[0]];
    }
    // Fresh expeditions open with two safe, single-action rooms. Leave the last
    // card untouched so the next bag can still avoid a repeat at the boundary.
    const protectOpening = simpleStart && cycle === 0;
    if (protectOpening) {
      for (let i = 0; i < 2; i++) {
        const active = type => type !== 'door' && safeOpeners.includes(type);
        if (active(deck[i])) continue;
        const other = deck.findIndex((type,j) => j > i && j < deck.length - 1 && active(type));
        [deck[i], deck[other]] = [deck[other], deck[i]];
      }
    }
    const fork=deck.indexOf('fork'), chest=deck.indexOf('chest');
    if (chest===fork+1) {
      const move=chest===deck.length-1 ? fork : chest;
      const other=deck.findIndex((_,i)=>i>(protectOpening?1:0) && i<deck.length-1 && i!==fork && i!==chest);
      [deck[move],deck[other]]=[deck[other],deck[move]];
    }
    return deck[cursor % deck.length];
  }

  function mixedRoom(input, area, seed, start, step, state) {
    const random = randomSource([seed, area, start, 'mixed-visit'].join(':'));
    const visitLength = pick(random, start === 0 ? [8, 9, 10] : [9, 10, 11]);
    const checkpointAt = visitLength - 2, visit = area + '@' + start;
    const fromVault = (state.lastRoute || state.route) === 'vault';
    const detours = state.bonusVisit===visit && Number.isSafeInteger(state.bonusRooms) && state.bonusRooms>=0 ? state.bonusRooms : 0;
    const slot = Math.max(0,Math.min(step-detours,visitLength-1));
    const total = visitLength+detours+Number(fromVault);
    const savedDraw = state.nextQuestDraw;
    const cursor = Number.isSafeInteger(savedDraw) && savedDraw >= 0 ? savedDraw : Math.min(slot,checkpointAt);
    const simpleStart = input.chained && (state.simpleStart === true || (start === 0 && step === 0 && cursor === 0));
    const checkpointType = pick(random, ['person', 'item', 'signal', 'sluice'].filter(type => type !== state.lastQuest));
    const reservedChestCard = pick(random, CARDS.chest.map((_, i) => i));
    // After migration the player may already be at a gate without this visit's seal.
    const checkpoint = !fromVault && (slot === checkpointAt || (slot > checkpointAt && state.gateSealFor !== visit));
    let type;
    if (fromVault) type = 'chest';
    else if (checkpoint) type = checkpointType;
    else if (slot > checkpointAt) type = 'gate';
    else type = questAt(seed, cursor, simpleStart);
    const draw = !fromVault && !checkpoint && questDeck.includes(type);
    const storyFlags = { nextQuestDraw: cursor+Number(draw), lastQuest: fromVault ? (state.lastQuest || 'fork') : type,
      bonusVisit: visit, bonusRooms: detours+Number(fromVault) };
    if (simpleStart && cursor < questDeck.length) storyFlags.simpleStart = true;
    if (checkpoint) storyFlags.gateSealFor = visit;
    if (type === 'gate') storyFlags.gateSealFor = '';
    const roomRandom = randomSource([seed, area, start, slot, type, 'mixed-room'].join(':'));
    const card = type === 'chest' ? reservedChestCard : CARDS[type] ? Math.floor(roomRandom() * CARDS[type].length) : 0;
    const obstacleStyle = ['feeding', 'floodgate', 'cart'].includes(type) ? Obstacles.mode(Number(input.initialBand) || 1, roomRandom()) : null;
    const classic = !checkpoint && (type === 'chest' || (draw && !!shortTasks[type] && roomRandom() < .45));
    return { area, seed, start, slot, total, reservedChestCard, planned: { type, card }, type, fromVault, obstacleStyle,
      checkpoint, classic, mixed: true, storyFlags, displaySlot: Math.min(step,total-1) };
  }

  function roomSlot(input) {
    const area = Object.prototype.hasOwnProperty.call(AREAS, input.area) ? input.area : 'crypt';
    const seed = String(input.seed == null ? 'dungeon' : input.seed);
    const index = Number.isFinite(input.index) ? Math.max(0, Math.floor(input.index)) : 0;
    const state = input.storyState || {};
    const local = state.areaSteps && state.areaSteps[area];
    const step = Number.isFinite(local) ? Math.max(0, Math.floor(local)) : index;
    const start = Math.max(0, index - step);
    const course = input.curriculum || input.lesson;
    if (course && input.mixed === true) return mixedRoom(input, area, seed, start, step, state);
    let plan = course ? curriculumPlan(seed, area, start) : visitPlan(seed, area, start);
    if (course && input.obstacles === true) {
      const obstacleRandom = randomSource([seed, area, start, 'blocked-paths'].join(':'));
      plan = Obstacles.makePlan(plan, obstacleRandom, pick, shuffle);
    }
    const slot = Math.min(step, plan.length - 1);
    const planned = plan[slot];
    const fromVault = (state.lastRoute || state.route) === 'vault' && planned.type !== 'gate';
    const type = fromVault ? 'chest' : planned.type;
    const isBlocked = type === 'feeding' || type === 'floodgate';
    const obstacleStyle = isBlocked ? Obstacles.mode(Number(input.initialBand) || 1,
      randomSource([seed, area, start, slot, 'instruction-style'].join(':'))()) : null;
    return { area, seed, start, slot, total: plan.length, reservedChestCard: plan.find(room => room.type === 'chest').card,
      planned, fromVault, type, obstacleStyle };
  }

  function lessonTargetsFor(config = {}) {
    if (config.legacy) return [];
    const { type, obstacleStyle, mixed, checkpoint, classic } = roomSlot({ ...config, curriculum: true });
    if (mixed && type === 'gate') return gateTerms.slice();
    if (classic || checkpoint) return [];
    if (!config.legacyControls && (type === 'fork' || type === 'gate')) return Lessons.targetsFor('cart');
    if (obstacleStyle) {
      if (obstacleStyle !== 'word') return [];
      // Starting readers meet simple directions first. A word they already
      // recognised elsewhere can later be practised at its own earned band.
      return Number(config.initialBand || 1) === 1 ?
        Obstacles.terms.filter(term => (config.familiarTargets || []).includes(term)) : [...Obstacles.terms];
    }
    const candidates = Lessons.targetsFor(type);
    return type === 'bridge' ? candidates.filter(term => (config.familiarTargets || []).includes(term)) : candidates;
  }

  const shortTasks = {
    door:['走進值夜的入口。','跟着送貨隊進門。','到門後會合。','改走側門。','找到為你留的門。'],
    person:['把失物還給物主。','把口信交給當值的人。','找今天帶路的嚮導。','找同伴交換暗號。','找目擊的人問清楚。'],
    item:['取回借出的用具。','取走原來的樣品。','把展品放回原處。','取回寄存的物件。','認領你的行李。'],
    bridge:['走過能承重的橋。','走過巡查員驗好的橋。','沿運貨橋過去。','沿穩固的橋歸隊。','踏上剛驗收的橋。'],
    ladder:['沿梯子爬到出口。','爬上去接更。','爬上合格的梯子。','沿檢修梯上去。','沿安全的梯子抄近路。'],
    chest:['打開失主的寶箱。','打開驗好的一箱。','打開庫存單上的錢箱。','打開真正的寶箱。','按清單打開錢箱。']
  };
  function taskCard(scene, input, cardIndex, arrival, checkpoint, random) {
    const {encounterType:type,targetType:target} = scene, band = Number(input.initialBand) || 1;
    if (checkpoint) { scene.checkpoint = true; scene.title = '關印查驗'; }
    if (type === 'signal' || type === 'sluice') {
      // The same input and sprite vocabulary as an ordinary station, with a local checkpoint purpose.
      const local = Lessons.practice({ area:scene.area, type, level:Math.min(2,band), random, pick, shuffle,
        positionsFor, colors:RUNE_NAMES, materials:MATERIAL_NAMES });
      const purpose = type === 'signal' ? '向門衛發出約定的鼓號，領取關印。' : '替門衛打開驗水閘，領取關印。';
      return Object.assign(scene, local, {title:'關印查驗',prompt:purpose+local.prompt,checkpoint:true});
    }
    let purpose = band === 1 ? shortTasks[type][cardIndex] : arrival;
    if (checkpoint) purpose = type === 'person' ? '找當值的門衛領取關印。' : '取走門衛寄存關印的容器。';
    const width = Math.max(1, Math.min(3, band));
    const positions = positionsFor(target,width+1,false), correctPosition = pick(random,positions);
    const rune = () => pick(random,RUNES), itemMaterial = () => rule('material',pick(random,type==='chest'?['wood','iron']:['wood','iron','ceramic','copper']));
    let rules;
    if (target==='person') rules = [rule('hood',rune()),rule('carrying',pick(random,['lantern','scroll'])),rule('facing',pick(random,['front','back']))];
    else if (target==='door') rules = [rule('rune',rune()),rule('material',pick(random,MATERIALS)),rule('lit',pick(random,[0,1]))];
    else {
      rules = target==='item' ? [itemMaterial(),rule('decoration',pick(random,['none','red','blue','green']))] :
        [rule('material',pick(random,['wood','iron'])),rule('trim',rune())];
      if (width===3) rules.push(spatialRule(random,positions,correctPosition,target!=='item'));
    }
    rules = rules.slice(0,width);
    const conditions = rules.map(r=>ruleText(r,target,type==='chest'));
    const options = readingOptions(random,{rules,targetType:target,correctPosition,chestRoom:type==='chest'},positions);
    for(const o of options)o.targetEvidence='neutral';
    const answer = options.find(o=>o.correct);
    scene.options=options;scene.prompt=purpose+conditions.join('，而且')+'。';
    scene.hint='看清楚這項記認：'+conditions[0]+'。';scene.concept=checkpoint?'關印查驗':'依照記認行動';
    if(type==='person'&&!checkpoint)scene.taskAction=['return','deliver','guide','password','witness'][cardIndex];
    if(type==='chest')answer.reward='chest';
    if(type==='item')scene.collectItem={...answer.traits,label:answer.label};
    return scene;
  }

  function areaGate(scene, input, random) {
    const request=input.lesson, word=gateTerms.includes(request?.target)?request.target:null;
    const band=Number(word?request.level:input.initialBand)||1;
    const rules=[rule('material',pick(random,MATERIALS)),rule('rune',pick(random,RUNES))];
    if(band===3)rules.push(rule('lit',pick(random,[0,1,2])));
    const positions=positionsFor('door',rules.length+1,false),correctPosition=pick(random,positions);
    const options=readingOptions(random,{rules,targetType:'door',correctPosition},positions);
    const destination=pick(random,Object.keys(AREAS).filter(key=>key!==scene.area));
    const conditions=rules.map(r=>ruleText(r,'door'));
    for(const o of options){
      o.matches=rules.map(r=>matches(o.traits,r,o.position));
      o.targetEvidence=!word?'neutral':o.correct?'correct':o.matches.slice(0,2).every(Boolean)?'neutral':'miss';
      if(o.correct)o.nextArea=destination;
    }
    const conjunction=word==='兩者皆'?'兩者皆符合才可通過。':word==='同時符合'?'兩項條件須同時符合。':'';
    const prompt='關印已蓋好。'+conditions[0]+'，'+conditions[1]+'。'+conjunction+
      (conditions[2]?'還要看火把：'+conditions[2]+'。':'')+'走進符合記錄的門。';
    return Object.assign(scene,{title:'界門封印',areaGate:true,ending:true,options,prompt,gateConditions:conditions,
      hint:'逐項核對門身和符文'+(rules.length===3?'，再數燃亮的火把。':'。'),concept:word||'核對界門條件',
      ...(word?{lesson:{target:word,level:band,situation:'關印辨認界門',conditions}}:{})});
  }

  function dispatchRoom(scene, input, nextArea) {
    const request = input.lesson;
    const scored = request && Lessons.targetsFor('cart').includes(request.target);
    const level = Math.max(1, Math.min(3, Number(scored ? request.level : input.initialBand) || 1));
    const context = {area:scene.area, type:'cart', target:scored ? request.target : 'practice', level,
      random:randomSource([input.seed, scene.id, 'dispatch', level, request?.target].join(':')),
      pick, shuffle, positionsFor, colors:RUNE_NAMES, materials:MATERIAL_NAMES};
    const task = scored ? Lessons.build(context) : Lessons.practice(context);
    if (nextArea) task.options.find(option=>option.correct).nextArea=nextArea;
    return {...scene, ...task, title:'礦車調度', cardId:'dispatch-'+(scored?request.target:'roster'),
      kind:'reading', encounterType:'dispatch', targetType:'dispatch', backgroundRole:'passage', lockedExit:true,
      prompt:task.prompt+'礦車開出後，出口便會打開。', ...(nextArea?{ending:true}:{}),
      storyFlags:scene.storyFlags.lastQuest==='fork'?{...scene.storyFlags,lastQuest:'dispatch'}:scene.storyFlags};
  }

  function singleScene(config) {
    const input = config || {};
    if (input.legacy) {
      const old = createLegacyScene(input);
      if (!input.legacyControls && old.kind === 'choice') return dispatchRoom(old,input,old.options[0].nextArea);
      return old;
    }
    const { area, seed, start, slot, total, reservedChestCard, planned, fromVault, type, obstacleStyle,
      mixed, classic, checkpoint, storyFlags, displaySlot } = roomSlot(input);
    const locale = LOCALES[area];
    const random = randomSource(seed + ':room:' + area + ':' + start + ':' + slot);
    const cardIndex = fromVault ? pick(random, CARDS.chest.map((_, i) => i).filter(i => i !== reservedChestCard)) : planned.card;
    const card = CARDS[type]?.[cardIndex];
    const title = card ? card[0] : obstacleStyle ? Obstacles.titles[type] : Lessons.mechanisms[type].name;
    const arrival = card ? card[1](locale) : '';
    const targetType = TARGET_FOR[type] || type;
    const choice = type === 'fork' || (!mixed && type === 'gate');
    const difficulty = (['deep', 'fatal', 'pursuit', 'overrun'].includes(input.difficulty) || Number(input.difficulty) >= 3 ? 1 : 0) +
      Number(input.difficulty === 'overrun');
    const scene = {
      id: [area, start, slot, hash([seed, type, cardIndex, difficulty].join(':')).toString(36)].join('-'),
      area, title, chapter: AREAS[area].name, prompt: arrival, encounterType: type, cardId: type + '-' + cardIndex,
      kind: choice ? 'choice' : 'reading', targetType, progress: { current: (displaySlot ?? slot) + 1, total },
      backgroundVariant: Math.floor(random() * 3), backgroundRole: type === 'gate' ? 'exit' : targetType === 'person' ? 'meeting' : targetType === 'item' ? 'discovery' : 'passage',
      ...(type === 'bridge' ? { terrain: 'gap' } : type === 'ladder' ? { terrain: 'ledge' } : {}),
      storyFlags: storyFlags || {}, ...(type === 'chest' ? { chestRoom: true } : {}),
      ...(mixed ? { lockedExit: true } : {})
    };
    if (mixed && type === 'gate') return areaGate(scene, input, random);
    if (classic || checkpoint) return taskCard(scene, input, cardIndex, arrival, checkpoint, random);
    if (obstacleStyle) {
      const lesson = obstacleStyle === 'word' && Obstacles.terms.includes(input.lesson?.target) ? input.lesson : null;
      const band = Math.max(1, Math.min(3, Math.round(Number(lesson?.level || input.initialBand) || 1)));
      const target = lesson?.target;
      const obstacleRandom = randomSource([seed, area, start, slot, target || obstacleStyle, band].join(':'));
      Object.assign(scene, Obstacles.build({ type, band, style: obstacleStyle, target, random: obstacleRandom, pick, shuffle }));
      scene.id += '-O' + band + '-' + hash(target || obstacleStyle).toString(36);
      return scene;
    }
    if (choice) {
      const nextArea = type === 'gate' ? pick(random, Object.keys(AREAS).filter(key => key !== area)) : null;
      if (!input.legacyControls) return dispatchRoom(scene,input,nextArea);
      scene.options = newRouteOptions(random, nextArea);
      if (nextArea) {
        scene.ending = true;
        scene.prompt += '兩條路都通往' + AREAS[nextArea].name + '。';
      }
      const directions = scene.options.map(option => {
        const door = '刻有' + RUNE_NAMES[option.traits.rune] + '符文的' + MATERIAL_NAMES[option.traits.material] + '門';
        return door + (option.route === 'safe' ? '通往普通走廊' : '通往藏箱密室');
      });
      scene.prompt += directions.join('，') + '。你打算走哪條路？';
      scene.hint = '兩道門都可前進，按門身和符文辨認你想走的路。';
      if (input.curriculum && Number(input.initialBand || 1) <= 2) {
        const safe = scene.options.find(option => option.route === 'safe');
        const vault = scene.options.find(option => option.route === 'vault');
        scene.prompt = (nextArea ? '前面是' + AREAS[nextArea].name + '。' : '') +
          RUNE_NAMES[safe.traits.rune] + '符文門通往走廊，' + RUNE_NAMES[vault.traits.rune] + '符文門通往藏箱室。你想走哪條路？';
      }
      scene.concept = '路線選擇';
      return scene;
    }
    if (input.curriculum || input.lesson) {
      const request = input.lesson, scoring = request && Lessons.targetsFor(type).includes(request.target);
      const level = Math.max(1, Math.min(3, Math.round(Number(scoring ? request.level : input.initialBand) || 1)));
      const vocabulary = scoring ? request.target : 'practice';
      const lessonRandom = randomSource([seed, area, start, slot, vocabulary, level].join(':'));
      const context = { area, type, locale, target: vocabulary, level, legacyControls:input.legacyControls, random: lessonRandom, pick, shuffle, positionsFor,
        colors: RUNE_NAMES, materials: MATERIAL_NAMES };
      Object.assign(scene, scoring ? Lessons.build(context) : Lessons.practice(context));
      scene.id += '-L' + level + '-' + hash(vocabulary).toString(36);
      if (type==='cart' && !input.legacyControls) {
        scene.encounterType='dispatch';scene.targetType='dispatch';scene.lockedExit=true;
        scene.prompt+='礦車開出後，出口便會打開。';
      }
      return scene;
    }
    const positions = positionsFor(targetType, difficulty > 0 || fromVault ? 4 : 3, false);
    const puzzle = readingPuzzle(type, random, difficulty, positions);
    scene.prompt += '\n' + writtenClue(type, puzzle.rules, random);
    scene.hint = puzzle.hint;
    scene.concept = puzzle.concept;
    scene.options = readingOptions(random, puzzle, positions);
    scene.spatialRules = puzzle.rules.filter(item => item.key === 'position').map(item => ({ ...item, targetType }));
    const answer = scene.options.find(option => option.correct);
    if (type === 'chest') answer.reward = 'chest';
    if (type === 'item') scene.collectItem = { ...answer.traits, label: answer.label };
    return scene;
  }

  // A source holds the fact needed to use the second group of objects. Choosing
  // a source and interpreting its information are two actions in one physical room.
  const sourceQuests = {
    cart:      { title:'礦道交更', person:'礦工', opener:'礦車堵住了通道。', question:'哪支拉桿能讓礦車開走？' },
    feeding:   { title:'餵食當值', person:'飼養員', record:'餵食記錄', opener:'守門獸伏在出口前。', question:'牠肯用哪個食盤？' },
    floodgate: { title:'石道排水', person:'守渠人', record:'排水圖', opener:'水淹過了通往出口的石階。', question:'哪支拉桿能把水排走？' },
    sluice:    { title:'閘房交接', person:'守閘員', record:'分流圖', opener:'水閘等着放水。', question:'今天該開哪座閘？' },
    signal:    { title:'鼓樓傳令', person:'傳令員', record:'值日鼓譜', opener:'鼓聲一起，門後的人就會行動。', question:'該敲哪面鼓？' },
    chest:     { title:'查驗庫存', person:'驗箱員', opener:'擬態怪混進了庫房。', question:'哪個箱子才藏有金幣？' },
    door:      { title:'尋訪門房', person:'值班門房', record:'通行令', opener:'這裏的門由不同的人看守。', question:'今天哪道門放行？' },
    fork:      { title:'岔路問程', person:'嚮導', record:'岔路圖', opener:'走廊在這裏分岔。', question:'兩條路各通往哪裏？' },
    dispatch:  { title:'貨車放行', person:'調車員', record:'派車單', opener:'滿載的礦車停在軌道上。', question:'現在該派出哪輛車？' },
    gate:      { title:'核驗關印', person:'界門守衛', opener:'關印蓋好了，界門仍然緊閉。', question:'哪道門認得這個印記？' }
  };

  function hasSource(input, scene) {
    if (!input.chained || !input.mixed || scene.boss || scene.checkpoint || !sourceQuests[scene.encounterType]) return false;
    if (scene.targetType === 'door' || scene.targetType === 'dispatch') return true;
    // The promised treasure detour is a quick pay-off. Non-chained cards in
    // the bag also leave time to breathe between longer tasks at high depths.
    if ((input.storyState?.lastRoute || input.storyState?.route) === 'vault') return false;
    const depth = input.index || 0;
    if (depth < 2) return false;
    const chance = depth < 8 ? .18 : depth < 18 ? .54 : .90;
    return randomSource([input.seed, scene.area, depth, 'pair-this-room'].join(':'))() < chance;
  }

  function sourceChoices(sourceType, random) {
    const person = sourceType === 'person';
    const field = pick(random, person ? ['hood','carrying','facing'] : ['material','decoration']);
    const values = {hood:RUNES, carrying:['lantern','scroll'], facing:['front','back'],
      material:['wood','iron'], decoration:['red','blue','green','none']};
    const traits = person ? {hood:pick(random,RUNES), carrying:pick(random,values.carrying), facing:pick(random,values.facing)} :
      {type:'box', material:pick(random,values.material), decoration:pick(random,values.decoration)};
    const pair = shuffle(random, values[field]).slice(0,2);
    const assigned = shuffle(random, pair);
    const options = ['left','right'].map((position,i) => {
      const face = {...traits,[field]:assigned[i]}, correct = assigned[i] === pair[0];
      return { id:'source-'+position, position, traits:face, correct, route:'safe', matches:[correct],
        label:DESCRIBE[sourceType](face)+'；位置：'+POSITION_NAMES[position], targetEvidence:'neutral' };
    });
    const value = pair[0];
    let detail;
    if (field==='hood') detail='戴'+RUNE_NAMES[value]+'兜帽';
    else if (field==='carrying') detail=value==='lantern'?'手持提燈':'手持卷軸';
    else if (field==='facing') detail=value==='front'?'面向你':'背向你';
    else if (field==='material') detail=MATERIAL_NAMES[value]+'製';
    else detail=value==='none'?'沒有緞帶':'繫着'+RUNE_NAMES[value]+'緞帶';
    return {options,detail};
  }

  function createScene(config = {}) {
    const scene = singleScene(config);
    if (!hasSource(config, scene)) return scene;
    const quest = sourceQuests[scene.encounterType];
    // This draw replaced the fork in the saved bag. Preserve a source already found before the change.
    const sourceSeed = scene.encounterType==='dispatch' ? 'fork' : scene.encounterType;
    const random = randomSource([config.seed, scene.area, config.index, sourceSeed, 'clue-source'].join(':'));
    const person = !quest.record || random() < .5;
    const sourceType = person ? 'person' : 'item';
    const sourceName = person ? quest.person : quest.record;
    const {options,detail} = sourceChoices(sourceType,random);
    const step = config.questStep === 2 ? 2 : 1;
    const chain = {step, sourceType, sourceName, sourceOptions:options, sourceId:options.find(o=>o.correct).id,
      actionType:scene.targetType, actionOptions:scene.options, actionObstacle:scene.obstacle,
      actionTerrain:scene.terrain, actionChestRoom:!!scene.chestRoom, actionTaskAction:scene.taskAction};
    // Prefix the acquired facts with their speaker or document. Keep the
    // actual generated puzzle intact, including its visible counterexamples.
    const common = {chain, questStep:step, questTotal:2, title:quest.title};
    if (step === 2) {
      const instruction = scene.prompt.replace(/^礦車擋住了路。|^關印已蓋好。/u,'');
      const prompt = person ? sourceName+'說：「'+instruction+'」' : '你翻開《'+sourceName+'》，上面寫着：「'+instruction+'」';
      return {...scene, ...common, prompt};
    }
    const {lesson, chestRoom, obstacle, taskAction, collectItem, areaGate, ending, gateConditions, ...room} = scene;
    const seek = person ? '先問'+detail+'的'+quest.person+'。' : '先從'+detail+'的記錄箱取出《'+quest.record+'》。';
    const hint = person ? '看看兩人的模樣，找'+detail+'的那一位。' : '找'+detail+'的記錄箱。';
    return {...room, ...common, prompt:quest.opener+quest.question+seek, hint, concept:'尋找線索',
      kind:'reading', targetType:sourceType, options, storyFlags:{}};
  }

  function arenaInstruction(puzzle, band) {
    const [first, second] = puzzle.rules;
    if (puzzle.targetType === 'person') {
      const hood = RUNE_NAMES[first.value].replace(/色$/, '') + '帽';
      const wearing = first.negative ? '沒有戴' : '戴着';
      const carried = second.value === 'lantern' ? '燈籠' : '卷軸';
      if (band === 1) return '先找' + wearing + hood + '、手拿' + carried + '的人。';
      if (band === 2) return '先找傳口令的同伴。那人手拿' + carried + '，而且' + wearing + hood + '。';
      return '守衛命人截查手拿' + carried + '的旅客。去找當中' + wearing + hood + '的那位，他知道解鎖口令。';
    }
    if (puzzle.targetType === 'item') {
      const noun = { wood:'木箱', iron:'鐵箱', ceramic:'陶壺', copper:'銅壺' }[first.value];
      const ribbon = second.value === 'none' ? '沒有繫緞帶' : (second.negative ? '沒有繫' : '繫着') + RUNE_NAMES[second.value] + '緞帶';
      if (band === 1) return '再拿' + ribbon + '的' + noun + '。';
      if (band === 2) return '開門的鑰匙收在' + noun + '裏。取走' + ribbon + '的那一個。';
      return '同伴記得封印物裝在' + noun + '裏，但這裏有幾個相似的容器。對一對他的記錄，取走' + ribbon + '的那個' + noun + '。';
    }
    const gate = MATERIAL_NAMES[first.value] + '門', rune = RUNE_NAMES[second.value] + '符文';
    if (band === 1) return '最後走進刻有' + rune + '的' + gate + '。';
    if (band === 2) return '出口是' + gate + '。認清門上的' + rune + '才離開。';
    return '巡邏隊在幾道門上刻了' + rune + '。當中只有' + gate + '通往外面的走廊，從那裏逃出。';
  }

  function createBossScene(input) {
    const config = input || {};
    const band = [1, 2, 3].includes(config.readingBand) ? config.readingBand : 0;
    const area = Object.prototype.hasOwnProperty.call(AREAS, config.area) ? config.area : 'crypt';
    const story = STORIES[area] || { ...LOCALES[area], chapter: AREAS[area].name };
    const encounter = Number.isSafeInteger(config.encounter) && config.encounter >= 1 ? config.encounter : 1;
    const round = Number.isFinite(config.round) ? Math.max(1, Math.min(3, Math.floor(config.round))) : 1;
    // One encounter owns one layout and one complete escape plan. Advancing a
    // step changes its active answer, never the targets or the instructions.
    const sceneSeed = String(config.seed == null ? 'dungeon' : config.seed) + ':arena:' + area + ':' + encounter;
    const random = randomSource(sceneSeed);
    const objectives = ['identify', 'unlock', 'escape'];
    const starts = encounter >= 2 ? [
      '先找到能說出解鎖密語的同伴；在他告訴你密語之前，先別碰封印物或出口。',
      '然後依密語拿起封印物，立即用它解除出口的鎖；這一步要在聽到密語之後、走向門之前完成。',
      '最後等出口解鎖後，才走進符合全部條件的門，離開競技場。'
    ] : [
      '先請指定的同伴說出解鎖密語。',
      '然後依密語拿起指定封印物，解除出口的鎖。',
      '最後穿過指定的門逃走。'
    ];
    const puzzles = [2, 3, 1].map(stage => {
      const type = ['door', 'person', 'item'][stage - 1];
      const positions = positionsFor(type, 3, true);
      const puzzle = puzzleFor(stage, story, random, 0, true, positions);
      if (band) {
        // Three targets can distinguish two independent clues, each with its own near-match.
        puzzle.rules = puzzle.rules.slice(0, 2);
        if (band === 1) puzzle.rules = puzzle.rules.map(clue => ({ ...clue, negative: false }));
      }
      return { ...puzzle, positions };
    });
    const options = [];
    const escapeSteps = puzzles.map((puzzle, index) => {
      const step = index + 1;
      const group = readingOptions(random, puzzle, puzzle.positions);
      const targetId = 'boss-' + group.find(option => option.correct).id;
      for (const option of group) {
        options.push(Object.assign({}, option, { id: 'boss-' + option.id, targetType: puzzle.targetType, step,
          correct: step === round && option.correct }));
      }
      return {
        step, targetType: puzzle.targetType, targetId,
        text: band ? arenaInstruction(puzzle, band) : starts[index] + '刻文寫着：「' + puzzle.rules.map(item => ruleText(item, puzzle.targetType)).join('，而且') + '。」'
      };
    });
    const successTexts = [
      '同伴說出了解鎖密語。接着依密語和原來的指示，找到解除出口封印的物品。',
      '你立即使用封印物，出口的鎖鬆開了。最後依原來的指示，走向相符的門。',
      '你穿過解鎖的門，離開燭影競技場。守衛的投射物落在身後。'
    ];
    return {
      id: 'arena-' + encounter + '-' + hash('varied-v5:' + sceneSeed).toString(36),
      area, locationName: '燭影競技場', title: '燭影競技場・逃生通路', chapter: story.chapter,
      kind: 'guardian', boss: true, targetType: 'arena', currentStep: round, objective: objectives[round - 1],
      guardian: { name: story.guardian, round, total: 3 },
      backgroundVariant: 0, backgroundRole: 'arena',
      prompt: band === 1 ? '照次序做三件事，打開出口。' : '競技場的出口已封鎖。守衛正在甦醒；依次完成刻文中的三步，才能逃離。',
      hint: '先讀完三步，再按次序行動。只看顏色或只看物品種類，都可能找錯目標。',
      concept: '多項條件與行動次序', successText: successTexts[round - 1],
      escapeSteps, completedOptionIds: escapeSteps.slice(0, round - 1).map(step => step.targetId),
      spatialRules: puzzles.flatMap((puzzle, index) => puzzle.rules.filter(item => item.key === 'position').map(item => Object.assign({ step: index + 1, targetType: puzzle.targetType }, item))),
      options, storyFlags: {}
    };
  }

  return Object.freeze({ AREAS, LESSON_TARGETS: Lessons?.targets || [], lessonTargetsFor, createScene, createBossScene });
}));
