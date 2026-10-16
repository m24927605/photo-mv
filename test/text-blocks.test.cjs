const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../src/model.js');
const text=value=>({value,font:'Arial',color:'#ffffff',size:.06,x:.1,y:.2,bold:false,italic:false,underline:false});
const fixture=()=>({...M.createProject(),slides:['a','b','c'].map(asset=>({asset,duration:3,texts:[]}))});
test('文字跨照片延續，時間點修改保留前段並產生新區塊',()=>{
 const h=M.history(fixture());h.editText(0,p=>p.slides[0].texts.push(text('A')));for(const t of [0,2.9,3,5.9,6,9])assert.equal(M.textsAt(h.value,t)[0].value,'A');
 h.editText(1,p=>p.slides[1].texts[0].value='B',1);assert.equal(M.textsAt(h.value,3.9)[0].value,'A');assert.equal(M.textsAt(h.value,4)[0].value,'B');assert.equal(M.textsAt(h.value,8.9)[0].value,'B');assert.deepEqual(M.textBlocks(h.value).map(b=>b.time),[0,4]);
 h.editText(2,p=>p.slides[2].texts[0].color='#ff0000');h.editText(0,p=>p.slides[0].texts[0].value='A2');assert.equal(M.textsAt(h.value,3.9)[0].value,'A2');assert.equal(M.textsAt(h.value,4)[0].value,'B');assert.equal(M.textsAt(h.value,6)[0].color,'#ff0000');
});
test('刪除是空白文字區塊，撤銷可恢復延續且不改照片及音樂',()=>{
 const h=M.history(fixture());h.editText(0,p=>p.slides[0].texts.push(text('A')));h.editText(1,p=>p.slides[1].texts.splice(0),1);
 assert.equal(M.textsAt(h.value,3.9).length,1);assert.equal(M.textsAt(h.value,4).length,0);assert.equal(M.textsAt(h.value,8).length,0);
 h.edit(p=>{p.slides[0].duration=4;p.music='song'});h.undoText();assert.equal(M.textsAt(h.value,8)[0].value,'A');assert.equal(h.value.slides[0].duration,4);assert.equal(h.value.music,'song');h.redoText();assert.equal(M.textsAt(h.value,5).length,0);
 const restored=M.history(fixture());restored.restore(JSON.parse(JSON.stringify(h.snapshot())));restored.undoText();assert.equal(M.textsAt(restored.value,8)[0].value,'A');
});
test('草稿快照保留時間點與單一步驟，不修改目前模型',()=>{
 const h=M.history(fixture());h.editText(0,p=>p.slides[0].texts.push(text('A')));const draft=h.snapshot({slideIndex:1,index:0,offset:1,value:'B'});assert.equal(M.textsAt(h.value,4)[0].value,'A');assert.equal(M.textsAt(draft.project,4)[0].value,'B');assert.equal(draft.textUndo.length,h.snapshot().textUndo.length+1);
 const restored=M.history(fixture());restored.restore(draft);restored.undoText();assert.equal(M.textsAt(restored.value,4)[0].value,'A');
});
test('匯出依圖片與文字邊界切分；共同剪裁保留起點的延續文字',()=>{
 const h=M.history(fixture());h.editText(0,p=>p.slides[0].texts.push(text('A')));h.editText(1,p=>p.slides[1].texts[0].value='B',1);const segments=M.renderSegments(h.value);assert.deepEqual(segments.map(s=>[s.asset,s.duration,s.texts[0].value]),[['a',3,'A'],['b',1,'A'],['b',2,'B'],['c',3,'B']]);
 const cropped=M.trimProject(h.value,3.5,8);assert.equal(M.totalDuration(cropped),4.5);assert.equal(M.textsAt(cropped,0)[0].value,'A');assert.equal(M.textsAt(cropped,.5)[0].value,'B');assert.deepEqual(M.renderSegments(cropped).map(s=>[s.duration,s.texts[0].value]),[[.5,'A'],[2,'B'],[2,'B']]);
 assert.equal(M.textsAt(M.trimProject(h.value,5,8),0)[0].value,'B');
});
test('拒絕非法文字時間、內容及區塊標記',()=>{
 for(const mutate of [p=>p.slides[0].textChanges=[{at:-1,texts:[]}],p=>p.slides[0].textChanges=[{at:.01,texts:[]}],p=>p.slides[0].textChanges=[{at:1,texts:[]},{at:1,texts:[]}],p=>p.slides[0].textOverride='yes']){const p=fixture();mutate(p);assert.throws(()=>M.validate(p));}
});
test('在既有後段區塊前新增獨立文字，輸入、樣式與刪除都延續至後圖',()=>{
 const h=M.history(fixture());h.editText(0,p=>p.slides[0].texts.push(text('底字')));
 h.editText(1,p=>p.slides[1].texts.push({...text('超過100分'),id:'later'}),1);
 h.editText(1,p=>p.slides[1].texts.push({...text(''),id:'new'}));
 h.editText(1,p=>p.slides[1].texts.find(t=>t.id==='new').value='貓哥午安');
 h.editText(1,p=>Object.assign(p.slides[1].texts.find(t=>t.id==='new'),{color:'#ff0000',x:.4}));
 assert.deepEqual(M.textsAt(h.value,6).map(t=>t.value),['底字','超過100分','貓哥午安']);
 assert.deepEqual(M.textsAt(h.value,2).map(t=>t.value),['底字']);
 assert.equal(M.textsAt(h.value,6).find(t=>t.id==='new').x,.4);
 const restored=M.history(fixture());restored.restore(h.snapshot());restored.editText(1,p=>p.slides[1].texts.splice(p.slides[1].texts.findIndex(t=>t.id==='new'),1));
 assert.deepEqual(M.textsAt(restored.value,6).map(t=>t.value),['底字','超過100分']);restored.undoText();assert.equal(M.textsAt(restored.value,6).at(-1).value,'貓哥午安');restored.redoText();assert.equal(M.textsAt(restored.value,6).length,2);
});
test('只延續同一段文字到其下一次明確修改，其他文字修改不阻斷',()=>{
 const h=M.history(fixture());h.editText(0,p=>p.slides[0].texts.push({...text('A'),id:'a'}));
 h.editText(1,p=>p.slides[1].texts.push({...text('其他字'),id:'other'}),1);
 h.editText(2,p=>p.slides[2].texts.find(t=>t.id==='a').value='B',1);
 h.editText(0,p=>p.slides[0].texts.find(t=>t.id==='a').color='#ff0000');
 assert.equal(M.textsAt(h.value,6)[0].color,'#ff0000');assert.equal(M.textsAt(h.value,7)[0].value,'B');assert.equal(M.textsAt(h.value,7)[0].color,'#ffffff');
 const bad=fixture();bad.slides[0].texts=[{...text('A'),id:'x'},{...text('B'),id:'x'}];assert.throws(()=>M.validate(bad));
});
