require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-scrub-'));app.setPath('userData',dir);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(__dirname,'fixtures/earth.jpg'),path.join(__dirname,'fixtures/exif-rotated.jpg')]});
 app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
  const js=code=>win.webContents.executeJavaScript(code),delay=()=>new Promise(r=>setTimeout(r,70));
  const wait=async code=>{for(let i=0;i<200;i++){if(await js(code))return;await delay();}throw Error('timeout '+code);};
  async function drag(target,fraction,ySelector){
   const coords=await js(`(()=>{const t=$('${target}').getBoundingClientRect(),c=$('timeline-content').getBoundingClientRect(),y=$('${ySelector}').getBoundingClientRect();return {x:Math.round(t.left+Math.max(2,t.width/2)),y:Math.round(y.top+y.height/2),end:Math.round(c.left+c.width*${fraction})};})()`);
   win.webContents.sendInputEvent({type:'mouseDown',x:coords.x,y:coords.y,button:'left',clickCount:1});await delay();
   win.webContents.sendInputEvent({type:'mouseMove',x:coords.end,y:coords.y,button:'left',modifiers:['leftButtonDown']});await delay();
   win.webContents.sendInputEvent({type:'mouseUp',x:coords.end,y:coords.y,button:'left',clickCount:1});await delay();
  }
  try{
   await wait('!restoring&&!busy');await js("$('import').click()");await wait('history.value.slides.length===2&&image');
   const original=await js('JSON.stringify(history.value)');
   await js('seek(1)');
   await drag('timeline-playhead',.75,'music-track');assert.ok(Math.abs(await js('playhead')-4.5)<.03);assert.equal(await js('selected'),1);await wait('image&&image.naturalWidth===80');
   await drag('timeline-playhead',.25,'slides');assert.ok(Math.abs(await js('playhead')-1.5)<.03);assert.equal(await js('selected'),0);
   await drag('timeline-ruler',.8,'timeline-ruler');assert.ok(Math.abs(await js('playhead')-4.8)<.03);
   await js("$('timeline-playhead').focus()");win.webContents.sendInputEvent({type:'keyDown',keyCode:'End'});await wait('playhead===6');
   win.webContents.sendInputEvent({type:'keyDown',keyCode:'Home'});await wait('playhead===0');
   assert.equal(await js('JSON.stringify(history.value)'),original);assert.equal(await js('flushSave()'),true);
   assert.equal((await js('window.desktop.restore()')).snapshot.ui.playhead,0);
   console.log('TIMELINE_SCRUB_PASS: 真實滑鼠拖曳照片／音樂區共用軸、刻度拖曳、跨照片預覽、鍵盤首尾、原片不變與儲存');
   await fs.rm(dir,{recursive:true,force:true});app.exit(0);
  }catch(e){console.error(e);app.exit(1);}
 });});require('../src/main.cjs');
})();
