const path=require('node:path');
const {validateDraft,validateTextState}=require('./model.js');
function verifySnapshot(snapshot,assets){
  if(!snapshot?.state||!snapshot.ui)throw Error('專案格式不完整');
  const {state,ui}=snapshot;validateDraft(state.project);
  for(const entries of [state.textUndo === undefined ? [] : state.textUndo, state.textRedo === undefined ? [] : state.textRedo]) {
    if(!Array.isArray(entries))throw Error('文字步驟資料不合法');
    for(const texts of entries)validateTextState(texts);
  }
  const p=state.project;
  if(p.slides.some(s=>assets.get(s.asset)?.kind!=='photo')||(p.music&&assets.get(p.music)?.kind!=='music'))throw Error('專案來源資料不完整');
  if(!ui||!Number.isInteger(ui.selected)||ui.selected < -1||ui.selected>=p.slides.length||!Number.isInteger(ui.textIndex)||!Number.isFinite(ui.playhead)||ui.playhead<0||typeof ui.textToolsVisible!=='boolean'||typeof ui.musicOpen!=='boolean'||!Number.isFinite(ui.scrollLeft)||ui.scrollLeft<0||(ui.toolbarPosition&&(!Number.isFinite(ui.toolbarPosition.x)||!Number.isFinite(ui.toolbarPosition.y))))throw Error('編輯位置資料不合法');
}
function makeDocument(snapshot,assets){
  verifySnapshot(snapshot,assets);const p=snapshot.state.project,ids=new Set(p.slides.map(s=>s.asset));if(p.music)ids.add(p.music);
  return {format:1,...snapshot,assets:[...ids].map(id=>assets.get(id))};
}
function readDocument(saved){
  if(!saved||saved.format!==1||!Array.isArray(saved.assets))throw Error('專案格式不合法');
  const assets=new Map();
  for(const a of saved.assets){
    if(!a||typeof a.id!=='string'||assets.has(a.id)||typeof a.name!=='string'||typeof a.file!=='string'||!path.isAbsolute(a.file)||!['photo','music'].includes(a.kind)||!({photo:['jpg','jpeg','png','webp'],music:['mp3','wav','m4a']}[a.kind].includes(a.ext))||path.extname(a.file).slice(1).toLowerCase()!==a.ext)throw Error('來源紀錄不合法');assets.set(a.id,a);
  }
  verifySnapshot(saved,assets);return {snapshot:{state:saved.state,ui:saved.ui},assets};
}
module.exports={verifySnapshot,makeDocument,readDocument};
