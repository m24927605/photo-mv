const {protocol}=require('electron');
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {Readable}=require('node:stream');
protocol.registerSchemesAsPrivileged([{scheme:'celebration-asset',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}]);
function installMediaProtocol(assets){
  protocol.handle('celebration-asset',async request=>{
    const url=new URL(request.url),asset=assets.get(url.pathname.slice(1));
    if(url.hostname!=='local'||asset?.kind!=='music')return new Response('Not found',{status:404});
    try{
      const {size}=await fs.stat(asset.file);let start=0,end=size-1,status=200;
      if(request.headers.has('range')){
        const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range'));
        if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
        if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
        else start=Math.max(0,size-Number(match[2]));
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
        status=206;
      }
      const headers={'Content-Type':{wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4'}[asset.ext],'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'};
      if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
      if(request.method==='HEAD')return new Response(null,{status,headers});
      const stream=createReadStream(asset.file,{start,end});const abort=()=>stream.destroy();request.signal.addEventListener('abort',abort,{once:true});stream.once('close',()=>request.signal.removeEventListener('abort',abort));
      return new Response(Readable.toWeb(stream),{status,headers});
    }catch{return new Response('Missing source',{status:404});}
  });
}
module.exports={installMediaProtocol};
