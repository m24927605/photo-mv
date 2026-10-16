const { test } = require('node:test');
const assert = require('node:assert/strict');
const { history, validate, sizes } = require('../src/model.js');
const fixture = () => ({ slides: [{ asset: 'a', duration: 1.1, texts: [{ value: '中文 English', font: 'Microsoft JhengHei', color: '#ffffff', size: .06, x: .1, y: .8, bold: false, italic: false, underline: false }] }], resolution: '1080p', lossless: false });
test('五種解析度與精確影格數', () => { assert.equal(Object.keys(sizes).length, 5); assert.equal(validate(fixture()), 33); });
test('僅復原文字時間區塊，照片與音樂操作保持不變', () => {
  const p = fixture(), h = history(p);
  h.edit(n => { n.music = 'song'; n.slides.push({asset:'b',duration:3,texts:[]}); });
  assert.equal(h.canUndoText('a'),false);
  h.editText(0,n => n.slides[0].texts[0].value='修改文字');
  h.edit(n => { n.music='other'; n.slides[0].duration=5; });
  h.editText(0,n => n.slides[0].texts=[]);
  assert.equal(h.canUndoText('a'),true);
  h.undoText('a'); assert.equal(h.value.slides[0].texts[0].value,'修改文字');
  h.undoText('a'); assert.deepEqual(h.value.slides[0].texts,p.slides[0].texts);
  assert.equal(h.value.music,'other'); assert.equal(h.value.slides[0].duration,5); assert.equal(h.value.slides.length,2);
  assert.equal(h.canUndoText('a'),false); assert.equal(h.canUndoText('b'),false);
});
test('拒絕不合法專案、時長、座標與字體', () => { for (const mutate of [p => p.slides = [], p => p.resolution = '8K', p => p.slides[0].duration = NaN, p => p.slides[0].duration = 1.11, p => p.slides[0].texts[0].x = Infinity, p => p.slides[0].texts[0].font = 'arbitrary', p => p.slides[0].texts[0].color = 'url(x)']) { const p = fixture(); mutate(p); assert.throws(() => validate(p)); } });

test('音樂裁切與音量／淡入淡出驗證', () => {
  const {musicLevel}=require('../src/model.js'); const p=fixture();
  p.music='song'; p.musicEdit={duration:10,start:2,end:5,volume:.5,fadeIn:.2,fadeOut:.2};
  assert.equal(validate(p),33); assert.equal(musicLevel(p.musicEdit,0,1.1),0); assert.equal(musicLevel(p.musicEdit,.5,1.1),.5); assert.equal(musicLevel(p.musicEdit,1.1,1.1),0);
  for(const change of [m=>m.start=-1,m=>m.end=11,m=>m.volume=2,m=>m.fadeIn=14401,m=>m.end=m.start]) {const q=structuredClone(p);change(q.musicEdit);assert.throws(()=>validate(q));}
});

test('照片決定時間軸、音樂不延長，開始與結束軸決定輸出範圍',()=>{const {totalDuration,playbackRange,musicFades}=require('../src/model.js');const p=fixture();p.music='a';p.musicEdit={duration:5,start:0,end:5,volume:1,fadeIn:5,fadeOut:5};assert.equal(totalDuration(p),1.1);assert.equal(validate(p),33);assert.deepEqual(musicFades(p.musicEdit,1.1),{fadeIn:1.1,fadeOut:1.1});p.selection={start:.2,end:5};assert.deepEqual(playbackRange(p),{start:.2,end:1.1});assert.equal(validate(p),33);});

test('共用範圍剪裁同時保留照片交集與對應音樂長度',()=>{
 const {trimProject,totalDuration}=require('../src/model.js');const p=fixture();p.slides=[0,1,2].map(i=>({asset:String(i),duration:3,texts:structuredClone(p.slides[0].texts)}));p.music='song';p.musicEdit={duration:2,start:0,end:2,volume:.5,fadeIn:1,fadeOut:1};p.selection={start:1.5,end:7};
 const cut=trimProject(p,1.5,7);assert.deepEqual(cut.slides.map(s=>[s.asset,s.duration]),[['0',1.5],['1',3],['2',1]]);assert.equal(totalDuration(cut),5.5);assert.equal(cut.musicEdit.end,5.5);assert.equal(cut.selection,undefined);assert.equal(validate(cut),165);assert.equal(p.slides[0].duration,3);assert.equal(cut.slides[0].texts[0].value,p.slides[0].texts[0].value);
 for(const [a,b] of [[-1,2],[2,2],[0,10],[.05,1]])assert.throws(()=>trimProject(p,a,b));
});

test('起始及結束軸直接決定有效播放範圍，保留原時間軸可調回',()=>{const {playbackRange,totalDuration}=require('../src/model.js');const p=fixture();assert.deepEqual(playbackRange(p),{start:0,end:1.1});p.selection={start:.2,end:.7};assert.deepEqual(playbackRange(p),{start:.2,end:.7});assert.equal(totalDuration(p),1.1);assert.equal(p.slides[0].duration,1.1);});

test('文字時間區塊的前後步驟可重開、會分支，且不復原照片操作',()=>{
 const h=history(fixture());h.edit(p=>p.slides.push({asset:'b',duration:2,texts:[]}));
 h.editText(0,p=>p.slides[0].texts[0].color='#ff0000');h.editText(0,p=>p.slides[0].texts=[]);h.undoText();assert.equal(h.value.slides[0].texts[0].color,'#ff0000');assert.equal(h.canRedoText(),true);
 const restored=history(fixture());restored.restore(JSON.parse(JSON.stringify(h.snapshot())));restored.redoText();assert.deepEqual(restored.value.slides[0].texts,[]);restored.undoText();assert.equal(restored.value.slides[0].texts[0].color,'#ff0000');
 h.editText(1,p=>p.slides[1].texts=[{...p.slides[0].texts[0],value:'B'}]);assert.equal(h.canRedoText(),false);h.undoText();assert.equal(require('../src/model.js').textsAt(h.value,2)[0].value,'中文 English');h.redoText();assert.equal(h.value.slides[1].texts[0].value,'B');
 h.edit(p=>p.slides.splice(0,1));h.undoText();assert.deepEqual(h.value.slides.map(s=>s.asset),['b']);
});
