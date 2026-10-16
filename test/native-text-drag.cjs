require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photo-mv-native-drag-'));app.setPath('userData',dir);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(__dirname,'fixtures/earth.jpg')]});
 app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{
  const js=s=>win.webContents.executeJavaScript(s),delay=()=>new Promise(r=>setTimeout(r,100));
  try{
   for(let n=0;n<300&&await js('restoring||busy');n++)await delay();await js("$('import').click()");for(let n=0;n<300&&!await js('slide()&&image');n++)await delay();
   await js("editText(p=>p.slides[0].texts=[{value:'直接拖曳這段文字',font:fonts[0],color:'#ffffff',size:.07,x:.1,y:.25,bold:false,italic:false,underline:false},{value:'對齊參考',font:fonts[0],color:'#ffcc22',size:.07,x:.6,y:.65,bold:false,italic:false,underline:false}]);textIndex=0;textToolsVisible=true;toolbarPosition={x:8,y:8};refresh();window.dragEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','dragstart'])window.addEventListener(type,e=>dragEvents.push({type,x:e.clientX,y:e.clientY,buttons:e.buttons,target:e.target.className}),true)");
   win.setTitle('照片MV — 原生拖曳實測');win.show();win.focus();console.log('NATIVE_DRAG_READY');
   app.once('quit',()=>require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));
   let previous=0;
   while(!win.isDestroyed()){
    const count=await js("dragEvents.filter(e=>e.type==='pointerup'||e.type==='pointercancel').length");
    if(count>previous){previous=count;await delay();
   const result=await js("({text:slide().texts[0],events:dragEvents,guideHidden:$('text-guides').hidden,drag:drag&&{moved:drag.moved,latest:drag.latest}})");
   await fs.writeFile(path.join(__dirname,'../docs/test-results/native-text-drag.json'),JSON.stringify({testedAt:new Date().toISOString(),...result},null,2)+'\n');await fs.writeFile(path.join(__dirname,'../docs/test-results/native-text-drag.png'),(await win.webContents.capturePage()).toPNG());console.log('NATIVE_DRAG_CAPTURED',JSON.stringify(result));
    }
    await delay();
   }

  }catch(e){if(!win.isDestroyed()){console.error(e);app.exit(1);}}
 }));require('../src/main.cjs');
})();
