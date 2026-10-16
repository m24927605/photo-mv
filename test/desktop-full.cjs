require('../src/media-protocol.cjs');
const { app, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const ffmpeg = require('ffmpeg-static');
const results = [];
const evidence = path.join(__dirname, '..', 'docs', 'test-results');
let dir, win, picks = [], destination, cancelSave = false, closeChoice = 0, confirmations = 0;
const sourceHashes = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function command(args) { return exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 60000, maxBuffer: 4096 }); }
async function js(code) { return win.webContents.executeJavaScript(code); }
async function wait(code, timeout = 90000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await js(code)) return; await delay(50); } throw Error(`Timeout ${code}: ${await js("$('status').textContent")}`); }
async function change(id, value, checked = false) {
  if (id === 'text') {
    win.show();win.focus();win.webContents.focus();await wait('document.hasFocus()',5000);
    await js("(() => {const e=$('text-layer').children[textIndex].querySelector('.text-edit'); e.focus(); const r=document.createRange();r.selectNodeContents(e);window.getSelection().removeAllRanges();window.getSelection().addRange(r);})()");
    await win.webContents.insertText(value);
    await wait(`editing?.value === ${JSON.stringify(value)}`,5000);
    await js('document.activeElement.blur()');
  } else await js(`$('${id}').${checked ? 'checked' : 'value'} = ${JSON.stringify(value)}; $('${id}').dispatchEvent(new Event('change'));`);
}
async function click(id) { await js(`$('${id}').click()`); }
async function addText(value) {
  const count = await js('slide().texts.length');
  await click('add-text');
  assert.equal(await js('slide().texts.length'), count + 1);
  assert.equal(await js("document.activeElement.classList.contains('text-edit')"), true);
  assert.equal(await js("$('text-toolbar').hidden"), false);
  await change('text', value);
  assert.equal(await js('text().value'), value);
}
async function dragBox(index, dx, dy) {
  win.focus();win.webContents.focus();
  await js(`$('text-layer').children[${index}].querySelector('.text-edit').focus();document.activeElement.blur()`);
  if(!await js("$('text-toolbar').hidden"))await dragToolbar(8,8);
  const r = await js(`(() => { const box=$('text-layer').children[${index}];box.scrollIntoView({block:'nearest'});const b=box.querySelector('.text-edit').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
  const hit=await js(`document.elementFromPoint(${Math.round(r.x)},${Math.round(r.y)})?.closest('.text-box')?.getAttribute('aria-label')`);
  if(!hit?.startsWith(`移動文字 ${index+1}：`)){await fs.writeFile(path.join(evidence,'drag-failure.png'),(await win.webContents.capturePage()).toPNG());throw Error('Text drag hit '+hit+' expected '+index+' at '+JSON.stringify(r)+' '+await js("JSON.stringify({texts:slide().texts,toolbar:toolbarPosition})"));}
  for (const event of [
    { type:'mouseDown', x:Math.round(r.x), y:Math.round(r.y), button:'left', clickCount:1 },
    { type:'mouseMove', x:Math.round(r.x+dx), y:Math.round(r.y+dy), button:'left', modifiers:['leftButtonDown'] },
    { type:'mouseUp', x:Math.round(r.x+dx), y:Math.round(r.y+dy), button:'left', clickCount:1 }
  ]) { win.webContents.sendInputEvent(event); await delay(30); }
  await delay(50);
}
async function dragToolbar(x, y) {
  const r=await js("(() => {const h=$('toolbar-handle').getBoundingClientRect(), t=$('text-toolbar').getBoundingClientRect();return {x:h.x+h.width/2,y:h.y+h.height/2,left:t.left,top:t.top}})()");
  for(const event of [
    {type:'mouseDown',x:Math.round(r.x),y:Math.round(r.y),button:'left',clickCount:1},
    {type:'mouseMove',x:Math.round(r.x+x-r.left),y:Math.round(r.y+y-r.top),button:'left',modifiers:['leftButtonDown']},
    {type:'mouseUp',x:Math.round(r.x+x-r.left),y:Math.round(r.y+y-r.top),button:'left',clickCount:1}
  ]) {win.webContents.sendInputEvent(event);await delay(30);}
}
async function placeBox(index, x, y) {
  const r = await js(`(() => {const c=$('preview').getBoundingClientRect(), t=slide().texts[${index}];return {dx:(${x}-t.x)*c.width,dy:(${y}-t.y)*c.height};})()`);
  await dragBox(index, r.dx, r.dy);
}
async function reorderClip(from,to){
 await js(`(()=>{const source=$('slides').children[${from}],target=$('slides').children[${to}],r=target.getBoundingClientRect(),data=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{dataTransfer:data,bubbles:true}));target.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true,clientX:${from}<${to}?r.right-1:r.left+1}));source.dispatchEvent(new DragEvent('dragend',{dataTransfer:data,bubbles:true}));})()`);
}
async function resizeClip(index,side,seconds){
 const r=await js(`(()=>{const h=$('slides').children[${index}].querySelector('.photo-edge.${side}');h.scrollIntoView({block:'nearest'});const r=h.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,scale:$('timeline-content').getBoundingClientRect().width/Model.totalDuration(history.value)}})()`);
 const dx=seconds*r.scale*(side==='left'?-1:1);
 for(const event of [{type:'mouseDown',x:Math.round(r.x),y:Math.round(r.y),button:'left',clickCount:1},{type:'mouseMove',x:Math.round(r.x+dx),y:Math.round(r.y),button:'left',modifiers:['leftButtonDown']},{type:'mouseUp',x:Math.round(r.x+dx),y:Math.round(r.y),button:'left',clickCount:1}]){win.webContents.sendInputEvent(event);await delay(30);}
}
async function photoImport(files) { picks = files; await click('import'); await wait('history.value.slides.length > 0 && image !== null'); }
async function check(name, fn) { const start = Date.now(); await fn(); results.push({ name, result: 'PASS', milliseconds: Date.now() - start }); console.log('PASS', name); }
async function probe(file) { return JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout); }
async function hash(file) { return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'); }
async function output(resolution, lossless = false) {
  await change('resolution', resolution); await change('encoding', lossless ? 'lossless' : 'mp4');
  destination = path.join(dir, `${resolution}-${lossless ? 'lossless.mov' : 'quality.mp4'}`);
  await click('export'); await wait('!busy');
  assert.match(await js("$('status').textContent"), /輸出完成/);
  return destination;
}
async function pngAt(file, seconds, outputFile) { await command(['-ss', String(seconds), '-i', file, '-frames:v', '1', outputFile]); }
async function report(error) {
  const data = { testedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, electron: process.versions.electron, ffmpeg: (await exec(ffmpeg, ['-version'])).stdout.split('\n')[0], results, error: error?.stack || null, windowsExecuted: false, dialogSelection: 'Native dialog selection is automated; editor, playback, canvas and encoder are real.' };
  await fs.writeFile(path.join(evidence, 'macos-functional.json'), JSON.stringify(data, null, 2));
}
async function run() {
  await wait('!restoring && !busy');
  const earth = path.join(__dirname, 'fixtures', 'earth.jpg');
  const portrait = path.join(dir, "直幅 ' photo.png"), webp = path.join(dir, '透明照片.webp');
  await command(['-f', 'lavfi', '-i', 'color=c=green:s=800x1200', '-frames:v', '1', portrait]);
  await command(['-f', 'lavfi', '-i', 'color=c=blue@0.5:s=640x360,format=rgba', '-frames:v', '1', webp]);
  for (const file of [earth, portrait, webp]) sourceHashes.set(file, await hash(file));
  const wav = path.join(dir, '短音樂.wav'), mp3 = path.join(dir, '長音樂.mp3'), m4a = path.join(dir, '音樂.m4a');
  await command(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.25', wav]);
  await command(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=128', mp3]);
  await command(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', '-c:a', 'aac', m4a]);
  for (const file of [wav, mp3, m4a]) sourceHashes.set(file, await hash(file));
  await check('JPEG／PNG／WebP 與真實照片、中文／空白／引號檔名匯入', async () => {
    await photoImport([earth, portrait, webp]); assert.equal(await js('history.value.slides.length'), 3);
    await wait('image.naturalWidth > 1000');
  });
  await check('照片排序及刪除不進入文字復原記錄', async () => {
    await reorderClip(0,1); assert.equal(await js('selected'),1);
    await reorderClip(1,0); assert.equal(await js('selected'),0);
    await js("$('slides').children[1].querySelector('.photo-delete').click()"); assert.equal(await js('history.value.slides.length'),2);
    const state = await js('JSON.stringify(history.value)'); await click('undo'); assert.equal(await js('JSON.stringify(history.value)'),state);
    await photoImport([portrait]); await wait('history.value.slides.length === 3');
    await reorderClip(2,1); await js("$('slides').children[0].querySelector('.select-slide').click()");
  });
  await check('照片軸左右把手伸縮時間、共同刻度與點擊定位',async()=>{
    await resizeClip(0,'right',.5);assert.equal(await js('history.value.slides[0].duration'),3.5);
    await resizeClip(0,'left',.5);assert.equal(await js('history.value.slides[0].duration'),4);
    await resizeClip(0,'left',-.5);assert.equal(await js('history.value.slides[0].duration'),3.5);
    await change('duration','3');
    await js("$('timeline-ruler').dispatchEvent(new MouseEvent('click',{clientX:$('timeline-content').getBoundingClientRect().left+$('timeline-content').clientWidth*4/9,bubbles:true}))");
    assert.equal(await js('selected'),1);await js("$('slides').children[0].querySelector('.select-slide').click()");
  });
  await check('片段時間、非法值拒絕、復原', async () => {
    await change('duration', '0'); assert.equal(await js('slide().duration'), 3);
    await change('duration', '1.1'); assert.equal(await js('slide().duration'), 1.1);
    await click('undo'); assert.equal(await js('slide().duration'), 1.1);
    for (let i = 0; i < 3; i++) { await js(`$('slides').children[${i}].querySelector('.select-slide').click()`); await change('duration', i === 0 ? '1.1' : '1'); }
    await js("$('slides').children[0].querySelector('.select-slide').click()");
  });
  await check('多段多行中英文、色彩、字級、六種字體、粗體與斜體', async () => {
    await addText('中文回憶 English\n第二行 2026');
    await change('color', '#ffcc22'); await change('size',String(.07*await js('Model.sizes[history.value.resolution][1]'))); await change('bold', true, true); await change('italic', true, true); await change('underline', true, true);
    await placeBox(0, .15, .2);
    const signatures = [];
    for (const f of await js('fonts')) {
      await change('font', f);
      signatures.push(await js("$('preview').toDataURL()"));
    }
    assert.equal(new Set(signatures).size, 6, '所有字體必須產生不同的實際繪圖');
    await change('font', 'PingFang TC');
    await addText('第二段文字'); await placeBox(1, .5, .7);
    assert.equal(await js('slide().texts.length'), 2);
    await js("$('text-layer').children[1].querySelector('.text-edit').focus();document.activeElement.blur();$('delete-text').click()"); assert.equal(await js('slide().texts.length'), 1); await click('undo'); assert.equal(await js('slide().texts.length'), 2);
    await js("$('text-layer').children[0].querySelector('.text-edit').focus(); document.activeElement.blur()");
    const t = await js('structuredClone(text())'); assert.equal(t.color, '#ffcc22'); assert.equal(t.size, .07); assert.equal(t.bold, true); assert.equal(t.italic, true); assert.equal(t.underline, true);
    assert.equal(await js("$('x') === null && $('y') === null"), true);
  });
  await check('文字框拖曳、空白區不移動、方向鍵、工具列刪除、上一步與下一步', async () => {
    const before = await js('structuredClone(slide().texts)');
    const projectBefore = await js('JSON.stringify(history.value)'); await dragToolbar(100,8);
    assert.equal(await js('JSON.stringify(history.value)'),projectBefore);
    assert.ok(await js("$('text-toolbar').getBoundingClientRect().top < $('preview').getBoundingClientRect().top"));
    const blank = await js("(() => {const r=$('preview').getBoundingClientRect();return {x:Math.round(r.x+5),y:Math.round(r.y+5)}})()");
    win.webContents.sendInputEvent({type:'mouseDown',...blank,button:'left',clickCount:1});
    win.webContents.sendInputEvent({type:'mouseMove',x:blank.x+50,y:blank.y+30,button:'left'});
    win.webContents.sendInputEvent({type:'mouseUp',x:blank.x+50,y:blank.y+30,button:'left',clickCount:1});
    await delay(50); assert.deepEqual(await js('slide().texts'), before); assert.equal(await js("$('text-toolbar').hidden"),true);
    await dragBox(1, 40, -20); assert.equal(await js('textIndex'), 1);
    assert.ok(await js(`text().x > ${before[1].x}`)); assert.deepEqual(await js('slide().texts[0]'), before[0]);
    await click('undo'); assert.deepEqual(await js('slide().texts'), before);
    await dragBox(0, 50, 30); assert.equal(await js('textIndex'), 0);
    assert.ok(await js(`text().x > ${before[0].x}`));
    await click('undo'); assert.deepEqual(await js('slide().texts'), before);
    await js("$('text-layer').children[0].focus()");
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
    await wait(`text().x > ${before[0].x}`); await click('undo'); assert.deepEqual(await js('slide().texts'), before);
    await js("$('text-layer').children[0].querySelector('.text-edit').focus();document.activeElement.blur();$('delete-text').click()");
    assert.deepEqual(await js('slide().texts'), [before[1]]);
    await click('undo'); assert.deepEqual(await js('slide().texts'), before);
    await js("for(const i of [1,0]){$('text-layer').children[i].querySelector('.text-edit').focus();document.activeElement.blur();$('delete-text').click();}");
    assert.equal(await js('slide().texts.length'),0); assert.equal(await js("$('text-toolbar').hidden"),false); assert.equal(await js("$('undo').disabled"),false);
    await click('undo'); await click('undo'); assert.deepEqual(await js('slide().texts'),before);
    const edge = await js("(() => {const r=$('preview').getBoundingClientRect();return {dx:-text().x*r.width-10,dy:-text().y*r.height-5}})()");
    await dragBox(0, edge.dx, edge.dy); assert.equal(await js('text().x'),0); assert.equal(await js('text().y'),0);
    await click('undo'); assert.deepEqual(await js('slide().texts'), before);
  });
  if (process.argv.includes('--text-only')) return;
  await check('WAV／MP3／M4A 匯入與移除', async () => {
    for (const file of [mp3, m4a, wav]) { picks = [file]; await click('music'); await wait(`history.value.musicName === ${JSON.stringify(path.basename(file))}`); assert.ok(await js("Math.abs(Number($('music-end').value)-history.value.musicEdit.duration)<.01")); }
    await click('remove-music'); assert.equal(await js('history.value.music'),null);
    picks=[wav]; await click('music'); await wait("history.value.musicName === '短音樂.wav'");
  });
  await check('音樂編輯器裁切、音量與淡入淡出控制', async () => {
    await click('music-track'); assert.equal(await js("$('music-editor').hidden"),false);
    await wait("!$('source-waveform').hidden && $('source-waveform').naturalWidth > 0");
    await wait("!$('project-waveform').hidden && $('project-waveform').naturalWidth > 0");
    await change('music-start','.05'); await change('music-end','.2'); await change('music-volume','40');
    await change('music-fade-in','.2'); await change('music-fade-out','.3');
    const m=await js('history.value.musicEdit');assert.equal(m.start,.05);assert.equal(m.end,.2);assert.equal(m.volume,.4);assert.equal(m.fadeIn,.2);assert.equal(m.fadeOut,.3);
    const box=await js("(()=>{const b=$('clip-region');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dx:$('wave-editor').clientWidth*.1};})()");
    for(const event of [{type:'mouseDown',x:Math.round(box.x),y:Math.round(box.y),button:'left',clickCount:1},{type:'mouseMove',x:Math.round(box.x+box.dx),y:Math.round(box.y),button:'left',modifiers:['leftButtonDown']},{type:'mouseUp',x:Math.round(box.x+box.dx),y:Math.round(box.y),button:'left',clickCount:1}]){win.webContents.sendInputEvent(event);await delay(30);}
    assert.ok(await js('history.value.musicEdit.start > .05'));assert.ok(await js('Math.abs(history.value.musicEdit.end-history.value.musicEdit.start-.15)<.011'));
    await change('music-start','.05');await change('music-end','.2');
    await click('close-music');assert.equal(await js("$('music-editor').hidden"),true);
  });
  if(process.argv.includes('--timeline-only'))return;
  await check('真實音訊播放、短音樂循環、照片邊界與停止', async () => {
    await click('play'); await wait('playing && !audio.paused');
    await delay(1250); assert.equal(await js('selected'), 1); assert.equal(await js('audio.loop'), true); assert.equal(await js('audio.paused'), false);
    await click('play'); assert.equal(await js('playing'), false); assert.equal(await js('audio.paused'), true);
    await click('play'); await wait('playing'); await wait('!playing', 10000); assert.equal(await js('audio.paused'), true);
    await js("$('slides').children[0].querySelector('.select-slide').click()"); await wait('image !== null');
  });
  await check('五種尺寸：真實照片與文字 MP4 輸出、影格數、音樂非靜音', async () => {
    for (const [resolution, [width, height]] of Object.entries(await js('Model.sizes'))) {
      const file = await output(resolution), info = await probe(file), video = info.streams.find(s => s.codec_type === 'video');
      assert.equal(video.width, width); assert.equal(video.height, height); assert.equal(Number(video.nb_frames), 93); assert.equal(video.r_frame_rate, '30/1');
      assert.ok(info.streams.some(s => s.codec_type === 'audio')); assert.ok(Math.abs(Number(info.format.duration) - 3.1) < 1 / 30);
      const levels = await exec(ffmpeg, ['-hide_banner', '-i', file, '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-']);
      assert.match(levels.stderr, /RMS level dB: -?\d/);
      await pngAt(file, .5, path.join(evidence, `${resolution}-photo-text.png`));
    }
  });
  await check('五種尺寸：無損 MOV 與合成 PNG 像素完全一致', async () => {
    for (const resolution of Object.keys(await js('Model.sizes'))) {
      const file = await output(resolution, true);
      const expected = path.join(dir, 'expected.png');
      const bytes = await js(`(async()=>{ const c=document.createElement('canvas'); [c.width,c.height]=Model.sizes[${JSON.stringify(resolution)}]; const s=history.value.slides[0]; drawSlide(c,await loadImage(s.asset),s);return Array.from(new Uint8Array(await (await new Promise(r=>c.toBlob(r))).arrayBuffer()));})()`);
      await fs.writeFile(expected, Buffer.from(bytes));
      const a = path.join(dir, 'expected.rgb'), b = path.join(dir, 'actual.rgb');
      await command(['-i', expected, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', a]);
      await command(['-ss', '0.5', '-i', file, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', b]);
      assert.equal(await hash(a), await hash(b), resolution);
    }
  });
  await check('照片及兩軸決定影片長度、長音樂截斷與無聲輸出', async () => {
    picks = [m4a]; await click('music'); await wait("history.value.musicName === '音樂.m4a'"); await output('480p');
    picks = [mp3]; await click('music'); await wait("history.value.musicName === '長音樂.mp3'");
    assert.equal(await js("!!$('timeline-warning')"),false);
    const expected=await js('Model.totalDuration(history.value)');let file = await output('480p'); let info = await probe(file);assert.ok(Math.abs(Number(info.format.duration)-expected)<1/30);
    assert.equal(info.streams.find(s=>s.codec_type==='video').nb_frames,'93');
    await click('remove-music'); file = await output('480p'); info = await probe(file); assert.equal(info.streams.length, 1);
  });
  await check('對話框取消、損壞照片／音樂拒絕、不變更既有編輯', async () => {
    const original = await js('JSON.stringify(history.value)');
    picks = []; await click('import'); await delay(100); await click('music'); await delay(100); assert.equal(await js('JSON.stringify(history.value)'), original);
    cancelSave = true; await click('export'); await wait('!busy'); cancelSave = false; assert.equal(await js('JSON.stringify(history.value)'), original);
    const bad = path.join(dir, '壞檔.png'); await fs.writeFile(bad, 'broken'); picks = [bad]; await click('import'); await wait("$('status').textContent.includes('decode') || $('status').textContent.includes('decoded')"); assert.equal(await js('JSON.stringify(history.value)'), original);
    const badAudio = path.join(dir, '壞檔.mp3'); await fs.writeFile(badAudio, 'broken'); picks = [badAudio]; await click('music'); await wait("$('status').textContent.includes('無法解碼')"); assert.equal(await js('JSON.stringify(history.value)'), original);
  });
  await check('EXIF 旋轉、直幅黑邊與透明圖片合成', async () => {
    picks = [path.join(__dirname, 'fixtures', 'exif-rotated.jpg')]; await click('import'); await wait('history.value.slides.length === 4');
    await js("$('slides').children[3].querySelector('.select-slide').click()"); await wait('image !== null && image.naturalWidth === 80');
    assert.equal(await js('image.naturalHeight'), 120);
    const pixels = await js("(() => { const c=$('preview').getContext('2d'); return {edge:Array.from(c.getImageData(5,360,1,1).data),top:Array.from(c.getImageData(640,120,1,1).data),bottom:Array.from(c.getImageData(640,600,1,1).data)}})()");
    assert.deepEqual(pixels.edge, [0,0,0,255]); assert.ok(pixels.top[0] > 200); assert.ok(pixels.bottom[2] > 200);
    await js("$('slides').children[3].querySelector('.photo-delete').click(); $('slides').children[2].querySelector('.select-slide').click()"); await wait('image !== null && image.naturalWidth === 640');
    const alpha = await js("Array.from($('preview').getContext('2d').getImageData(640,360,1,1).data)"); assert.equal(alpha[3],255); assert.ok(alpha[2] > 100 && alpha[2] < 160);
    await js("$('slides').children[0].querySelector('.select-slide').click()"); await wait('image !== null');
  });
  await check('來源覆寫遭拒、匯入來源 SHA-256 完全不變', async () => {
    destination = earth; await click('export'); await wait('!busy'); assert.match(await js("$('status').textContent"), /不能覆寫/);
    for (const [file, original] of sourceHashes) assert.equal(await hash(file), original);
  });
  await check('準備影格時取消、編碼中取消、取消後可再次輸出', async () => {
    await change('resolution', '4K'); destination = path.join(dir, 'cancel.mp4'); await fs.writeFile(destination, 'existing');
    await click('export'); await wait('busy'); await click('cancel'); await wait('!busy'); assert.equal(await fs.readFile(destination, 'utf8'), 'existing');
    await change('duration', '60'); destination = path.join(dir, 'cancel-encoding.mp4'); await fs.writeFile(destination, 'existing');
    await click('export'); await wait("busy && $('status').textContent.includes('編碼')"); await click('cancel'); await wait('!busy'); assert.equal(await fs.readFile(destination, 'utf8'), 'existing');
    await change('duration', '1.1'); await output('480p');
    assert.equal((await fs.readdir(dir)).some(name => name.startsWith('.celebration-')), false);
  });
  await check('本機自動儲存保留當前編輯快照',async()=>{
    assert.equal(await js('flushSave()'),true);const saved=await js('window.desktop.restore()');assert.deepEqual(saved.snapshot.state.project,await js('history.value'));
  });
  await js("$('slides').children[0].querySelector('.select-slide').click(); window.scrollTo(0,0)"); await wait('image !== null');
  await fs.writeFile(path.join(evidence, 'macos-desktop.png'), (await win.webContents.capturePage()).toPNG());
}
(async () => {
  await fs.mkdir(evidence, { recursive: true }); dir = await fs.mkdtemp(path.join(os.tmpdir(), 'celebration-functional-'));
  dialog.showOpenDialog = async () => ({ canceled: picks.length === 0, filePaths: picks });
  dialog.showSaveDialog = async () => ({ canceled: cancelSave, filePath: destination });
  dialog.showMessageBoxSync = () => { confirmations++; return closeChoice; };
  app.on('browser-window-created', (_e, created) => {
    win = created; win.webContents.once('did-finish-load', async () => {
      try { await run(); await report(); console.log(`FUNCTIONAL_PASS ${results.length} groups`); await js('flushSave()'); await fs.rm(dir, { recursive: true, force: true }); app.exit(0); }
      catch (e) { console.error(e); await report(e); await js('window.desktop.cancel()').catch(() => {}); await fs.rm(dir, { recursive: true, force: true }); app.exit(1); }
    });
  });
  const dataDir=path.join(dir,'app-state');await fs.mkdir(dataDir,{recursive:true});app.setPath('userData',dataDir);
  require('../src/main.cjs');
})();
