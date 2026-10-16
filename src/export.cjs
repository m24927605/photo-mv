const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { sizes, validate, renderSegments } = require('./model.js');
const ffmpeg = require('./ffmpeg.cjs');
const { clipArgs, musicFilter } = require('./audio.cjs');

async function createJob(project, destination, audio, onProgress = () => {}) {
  const frames = validate(project), segments = renderSegments(project);
  if (Boolean(audio) !== Boolean(project.music)) throw Error('音樂資產不一致');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'celebration-'));
  const partial = path.join(path.dirname(destination), `.celebration-${require('node:crypto').randomUUID()}${project.lossless ? '.mov' : '.mp4'}`);
  let child, running, cancelled = false, count = 0;
  async function run(args, duration, offset, weight) {
    if (cancelled) throw Error('輸出已取消');
    running = new Promise((resolve, reject) => {
      child = spawn(ffmpeg, ['-hide_banner', '-nostdin', '-y', ...args, '-progress', 'pipe:1'], { windowsHide: true, cwd: dir });
      let error = '';
      child.stderr.on('data', b => { error = (error + b).slice(-4000); });
      child.stdout.on('data', b => { const matches = [...String(b).matchAll(/out_time_us=(\d+)/g)]; if (matches.length) onProgress(offset + weight * Math.min(1, Number(matches.at(-1)[1]) / (duration * 1e6))); });
      child.on('error', () => reject(Error('無法啟動隨附的影片編碼器')));
      child.on('close', code => code === 0 && !cancelled ? resolve() : reject(Error(cancelled ? '輸出已取消' : `影片編碼失敗：${error}`)));
    });
    try { await running; } finally { child = null; running = null; }
  }
  const cleanup = async () => { await fs.rm(dir, { recursive: true, force: true }); await fs.rm(partial, { force: true }); };
  return {
    async add(index, bytes) {
      if (cancelled || index !== count || index >= segments.length) throw Error('輸出已取消或影格順序不合法');
      const b = Buffer.from(bytes);
      const [w, h] = sizes[project.resolution];
      if (b.length > 150 * 1024 * 1024 || b.length < 24 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || b.readUInt32BE(16) !== w || b.readUInt32BE(20) !== h) throw Error('合成圖片格式或尺寸錯誤');
      await fs.writeFile(path.join(dir, `${index}.png`), b);
      count++;
    },
    async finish() {
      try {
        if (cancelled || count !== segments.length) throw Error('輸出已取消或缺少影格');
        const list = segments.map((s, i) => `file '${i}.png'\noption framerate 30\nduration ${s.duration}`).join('\n') + `\nfile '${count - 1}.png'\noption framerate 30\n`;
        await fs.writeFile(path.join(dir, 'slides.txt'), list);
        const args = ['-f', 'concat', '-safe', '0', '-i', 'slides.txt'];
        if (audio) {
          const m = project.musicEdit;
          await run(clipArgs(audio, m), m.end - m.start, 0, .1);
          args.push('-filter_complex', `${musicFilter(m, frames / 30)}[audio]`);
        }
        args.push('-map', '0:v:0');
        if (audio) args.push('-map', '[audio]', '-c:a', 'aac', '-b:a', '320k');
        const photoDuration=project.slides.reduce((n,s)=>n+s.duration,0);
        args.push('-vf', `fps=30,trim=duration=${photoDuration}`, '-t', String(frames / 30), '-c:v', project.lossless ? 'libx264rgb' : 'libx264', '-crf', project.lossless ? '0' : '16', '-preset', 'medium', '-pix_fmt', project.lossless ? 'rgb24' : 'yuv420p', '-movflags', '+faststart', partial);
        await run(args, frames / 30, audio ? .1 : 0, audio ? .9 : 1);
        if (cancelled) throw Error('輸出已取消');
        await fs.rename(partial, destination);
      } finally { await cleanup(); }
    },
    async cancel() { cancelled = true; const stopped = running; if (child && child.exitCode === null && !child.killed) child.kill('SIGKILL'); if (stopped) await stopped.catch(() => {}); await cleanup(); }
  };
}
module.exports = { createJob };
