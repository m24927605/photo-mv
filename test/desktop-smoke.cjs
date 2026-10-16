require('../src/media-protocol.cjs');
const { app, dialog } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
let temp, output, failures = [];
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('console-message', (_e, level, message) => { if (level === 3) failures.push(message); });
  win.webContents.on('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        const wait = async fn => { for (let n = 0; n < 300; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('UI timeout: ' + document.getElementById('status').textContent); };
        await wait(() => !restoring && !busy);
        document.getElementById('import').click(); await wait(() => history.value.slides.length === 2 && image);
        if (document.getElementById('x') || document.getElementById('y')) throw Error('obsolete coordinate fields');
        const actions = Array.from(document.querySelectorAll('header .actions button:not(#project-menu)'));
        if (actions.map(b=>b.textContent).join(',') !== '+照片,+文字,+音樂' || new Set(actions.map(b=>b.getBoundingClientRect().top)).size !== 1) throw Error('add buttons row');
        const exportControls = ['resolution','encoding','export'].map(id=>document.getElementById(id).getBoundingClientRect());
        if (exportControls.some(r=>Math.abs(r.bottom-exportControls[0].bottom)>1 || Math.abs(r.height-38)>1)) throw Error('export controls alignment');

        document.getElementById('add-text').click();
        const editor = document.querySelector('.text-edit');
        if (document.activeElement !== editor || document.getElementById('text-toolbar').hidden) throw Error('paint text editing not focused');
        editor.textContent = '慶祝回憶 English'; editor.dispatchEvent(new InputEvent('input')); editor.blur();
        if (text().value !== '慶祝回憶 English') throw Error('text missing');
        document.getElementById('underline').checked = true; document.getElementById('underline').dispatchEvent(new Event('change'));
        if (!text().underline) throw Error('underline');
        document.querySelector('.text-box').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}));
        if (text().x <= .1) throw Error('position');
        document.getElementById('undo').click(); if (text().x !== .1) throw Error('undo');
        document.getElementById('delete-text').click(); if (slide().texts.length) throw Error('delete');
        if (document.getElementById('text-toolbar').hidden || document.getElementById('undo').disabled) throw Error('undo hidden after deleting last text');
        document.getElementById('undo').click(); if (slide().texts.length !== 1) throw Error('delete undo');
        document.getElementById('resolution').value = '480p'; document.getElementById('resolution').dispatchEvent(new Event('change'));
        document.getElementById('export').click(); await wait(() => !busy);
        if (!document.getElementById('status').textContent.includes('輸出完成')) throw Error(document.getElementById('status').textContent);
        return { slides: history.value.slides.length, text: text().value, bridge: typeof window.require, sandbox: typeof process };
      })()`);
      const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', output]));
      if (info.streams[0].width !== 854 || info.streams[0].nb_frames !== '180') throw Error('invalid export');
      if (failures.length) throw Error(failures.join('\n'));
      console.log('DESKTOP_SMOKE_PASS', JSON.stringify(result));
      await win.webContents.capturePage().then(img => fs.writeFile(path.join(process.cwd(), 'docs/desktop-preview.png'), img.toPNG()));
      await win.webContents.executeJavaScript('flushSave()');
      await fs.rm(temp, { recursive: true, force: true }); app.exit(0);
    } catch (e) { console.error(e); if (temp) await fs.rm(temp, { recursive: true, force: true }); app.exit(1); }
  });
});
(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'celebration-desktop-'));
  const files = [];
  for (const color of ['red', 'blue']) { const file = path.join(temp, `${color} 中文.png`); execFileSync(require('ffmpeg-static'), ['-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=1920x1080`, '-frames:v', '1', file]); files.push(file); }
  output = path.join(temp, '影片.mp4');
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
  const dataDir=path.join(temp,'app-state');await fs.mkdir(dataDir,{recursive:true});app.setPath('userData',dataDir);
  require('../src/main.cjs');
})();
