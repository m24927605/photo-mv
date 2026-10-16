require('../src/media-protocol.cjs');
const {app,dialog}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photo-mv-native-inherit-'));app.setPath('userData',dir);dialog.showOpenDialog=async()=>({canceled:false,filePaths:['earth.jpg','exif-rotated.jpg','earth.jpg'].map(n=>path.join(__dirname,'fixtures',n))});
 app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{
  const js=s=>win.webContents.executeJavaScript(s),delay=()=>new Promise(r=>setTimeout(r,100));
  try{
   while(await js('restoring||busy'))await delay();await js("$('import').click()");while(!await js('history.value.slides.length===3&&image'))await delay();await js("seek(0);editText(p=>p.slides[0].texts=[{value:'A 原文字',font:fonts[0],color:'#ffffff',size:.08,x:.1,y:.25,bold:false,italic:false,underline:false}]);history.editText(1,p=>p.slides[1].texts.push({id:'future-text',value:'後段原有文字',font:fonts[0],color:'#00ff00',size:.06,x:.1,y:.5,bold:false,italic:false,underline:false}),1);textIndex=-1;textToolsVisible=false;refresh()");
   win.setTitle('照片MV — 文字延續實測');win.show();win.focus();console.log('NATIVE_INHERITANCE_READY');app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));let previous='',steps=[];
   while(!win.isDestroyed()){
    const state=await js("({playhead,photo:selected,texts:slide().texts,blocks:Model.textBlocks(history.value),editing:!!editing})");const key=JSON.stringify(state);if(key!==previous){previous=key;steps.push(state);await fs.writeFile(path.join(__dirname,'../docs/test-results/native-text-inheritance.json'),JSON.stringify({testedAt:new Date().toISOString(),steps},null,2)+'\n');console.log('NATIVE_INHERITANCE_STATE',JSON.stringify(state));}await delay();
   }
  }catch(e){if(!win.isDestroyed()){console.error(e);app.exit(1);}}
 }));require('../src/main.cjs');
})();
