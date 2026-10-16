const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const path = require('node:path');

async function prepare() {
  const dir = path.join(__dirname, '..', 'vendor', 'win-x64');
  await fs.mkdir(dir, { recursive: true });
  const release = require('ffmpeg-static/package.json')['ffmpeg-static']['binary-release-tag'];
  const base = `https://github.com/eugeneware/ffmpeg-static/releases/download/${release}`;
  for (const [remote, name, gzip] of [
    ['ffmpeg-win32-x64.gz', 'ffmpeg.exe', true],
    ['win32-x64.LICENSE', 'ffmpeg.LICENSE', false],
    ['win32-x64.README', 'ffmpeg.README', false]
  ]) {
    const file = path.join(dir, name);
    console.log(`下載 Windows ${name} (${release})`);
    const response = await fetch(`${base}/${remote}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw Error(`下載失敗：${response.status} ${remote}`);
    const partial = `${file}.download`;
    try {
      if (gzip) await pipeline(response.body, createGunzip(), createWriteStream(partial));
      else await pipeline(response.body, createWriteStream(partial));
      await fs.rename(partial, file);
    } finally { await fs.rm(partial, { force: true }); }
  }
  const binary = await fs.open(path.join(dir, 'ffmpeg.exe'));
  try {
    const header = Buffer.alloc(2); await binary.read(header, 0, 2, 0);
    if (header.toString() !== 'MZ') throw Error('下載檔案不是 Windows 執行檔');
  } finally { await binary.close(); }
}
prepare().catch(error => { console.error(error); process.exitCode = 1; });
