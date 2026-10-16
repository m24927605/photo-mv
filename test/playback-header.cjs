require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-header-'));app.setPath('userData',dir);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(__dirname,'fixtures/earth.jpg'),path.join(__dirname,'fixtures/exif-rotated.jpg')]});
 app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
  const js=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<200;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('timeout '+code);};
  try{
   await wait('!restoring&&!busy');await js("$('import').click()");await wait('history.value.slides.length===2&&image');await js('flushSave()');
   const result=await js(`(async()=>{
    const ids=['import','add-text','music'],rects=()=>ids.map(id=>{const r=$(id).getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
    const before=rects();const statusWidth=$('save-status').getBoundingClientRect().width;
    for(const value of ['儲存中…','已儲存','儲存失敗']){$('save-status').textContent=value;if(JSON.stringify(rects())!==JSON.stringify(before))throw Error('status changes button positions');}
    $('save-status').textContent='已儲存';let samples=[],badges=[],badgeWrites=0;const observer=new MutationObserver(records=>badgeWrites+=records.length);observer.observe($('save-status'),{childList:true,characterData:true,subtree:true});
    const timer=setInterval(()=>{samples.push(rects());badges.push($('save-status').textContent);},16);
    $('play').click();await new Promise(r=>setTimeout(r,1600));const checkpoint=(await window.desktop.restore()).snapshot.ui.playhead;await new Promise(r=>setTimeout(r,1850));clearInterval(timer);observer.disconnect();
    const at=playhead,currentPhoto=selected;$('play').click();await flushSave();
    return {before,samples,badges,badgeWrites,checkpoint,statusWidth,at,currentPhoto};
   })()`);
   assert.ok(result.samples.length>100);for(const sample of result.samples)assert.deepEqual(sample,result.before);assert.ok(result.badges.every(x=>x==='已儲存'));assert.equal(result.currentPhoto,1);assert.equal(result.badgeWrites,0);assert.ok(result.checkpoint>1&&result.checkpoint<2);
   const saved=JSON.parse(await fs.readFile(path.join(dir,'current-project.json'),'utf8'));assert.ok(Math.abs(saved.ui.playhead-result.at)<.1);
   console.log('PLAYBACK_HEADER_PASS: 逾 100 次實際播放取樣、跨照片切換、三按鈕位置不變、狀態不閃爍、播放位置仍儲存');
   app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
  }catch(e){console.error(e);app.exit(1);}
 });});require('../src/main.cjs');
})();
