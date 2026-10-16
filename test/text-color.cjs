require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-color-'));app.setPath('userData',path.join(dir,'state'));
 const output=path.join(dir,'color.mov');
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(__dirname,'fixtures/earth.jpg')]});
 dialog.showSaveDialog=async()=>({canceled:false,filePath:output});
 app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
  const js=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let n=0;n<300;n++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('timeout '+code);};
  try{
   await wait('!restoring&&!busy');await js("$('import').click()");await wait('slide()&&image');
   await js("$('add-text').click()");win.focus();win.webContents.focus();await win.webContents.insertText('顏色 Color');
   await js("document.activeElement.blur();$('color').value='#ff00ff';$('color').dispatchEvent(new Event('input'))");
   assert.equal(await js('text().color'),'#ff00ff','挑色 input 必須立即套用，不等 change');
   const count=await js("(()=>{const d=$('preview').getContext('2d').getImageData(0,0,1280,720).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]===255&&d[i+1]===0&&d[i+2]===255)n++;return n;})()");assert.ok(count>100,'預覽缺少所選顏色文字');
   await js("(()=>{const e=document.querySelector('.text-edit');e.focus();const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);})()");
   assert.equal(await js('getSelection().toString()'),'顏色 Color');
   assert.equal(await js("getComputedStyle(document.querySelector('.text-edit'),'::selection').color"),'rgb(255, 0, 255)','全選反白不可把字色強制顯示成白色');
   const rect=await js("(()=>{const r=document.querySelector('.text-edit').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)};})()");
   const selectedPixels=(await win.webContents.capturePage(rect)).toBitmap();let selectedColored=0;for(let i=0;i<selectedPixels.length;i+=4)if(selectedPixels[i]===255&&selectedPixels[i+1]===0&&selectedPixels[i+2]===255)selectedColored++;assert.ok(selectedColored>10,'全選文字的實際畫面沒有呈現所選顏色');
   await js("window.colorErrors=[];window.addEventListener('error',e=>{colorErrors.push(e.message);e.preventDefault();});$('preview').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));$('color').dispatchEvent(new Event('change'))");
   assert.deepEqual(await js('colorErrors'),[],'點影片關閉色盤後的延遲 change 不可存取已取消選取的文字');assert.equal(await js('slide().texts[0].color'),'#ff00ff');
   await js("selectTextBox(0);$('color').dispatchEvent(new Event('change'));$('undo').click()");assert.equal(await js('text().color'),'#ffffff','input + change 不可重複增加復原步驟');
   await js("$('color').value='#ff00ff';$('color').dispatchEvent(new Event('input'));flushSave()");
   const loaded=new Promise(r=>win.webContents.once('did-finish-load',r));win.reload();await loaded;await wait('!restoring&&!busy&&image');assert.equal(await js('text().color'),'#ff00ff');
   await js("$('resolution').value='480p';$('resolution').dispatchEvent(new Event('change'));$('encoding').value='lossless';$('encoding').dispatchEvent(new Event('change'));$('duration').value='.1';$('duration').dispatchEvent(new Event('change'));$('export').click()");await wait("!busy&&$('status').textContent.includes('輸出完成')");
   const rgb=execFileSync(require('ffmpeg-static'),['-v','error','-i',output,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:4*1024*1024});let colored=0;for(let i=0;i<rgb.length;i+=3)if(rgb[i]===255&&rgb[i+1]===0&&rgb[i+2]===255)colored++;assert.ok(colored>100,'實際匯出影格缺少所選文字顏色');
   await fs.writeFile(path.join(__dirname,'../docs/test-results/text-color.json'),JSON.stringify({testedAt:new Date().toISOString(),platform:'darwin',inputUpdatesBeforeChange:true,clickPreviewClosesPickerWithoutLosingColor:true,undoWithoutDuplicateStep:true,reloadRetainsColor:true,allSelectedColorPixels:selectedColored,previewExactColorPixels:count,exportExactColorPixels:colored,windowsExecuted:false},null,2)+'\n');
   console.log('TEXT_COLOR_PASS: 即時挑色、預覽像素、復原、儲存重載、實際無損影片像素');app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
  }catch(e){console.error(e);app.exit(1);}
 });});require('../src/main.cjs');
})();
