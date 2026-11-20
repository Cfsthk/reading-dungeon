/* Authored Hong Kong Chinese reading tasks. Every visible choice has a witness
   for the distinction it is meant to test. The caller supplies the saved room RNG. */
(function (root, factory) {
  'use strict';
  const lessons = factory();
  if (typeof module === 'object' && module.exports) module.exports = lessons;
  else root.DungeonLessons = lessons;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const roles = ['原主', '物主', '代領', '轉交', '暫存', '歸還'];
  const quantities = ['至少', '至多', '恰好', '不足', '超過'];
  const logic = ['同時符合', '兩者皆', '只有其中一項', '除了……以外', '其餘'];
  const space = ['緊鄰', '相隔一座', '介乎……之間', '位於兩端', '從右數第二'];
  const reference = ['前者', '後者', '分別', '相同', '相異'];
  const craft = ['鑲嵌', '纏繞', '交錯', '深淺相間', '對稱'];
  const targets = Object.freeze([...roles, ...quantities, ...logic, ...space, ...reference, ...craft]);
  const runes = ['red', 'blue', 'green', 'gold'];
  const numeral = ['零', '一', '兩', '三'];
  const mechanisms = Object.freeze({
    sluice: { name: '分流水閘', noun: '水閘', action: '開啟', unit: '座' },
    cart: { name: '礦車調度', noun: '礦車', action: '派出', unit: '輛' },
    signal: { name: '鼓號傳訊', noun: '訊號鼓', action: '敲響', unit: '面' }
  });
  const controlNames = {
    crypt:'巡夜路標機', tide:'潮位路標機', fungus:'育苗路標機', forge:'鑄造控制台',
    archive:'書庫索引機', glacier:'冰道路標機', amber:'蜂房路標機', astral:'星盤校準機'
  };

  // Local facts make people identifiable from the message. The words A, B
  // and C name roles internally only; their hood colours and locations rotate.
  const settings = {
    crypt: { people: '夜班交更', object: '巡更牌', art: '巡燈封廊', sample: '塔徽', light: '鐘樓夜巡要改道。',
      roles: ['交班', '接更', '報時'], note: 'A交班，B接更，C負責報時。', task: '夜巡', water: '把井水導入鐘樓的蓄水槽', freight: '把銅鐘送到起吊處', message: '通知巡夜人換班' },
    tide: { people: '潮表代領', object: '潮汐表', art: '退潮渡口', sample: '潮位牌', light: '退潮時，堤邊只有一條路可走。',
      roles: ['量潮', '抄表', '報潮'], note: 'A量潮，B把讀數抄進表裏，C到碼頭報潮。', task: '測潮', water: '把積水排往外港', freight: '把量水尺送到渡口', message: '提醒碼頭的人潮水將至' },
    fungus: { people: '新菇目擊者', object: '採菇簿', art: '避光育苗', sample: '孢子罐', light: '剛冒出的幼菇怕強光。你要為育苗員打開合適的房間。',
      roles: ['觀察', '記錄', '報訊'], note: 'A首先看見新菇，B記錄顏色，C趕去報訊。', task: '採菇', water: '把水引進育苗床', freight: '把孢子送進溫床', message: '召集採菇人收集孢子' },
    forge: { people: '模具返修', object: '試模圖', art: '樣板驗收', sample: '鑄造樣板', light: '通往風箱的廊門剛修好。',
      roles: ['鑄造', '試模', '驗收'], note: 'A鑄模，B試模，C驗收成品。', task: '試模', water: '讓冷水流入淬火池', freight: '把鐵胚送到工匠手上', message: '通知爐前工匠停火' },
    archive: { people: '代還孤本', object: '古書', art: '印鑑配對', sample: '藏書印', light: '書庫要開放一間閱覽室。',
      roles: ['抄錄', '校對', '裝訂'], note: 'A抄寫古書，B校對文字，C裝訂書頁。', task: '校書', water: '把滲進書庫的水排走', freight: '把拓本送進修書室', message: '召集校書員核對印記' },
    glacier: { people: '搜索接力', object: '搜救圖', art: '冰隙繩橋', sample: '冰路標', light: '雪地搜索隊要穿過避風廊。',
      roles: ['探路', '標記', '接應'], note: 'A探路，B沿途留下標記，C在營地接應。', task: '搜救', water: '將融雪引到堡外', freight: '把救援繩送到冰隙旁', message: '召回搜索隊' },
    amber: { people: '蜂房換班', object: '育蜂冊', art: '蠟罐封存', sample: '蠟罐', light: '蜂房的暗道要開放給養蜂人。',
      roles: ['照料', '點算', '接任'], note: 'A暫時照料幼蜂，B點算蜂箱，C今晚起正式接任。', task: '養蜂', water: '把清水引到洗罐池', freight: '把蜂蠟送去封罐', message: '通知養蜂人關好蜂房' },
    astral: { people: '彗星目擊者', object: '觀星圖', art: '校準星盤', sample: '校準牌', light: '觀測員要沿暗廊登上天文臺。',
      roles: ['觀測', '複核', '通報'], note: 'A在鏡中先看見彗星，B複核位置，C把消息傳到山下。', task: '觀星', water: '把水引進報時水鐘', freight: '把鏡片送到望遠鏡旁', message: '通知觀測員開始記時' }
  };

  function targetsFor(type) {
    if (type === 'door') return [...quantities, ...logic, ...space.filter(t => t !== '相隔一座'), '相同', '相異'];
    if (mechanisms[type]) return [...quantities, ...logic, ...space.filter(t => t !== '相隔一座' || type === 'sluice'), ...reference];
    if (type === 'person') return [...roles, '前者', '後者', '分別', '其餘'];
    if (type === 'item') return [...craft, '相同', '相異'];
    if (type === 'bridge' || type === 'ladder') return [...space.filter(t => t !== '相隔一座' || type === 'bridge'), '相同', '相異', ...logic];
    return [];
  }

  function makeContext(input) {
    const { random, type, area, level, target } = input;
    const pick = list => input.pick(random, list);
    const shuffle = list => input.shuffle(random, list);
    const palette = shuffle(runes), [tone, otherTone] = palette;
    const place = settings[area], machine = mechanisms[type], door = type === 'door';
    const noun = machine?.noun || ({ door: '門', bridge: '橋', ladder: '梯', item: input.legacyControls ? place.sample : controlNames[area], person: '人' })[type];
    const action = machine?.action || ({ door: '推開', bridge: '踏上', ladder: '爬上', item: '取出', person: '找出' })[type];
    const mission = machine ? ({ sluice: place.water, cart: place.freight, signal: place.message })[type] + '。' : door ? place.light : '';
    const colorKey = type === 'bridge' || type === 'ladder' ? 'trim' : 'rune';
    const colorName = c => input.colors[c] + (colorKey === 'trim' ? '緞帶' : '符文');
    const secondText = machine ? '繫有金色緞帶' : '以木製成';
    const second = machine ? t => t.banded : t => t.material === 'wood';
    return { ...input, type, target, level, place, noun, action, mission, machine, door, pick, shuffle, palette, tone, otherTone, colorKey, colorName, secondText, second };
  }

  function describe(c, t) {
    if (c.type === 'person') return c.colors[t.hood] + '兜帽，手持' + (t.carrying === 'lantern' ? '提燈' : '卷軸');
    if (t.type === 'box' || t.type === 'jug') return c.materials[t.material]+'製的'+(t.type==='box'?'箱子':'水壺')+'，'+(t.decoration==='none'?'沒有緞帶':'繫着'+c.colors[t.decoration]+'緞帶');
    if (t.type === 'specimen') return c.noun + '，' + attachments[t.attachment] + '，' + patternLabel(t) + '，' + c.colorName(t.rune);
    if (c.machine) return c.noun + '，' + c.colorName(t.rune) + '，' + numeral[t.count] + '盞指示燈亮着，' + (t.banded ? '繫有金色緞帶' : '沒有金色緞帶');
    if (c.door) return c.materials[t.material] + '門，' + c.colorName(t.rune) + '，兩支火把中有' + numeral[t.lit] + '支亮着';
    return c.materials[t.material] + c.noun + '，繫着' + c.colorName(t.trim);
  }

  const criterion = (text, test, focal = false) => ({ text, test, focal });

  // For k conditions we reserve one correct answer plus a witness that
  // fails only each individual condition. Search positions, not random boards:
  // a valid layout is found even for a fixed edge, neighbour or landmark.
  function assemble(c, variants, rules, count, constraints = () => true) {
    const slots = c.positionsFor(c.type, count, false);
    const masks = [-1, ...rules.map((_, i) => i)];
    if (masks.length > count) throw Error('Too few choices for all clue conditions');
    const pools = slots.map((_, index) => masks.map(mask =>
      variants.filter(t => constraints(t, index) && rules.every((r, i) => r.test(t, index) === (i !== mask)))));
    const required = c.shuffle(masks);
    const assignments = new Map();
    function assign(left) {
      if (!left.length) return true;
      const [mask, ...rest] = left;
      for (const slot of c.shuffle(slots.map((_, index) => index))) {
        if (assignments.has(slot) || !pools[slot][mask + 1].length) continue;
        assignments.set(slot, mask);
        if (assign(rest)) return true;
        assignments.delete(slot);
      }
      return false;
    }
    if (!assign(required)) throw Error('No independent reading choices: ' + [c.type, c.target, count]);
    const used = new Set(), options = [];
    for (let slot = 0; slot < slots.length; slot++) {
      const mask = assignments.has(slot) ? assignments.get(slot) : c.pick(masks.filter(m => m >= 0 && pools[slot][m + 1].length));
      const pool = pools[slot][mask + 1];
      const fresh = pool.filter(t => !used.has(t));
      const traits = c.pick(fresh.length ? fresh : pool);
      used.add(traits);
      const matches = rules.map(r => r.test(traits, slot));
      options.push({ id: c.type + '-' + (slot + 1), position: slots[slot], label: describe(c, traits), traits: { ...traits },
        correct: mask === -1, route: 'safe', matches,
        targetEvidence: mask === -1 ? 'correct' : rules[mask].focal ? 'miss' : 'neutral' });
    }
    return options;
  }

  function visibleVariants(c) {
    const options = [];
    if (c.machine) {
      for (const rune of runes) for (const banded of [false, true]) for (let count = 0; count <= 2; count++)
        options.push({ rune, banded, count });
    } else if (c.door) {
      for (const rune of runes) for (const material of ['wood', 'stone', 'iron']) for (let lit = 0; lit <= 2; lit++)
        options.push({ material, rune, lit, torches: 2, cracked: false });
    } else {
      for (const trim of runes) for (const material of ['wood', 'iron']) options.push({ material, trim, intact: true });
    }
    return options;
  }

  const glosses = {
    '至少':'這個數目或更多', '至多':'這個數目或更少', '恰好':'剛好一樣多', '不足':'比指定數目少', '超過':'比指定數目多',
    '原主':'原來擁有物件的人', '物主':'物件的主人', '代領':'替別人領取', '轉交':'收下後再交給另一人', '暫存':'暫時存放', '歸還':'把借來的東西送回',
    '同時符合':'每項都要符合', '兩者皆':'兩項都符合', '只有其中一項':'符合一項就可以，兩項都有也不行', '除了……以外':'先把指明的一組排除', '其餘':'餘下的',
    '緊鄰':'在旁邊，中間沒有別的選項', '相隔一座':'中間有另一座', '介乎……之間':'在指明的兩者中間', '位於兩端':'在最左或最右', '從右數第二':'由最右面的開始，數到第二個',
    '前者':'先提到的一個', '後者':'後提到的一個', '分別':'按先後次序一一對應', '相同':'一樣', '相異':'不一樣',
    '鑲嵌':'石頭嵌入凹槽', '纏繞':'帶子繞過物件幾圈', '交錯':'線條交叉穿過', '深淺相間':'深色、淺色輪流出現', '對稱':'圖案兩邊像照鏡一樣'
  };

  const amountTests = {
    '至少': (n, v) => n >= v, '至多': (n, v) => n <= v, '恰好': (n, v) => n === v,
    '不足': (n, v) => n < v, '超過': (n, v) => n > v
  };

  function numerical(c) {
    const threshold = c.pick(({ 至少: [1,2], 至多: [1], 恰好: [0,1,2], 不足: [1,2], 超過: [0,1] })[c.target]);
    const count = c.machine ? t => t.count : t => t.lit;
    const unit = c.machine ? '盞指示燈' : '支火把';
    const main = c.target === '不足' ? '亮着的' + (c.machine ? '指示燈' : '火把') + '不足' + numeral[threshold] + (c.machine ? '盞' : '支') :
      c.target === '超過' ? '亮着的' + (c.machine ? '指示燈' : '火把') + '超過' + numeral[threshold] + (c.machine ? '盞' : '支') :
      c.target + '有' + numeral[threshold] + unit + '亮着';
    const rules = [criterion(main, t => amountTests[c.target](count(t), threshold), true)];
    if (c.level >= 2) rules.push(criterion(c.secondText, c.second));
    if (c.level >= 3) rules.push(criterion('帶有' + c.colorName(c.tone), t => t[c.colorKey] === c.tone));
    // Keep incidental colours, materials and fittings identical: a pupil
    // comparing quantities should never be able to choose the only bright rune.
    const variants=visibleVariants(c).filter(t=>(c.level>=3||t[c.colorKey]===c.tone) &&
      (c.level>=2 || (c.machine?t.banded===false:t.material==='stone')));
    return board(c, rules, main, '數量', {variants});
  }

  function board(c, rules, main, situation, override = {}) {
    const count = override.count || (rules.length + 1);
    const options = assemble(c, override.variants || visibleVariants(c).filter(t => !c.door && !c.machine || (c.door ? t.lit : t.count) === 1), rules, count, override.constraints);
    const other = rules.filter(r => !r.focal).map(r => r.text);
    const sentence = c.action + (other.length ? other.join('、') + '，而且' : '') + main + '的' + c.noun + '。';
    const title=c.machine?.name || (c.type==='door'?(['crypt','fungus'].includes(c.area)?c.place.art:'巡查通道'):
      c.type==='bridge'?(['tide','glacier'].includes(c.area)?c.place.art:'巡橋記錄'):'高臺通道');
    return { title: override.title || title,
      prompt: override.prompt || (c.level > 1 ? c.mission : '') + sentence,
      rules, options, situation: situation + '/' + (c.machine ? c.place[c.type === 'cart' ? 'freight' : c.type === 'sluice' ? 'water' : 'message'] : c.type) };
  }

  function logical(c) {
    const colored = '帶有' + c.colorName(c.tone), isColor = t => t[c.colorKey] === c.tone;
    if (c.target === '同時符合' || c.target === '兩者皆') {
      const rules = [criterion(colored, isColor, true), criterion(c.secondText, c.second, true)];
      if (c.level === 3 && (c.door || c.machine)) rules.push(criterion('有一盞燈亮着', t => (c.door ? t.lit : t.count) === 1));
      const details = c.target === '同時符合' ? '要同時符合兩項要求：' + colored + '、' + c.secondText :
        '要求有兩項：' + colored + '、' + c.secondText + '。兩者皆符合才可使用';
      const extra = rules.length === 3 ? '另外，亮着的' + (c.door ? '火把要有一支' : '指示燈要有一盞') + '。' : '';
      return board(c, rules, '', '雙重規格', { variants: visibleVariants(c).filter(t=>rules.length===3 || !c.door&&!c.machine || (c.door?t.lit:t.count)===1), prompt: (c.level === 3 ? c.mission : '') + details + '。' + extra + c.action + '合適的' + c.noun + '。' });
    }
    if (c.target === '只有其中一項') {
      const rule = criterion(c.target, t => isColor(t) !== c.second(t), true);
      const variants = visibleVariants(c).filter(t=>[c.tone,c.otherTone].includes(t[c.colorKey]) && (!c.door&&!c.machine || (c.door?t.lit:t.count)===1)), pickState = (a,b) => c.pick(variants.filter(t => isColor(t) === a && c.second(t) === b));
      const side = c.pick([true,false]);
      const correct = pickState(side,!side);
      const wrong = [pickState(false,false),pickState(true,true)];
      const traits = c.shuffle([correct,...wrong]);
      const options = traits.map((t,i) => ({ id: c.type + '-' + (i+1), position: c.positionsFor(c.type,3,false)[i],
        traits: { ...t }, label: describe(c,t), route:'safe', correct:t===correct, matches:[rule.test(t)], targetEvidence:t===correct?'correct':'miss' }));
      return { title: c.machine?.name || '單項通行令', prompt: (c.level > 1 ? c.mission : '') +
        '條件有兩項：' + colored + '、' + c.secondText + '。' + c.action + '只有其中一項符合的' + c.noun + '。',
        options, rules:[rule], situation:'單項許可/'+(c.machine?c.place[c.type==='cart'?'freight':c.type==='signal'?'message':'water']:c.type) };
    }
    const excluded = c.colorName(c.tone);
    const rules = [criterion('沒有' + excluded, t => !isColor(t), true)];
    if (c.level >= 2) rules.push(criterion(c.secondText,c.second));
    const text = c.target === '其餘' ? '有' + excluded + '的' + c.noun + '留給維修員。其餘的都可用。' :
      '除了有' + excluded + '的' + c.noun + '以外，其他的都可用。';
    return board(c,rules,'','預留檢修',{ prompt:(c.level === 3 ? c.mission : '') + text +
      '請在可用的當中，' + c.action + (c.level >= 2 ? c.secondText + '的' : '合適的') + c.noun + '。' });
  }

  function spatial(c) {
    const n = c.level === 1 && c.target==='從右數第二' ? c.pick([2,3,4]) : c.level === 1 && c.target==='緊鄰' ? 3 : 4;
    const layouts = Array.from({length:n},(_,i)=>i), fromLeft = c.pick([true,false]);
    let isHere, placeText, constraints=()=>true, alongside=true, premise='';
    const key=c.colorKey, marker=color=>(key==='trim'?'繫着':'刻有')+c.colorName(color)+'的'+c.noun;
    const measure=c.machine?.unit || {door:'道',bridge:'座',ladder:'架'}[c.type];
    if (c.target === '位於兩端') {
      isHere=i=>i===0||i===n-1;placeText='位於兩端';
    } else if (c.target === '從右數第二') {
      const chosen=n-2, omit=c.level>=2&&c.pick([true,false]);
      isHere=i=>omit?i!==chosen:i===chosen;alongside=omit;
      placeText='從右數第二'+measure;
      if(omit)premise='從右數第二'+measure+c.noun+'已預留給巡查員。';
    } else if (c.target === '緊鄰') {
      const anchor=n===3?(fromLeft?0:2):(fromLeft?1:2);
      isHere=i=>Math.abs(i-anchor)===1;alongside=n>3;
      placeText='緊鄰'+marker(c.tone);constraints=(t,i)=>(t[key]===c.tone)===(i===anchor);
    } else if (c.target === '介乎……之間') {
      const span=c.pick([[0,2],[1,3],[0,3]]);
      const [a,b]=fromLeft?span:span.slice().reverse();
      isHere=i=>i>Math.min(a,b)&&i<Math.max(a,b);alongside=span[1]-span[0]>2;
      placeText='介乎'+marker(c.tone)+'與'+marker(c.otherTone)+'之間';
      constraints=(t,i)=>i===a?t[key]===c.tone:i===b?t[key]===c.otherTone:![c.tone,c.otherTone].includes(t[key]);
    } else {
      const two=c.level>1, anchors=c.shuffle(layouts).slice(0,two?2:1);
      isHere=i=>anchors.some(a=>Math.abs(i-a)===2);alongside=two;
      placeText='跟'+(two?'其中一座':'那座')+marker(c.tone)+'相隔一座'+c.noun;

      constraints=(t,i)=>(t[key]===c.tone)===anchors.includes(i);
    }
    let detail=c.secondText,other=c.second;
    if(c.target==='位於兩端'&&c.type==='bridge'&&c.area==='glacier'){
      detail='繫着'+c.colorName(c.tone);other=t=>t.trim===c.tone;
    }
    const rules=[criterion(placeText,(t,i)=>isHere(i),true)];
    if(alongside)rules.push(criterion(detail,other));
    let instruction;
    if(c.target==='從右數第二') instruction=premise?premise+'在其餘的當中，'+c.action+detail+'的'+c.noun+'。':
      c.action+placeText+c.noun+'。';
    else if(c.target==='位於兩端') instruction='在位於兩端的'+c.noun+'中，'+c.action+detail+'的那'+measure+'。';
    else if(c.target==='緊鄰') instruction='先找'+marker(c.tone)+'。'+c.action+'緊鄰它'+(alongside?'、而且'+detail:'')+'的'+c.noun+'。';
    else instruction=c.action+placeText+(alongside?'、而且'+detail:'')+'的'+c.noun+'。';
    const prompt=(c.level===3?c.mission:'')+instruction;
    return board(c,rules,placeText,'排列與鄰位',{ count:n,constraints,prompt });
  }

  function compare(c) {
    const equal=c.target==='相同';
    const detail=c.colorName(c.tone), rules=[criterion('符號比較',t=>(t[c.colorKey]===c.tone)===equal,true)];
    if(c.level>=2)rules.push(criterion(c.secondText,c.second));
    const prompt=(c.level===3?c.mission:'')+'記錄上的記號是'+detail+'。'+c.action+
      (c.level>=2?c.secondText+'、而且記號':'記號')+'與記錄'+c.target+'的'+c.noun+'。';
    return board(c,rules,'','對照通行記錄',{prompt});
  }

  function mechanismReference(c) {
    const [a,b]=c.palette, nameA=c.colorName(a),nameB=c.colorName(b);
    const task=c.pick([0,1]), tone=c.target==='前者'?a:c.target==='後者'?b:task?b:a;
    const rules=[criterion('解讀順序',t=>t.rune===tone,true)];
    if(c.level>=2)rules.push(criterion(c.secondText,c.second));
    const text=c.target==='分別' ? nameA+'和'+nameB+'分別代表日班和夜班。現在是'+(task?'夜班':'日班')+'。' :
      '名冊列出兩種記號：'+nameA+'、'+nameB+'。這次使用'+c.target+'。';
    return board(c,rules,'','交更信號',{variants:visibleVariants(c).filter(t=>[a,b].includes(t.rune)&&t.count===1&&(c.level>1||!t.banded)),prompt:(c.level===3?c.mission:'')+text+c.action+
      (c.level>=2?c.secondText+'、':'')+'記號正確的'+c.noun+'。'});
  }

  function people(c) {
    const n=c.level===1?2:c.level===2?3:4;
    const colors=c.shuffle(runes).slice(0,n);
    const names=colors.map(color=>c.colors[color].replace('色','')+'帽人');
    const [a,b,d]=names, rolesQuestion=roles.includes(c.target), note=c.place.note.replace('A',a).replace('B',b).replace('C',d||a);
    let body, question, correct, purpose;
    // Shuffle the order of propositions independently of the roles where both
    // are self-contained. The same actor can be right or wrong on a later visit.
    const join=statements=>c.shuffle(statements).join('');
    const object=c.place.object;
    if(rolesQuestion){
      if(c.target==='物主'||c.target==='原主'||c.target==='歸還'){
        const cases=[
          [a+'把自己的'+object+'借給'+b+'。','借用'],
          [b+'拾到'+a+'遺下的'+object+'。','認領'],
          [b+'替'+a+'保管'+object+'。東西一直是'+a+'的。','寄存']
        ];
        const picked=c.pick(cases);body=picked[0];purpose=picked[1];correct=0;
        question=c.target==='歸還'?'要歸還'+object+'，該交給誰？':'誰是'+object+'的'+c.target+'？';
        if(n>=3)body+=d+'來送信，順路把東西帶來。';
      } else if(c.target==='代領'){
        [purpose,body]=c.pick([
          ['委託取件',a+'沒空，請'+b+'替自己領取'+object+'。'],
          ['失物認領',b+'帶着'+a+'的認領紙，替'+a+'取回失物。'],
          ['全隊領用',a+'留在營地。隊員推舉'+b+'去領全隊的'+object+'。']]);
        correct=1;question='誰來代領？';
        if(n>=3)body+=d+'在發放處核對名冊。';
      } else if(c.target==='暫存'){
        [purpose,body]=c.pick([
          ['寄放待取',a+'把'+object+'放在'+b+'那裏，明天才取回。'],
          ['避雨保管',b+'收起'+a+'的'+object+'，等雨停才還給物主。'],
          ['換班保管',a+'出發巡查，請'+b+'保管'+object+'，直至自己回來。']]);
        correct=1;question='物件暫存在誰那裏？';
        if(n>=3)body+=d+'只負責送收據。';
      } else {
        const recipient=n===2?'值班員':d;
        [purpose,body]=c.pick([
          ['交給接班人',a+'把'+object+'交給'+b+'，請'+b+'帶給'+recipient+'。'],
          ['轉送誤投件',b+'收到'+a+'寄錯的'+object+'，答應送到'+recipient+'手上。'],
          ['接力送件',a+'只能送到路口。'+b+'在那裏接過'+object+'，繼續送給'+recipient+'。']]);
        correct=1;question='誰負責轉交？';
      }
      if(n===4)body=join([body,names[3]+'只負責在門外帶路。']);
    } else {
      const tasks=c.place.roles.slice(0,n===2?2:3);
      const choice=c.pick([0,1]);
      if(c.target==='其餘'){
        // All stated exclusions leave one person, even at the two-choice level.
        const order=c.shuffle(names.map((_,i)=>i)); correct=order.pop();
        body=order.map(i=>names[i]).join('、')+'已出發巡查。';
        question='其餘的人留下候命。誰留下來？';purpose='分配餘下工作';
      } else if(c.target==='分別'){
        body=a+'和'+b+'分別負責'+tasks[0]+'和'+tasks[1]+'。';correct=choice;
        if(n>=3)body+=d+'負責'+c.place.roles[2]+'。';
        question='找出負責'+tasks[choice]+'的人。';purpose='按序分工';
      } else {
        // Reverse which two jobs the final note mentions: neither the colour
        // first named in the paragraph nor the first job is always correct.
        const sequence=c.pick([[0,1],[1,0]]);correct=sequence[c.target==='前者'?0:1];
        body=(n>=3?note:a+'負責'+tasks[0]+'，'+b+'負責'+tasks[1]+'。')+
          '名冊列出兩項工作：'+tasks[sequence[0]]+'、'+tasks[sequence[1]]+'。';
        question='找負責'+c.target+'的人。';purpose='對照當值名冊';
      }
      if(n===4)body+=names[3]+'專管派送工具。';
    }
    const positions=c.shuffle(c.positionsFor('person',n,false));
    const traits=colors.map(hood=>({hood,carrying:'lantern',facing:'front'}));
    const options=traits.map((t,i)=>({id:'person-'+(i+1),position:positions[i],traits:t,label:describe(c,t),route:'safe',
      correct:i===correct,matches:[i===correct],targetEvidence:i===correct?'correct':'miss'}));
    return {title:c.place.people,prompt:body+question,options,rules:[criterion(c.target,()=>false,true)],
      situation:rolesQuestion?purpose:c.place.people+'/'+purpose};
  }

  const attachments={inlaid:'寶石鑲嵌在凹槽中',clasped:'寶石扣在表面',wrapped:'繩帶纏繞着器身',tied:'繩帶只打了一個結'};
  const patterns={crossed:'線條交錯',parallel:'線條平行',alternating:'色紋深淺相間',grouped:'深淺色紋分成兩組',symmetric:'圖紋左右對稱',asymmetric:'圖紋左右不對稱'};
  function patternLabel(t){return t.pattern==='grid'?(t.crossed?'線條交錯':'線條平行')+'，'+(t.symmetric?'左右對稱':'左右不對稱'):patterns[t.pattern];}

  function specimen(c){
    const isAttachment=['鑲嵌','纏繞'].includes(c.target);
    const isCompare=['相同','相異'].includes(c.target);
    const attachPair=c.target==='纏繞'?['wrapped','tied']:c.target==='鑲嵌'?['inlaid','clasped']:c.pick([['wrapped','tied'],['inlaid','clasped']]);
    const patternPair=c.target==='深淺相間'?['alternating','grouped']:c.target==='對稱'?['symmetric','asymmetric']:c.pick(c.target==='交錯'?[['crossed','parallel']]:[['crossed','parallel'],['alternating','grouped']]);
    const testingGrid=c.area==='forge'&&['交錯','對稱'].includes(c.target);
    const gridKey=c.target==='交錯'?'crossed':'symmetric';
    const grids=testingGrid?[{pattern:'grid',crossed:true,symmetric:true},{pattern:'grid',crossed:true,symmetric:false},
      {pattern:'grid',crossed:false,symmetric:true},{pattern:'grid',crossed:false,symmetric:false}]:patternPair.map(pattern=>({pattern}));
    const variants=[];
    const firstPattern=patternPair[0], firstAttach=attachPair[0];
    const sampleMark=c.pick([firstPattern,patternPair[1]]);
    const first= isAttachment?criterion(attachments[firstAttach],t=>t.attachment===firstAttach,true):
      testingGrid?criterion(c.target==='對稱'?'圖紋左右對稱':'線條交錯',t=>t[gridKey],true):
      isCompare?criterion('圖紋與樣本'+c.target,t=>(t.pattern===sampleMark)===(c.target==='相同'),true):
      criterion(patterns[firstPattern],t=>t.pattern===firstPattern,true);
    const rules=[first];
    if(c.level>=2){
      if(testingGrid)rules.push(criterion(gridKey==='crossed'?'圖紋左右對稱':'線條交錯',t=>gridKey==='crossed'?t.symmetric:t.crossed));
      else if(isAttachment)rules.push(criterion(patterns[firstPattern],t=>t.pattern===firstPattern));
      else rules.push(criterion(attachments[firstAttach],t=>t.attachment===firstAttach));
    }
    if(c.level>=3)rules.push(criterion('帶有'+c.colorName(c.tone),t=>t.rune===c.tone));
    for(const attachment of (isAttachment||c.level>=2&&!testingGrid?attachPair:[firstAttach])){
      for(const grid of grids){
        if(c.level===1&&isAttachment&&grid.pattern!==firstPattern)continue;
        if(c.level===1&&testingGrid&&!(gridKey==='crossed'?grid.symmetric:grid.crossed))continue;
        for(const rune of (c.level===3?[c.tone,c.otherTone]:[c.tone]))variants.push({type:'specimen',attachment,...grid,rune});
      }
    }
    const cases=c.legacyControls?[
      ['驗收','工匠送來一批'+c.noun+'。找出符合訂單的那件。'],
      ['配補件','展櫃裏少了一件'+c.noun+'。按原件記錄選出配得上的補件。'],
      ['領樣','你要帶走一件'+c.noun+'作樣本。照領取單仔細核對。']
    ]:[
      ['驗收','門鎖接上了新控制台。工匠留下了能開門的機器的記認。'],
      ['核對','開門的線路剛修好。維修簿記下了控制門鎖的那台機器。'],
      ['交更','其餘的機器仍在調校。值班員只把門鎖接到符合記錄的那台。']
    ];
    const [purpose,intro]=c.pick(cases);
    const description=rules.map(r=>r.text).join('、而且')+'的'+c.noun;
    const prompt=(c.level>1?intro:'')+(isCompare?'樣本上可見的特徵是'+patterns[sampleMark]+'。':'')+
      (c.legacyControls?'取出'+description+'。':'找出'+description+'，按下機上的按鈕開門。');
    const title=c.legacyControls?(['forge','archive','amber','astral'].includes(c.area)?c.place.art:'庫房選樣'):
      c.area==='astral'?'校準星盤':c.noun;
    return board(c,rules,'',(c.legacyControls?'器物':'門鎖')+purpose,{variants,title,prompt});
  }

  const positionText={left:'左邊',middle:'正中',right:'右邊','far-left':'最左邊','inner-left':'從左數第二',
    'inner-right':'從右數第二','far-right':'最右邊','upper-left':'左上方','lower-left':'左下方','upper-right':'右上方','lower-right':'右下方'};
  function labelled(c, options){
    return c.shuffle(options).map(o=>({...o,label:o.label+'，位置：'+positionText[o.position]}));
  }

  function practice(input){
    const c=makeContext(input),chest=c.type==='chest',item=c.type==='item';
    if(chest)c.type='item';
    const rules=[], color=chest||item?'decoration':c.colorKey, tone=c.pick(['red','blue','green']);
    let options,title,prompt,hint;
    if(chest||item){
      const variants=[];
      for(const material of (chest?['wood','iron']:['ceramic','copper']))for(const decoration of ['red','blue','green'])
        variants.push({type:chest?'box':'jug',material,decoration});
      const material=c.pick(chest?['wood','iron']:['ceramic','copper']);
      rules.push(criterion(c.materials[material]+'製',t=>t.material===material));
      if(c.level>1)rules.push(criterion('繫'+c.colors[tone]+'緞帶',t=>t.decoration===tone));
      options=assemble(c,variants.filter(t=>c.level>1||t.decoration===tone),rules,rules.length+1);
      if(chest)options.find(o=>o.correct).reward='chest';
      title=chest?'查驗寶箱':'取回水壺';
      const object=chest?'寶箱':'水壺';
      prompt=(c.level===3?'貨單上的物件有兩個記認，請逐項核對。':'')+(chest?'打開':'拿取')+rules.map(r=>r.text).join('、')+'的'+object+'。';
      hint='先看材料，再看'+object+'上的緞帶。';
    }else if(c.type==='person'){
      const palette=c.palette.slice(0,c.level===1?2:3);
      const hoods=palette.map(hood=>({hood,carrying:'scroll',facing:'front'}));
      rules.push(criterion(c.colors[c.tone]+'兜帽',t=>t.hood===c.tone));
      options=assemble(c,hoods,rules,2);title='當值名冊';prompt='找戴'+c.colors[c.tone]+'兜帽的人。';hint='留意兜帽的顏色。';
    }else{
      rules.push(criterion('帶有'+c.colorName(tone),t=>t[color]===tone));
      if(c.level>1)rules.push(criterion(c.secondText,c.second));
      const variants=visibleVariants(c).filter(t=>(!c.door&&!c.machine||(c.door?t.lit:t.count)===1)&&(c.level>1||c.second(t)));
      options=assemble(c,variants,rules,rules.length+1);title=c.machine?.name||'通道記認';
      prompt=(c.level===3?c.mission:'')+c.action+rules.map(r=>r.text).join('、')+'的'+c.noun+'。';hint='先找'+c.colorName(tone)+'。';
    }
    options=labelled(c,options).map(o=>({...o,targetEvidence:'neutral'}));
    const answer=options.find(o=>o.correct);
    return {title,prompt,hint,options,concept:'辨認實物',...(item?{collectItem:{...answer.traits,label:answer.label}}:{})};
  }

  function build(input){
    const c=makeContext(input);
    let result;
    if(c.type==='person')result=people(c);
    else if(c.type==='item')result=specimen(c);
    else if(quantities.includes(c.target))result=numerical(c);
    else if(logic.includes(c.target))result=logical(c);
    else if(space.includes(c.target))result=spatial(c);
    else if(['相同','相異'].includes(c.target))result=compare(c);
    else result=mechanismReference(c);
    const options=labelled(c,result.options);
    // Refuse boards on which an assessed clause is redundant, including ones
    // generated for the very youngest pupils. A semantic role counts as one test.
    if(options.filter(o=>o.correct).length!==1||result.rules.some((_,i)=>
      !options.some(o=>o.matches.every((match,j)=>match===(j!==i)))))throw Error('Invalid lesson witnesses for '+c.target);
    const conditions=result.rules.map(r=>r.text);
    const answer=options.find(o=>o.correct);
    return {title:result.title,prompt:result.prompt,hint:'「'+c.target+'」即是'+glosses[c.target]+'。再讀一次線索。',options,
      concept:c.target,lesson:{target:c.target,level:c.level,situation:result.situation,conditions},cardId:'lesson-'+c.type+'-'+c.target,
      ...(c.type==='item'?(c.legacyControls?{collectItem:{...answer.traits,label:answer.label}}:{targetType:'console',lockedExit:true}):{})};
  }
  return Object.freeze({targets,mechanisms,targetsFor,build,practice});
}));
