require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photo-mv-drag-'));app.setPath('userData',path.join(dir,'state'));
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(__dirname,'fixtures/earth.jpg')]});
 app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{
  const js=s=>win.webContents.executeJavaScript(s),delay=()=>new Promise(r=>setTimeout(r,60));
  const wait=async s=>{for(let n=0;n<300;n++){if(await js(s))return;await delay();}throw Error('timeout '+s);};
  const mouse=async(type,p)=>{win.webContents.sendInputEvent({type,x:Math.round(p.x),y:Math.round(p.y),button:'left',clickCount:p.clickCount||1,...(type==='mouseMove'?{modifiers:['leftButtonDown']}:{})});await delay();};
  const point=()=>js("(()=>{const b=document.querySelector('.text-edit').getBoundingClientRect();return {x:Math.round(b.left+10),y:Math.round(b.top+10)};})()");
  try{
   await wait('!restoring&&!busy');await js("$('import').click()");await wait('slide()&&image');
   await js("$('add-text').click()");win.focus();win.webContents.focus();await win.webContents.insertText('拖曳文字 Drag');
   await js("document.activeElement.blur();history.edit(p=>{p.slides[0].texts[0].x=.1;p.slides[0].texts[0].y=.25;for(let i=1;i<20;i++)p.slides[0].texts.push({...p.slides[0].texts[0],id:crypto.randomUUID(),value:'文字 '+i,x:.6,y:.6});});refresh();toolbarPosition={x:8,y:8};placeToolbar()");
   const start=await point();await mouse('mouseDown',start);
   const perf=await js("(async()=>{const originalDraw=drawSlide,originalRect=Element.prototype.getBoundingClientRect,originalFrame=paintTextDrag;let photos=0,reads=0,frames=0,frameMilliseconds=0;drawSlide=(c,img,s)=>{if(img===image)photos++;return originalDraw(c,img,s);};Element.prototype.getBoundingClientRect=function(){reads++;return originalRect.call(this);};paintTextDrag=()=>{const t=performance.now();frames++;originalFrame();frameMilliseconds+=performance.now()-t;};const box=$('preview'),t=performance.now();for(let i=1;i<=120;i++)box.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:drag.x+i/3,clientY:drag.y+i/6}));const elapsed=performance.now()-t;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);drawSlide=originalDraw;Element.prototype.getBoundingClientRect=originalRect;paintTextDrag=originalFrame;return {pointerEvents:120,eventBurstMilliseconds:elapsed,originalPhotoDraws:photos,layoutReads:reads,renderedFrames:frames,frameMilliseconds};})()");
   assert.equal(perf.originalPhotoDraws,0);assert.equal(perf.layoutReads,0);assert.equal(perf.renderedFrames,1);assert.equal(await js("$('text-guides').hidden"),false);assert.ok(await js("crosshairLines.x.style.left&&crosshairLines.y.style.top"));
   await mouse('mouseUp',{x:start.x+40,y:start.y+20});assert.ok(await js('slide().texts[0].x>.1'),'直接拖文字內容必須移動');
   await js("$('undo').click()");assert.equal(await js('slide().texts[0].x'),.1);await js("$('redo').click()");assert.ok(await js('slide().texts[0].x>.1'));await js("$('undo').click()");
   const tap=await point();await mouse('mouseDown',tap);await mouse('mouseUp',{x:tap.x+1,y:tap.y+1});assert.equal(await js('document.activeElement.isContentEditable'),false);await mouse('mouseDown',{...tap,clickCount:2});await mouse('mouseUp',{...tap,clickCount:2});assert.equal(await js('document.activeElement.isContentEditable'),true);assert.equal(await js('slide().texts[0].x'),.1);
   await win.webContents.insertText('可輸入');await wait("editing?.value.includes('可輸入')");await js("document.activeElement.blur();$('undo').click()");assert.equal(await js('slide().texts[0].value'),'拖曳文字 Drag');
   const otherFrom=await point(),scale=await js("(()=>{const r=$('preview').getBoundingClientRect();return {w:r.width,h:r.height};})()");
   const otherTo={x:otherFrom.x+.5*scale.w,y:otherFrom.y+.35*scale.h};await mouse('mouseDown',otherFrom);await mouse('mouseMove',otherTo);await wait("!$('text-guides').hidden");await mouse('mouseUp',otherTo);assert.ok(Math.abs(await js('slide().texts[0].x')-.6)<1e-6);assert.ok(Math.abs(await js('slide().texts[0].y')-.6)<1e-6);await js("$('undo').click()");
   const snap=await js("(()=>{const r=$('preview').getBoundingClientRect(),b=textBounds($('preview'),slide().texts[0]);return {x:.5-Math.max(b.width/1280,40/r.width)/2,y:.5-Math.max(b.height/720,40/r.height)/2,w:r.width,h:r.height};})()");
   const from=await point(),to={x:from.x+(snap.x-.1)*snap.w+2,y:from.y+(snap.y-.25)*snap.h+2};await mouse('mouseDown',from);await mouse('mouseMove',to);await wait("!$('text-guides').hidden&&!guideLines.x.hidden&&!guideLines.y.hidden");
   assert.equal(await js("$('text-guides').hidden"),false);assert.equal(await js('guideLines.x.hidden'),false);assert.equal(await js('guideLines.y.hidden'),false);assert.equal(await js('guideLines.x.style.left'),'50%');assert.equal(await js('guideLines.y.style.top'),'50%');
   assert.equal(await js("(()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const s=structuredClone(slide());s.texts[0]=dragPosition(drag.latest).text;drawSlide(c,image,s);return c.toDataURL()===$('preview').toDataURL();})()"),true,'參考線不能畫進影片影格');
   await mouse('mouseUp',to);assert.ok(Math.abs(await js('slide().texts[0].x')-snap.x)<1e-6);assert.ok(Math.abs(await js('slide().texts[0].y')-snap.y)<1e-6);assert.equal(await js("$('text-guides').hidden"),true);
   await js("$('undo').click();flushSave()");assert.equal(await js('history.canRedoText(slide().asset)'),true);
   const loaded=new Promise(r=>win.webContents.once('did-finish-load',r));win.reload();await loaded;await wait('!restoring&&!busy&&image');assert.equal(await js('history.canRedoText(slide().asset)'),true);await js("$('redo').click()");assert.ok(Math.abs(await js('slide().texts[0].x')-snap.x)<1e-6);await js("$('undo').click();toolbarPosition={x:8,y:8};placeToolbar()");
   const before=await js('JSON.stringify(slide().texts)'),cancelFrom=await point();await mouse('mouseDown',cancelFrom);await mouse('mouseMove',{x:cancelFrom.x+25,y:cancelFrom.y+25});win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay();await mouse('mouseUp',{x:cancelFrom.x+25,y:cancelFrom.y+25});assert.equal(await js('JSON.stringify(slide().texts)'),before);assert.equal(await js("$('text-guides').hidden"),true);
   await js("editText(p=>p.slides[0].texts=p.slides[0].texts.slice(0,1));$('delete-text').click()");assert.equal(await js('slide().texts.length'),0);assert.equal(await js("$('text-toolbar').hidden"),false);assert.equal(await js("$('delete-text').disabled"),true);await js("$('undo').click()");assert.equal(await js('slide().texts.length'),1);await js("$('redo').click()");assert.equal(await js('slide().texts.length'),0);
   assert.equal(await js("document.querySelector('.text-delete,.text-handle')"),null);assert.match(await js("$('text-toolbar').textContent"),/上一步.*下一步.*刪除/s);
   const evidence={testedAt:new Date().toISOString(),platform:'darwin',...perf,directTextDrag:true,releaseOutsideBoxCommits:true,crosshairDuringDrag:true,doubleClickAndType:true,jitterDoesNotMove:true,centerSnapBothAxes:true,otherTextSnapBothAxes:true,guidesNotInVideoPixels:true,cancelPreservesText:true,singleStepUndoRedo:true,redoRestoredAfterReload:true,toolbarDelete:true,lastTextUndoRedo:true,windowsExecuted:false};
   await fs.writeFile(path.join(__dirname,'../docs/test-results/text-drag.json'),JSON.stringify(evidence,null,2)+'\n');console.log('TEXT_DRAG_PASS',evidence);
   app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
  }catch(e){console.error(e);app.exit(1);}
 }));require('../src/main.cjs');
})();
