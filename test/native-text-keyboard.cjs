require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photo-mv-native-text-key-'));app.setPath('userData',dir);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(__dirname,'fixtures/earth.jpg')]});
 app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{
  const js=s=>win.webContents.executeJavaScript(s),delay=()=>new Promise(r=>setTimeout(r,100));
  try{
   while(await js('restoring||busy'))await delay();await js("$('import').click()");while(!await js('slide()&&image'))await delay();await js("editText(p=>p.slides[0].texts=[{value:'選取框後按 Delete',font:fonts[0],color:'#ffffff',size:.08,x:.1,y:.25,bold:false,italic:false,underline:false}]);textIndex=-1;textToolsVisible=false;toolbarPosition={x:8,y:8};refresh();window.testKeys=[];window.addEventListener('keyup',e=>testKeys.push({key:e.key,meta:e.metaKey,ctrl:e.ctrlKey}))");
   win.setTitle('照片MV — 鍵盤刪除實測');win.show();win.focus();console.log('NATIVE_KEYBOARD_READY');app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));let previous='';
   while(!win.isDestroyed()){
    const state=await js("({texts:snapshot().state.project.slides[0].texts,photoCount:history.value.slides.length,editing:document.activeElement.isContentEditable,canUndo:history.canUndoText(slide().asset),canRedo:history.canRedoText(slide().asset),keys:testKeys})");const key=JSON.stringify(state);if(key!==previous){previous=key;await fs.writeFile(path.join(__dirname,'../docs/test-results/native-text-keyboard.json'),JSON.stringify({testedAt:new Date().toISOString(),...state},null,2)+'\n');console.log('NATIVE_KEYBOARD_STATE',JSON.stringify(state));}await delay();
   }
  }catch(e){if(!win.isDestroyed()){console.error(e);app.exit(1);}}
 }));require('../src/main.cjs');
})();
