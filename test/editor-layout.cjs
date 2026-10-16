require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-layout-'));app.setPath('userData',dir);
 dialog.showOpenDialog=async(_win,options)=>({canceled:false,filePaths:[path.join(__dirname,options.filters[0].extensions.includes('mp3')?'fixtures/tone.wav':'fixtures/earth.jpg')]});
 app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
  const js=code=>win.webContents.executeJavaScript(code),delay=()=>new Promise(r=>setTimeout(r,100));
  const wait=async code=>{for(let i=0;i<200;i++){if(await js(code))return;await delay();}throw Error('timeout '+code);};
  try{
   await wait('!restoring&&!busy');await js("$('import').click()");await wait('history.value.slides.length===1&&image');
   const layouts=[];for(const [width,height] of [[1000,720],[1380,900],[1280,800]]){
    win.setContentSize(width,height);await delay();
    const geometry=await js("(()=>{const p=$('preview').getBoundingClientRect(),m=$('music-track').getBoundingClientRect();return {width:innerWidth,height:innerHeight,previewWidth:p.width,previewHeight:p.height,musicBottom:m.bottom};})()");
    layouts.push(geometry);assert.ok(geometry.previewHeight>=239);assert.ok(geometry.previewHeight>geometry.height-555+40);assert.ok(Math.abs(geometry.previewWidth/geometry.previewHeight-16/9)<.02);assert.ok(geometry.musicBottom<=geometry.height+3,JSON.stringify(geometry));
   }
   assert.equal(await js("document.body.textContent.includes('未選音樂')"),false);assert.equal(await js("$('remove-music').hidden"),true);assert.equal(await js("!!$('remove-music').closest('.music-track-block')"),true);
   await js("$('add-text').click()");win.focus();win.webContents.focus();await win.webContents.insertText('框外刪除 Text');await js('document.activeElement.blur()');
   const clickAt=async point=>{for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1});await delay();};
   await js('toolbarPosition={x:8,y:8};placeToolbar()');
   for(const area of ['gutter','canvas']){
    const point=await js(`(()=>{const r=document.querySelector('${area==='gutter'?'.preview-area':'#preview'}').getBoundingClientRect();return {x:r.left+4,y:r.top+r.height/2};})()`);
    await clickAt(point);assert.equal(await js("$('text-toolbar').hidden"),true,area+' 點擊應隱藏文字工具列');
    await js('refresh()');assert.equal(await js("document.querySelector('.text-delete, .text-handle')"),null,'文字框沒有叉號及拖曳符號');assert.equal(await js("getComputedStyle(document.querySelector('.text-box')).borderTopColor"),'rgba(0, 0, 0, 0)','未選文字沒有外框');assert.equal(await js('slide().texts[0].value'),'框外刪除 Text');
    const textPoint=await js("(()=>{const r=document.querySelector('.text-edit').getBoundingClientRect();return {x:r.left+5,y:r.top+5};})()");await clickAt(textPoint);assert.equal(await js("$('text-toolbar').hidden"),false,'點文字重新顯示工具列');
   }
   assert.equal(await js("(()=>{const r=document.querySelector('.text-box').getBoundingClientRect();return getComputedStyle(document.elementFromPoint(r.left+.5,r.top+r.height/2)).cursor;})()"),'move','邊框 hover 必須顯示四向移動游標');
   const toolPoint=await js("(()=>{const r=$('toolbar-handle').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()");await clickAt(toolPoint);assert.equal(await js("$('text-toolbar').hidden"),false,'點工具列不應隱藏');
   await js('document.activeElement.blur()');
   assert.match(await js("$('size').parentElement.textContent"),/px/);
   await js("$('size').value='12';$('size').dispatchEvent(new Event('change'))");assert.ok(Math.abs(await js('text().size*2160')-12)<1e-6);
   await js("$('size').value='144';$('size').dispatchEvent(new Event('change'));history.editText(selected,p=>Object.assign(p.slides[selected].texts[0],movedText(p.slides[selected].texts[0],2,-2)));refresh();toolbarPosition={x:8,y:8};placeToolbar()");
   assert.equal(await js("document.querySelector('.text-delete, .text-handle')"),null);
   const control=await js("(()=>{const r=$('delete-text').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
   await clickAt(control);await wait('slide().texts.length===0');assert.equal(await js("$('text-toolbar').hidden"),false);assert.equal(await js("$('delete-text').disabled"),true);await js("$('undo').click()");assert.equal(await js('slide().texts.length'),1);await js("$('redo').click()");assert.equal(await js('slide().texts.length'),0);await js("$('undo').click()");
   await js("$('resolution').value='720p';$('resolution').dispatchEvent(new Event('change'))");assert.equal(await js("Number($('size').value)"),48);
   await js("$('size').value='24';$('size').dispatchEvent(new Event('change'))");assert.equal(await js('text().size*720'),24);assert.equal(await js('flushSave()'),true);
   await js("$('music').click()");await wait('!!history.value.music');assert.equal(await js("$('remove-music').hidden"),false);
   const musicRemove=await js("(()=>{const r=$('remove-music').getBoundingClientRect(),b=document.querySelector('.music-track-block').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,inside:r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom};})()");assert.equal(musicRemove.inside,true);await clickAt(musicRemove);await wait('!history.value.music');assert.equal(await js("$('remove-music').hidden"),true);assert.equal(await js("$('track-wave-status').textContent"),'');
   console.log('EDITOR_LAYOUT_PASS '+JSON.stringify({layouts,toolbarDeleteAndRedo:true,musicRemoveInsideTrack:true,sizePixels:true}));
   app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
  }catch(e){console.error(e);app.exit(1);}
 });});require('../src/main.cjs');
})();
