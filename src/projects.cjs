const {dialog,Menu}=require('electron');const fs=require('node:fs/promises'),path=require('node:path');
const {createStore}=require('./project-store.cjs');const {makeDocument,readDocument}=require('./project-document.cjs');
async function protectSources(target,assets){
  const existing=await fs.stat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  for(const a of assets.values()){
    if(path.resolve(a.file)===target)throw Error('不能覆寫匯入來源');
    const source=await fs.stat(a.file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(existing&&source&&existing.dev===source.dev&&existing.ino===source.ino)throw Error('不能覆寫匯入來源');
  }
}
function createProjects(win,assets,recovery,onReset){
  let file=typeof recovery?.projectFile==='string'?recovery.projectFile:null,dirty=recovery?.projectDirty===true;
  const title=()=>win.setTitle(`照片MV — ${file?path.basename(file):'未命名'}`);title();
  async function save(snapshot,saveAs=false){
    const doc=makeDocument(snapshot,assets);let destination=file;
    if(saveAs||!destination){const picked=await dialog.showSaveDialog(win,{title:saveAs?'另存專案':'儲存專案',defaultPath:saveAs&&file?path.join(path.dirname(file),`${path.parse(file).name} 副本.celebration`):'未命名.celebration',filters:[{name:'照片MV 專案',extensions:['celebration']}]});if(picked.canceled||!picked.filePath)return false;destination=path.resolve(picked.filePath);}
    if(saveAs&&file){
      const current=await fs.stat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      const target=await fs.stat(destination).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      if(destination===file||(current&&target&&current.dev===target.dev&&current.ino===target.ino))throw Error('另存專案請選擇不同檔案');
    }
    await protectSources(destination,assets);await createStore(path.dirname(destination),path.basename(destination)).save(doc);
    file=destination;dirty=false;title();return true;
  }
  async function leave(snapshot){
    const p=snapshot.state.project;if((!file&&!p.slides.length&&!p.music)||(file&&!dirty))return true;
    const {response}=await dialog.showMessageBox(win,{type:'question',buttons:['儲存','不儲存','取消'],defaultId:0,cancelId:2,message:file?'是否將最新變更儲存到專案檔？':'是否先儲存成專案檔？',detail:'切換後會以新專案取代目前的編輯內容。'});
    return response===1||(response===0&&await save(snapshot));
  }
  async function replace(doc,nextFile){
    await onReset();assets.clear();if(doc)for(const [id,a] of doc.assets)assets.set(id,a);file=nextFile;dirty=false;title();
  }
  async function newProject(snapshot){if(!await leave(snapshot))return false;await replace(null,null);return true;}
  async function open(snapshot){
    const picked=await dialog.showOpenDialog(win,{title:'開啟專案',properties:['openFile'],filters:[{name:'照片MV 專案',extensions:['celebration']}]});
    if(picked.canceled||!picked.filePaths.length)return null;
    if(!await leave(snapshot))return null;
    const nextFile=path.resolve(picked.filePaths[0]),doc=readDocument(JSON.parse(await fs.readFile(nextFile,'utf8')));await replace(doc,nextFile);return doc.snapshot;
  }
  const items=()=>[
    {label:'新專案',accelerator:'CmdOrCtrl+N',click:()=>win.webContents.send('project-command','new')},
    {label:'開啟專案…',accelerator:'CmdOrCtrl+O',click:()=>win.webContents.send('project-command','open')},
    {label:'儲存專案',accelerator:'CmdOrCtrl+S',click:()=>win.webContents.send('project-command','save')},
    {label:'另存專案…',accelerator:'CmdOrCtrl+Shift+S',click:()=>win.webContents.send('project-command','save-as')}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate([...(process.platform==='darwin'?[{label:'照片MV',role:'appMenu'}]:[]),{label:'專案',submenu:[...items(),{type:'separator'},{role:'close'}]},{role:'editMenu',label:'編輯'},{role:'viewMenu',label:'檢視'},{role:'windowMenu',label:'視窗'}]));
  return {save,open,newProject,markDirty(value){dirty=value;},metadata(){return {projectFile:file,projectDirty:dirty};},showMenu(){Menu.buildFromTemplate(items()).popup({window:win});}};
}
module.exports={createProjects,protectSources};
