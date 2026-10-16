const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const { createJob } = require('../src/export.cjs');
const { sizes } = require('../src/model.js');
async function command(args) { return exec(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 40 * 1024 * 1024 }); }
async function probe(file) { return JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout); }
test('真實 FFmpeg：五種尺寸、順序、音樂、時長與無損影格', { timeout: 180000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'celebration-test-'));
  try {
    const audio = path.join(dir, '短 音樂.wav');
    await command(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', audio]);
    for (const [resolution, [w, h]] of Object.entries(sizes)) {
      const buffers = [];
      for (const color of ['red', 'blue']) { const f = path.join(dir, `${resolution}-${color}.png`); await command(['-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}`, '-frames:v', '1', f]); buffers.push(await fs.readFile(f)); }
      const dest = path.join(dir, `${resolution}.mp4`);
      const p = { slides: [0, 1].map(i => ({ asset: String(i), duration: i === 0 ? 1.1 : 1.3, texts: [] })), resolution, lossless: false, music:'tone', musicEdit:{duration:.2,start:0,end:.2,volume:1,fadeIn:0,fadeOut:0} };
      const job = await createJob(p, dest, audio); await job.add(0, buffers[0]); await job.add(1, buffers[1]); await job.finish();
      const info = await probe(dest), v = info.streams.find(s => s.codec_type === 'video');
      assert.equal(v.width, w); assert.equal(v.height, h); assert.equal(v.r_frame_rate, '30/1'); assert.equal(Number(v.nb_frames), 72); assert.ok(info.streams.some(s => s.codec_type === 'audio')); assert.ok(Math.abs(Number(info.format.duration) - 2.4) <= 1 / 30);
      for (const [time, channel] of [['0.5', 0], ['1.5', 2]]) { const raw = path.join(dir, 'pixel.rgb'); await command(['-ss', time, '-i', dest, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]); assert.ok((await fs.readFile(raw))[channel] > 200); }
      if (resolution === '480p') {
        p.lossless = true; p.music = null; p.musicEdit = null; const lossless = path.join(dir, 'lossless.mov'); const j = await createJob(p, lossless); await j.add(0, buffers[0]); await j.add(1, buffers[1]); await j.finish();
        const raw = path.join(dir, 'lossless.rgb'), original = path.join(dir, 'original.rgb');
        await command(['-i', lossless, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
        await command(['-i', path.join(dir, '480p-red.png'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', original]);
        assert.deepEqual(await fs.readFile(raw), await fs.readFile(original)); assert.equal((await probe(lossless)).streams.length, 1);
      }
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('取消與失敗不覆寫目的檔，錯誤影格遭拒絕', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'celebration-failure-'));
  try {
    const dest = path.join(dir, 'existing.mp4'); await fs.writeFile(dest, 'keep');
    const p = { slides: [{ asset: 'a', duration: 1, texts: [] }], resolution: '480p', lossless: false };
    const j = await createJob(p, dest); await assert.rejects(j.add(0, Buffer.from('invalid'))); await assert.rejects(j.finish()); assert.equal(await fs.readFile(dest, 'utf8'), 'keep');
    const k = await createJob(p, dest); await k.cancel(); await assert.rejects(k.finish()); assert.equal(await fs.readFile(dest, 'utf8'), 'keep');
    assert.deepEqual(await fs.readdir(dir), ['existing.mp4']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('實際音樂裁切、循環、音量及淡入淡出', {timeout:60000}, async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-audio-edit-'));
  try {
    const source=path.join(dir,'two-tones.wav'), image=path.join(dir,'frame.png');
    await command(['-f','lavfi','-i','sine=frequency=440:duration=1','-f','lavfi','-i','sine=frequency=880:duration=1','-filter_complex','[0:a][1:a]concat=n=2:v=0:a=1',source]);
    await command(['-f','lavfi','-i','color=black:s=854x480','-frames:v','1',image]);
    const bytes=await fs.readFile(image);
    const project={slides:[{asset:'image',duration:2,texts:[]}],resolution:'480p',lossless:false,music:'song',musicEdit:{duration:2,start:1.1,end:1.6,volume:.5,fadeIn:.4,fadeOut:.4}};
    async function samples(name) {
      const file=path.join(dir,name+'.mp4'), job=await createJob(project,file,source); await job.add(0,bytes);await job.finish();
      const raw=path.join(dir,name+'.pcm');await command(['-i',file,'-vn','-ac','1','-ar','8000','-f','s16le',raw]);return fs.readFile(raw);
    }
    const edited=await samples('edited');
    function rms(buffer,start,end) {let sum=0,count=0;for(let n=Math.floor(start*8000);n<Math.floor(end*8000);n++){const x=buffer.readInt16LE(n*2);sum+=x*x;count++;}return Math.sqrt(sum/count);}
    const center=rms(edited,.8,1.2);assert.ok(center>100);assert.ok(rms(edited,0,.05)<center*.3);assert.ok(rms(edited,1.95,2)<center*.3);
    let crossings=0;for(let n=6401;n<9600;n++) if((edited.readInt16LE((n-1)*2)>=0)!==(edited.readInt16LE(n*2)>=0))crossings++;
    assert.ok(Math.abs(crossings/(2*.4)-880)<20,'裁切後應只剩 880Hz，且循環無靜音');
    project.musicEdit.volume=1;project.musicEdit.fadeIn=0;project.musicEdit.fadeOut=0;
    const full=await samples('full');assert.ok(Math.abs(center/rms(full,.8,1.2)-.5)<.05,'音量應為一半');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('長音樂不延長影片，輸出只到照片結尾', {timeout:30000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-black-tail-'));try{
  const source=path.join(dir,'music.wav'),image=path.join(dir,'red.png'),dest=path.join(dir,'video.mp4');
  await command(['-f','lavfi','-i','sine=duration=2',source]);await command(['-f','lavfi','-i','color=red:s=854x480','-frames:v','1',image]);
  const p={slides:[{asset:'image',duration:1,texts:[]}],resolution:'480p',lossless:false,music:'a',musicEdit:{duration:2,start:0,end:2,volume:1,fadeIn:0,fadeOut:0}};
  const job=await createJob(p,dest,source);await job.add(0,await fs.readFile(image));await job.finish();const info=await probe(dest);assert.equal(info.streams[0].nb_frames,'30');
  const pixel=path.join(dir,'black.rgb');await command(['-ss','0.9','-i',dest,'-vf','scale=1:1','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24',pixel]);assert.ok((await fs.readFile(pixel))[0]>200);
  const {createWaveform}=require('../src/audio.cjs');for(const args of [[source],[source,p.musicEdit,1]]){const url=await createWaveform(...args),png=Buffer.from(url.split(',')[1],'base64');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(20),120);}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('共用剪裁的音樂保留循環相位與原本淡化，不重頭播放', {timeout:30000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'celebration-audio-crop-'));try{
  const source=path.join(dir,'source.wav'),full=path.join(dir,'full.wav'),cut=path.join(dir,'cut.wav');
  await command(['-f','lavfi','-i','sine=frequency=440:duration=1','-f','lavfi','-i','sine=frequency=880:duration=1','-filter_complex','[0:a][1:a]concat=n=2:v=0:a=1',source]);
  const {renderMusicRange}=require('../src/audio.cjs'),m={duration:2,start:.2,end:1.8,volume:.5,fadeIn:.5,fadeOut:.5};
  await renderMusicRange(source,m,6,0,6,full);await renderMusicRange(source,m,6,1.3,5.7,cut);
  const a=path.join(dir,'a.pcm'),b=path.join(dir,'b.pcm');
  await command(['-i',full,'-ss','1.3','-t','4.4','-f','s16le','-ac','2','-ar','48000',a]);await command(['-i',cut,'-f','s16le','-ac','2','-ar','48000',b]);
  assert.deepEqual(await fs.readFile(a),await fs.readFile(b));assert.ok(Math.abs(Number((await probe(cut)).format.duration)-4.4)<.001);
  const abort=new AbortController();abort.abort();const cancelled=path.join(dir,'cancel.wav');await assert.rejects(renderMusicRange(source,m,6,0,1,cancelled,abort.signal));await assert.rejects(fs.stat(cancelled));assert.equal((await fs.readdir(dir)).some(n=>n.endsWith('partial.wav')),false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
