require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../範例素材'),photos=path.join(root,'照片'),song=path.join(root,'音樂/00_卡農_鋼琴版_LeeGalloway.wav');
let target=path.join(root,'卡農範例專案.celebration');if(fsSync.existsSync(target))target=path.join(root,`卡農範例專案-${Date.now()}.celebration`);
const dir=fsSync.mkdtempSync(path.join(os.tmpdir(),'celebration-project-native-'));fsSync.mkdirSync(path.join(dir,'state'));app.setPath('userData',path.join(dir,'state'));
const actualOpen=dialog.showOpenDialog.bind(dialog),actualSave=dialog.showSaveDialog.bind(dialog);
dialog.showOpenDialog=(win,options)=>actualOpen(win,{...options,defaultPath:options.title==='開啟專案'?target:options.filters[0].extensions.includes('mp3')?song:photos});
dialog.showSaveDialog=(win,options)=>actualSave(win,{...options,defaultPath:target});
app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
 const js=code=>win.webContents.executeJavaScript(code),delay=()=>new Promise(r=>setTimeout(r,150));
 const wait=async code=>{const deadline=Date.now()+600000;while(Date.now()<deadline){if(await js(code))return;await delay();}throw Error('native project timeout '+code);};
 try{
  await wait('!restoring&&!busy');await js("$('import').click()");console.log('NATIVE_PHOTOS_DIALOG');await wait('history.value.slides.length===3&&image');
  await js("$('music').click()");console.log('NATIVE_CANON_DIALOG');await wait('!!history.value.music');assert.ok(Math.abs(await js('history.value.musicEdit.duration')-171.075918)<.01);
  await js("$('add-text').click()");win.focus();win.webContents.focus();await win.webContents.insertText('卡農・美好回憶');await js("document.activeElement.blur();$('size').value='96';$('size').dispatchEvent(new Event('change'))");
  console.log('NATIVE_READY_FOR_SAVE',target);
  await wait("!busy&&!projectTask&&$('status').textContent==='專案已儲存。'");assert.equal((JSON.parse(await fs.readFile(target,'utf8'))).state.project.slides.length,3);
  win.webContents.send('project-command','new');await delay();await wait('!busy&&!projectTask&&history.value.slides.length===0');assert.equal(await js('history.value.resolution'),'4K');
  win.webContents.send('project-command','open');console.log('NATIVE_PROJECT_OPEN_DIALOG');await delay();await wait('!busy&&!projectTask&&history.value.slides.length===3');assert.equal(await js('history.value.slides[0].texts[0].value'),'卡農・美好回憶');assert.equal(await js('Model.totalDuration(history.value)'),9);
  await wait("!$('project-waveform').hidden");const evidence=path.join(__dirname,'../docs/test-results');await fs.writeFile(path.join(evidence,'native-project.json'),JSON.stringify({testedAt:new Date().toISOString(),platform:'darwin',projectFile:target,realPhotoDialog:true,realMusicDialog:true,canonDurationSeconds:await js('history.value.musicEdit.duration'),realSaveDialog:true,newProjectCleared:true,realOpenDialog:true,restoredPhotos:3,restoredCaption:true,projectResolution:'4K',sourceSelectionNotStubbed:true,windowsExecuted:false},null,2)+'\n');
  await fs.writeFile(path.join(evidence,'native-project.png'),(await win.webContents.capturePage()).toPNG());console.log('NATIVE_PROJECT_PASS');app.once('quit',()=>fsSync.rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
 }catch(e){console.error(e);app.exit(1);}
});});require('../src/main.cjs');
