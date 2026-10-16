require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-projects-'));app.setPath('userData',path.join(dir,'state'));
 const source=path.join(__dirname,'fixtures/earth.jpg'),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),original=hash(await fs.readFile(source));
 const fileA=path.join(dir,'專案 A.celebration'),fileB=path.join(dir,'專案 B.celebration'),fileC=path.join(dir,'專案 C.celebration');let destination=fileA,openFile=null,saveDialogs=0,answers=[];
 dialog.showOpenDialog=async(_w,options)=>options.title==='開啟專案'?{canceled:!openFile,filePaths:openFile?[openFile]:[]}:{canceled:false,filePaths:options.filters[0].extensions.includes('mp3')?[path.join(__dirname,'fixtures/tone.wav')]:[source,path.join(__dirname,'fixtures/exif-rotated.jpg')]};
 dialog.showSaveDialog=async()=>{saveDialogs++;return {canceled:!destination,filePath:destination};};
 dialog.showMessageBox=async()=>{assert.ok(answers.length,'unexpected unsaved-project prompt');return {response:answers.shift()};};
 app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
  const js=code=>win.webContents.executeJavaScript(code),delay=()=>new Promise(r=>setTimeout(r,60));
  const wait=async code=>{for(let i=0;i<300;i++){if(await js(code))return;await delay();}throw Error('timeout '+code+' '+await js("$('status').textContent"));};
  const command=async action=>{win.webContents.send('project-command',action);await delay();await wait('!busy&&!projectTask');};
  const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
  try{
   await wait('!restoring&&!busy');assert.match(win.getTitle(),/^照片MV — /);await js("$('import').click()");await wait('history.value.slides.length===2&&image');await js("$('music').click()");await wait('!!history.value.music');
   await js("$('resolution').value='720p';$('resolution').dispatchEvent(new Event('change'));$('add-text').click()");win.focus();win.webContents.focus();await win.webContents.insertText('專案 A 中文 Text');await js("document.activeElement.blur();$('size').value='24';$('size').dispatchEvent(new Event('change'));changeRange(.5,4.5)");
   await command('save');assert.equal(saveDialogs,1);const savedA=await read(fileA);assert.equal(savedA.state.project.slides[0].texts[0].value,'專案 A 中文 Text');assert.equal(savedA.assets.length,3);assert.match(win.getTitle(),/專案 A/);
   await command('new');assert.equal(await js('history.value.slides.length'),0);assert.equal(await js('history.value.resolution'),'4K');assert.equal(await js('history.value.music'),null);
   await js("$('import').click()");await wait('history.value.slides.length===2');destination=fileB;await command('save');assert.equal(saveDialogs,2);
   await js("$('duration').value='7';$('duration').dispatchEvent(new Event('change'));flushSave()");answers.push(2);await command('new');assert.equal(await js('history.value.slides[0].duration'),7);
   answers.push(0);await command('new');assert.equal(saveDialogs,2);assert.equal((await read(fileB)).state.project.slides[0].duration,7);assert.equal(await js('history.value.slides.length'),0);
   openFile=fileA;await command('open');assert.deepEqual(await js('history.value'),savedA.state.project);assert.deepEqual(await js('history.snapshot().textUndo'),savedA.state.textUndo);assert.match(await js('window.desktop.readAsset(history.value.slides[0].asset)'),/^data:image\/jpeg;base64,/);
   await js("$('duration').value='4';$('duration').dispatchEvent(new Event('change'))");await command('save');assert.equal(saveDialogs,2);assert.equal((await read(fileA)).state.project.slides[0].duration,4);
   const before=await js('JSON.stringify(history.value)');openFile=null;await command('open');assert.equal(await js('JSON.stringify(history.value)'),before);
   openFile=path.join(dir,'bad.celebration');await fs.writeFile(openFile,'{"format":1}');await command('open');assert.equal(await js('JSON.stringify(history.value)'),before);assert.match(await js("$('status').textContent"),/專案操作失敗/);
   await command('new');await js("$('import').click()");await wait('history.value.slides.length===2');destination=null;answers.push(0);await command('new');assert.equal(await js('history.value.slides.length'),2);destination=source;await command('save');assert.match(await js("$('status').textContent"),/不能覆寫/);assert.equal(hash(await fs.readFile(source)),original);
   destination=fileC;await command('save');assert.equal((await read(fileC)).state.project.slides.length,2);
   await js("$('duration').value='2';$('duration').dispatchEvent(new Event('change'));flushSave()");answers.push(1);openFile=fileA;await command('open');assert.equal((await read(fileC)).state.project.slides[0].duration,3);assert.equal(await js('history.value.slides[0].duration'),4);
   const recovery=await read(path.join(dir,'state/current-project.json'));assert.equal(recovery.projectFile,fileA);assert.equal(recovery.projectDirty,false);assert.equal(answers.length,0);
   const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await loaded;await wait('!restoring&&!busy');assert.equal(await js('history.value.slides[0].duration'),4);assert.match(win.getTitle(),/專案 A/);
   const originalA=await fs.readFile(fileA),copy=path.join(dir,'專案副本.celebration');destination=copy;await command('save-as');assert.deepEqual((await read(copy)).state.project,(await read(fileA)).state.project);assert.deepEqual(await fs.readFile(fileA),originalA);assert.match(win.getTitle(),/專案副本/);
   await js("$('duration').value='6';$('duration').dispatchEvent(new Event('change'))");await command('save');assert.equal((await read(copy)).state.project.slides[0].duration,6);assert.deepEqual(await fs.readFile(fileA),originalA);
   destination=null;await command('save-as');assert.match(win.getTitle(),/專案副本/);assert.equal((await read(path.join(dir,'state/current-project.json'))).projectFile,copy);
   const copyBytes=await fs.readFile(copy);destination=copy;await command('save-as');assert.match(await js("$('status').textContent"),/不同檔案/);assert.deepEqual(await fs.readFile(copy),copyBytes);
   const alias=path.join(dir,'副本別名.celebration');await fs.link(copy,alias);destination=alias;await command('save-as');assert.match(await js("$('status').textContent"),/不同檔案/);assert.deepEqual(await fs.readFile(copy),copyBytes);
   destination=source;await command('save-as');assert.match(await js("$('status').textContent"),/不能覆寫/);assert.equal(hash(await fs.readFile(source)),original);assert.match(win.getTitle(),/專案副本/);
   openFile=fileA;await command('open');assert.equal(await js('history.value.slides[0].duration'),4);
   await js("removePhotos(new Set(history.value.slides.map(s=>s.asset)));$('remove-music').click()");answers.push(2);await command('new');assert.match(win.getTitle(),/專案 A/);assert.equal(answers.length,0);answers.push(0);await command('new');assert.equal((await read(fileA)).state.project.slides.length,0);assert.equal((await read(fileA)).state.project.music,null);
   console.log('PROJECTS_PASS: 新建、命名儲存、重複儲存、開啟、文字復原／媒體還原、未儲存取消／先儲存／捨棄、刪空後保護、壞檔保留、來源保護、另存副本／取消／原檔保留與重載');
   app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.quit();
  }catch(e){console.error(e);app.exit(1);}
 });});require('../src/main.cjs');
})();
