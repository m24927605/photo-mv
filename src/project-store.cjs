const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
function createStore(directory,filename='current-project.json'){
  const file=path.join(directory,filename);let next=null,worker=null;
  async function load(){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  function save(value){
    next=value;
    if(!worker)worker=(async()=>{
      await fs.mkdir(directory,{recursive:true});
      while(next){const value=next;next=null;const temporary=`${file}.${randomUUID()}.tmp`;let handle;
        try{handle=await fs.open(temporary,'w',0o600);await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=null;await fs.rename(temporary,file);}
        finally{if(handle)await handle.close();await fs.rm(temporary,{force:true});}
      }
    })().finally(()=>{worker=null;});
    return worker;
  }
  return {load,save,file};
}
module.exports={createStore};
