const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const directory=path.join(__dirname,'../src/assets'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'celebration-icons-'));
app.setPath('userData',path.join(temporary,'state'));app.commandLine.appendSwitch('force-device-scale-factor','1');
app.whenReady().then(async()=>{
 try{
  const win=new BrowserWindow({width:1024,height:1024,show:false,frame:false,transparent:true,backgroundColor:'#00000000',webPreferences:{offscreen:true}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>html,body{margin:0;width:1024px;height:1024px;background:transparent}</style>'+fs.readFileSync(path.join(directory,'icon.svg'),'utf8')));
  const master=(await win.webContents.capturePage()).resize({width:1024,height:1024});fs.writeFileSync(path.join(directory,'icon.png'),master.toPNG());
  const sizes=[16,24,32,48,64,128,256],images=sizes.map(size=>master.resize({width:size,height:size}).toPNG());
  const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
  sizes.forEach((size,i)=>{const entry=6+i*16;header[entry]=header[entry+1]=size===256?0:size;header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(images[i].length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=images[i].length;});
  fs.writeFileSync(path.join(directory,'icon.ico'),Buffer.concat([header,...images]));
  if(process.platform==='darwin'){
   const iconset=path.join(temporary,'icon.iconset');fs.mkdirSync(iconset);
   for(const size of [16,32,128,256,512])for(const scale of [1,2])fs.writeFileSync(path.join(iconset,`icon_${size}x${size}${scale===2?'@2x':''}.png`),master.resize({width:size*scale,height:size*scale}).toPNG());
   execFileSync('iconutil',['-c','icns',iconset,'-o',path.join(directory,'icon.icns')]);
  }
  if(nativeImage.createFromPath(path.join(directory,'icon.png')).isEmpty())throw Error('Icon render failed');
  console.log('ICONS_BUILT: PNG 1024px, ICO 16–256px, ICNS on macOS');
  app.once('quit',()=>fs.rmSync(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:100}));app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
