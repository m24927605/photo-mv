require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photo-mv-save-as-'));app.setPath('userData',path.join(dir,'state'));
 const original=path.join(dir,'原專案.celebration'),copy=path.join(dir,'另存副本.celebration'),actualSave=dialog.showSaveDialog.bind(dialog);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(__dirname,'fixtures/earth.jpg')]});
 dialog.showSaveDialog=(win,options)=>actualSave(win,{...options,defaultPath:options.title==='另存專案'?copy:original});
 app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{
  const js=s=>win.webContents.executeJavaScript(s),wait=async s=>{for(let n=0;n<3000;n++){if(await js(s))return;await new Promise(r=>setTimeout(r,100));}throw Error('timeout '+s);};
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  try{
   await wait('!restoring&&!busy');await js("$('import').click()");await wait('slide()&&image');await js("$('add-text').click()");win.show();win.focus();win.webContents.focus();await win.webContents.insertText('原生另存專案測試');await js('document.activeElement.blur()');
   win.webContents.send('project-command','save');console.log('NATIVE_ORIGINAL_SAVE_DIALOG');await wait("!busy&&!projectTask&&$('status').textContent==='專案已儲存。'");const before=await fs.readFile(original);
   win.webContents.send('project-command','save-as');console.log('NATIVE_SAVE_AS_DIALOG');await wait("!busy&&!projectTask&&$('status').textContent==='專案已另存。'");assert.equal(hash(await fs.readFile(original)),hash(before));assert.deepEqual(JSON.parse(await fs.readFile(copy)).state,JSON.parse(before).state);assert.match(win.getTitle(),/另存副本/);
   await js("$('duration').value='5';$('duration').dispatchEvent(new Event('change'))");win.webContents.send('project-command','save');await wait("!busy&&!projectTask&&$('status').textContent==='專案已儲存。'");assert.equal(JSON.parse(await fs.readFile(copy)).state.project.slides[0].duration,5);assert.equal(hash(await fs.readFile(original)),hash(before));
   const record={testedAt:new Date().toISOString(),platform:'darwin',nativeOriginalSaveDialog:true,nativeSaveAsDialog:true,originalSha256:hash(before),originalPreserved:true,copySelected:true,subsequentSaveUpdatesCopy:true,originalDuration:3,copyDuration:5,windowsExecuted:false};await fs.writeFile(path.join(__dirname,'../docs/test-results/native-save-as.json'),JSON.stringify(record,null,2)+'\n');await fs.writeFile(path.join(__dirname,'../docs/test-results/native-save-as.png'),(await win.webContents.capturePage()).toPNG());console.log('NATIVE_SAVE_AS_PASS');app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
  }catch(e){console.error(e);app.exit(1);}
 }));require('../src/main.cjs');
})();
