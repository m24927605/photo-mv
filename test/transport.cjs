require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photo-mv-transport-'));app.setPath('userData',dir);
 dialog.showOpenDialog=async(_win,options)=>({canceled:false,filePaths:options.filters[0].extensions.includes('mp3')?[path.join(__dirname,'fixtures/tone.wav')]:[path.join(__dirname,'fixtures/earth.jpg'),path.join(__dirname,'fixtures/exif-rotated.jpg')]});
 app.on('browser-window-created',(_e,win)=>{win.hide();win.webContents.once('did-finish-load',async()=>{
  const js=s=>win.webContents.executeJavaScript(s),wait=async s=>{for(let n=0;n<300;n++){if(await js(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('timeout '+s);};
  try{
   await wait('!restoring&&!busy');assert.equal(await js("$('rewind').disabled"),true);assert.equal(await js("$('play').textContent"),'▶ 播放');await js("$('import').click()");await wait('history.value.slides.length===2&&image');
   await js("seek(4);$('rewind').click()");assert.equal(await js('playhead'),0);assert.equal(await js('selected'),0);assert.equal(await js('playing'),false);
   await js("changeRange(1,5);seek(4);$('play').click()");await wait('playing');await js("$('rewind').click()");assert.equal(await js('playhead'),1);assert.equal(await js('playing'),false);assert.equal(await js('audio.paused'),true);assert.equal(await js("$('play').textContent"),'▶ 播放');
   await js("flushSave()");assert.equal((await js('window.desktop.restore()')).snapshot.ui.playhead,1);
   await js("$('music').click()");await wait('!!history.value.music');await js("seek(3);$('play').click();$('rewind').click()");await new Promise(r=>setTimeout(r,600));assert.equal(await js('playing'),false,'回到開始不可被尚未完成的音訊啟動再次播放');assert.equal(await js('audio.paused'),true);assert.equal(await js('playhead'),1);
   console.log('TRANSPORT_PASS: 播放名稱、空專案停用、回到0秒／開始軸、播放中停止並返回、狀態儲存');
   app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
  }catch(e){console.error(e);app.exit(1);}
 });});require('../src/main.cjs');
})();
