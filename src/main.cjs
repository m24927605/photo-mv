const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { validate, trimProject, totalDuration } = require('./model.js');
const { createStore } = require('./project-store.cjs');
const {makeDocument,readDocument}=require('./project-document.cjs');
const {createProjects,protectSources}=require('./projects.cjs');
const { createJob } = require('./export.cjs');
const { createWaveform, renderMusicRange } = require('./audio.cjs');
const waveTasks = new Map();
const entry = pathToFileURL(path.join(__dirname, 'index.html')).href;
if(!app.requestSingleInstanceLock()){app.quit();return;}
const {installMediaProtocol}=require('./media-protocol.cjs');
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
const assets = new Map();
let store, projects, recovery=null, restored=null, restoreError='', crashed=false;
let win, job, cropTask, busy = false, closing = false;
function trusted(e) { if (e.senderFrame !== win.webContents.mainFrame || e.senderFrame.url !== entry) throw Error('拒絕未授權來源'); }
function handle(name, fn) { ipcMain.handle(name, async (e, ...args) => { trusted(e); return fn(...args); }); }
handle('restore',()=>({snapshot:restored,error:restoreError}));
handle('save',async snapshot=>{
  if(restoreError)throw Error(restoreError);
  await store.save({...makeDocument(snapshot,assets),...projects.metadata()});
  restored=snapshot;return true;
});
handle('project-menu',()=>projects.showMenu());
handle('save-project',(snapshot,saveAs=false)=>{if(busy)throw Error('請等待目前處理完成');if(typeof saveAs!=='boolean')throw Error('儲存模式不合法');return projects.save(snapshot,saveAs);});
handle('new-project',snapshot=>{if(busy)throw Error('請等待目前處理完成');return projects.newProject(snapshot);});
handle('open-project',snapshot=>{if(busy)throw Error('請等待目前處理完成');return projects.open(snapshot);});

async function cancelCrop(){const task=cropTask;if(task){task.controller.abort();await task.pending.catch(()=>{});}}
handle('close-ready',async()=>{if(job)await job.cancel();await cancelCrop();closing=true;win.destroy();});
handle('import', async kind => {
  if (busy || !['photo', 'music'].includes(kind)) throw Error('無法匯入');
  const extensions = kind === 'photo' ? ['jpg', 'jpeg', 'png', 'webp'] : ['mp3', 'wav', 'm4a'];
  const result = await dialog.showOpenDialog(win, { properties: kind === 'photo' ? ['openFile', 'multiSelections'] : ['openFile'], filters: [{ name: kind === 'photo' ? '照片' : '音樂', extensions }] });
  const imported = [];
  for (const file of result.filePaths) {
    const stat = await fs.stat(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!stat.isFile() || stat.size > 100 * 1024 * 1024 || !extensions.includes(ext)) throw Error('格式不支援或檔案超過 100 MiB');
    imported.push({ id: randomUUID(), name: path.basename(file), file, kind, ext });
  }
  for (const asset of imported) assets.set(asset.id, asset);
  return imported.map(({ id, name }) => ({ id, name }));
});
handle('audio-source',id=>{if(assets.get(id)?.kind!=='music')throw Error('找不到音樂');return `celebration-asset://local/${id}`;});
handle('read', async id => {
  const asset = assets.get(id);
  if (!asset) throw Error('找不到匯入資產');
  const data = await fs.readFile(asset.file);
  if (data.length > 100 * 1024 * 1024) throw Error('檔案超過 100 MiB');
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' }[asset.ext];
  return `data:${mime};base64,${data.toString('base64')}`;
});
async function wave(kind, id, project) {
  const asset=assets.get(id);
  if(!asset || asset.kind !== 'music') throw Error('找不到音樂');
  waveTasks.get(kind)?.abort();
  const controller=new AbortController(); waveTasks.set(kind,controller);
  try {return await createWaveform(asset.file,project?.musicEdit,project?validate(project)/30:undefined,controller.signal);}
  catch(e){if(e.name==='AbortError')return null;throw e;}
  finally {if(waveTasks.get(kind)===controller) waveTasks.delete(kind);}
}
handle('source-wave', id => wave('source',id));
handle('track-wave', project => {validate(project);return wave('track',project.music,project);});
app.on('before-quit',()=>{cropTask?.controller.abort();for(const controller of waveTasks.values())controller.abort();});
handle('crop',async(project,start,end)=>{
  if(busy)throw Error('已有處理中的工作');
  const next=trimProject(project,start,end);
  if(project.slides.some(s=>assets.get(s.asset)?.kind!=='photo')||(project.music&&assets.get(project.music)?.kind!=='music'))throw Error('無效的匯入資產');
  busy=true;const controller=new AbortController(),created=[];
  const pending=(async()=>{
    const directory=path.join(app.getPath('userData'),'media');await fs.mkdir(directory,{recursive:true});
    if(project.music){
      const id=randomUUID(),file=path.join(directory,id+'.wav');created.push(file);
      await renderMusicRange(assets.get(project.music).file,project.musicEdit,totalDuration(project),start,end,file,controller.signal);
      next.music=id;next.musicName=project.musicName;
      assets.set(id,{id,name:next.musicName,file,kind:'music',ext:'wav'});
    }
    if(controller.signal.aborted)throw Error('剪裁已取消');validate(next);return next;
  })().catch(async e=>{for(const file of created){await fs.rm(file,{force:true});for(const [id,a] of assets)if(a.file===file)assets.delete(id);}throw e;});
  cropTask={controller,pending};
  try{return await pending;}finally{cropTask=null;busy=false;}
});
handle('begin', async project => {
  if (busy) throw Error('已有輸出工作');
  validate(project);
  if (project.slides.some(s => assets.get(s.asset)?.kind !== 'photo') || (project.music && assets.get(project.music)?.kind !== 'music')) throw Error('無效的匯入資產');
  busy = true;
  try {
    const result = await dialog.showSaveDialog(win, { defaultPath: `celebration.${project.lossless ? 'mov' : 'mp4'}`, filters: [{ name: '影片', extensions: [project.lossless ? 'mov' : 'mp4'] }] });
    if (result.canceled || !result.filePath) { busy = false; return false; }
    const target = path.resolve(result.filePath);
    await protectSources(target,assets);
    job = await createJob(project, target, assets.get(project.music)?.file, value => win.webContents.send('progress', value));
    return true;
  } catch (e) { busy = false; throw e; }
});
handle('frame', async (index, bytes) => { if (!job) throw Error('沒有輸出工作'); await job.add(index, bytes); });
handle('finish', async () => { if (!job) throw Error('沒有輸出工作'); try { await job.finish(); } finally { job = null; busy = false; } });
handle('cancel', async () => { if (job) await job.cancel();await cancelCrop(); job = null; busy = false; });
ipcMain.on('dirty', (e, value) => { trusted(e); projects.markDirty(value === true); });
app.whenReady().then(async () => {
  installMediaProtocol(assets);
  if(process.platform==='darwin')app.dock.setIcon(path.join(__dirname,'assets/icon.png'));
  store=createStore(app.getPath('userData'));
  try{
    const saved=await store.load();
    if(saved){const doc=readDocument(saved);for(const [id,a] of doc.assets)assets.set(id,a);restored=doc.snapshot;recovery=saved;}
  }catch(e){restoreError=`無法讀取自動儲存檔，已保留原檔：${e.message}`;}

  win = new BrowserWindow({ icon:path.join(__dirname,process.platform==='win32'?'assets/icon.ico':'assets/icon.png'), width: 1380, height: 900, minWidth: 1000, minHeight: 720, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  projects=createProjects(win,assets,recovery,async()=>{
    for(const controller of waveTasks.values())controller.abort();waveTasks.clear();
    if(restoreError){await fs.rename(store.file,`${store.file}.damaged-${Date.now()}`);restoreError='';}
    restored=null;
  });
  win.on('page-title-updated',e=>e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('render-process-gone',()=>{crashed=true;});
  win.on('close',e=>{
    if(closing)return;
    e.preventDefault();
    if(busy){const answer=dialog.showMessageBoxSync(win,{type:'warning',buttons:['繼續處理','取消處理並離開'],defaultId:0,cancelId:0,message:'處理尚未完成。'});if(answer===0)return;}
    if(crashed){closing=true;Promise.all([job?.cancel(),cancelCrop()]).finally(()=>win.destroy());return;}
    win.webContents.send('close-request');
  });
  win.loadURL(entry);
});
app.on('window-all-closed', () => app.quit());
