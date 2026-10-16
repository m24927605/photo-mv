const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const ffmpeg = require('./ffmpeg.cjs');
const {musicFades}=require('./model.js');
function clipArgs(source, m) {
  return ['-i',source,'-ss',String(m.start),'-t',String(m.end-m.start),'-map','0:a:0','-vn','-ar','48000','-ac','2','-c:a','pcm_s16le','clip.wav'];
}
function musicFilter(m, duration) {
  const {fadeIn,fadeOut}=musicFades(m,duration);
  let filter = `amovie=clip.wav:loop=0,asetpts=N/SR/TB,volume=${m.volume}`;
  if(fadeIn) filter+=`,afade=t=in:st=0:d=${fadeIn}`;
  if(fadeOut) filter+=`,afade=t=out:st=${duration-fadeOut}:d=${fadeOut}`;
  return filter;
}
async function renderMusicRange(source,settings,total,start,end,destination,signal){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-cut-'));
  const partial=destination+'.partial.wav';
  const run=args=>exec(ffmpeg,['-v','error','-nostdin','-y',...args],{cwd:dir,maxBuffer:1024*1024,signal,windowsHide:true});
  try{
    await run(clipArgs(source,settings));
    await run(['-filter_complex',`${musicFilter(settings,total)},atrim=start=${start}:end=${end},asetpts=N/SR/TB[audio]`,'-map','[audio]','-ar','48000','-ac','2','-c:a','pcm_s16le',partial]);
    await fs.rename(partial,destination);
  }finally{await fs.rm(dir,{recursive:true,force:true});await fs.rm(partial,{force:true});}
}
async function createWaveform(source, settings, duration, signal) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-wave-'));
  const run=args=>exec(ffmpeg,['-v','error','-nostdin','-y',...args],{cwd:dir,encoding:'buffer',maxBuffer:6*1024*1024,timeout:60000,signal,windowsHide:true});
  try {
    const width=settings?Math.min(6000,Math.max(1200,Math.ceil(duration*80))):1200;
    const picture=`aresample=8000,aformat=channel_layouts=mono,showwavespic=s=${width}x120:colors=0xa8aac5:scale=sqrt:filter=peak`;
    let args;
    if(settings) {
      await run(clipArgs(source,settings));
      args=['-filter_complex',`${musicFilter(settings,duration)},atrim=duration=${duration},${picture}[wave]`,'-map','[wave]'];
    } else args=['-i',source,'-filter_complex',`[0:a]${picture}[wave]`,'-map','[wave]'];
    const {stdout}=await run([...args,'-frames:v','1','-c:v','png','-f','image2pipe','pipe:1']);
    return `data:image/png;base64,${stdout.toString('base64')}`;
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={clipArgs,musicFilter,renderMusicRange,createWaveform};
