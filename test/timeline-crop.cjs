require('../src/media-protocol.cjs');
const {app,dialog}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const exec=require('node:util').promisify(require('node:child_process').execFile);
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-crop-'));app.setPath('userData',path.join(dir,'state'));
 const song=path.join(dir,'song.wav');await exec(require('ffmpeg-static'),['-v','error','-f','lavfi','-i','sine=frequency=440:duration=8',song]);
 dialog.showOpenDialog=async(_w,options)=>({canceled:false,filePaths:options.filters[0].extensions.includes('mp3')?[song]:[path.join(__dirname,'fixtures/earth.jpg'),path.join(__dirname,'fixtures/exif-rotated.jpg')]});
 const output=path.join(dir,'crop.mp4');dialog.showSaveDialog=async()=>({canceled:false,filePath:output});
 app.on('browser-window-created',(_e,win)=>{win.webContents.once('did-finish-load',async()=>{
  const js=code=>win.webContents.executeJavaScript(code),delay=()=>new Promise(r=>setTimeout(r,60));
  const wait=async code=>{for(let i=0;i<400;i++){if(await js(code))return;await delay();}throw Error('timeout '+code+' '+await js("$('status').textContent"));};
  async function rangeDrag(id,fraction,ySelector='timeline-ruler'){
   win.focus();win.webContents.focus();
   const c=await js(`(()=>{const r=$('${id}').getBoundingClientRect(),t=$('timeline-content').getBoundingClientRect(),y=$('${ySelector}').getBoundingClientRect();return {x:Math.round(r.left+r.width/2+1),y:Math.round(y.top+10),end:Math.round(t.left+t.width*${fraction})};})()`);
   win.webContents.sendInputEvent({type:'mouseMove',x:c.x,y:c.y});await delay();
   win.webContents.sendInputEvent({type:'mouseDown',x:c.x,y:c.y,button:'left',clickCount:1});await delay();win.webContents.sendInputEvent({type:'mouseMove',x:c.end,y:c.y,button:'left',modifiers:['leftButtonDown']});await delay();win.webContents.sendInputEvent({type:'mouseUp',x:c.end,y:c.y,button:'left',clickCount:1});await delay();
  }
  try{
   await wait('!restoring&&!busy');await js("$('import').click()");await wait('history.value.slides.length===2&&image');await js("$('music').click()");await wait('!!history.value.music');
   for(const id of ['edit-music','range-start','range-end','mark-start','mark-end','keep-range'])assert.equal(await js(`!!$('${id}')`),false);
   await js("$('music-heading').click()");assert.equal(await js("$('music-editor').hidden"),false);await js("$('close-music').click()");
   const original=await js('history.value.slides.map(s=>s.asset)');
   const bounds=await js("(()=>{const a=$('range-left').getBoundingClientRect(),b=$('music-track').getBoundingClientRect();return {bottom:a.bottom,musicBottom:b.bottom,height:a.height};})()");assert.ok(bounds.bottom>=bounds.musicBottom);assert.ok(bounds.height>150);
   await rangeDrag('range-left',1/6);await rangeDrag('range-right',5/6);assert.deepEqual(await js('history.value.selection'),{start:1,end:5});assert.equal(await js("!!$('timeline-warning')"),false);
   assert.deepEqual(await js('history.value.slides.map(s=>s.duration)'),[3,3]);assert.deepEqual(await js('history.value.slides.map(s=>s.asset)'),original);assert.match(await js("$('time').textContent"),/影片總長 4.0 秒/);
   await js("seek(4.8);$('play').click()");await wait('playing');await wait('!playing');assert.equal(await js('playhead'),5);
   await rangeDrag('range-right',1,'music-track');await rangeDrag('range-left',0,'music-track');assert.deepEqual(await js('history.value.selection'),{start:0,end:6});
   await rangeDrag('range-left',1/6);await rangeDrag('range-right',5/6);
   const beforeCancel=await js('JSON.stringify(history.value)');await js("$('export').click();$('cancel').click()");await wait('!busy');assert.equal(await js('JSON.stringify(history.value)'),beforeCancel);
   await js("$('resolution').value='480p';$('resolution').dispatchEvent(new Event('change'));$('export').click()");await wait("!busy&&$('status').textContent.includes('影片輸出完成')");
   let info=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output])).stdout);assert.equal(info.streams.find(s=>s.codec_type==='video').nb_frames,'120');assert.ok(Math.abs(Number(info.streams.find(s=>s.codec_type==='audio').duration)-4)<.04);
   assert.deepEqual(await js('history.value.slides.map(s=>s.duration)'),[3,3]);assert.deepEqual(await js('history.value.selection'),{start:1,end:5});
   await js("history.edit(p=>p.slides.forEach(s=>s.duration=1));refresh();changeRange(.5,1.5);$('export').click()");await wait("!busy&&$('status').textContent.includes('影片輸出完成')");
   const pixel=path.join(dir,'pixel.rgb');await exec(require('ffmpeg-static'),['-v','error','-y','-i',output,'-vf','scale=1:1','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo',pixel]);assert.ok((await fs.readFile(pixel)).some(n=>n>5));
   assert.equal(await js('flushSave()'),true);const saved=JSON.parse(await fs.readFile(path.join(dir,'state/current-project.json'),'utf8'));for(const a of saved.assets)assert.ok((await fs.stat(a.file)).isFile());
   const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await loaded;await wait('!restoring&&!busy');assert.deepEqual(await js('Model.playbackRange(history.value)'),{start:.5,end:1.5});assert.match(await js("$('time').textContent"),/影片總長 1.0 秒/);
   const asset=saved.assets.find(a=>a.kind==='music'),bytes=await fs.readFile(asset.file),url=`celebration-asset://local/${asset.id}`,fetch=require('electron').net.fetch;
   for(const [range,start,end] of [['bytes=0-19',0,20],['bytes=10-',10,bytes.length],['bytes=-32',bytes.length-32,bytes.length]]){const response=await fetch(url,{headers:{Range:range}});assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(start,end));}
   assert.equal((await fetch(url,{headers:{Range:`bytes=${bytes.length}-`}})).status,416);assert.equal((await fetch('celebration-asset://local/unknown')).status,404);
   await wait("!$('project-waveform').hidden");
   app.once('quit',()=>{require('node:fs').rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});console.log('TIMELINE_CROP_PASS: 起始／結束軸跨照片音樂拖曳、立即生效與可拉回、範圍預覽停止、取消、範圍實際匯出、音樂不延長照片、儲存重載、原照片不變、音訊串流');});app.quit();
  }catch(e){console.error(e);app.exit(1);}
 });});require('../src/main.cjs');
})();
