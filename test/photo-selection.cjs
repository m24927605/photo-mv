require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-selection-'));app.setPath('userData',dir);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:Array(3).fill(path.join(__dirname,'fixtures/earth.jpg'))});
 app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
  const js=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<200;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('timeout '+code);};
  const durations=()=>js('history.value.slides.map(s=>s.duration)');
  const change=value=>js(`$('duration').value=${JSON.stringify(value)};$('duration').dispatchEvent(new Event('change'))`);
  try{
   await wait('!restoring&&!busy');assert.equal(await js("history.value.resolution"),'4K');assert.equal(await js("$('resolution').value"),'4K');assert.equal(await js("!!$('default-duration')"),false);
   assert.equal(await js("!!$('select-all-photos').closest('.photo-track-block')"),true);
   assert.equal(await js("!!$('music-track').closest('.music-track-block')"),true);
   await js("$('import').click()");await wait('history.value.slides.length===3');
   await js("$('slides').children[0].querySelector('.select-slide').click();$('slides').children[1].querySelector('.select-slide').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))");
   assert.equal(await js("document.querySelectorAll('.photo-clip.selected').length"),2);
   await change('5');assert.deepEqual(await durations(),[5,5,3]);
   await js("$('slides').children[2].querySelector('.select-slide').click()");await change('2');assert.deepEqual(await durations(),[5,5,2]);
   await js("$('slides').children[2].querySelector('.select-slide').click()");
   win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await wait('selectedPhotos.size===3');
   await change('4');assert.deepEqual(await durations(),[4,4,4]);assert.equal(await js('Model.totalDuration(history.value)'),12);
   await js("$('slides').children[2].querySelector('.select-slide').click();$('slides').children[0].querySelector('.select-slide').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))");assert.equal(await js('selectedPhotos.size'),3);
   await js("$('slides').children[1].querySelector('.select-slide').click();$('select-all-photos').click()");assert.equal(await js('selectedPhotos.size'),3);
   for(const value of ['','0','1.25','5000']){await change(value);assert.deepEqual(await durations(),[4,4,4]);}
   await js("$('duration').focus()");win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});assert.equal(await js("document.activeElement.id"),'duration');
   assert.equal(await js('flushSave()'),true);const saved=await js('window.desktop.restore()');assert.deepEqual(saved.snapshot.state.project.slides.map(s=>s.duration),[4,4,4]);
   async function key(keyCode){win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});await new Promise(r=>setTimeout(r,80));}
   const original=await js('history.value.slides.map(s=>s.asset)');
   await js("$('duration').focus()");await key('Delete');assert.equal(await js('history.value.slides.length'),3);
   await js("$('slides').children[0].querySelector('.select-slide').click();$('add-text').click()");win.focus();win.webContents.focus();await win.webContents.insertText('ABC');await wait("editing?.value==='ABC'");await key('Backspace');await wait("editing?.value==='AB'");assert.equal(await js('history.value.slides.length'),3);
   await js("$('slides').children[1].querySelector('.select-slide').click()");await key('Delete');assert.deepEqual(await js('history.value.slides.map(s=>s.asset)'),[original[0],original[2]]);assert.equal(await js('history.value.slides[0].texts[0].value'),'AB');
   await js("$('slides').children[0].querySelector('.select-slide').click();$('slides').children[1].querySelector('.select-slide').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))");await key('Backspace');assert.equal(await js('history.value.slides.length'),0);
   assert.equal(await js('flushSave()'),true);assert.equal((await js('window.desktop.restore()')).snapshot.state.project.slides.length,0);assert.ok((await fs.stat(path.join(__dirname,'fixtures/earth.jpg'))).isFile());
   console.log('PHOTO_SELECTION_PASS: 4K 預設、單選／複選、Ctrl+A、批次秒數、Delete 刪單張、Backspace 刪複選、文字與輸入欄不誤刪、原檔保留與儲存');
   app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
  }catch(e){console.error(e);app.exit(1);}
 });});require('../src/main.cjs');
})();
