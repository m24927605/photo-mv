require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const dataDir=process.argv[2],stage=process.argv[3];fs.mkdirSync(dataDir,{recursive:true});app.setPath('userData',dataDir);
const fixtures=path.join(__dirname,'fixtures');
dialog.showOpenDialog=async(_win,options)=>({canceled:false,filePaths:options.filters[0].extensions.includes('mp3')?[path.join(fixtures,'tone.wav')]:[path.join(fixtures,'earth.jpg'),path.join(fixtures,'exif-rotated.jpg')]});
app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
  const js=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<200;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+code);};
  try{
    await wait('!restoring && !busy');
    if(stage==='write'){
      await js("$('import').click()");await wait('history.value.slides.length===2');
      await js("$('music').click()");await wait('history.value.music !== null');
      await js("$('slides').children[0].querySelector('.select-slide').click();$('duration').value='4.2';$('duration').dispatchEvent(new Event('change'));$('resolution').value='720p';$('resolution').dispatchEvent(new Event('change'));$('add-text').click();toolbarPosition={x:80,y:120};history.edit(p=>{p.musicEdit.start=.1;p.musicEdit.end=.4;p.musicEdit.volume=.6;p.musicEdit.fadeIn=.2;p.musicEdit.fadeOut=.2;})");
      win.focus();win.webContents.focus();await win.webContents.insertText('未離開文字框的中文 Crash recovery');
      await wait("editing?.value.includes('Crash recovery')");
      await wait("$('save-status').textContent==='已儲存'");
      console.log('READY_KILL');
    }else{
      const saved=JSON.parse(fs.readFileSync(path.join(dataDir,'current-project.json'),'utf8'));
      assert.deepEqual(await js('history.snapshot()'),saved.state);
      assert.equal(await js('history.canUndoText(history.value.slides[0].asset)'),true);
      assert.deepEqual(await js('toolbarPosition'),saved.ui.toolbarPosition);
      const state=await js('history.value');
      if(state.slides.length!==2||state.slides[0].duration!==4.2||state.resolution!=='720p'||!state.music||state.slides[0].texts[0].value.indexOf('Crash recovery')<0)throw Error('state not restored');
      const bytes=await js('window.desktop.readAsset(history.value.slides[0].asset)');if(!bytes.startsWith('data:image/jpeg;base64,'))throw Error('asset registry not restored');
      if(stage==='restore-close'){
        await js("$('text-layer').children[0].querySelector('.text-edit').focus()");win.focus();win.webContents.focus();await win.webContents.insertText('正常關閉也保留');
        win.close();
      }else{if(!state.slides[0].texts[0].value.includes('正常關閉也保留'))throw Error('close did not flush latest typing');console.log('RESTORE_PASS');app.exit(0);}
    }
  }catch(e){console.error(e);app.exit(1);}
});});
require('../src/main.cjs');
