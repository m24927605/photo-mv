const $ = id => document.getElementById(id);
const history = Model.history(Model.createProject());
let selected = 0, textIndex = 0, image = null, assetID = null, loading = 0, busy = false, cancelled = false, playing = false, started = 0, timer, drag, editing = null, textToolsVisible = false, toolbarPosition = null, toolbarDrag = null, playhead = 0, restoring = true, saveEnabled = true, saveTimer = null, revision = 0, switchingProject=false, projectTask=null, projectGeneration=0;
const thumbnails = new Map();
const selectedPhotos=new Set();let selectionAnchor=null;
const audio = new Audio(); audio.loop = true;
let playRequest = 0, paintedTextKey = '';
const guideLines = {}, crosshairLines = {};
for (const axis of ['x', 'y']) {
  for (const position of [1/3, .5, 2/3]) {
    const line = document.createElement('i'); line.className = `guide-${axis}`;
    line.style[axis === 'x' ? 'left' : 'top'] = `${position * 100}%`; $('text-guides').append(line);
  }
  const line = document.createElement('i'); line.className = `guide-${axis} guide-active`;
  line.hidden = true; $('text-guides').append(line); guideLines[axis] = line;
  const crosshair = document.createElement('i'); crosshair.className = `guide-${axis} guide-crosshair`;
  $('text-guides').append(crosshair); crosshairLines[axis] = crosshair;
}


function status(message) { $('status').textContent = message; }
function snapshot() {
  const state=history.snapshot(editing);
  return {state,ui:{selected,playhead,textIndex,textToolsVisible,toolbarPosition,musicOpen:!$('music-editor').hidden,scrollLeft:$('timeline-scroll').scrollLeft}};
}
function scheduleSave() {
  if(restoring||switchingProject||!saveEnabled)return;
  revision++;if(!playing)$('save-status').textContent='儲存中…';
  if(!saveTimer)saveTimer=setTimeout(()=>{saveTimer=null;flushSave();},250);
}
async function flushSave() {
  if(restoring||!saveEnabled)return false;
  clearTimeout(saveTimer);saveTimer=null;const current=revision;
  try{await window.desktop.save(snapshot());if(current===revision&&$('save-status').textContent!=='已儲存')$('save-status').textContent='已儲存';return true;}
  catch(e){$('save-status').textContent='儲存失敗';status(`自動儲存失敗：${e.message}`);return false;}
}

function slide() { const s=history.value.slides[selected];return s?{...s,texts:Model.textsAt(history.value,playhead)}:undefined; }
function text() { return slide()?.texts[textIndex]; }
function commitText() {
  if (!editing) return;
  const { slideIndex, index, offset, value } = editing;
  editing = null;
  history.editText(slideIndex, p => p.slides[slideIndex].texts[index].value = value.slice(0, 2000), offset);
  window.desktop.dirty(true);
  $('undo').disabled = busy || !history.canUndoText();
  $('redo').disabled = busy || !history.canRedoText();
  scheduleSave();
}
function syncToolbar() {
  const t = text();
  $('text-toolbar').hidden = busy || playing || !textToolsVisible;
  $('undo').disabled = busy || !history.canUndoText();
  $('redo').disabled = busy || !history.canRedoText();
  placeToolbar();
  for (const id of ['font', 'color', 'size', 'bold', 'italic', 'underline', 'delete-text']) $(id).disabled = busy || !t;
  if (t) { $('font').value = t.font; $('color').value = t.color; $('size').max=Model.sizes[history.value.resolution][1]*.3;$('size').value=Math.max(.01,+(t.size*Model.sizes[history.value.resolution][1]).toFixed(2)); $('bold').checked = t.bold; $('italic').checked = t.italic; $('underline').checked = t.underline; }
}
function selectTextBox(index) {
  if (editing && editing.index !== index) commitText();
  textIndex = index; textToolsVisible = index >= 0;
  for (const [i, box] of [...$('text-layer').children].entries()) box.classList.toggle('selected', i === index);
  syncToolbar();scheduleSave();
}
function stop() { playRequest++; if (drag) endTextDrag(); commitText(); playing = false; clearInterval(timer); audio.pause();scheduleSave(); $('play').textContent = '▶ 播放'; renderTextBoxes(); paintPreview(); syncToolbar(); }
function edit(fn) {
  stop();
  history.edit(p => {
    fn(p);
    if(p.selection){const max=Math.floor((Model.totalDuration(p)+1e-6)*10)/10;p.selection.end=Math.min(p.selection.end,max);p.selection.start=Math.min(p.selection.start,Math.max(0,p.selection.end-.1));if(p.selection.end<.1)delete p.selection;}
    if (p.musicEdit) { const total = Model.totalDuration(p); p.musicEdit.fadeIn = Math.min(p.musicEdit.fadeIn,total); p.musicEdit.fadeOut = Math.min(p.musicEdit.fadeOut,total); }
  });
  window.desktop.dirty(true); refresh();
}
function editText(fn) { const offset=Model.textOffset(history.value,selected,playhead);stop(); history.editText(selected, fn, offset); window.desktop.dirty(true); refresh(); }
async function loadImage(id) {
  const img = new Image();
  img.src = await window.desktop.readAsset(id);
  await img.decode();
  return img;
}
async function refresh() {
  const p = history.value;
  selected = Math.min(selected, p.slides.length - 1);
  if(p.slides.length&&selected<0)selected=Model.photoAt(p,Math.max(0,Math.min(playhead,Model.totalDuration(p)-1e-6)));
  playhead = Math.min(playhead,Model.totalDuration(p));
  textIndex = Math.min(textIndex, (slide()?.texts.length || 0) - 1);
  $('count').textContent = `${p.slides.length} 張`;
  $('empty').hidden = p.slides.length > 0;
  $('undo').disabled = busy || !history.canUndoText();
  $('redo').disabled = busy || !history.canRedoText();
  for(const asset of selectedPhotos)if(!p.slides.some(s=>s.asset===asset))selectedPhotos.delete(asset);
  if(!selectedPhotos.size&&slide())selectedPhotos.add(slide().asset);
  timeline.refresh(selected,busy,playhead);
  const chosen=p.slides.filter(s=>selectedPhotos.has(s.asset));
  $('duration').value=chosen.length&&chosen.every(s=>s.duration===chosen[0].duration)?chosen[0].duration:'';
  $('duration').disabled=busy||!chosen.length;
  $('select-all-photos').disabled=busy||!p.slides.length;
  $('photo-selection-count').textContent=`已選 ${chosen.length} 張`;
  $('add-text').disabled=busy||!slide()||slide().texts.length>=20;

  syncToolbar();
  renderTextBoxes();
  $('resolution').value = p.resolution; $('encoding').value = p.lossless ? 'lossless' : 'mp4';
  $('remove-music').disabled = busy || !p.music; $('remove-music').hidden = !p.music;
  musicTools.refresh(busy);
  for (const id of ['project-menu','import', 'music', 'resolution', 'encoding']) $(id).disabled = busy;
  for (const id of ['rewind', 'play', 'export']) $(id).disabled = busy || !p.slides.length;
  $('cancel').hidden = !busy||switchingProject; $('progress').hidden = !busy;
  displayTime();
  const id = slide()?.asset;
  if (id !== assetID) {
    const token = ++loading; image = null; assetID = id;
    paintPreview();
    if (id) try { const decoded = await loadImage(id); if (token !== loading) return; image = decoded; } catch (e) { if (token === loading) { assetID = null; status(`照片解碼失敗：${e.message}`); } }
  }
  paintPreview();
  scheduleSave();
}
async function run(fn) { try { await fn(); } catch (e) { status(e.message); } }
const fonts = Model.platformFonts[window.desktop.platform];
$('font').replaceChildren(...fonts.map(f => new Option(f, f)));
$('import').onclick = () => run(async () => { const assets = await window.desktop.importPhotos(); if (!assets.length) return; for (const a of assets) { const img=await loadImage(a.id); const thumb=document.createElement('canvas');thumb.width=128;thumb.height=72;drawSlide(thumb,img,{texts:[]});thumbnails.set(a.id,thumb.toDataURL()); } if (history.value.slides.length + assets.length > 300) throw Error('最多 300 張照片'); edit(p => {const first=p.slides.length;p.slides.push(...assets.map(a => ({ asset: a.id, name: a.name, duration: 3, texts: [] })));if(selected<0){selected=first;playhead=Model.photoStart(p,first);}}); status(''); });
$('music').onclick = () => run(async () => { const [asset] = await window.desktop.importMusic(); if (!asset) return; const source = await window.desktop.audioSource(asset.id); const testAudio = new Audio(source); await new Promise((resolve, reject) => { testAudio.onloadedmetadata = resolve; testAudio.onerror = () => reject(Error('無法解碼這段音樂')); }); if (!Number.isFinite(testAudio.duration) || testAudio.duration <= 0) throw Error('無法讀取音樂長度'); edit(p => { p.music = asset.id; p.musicName = asset.name; p.musicEdit = { duration: testAudio.duration, start: 0, end: testAudio.duration, volume: 1, fadeIn: 0, fadeOut: 0 }; }); });
$('remove-music').onclick = () => edit(p => { p.music = null; p.musicName = ''; p.musicEdit = null; });
$('undo').onclick = () => { stop(); history.undoText(); textIndex = Math.max(0, textIndex); textToolsVisible = true; window.desktop.dirty(true); refresh(); };
$('redo').onclick = () => { stop(); history.redoText(); textIndex = Math.max(0, textIndex); textToolsVisible = true; window.desktop.dirty(true); refresh(); };
$('delete-text').onclick = () => {
  if (busy || !text()) return;
  const index = textIndex; editText(p => p.slides[selected].texts.splice(index, 1));
  if (text()) $('text-layer').children[textIndex]?.focus({preventScroll: true}); else $('undo').focus({preventScroll: true});
};
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
  const key = e.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  e.preventDefault();
  if (!busy) $(key === 'y' || e.shiftKey ? 'redo' : 'undo').click();
});
$('duration').onchange=()=>{
  const input=$('duration'),value=Number(input.value),p=history.value;
  const total=p.slides.reduce((n,s)=>n+(selectedPhotos.has(s.asset)?value:s.duration),0);
  if(!input.value||!input.checkValidity()||total>14400){status('時間必須為 0.1–14400 秒（0.1 秒單位），照片總長不可超過 4 小時');refresh();return;}
  edit(p=>{for(const s of p.slides)if(selectedPhotos.has(s.asset))s.duration=value;playhead=selected>=0?Model.photoStart(p,selected):0;});status('');
};
function selectPhoto(i,event){
  const p=history.value,anchor=p.slides.findIndex(s=>s.asset===selectionAnchor);
  selectedPhotos.clear();
  if(event.shiftKey&&anchor>=0){for(let n=Math.min(anchor,i);n<=Math.max(anchor,i);n++)selectedPhotos.add(p.slides[n].asset);}
  else{selectedPhotos.add(p.slides[i].asset);selectionAnchor=p.slides[i].asset;}
  seek(Model.photoStart(p,i)+1e-6);$('slides').children[i].querySelector('.select-slide').focus({preventScroll:true});
}
function removePhotos(assets){
  const first=history.value.slides.findIndex(s=>assets.has(s.asset));if(first<0)return;
  edit(p=>{
    p.slides=p.slides.filter(s=>!assets.has(s.asset));for(const asset of assets)thumbnails.delete(asset);
    selectedPhotos.clear();selected=Math.min(first,p.slides.length-1);selectionAnchor=p.slides[selected]?.asset||null;
    playhead=selected>=0?Model.photoStart(p,selected):0;textIndex=-1;textToolsVisible=false;
  });
  if(selected>=0)$('slides').children[selected].querySelector('.select-slide').focus({preventScroll:true});else $('import').focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{
  const active=document.activeElement;
  if(busy||e.repeat||e.isComposing||!['Delete','Backspace'].includes(e.key)||['INPUT','TEXTAREA','SELECT'].includes(active.tagName)||active.isContentEditable)return;
  if(textToolsVisible&&text()&&active.closest('.text-box,.text-toolbar')){e.preventDefault();$('delete-text').click();return;}
  if(!active.closest('#slides,.photo-tools'))return;
  if(selectedPhotos.size){e.preventDefault();removePhotos(new Set(selectedPhotos));}
});
$('select-all-photos').onclick=()=>{if(busy)return;for(const s of history.value.slides)selectedPhotos.add(s.asset);refresh();};
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!busy&&document.activeElement.closest('#slides,.photo-tools')&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){
    e.preventDefault();$('select-all-photos').click();$('select-all-photos').focus({preventScroll:true});
  }
});
function displayTime(){const range=Model.playbackRange(history.value);$('time').textContent=`${Math.max(0,Math.min(range.end-range.start,playhead-range.start)).toFixed(1)} / 影片總長 ${(range.end-range.start).toFixed(1)} 秒`;}
function changeRange(start,end){
  const total=Math.floor((Model.totalDuration(history.value)+1e-6)*10)/10;
  if(![start,end].every(Number.isFinite)||start<0||end>total||end-start<.1-1e-6||[start,end].some(n=>Math.abs(n*10-Math.round(n*10))>1e-6)){status('範圍須在影片內，至少保留 0.1 秒');refresh();return;}
  edit(p=>{p.selection={start,end};playhead=Math.max(start,Math.min(playhead,end));selected=Model.photoAt(p,playhead===end?Math.max(0,playhead-1e-6):playhead);});status('');
}
$('resolution').onchange = () => edit(p => p.resolution = $('resolution').value);
$('encoding').onchange = () => edit(p => p.lossless = $('encoding').value === 'lossless');
$('add-text').onclick = () => {
  editText(p => { p.slides[selected].texts.push({ id: crypto.randomUUID(), value: '', font: fonts[0], color: '#ffffff', size: .06, x: .1, y: .45, bold: false, italic: false, underline: false }); textIndex = p.slides[selected].texts.length - 1; textToolsVisible = true; });
  $('text-layer').children[textIndex].querySelector('.text-edit').focus();
};
for (const [id, key] of [['font', 'font'], ['color', 'color'], ['size', 'size'], ['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline']]) {
  $(id).onchange = () => {
    if (!text()) return;
    let value = ['bold', 'italic', 'underline'].includes(id) ? $(id).checked : $(id).value;
    if (id === 'size') { value = Number(value) / Model.sizes[history.value.resolution][1]; if (!Number.isFinite(value) || value <= 0 || value > .3) { status('文字大小超出範圍'); refresh(); return; } }
    editText(p => p.slides[selected].texts[textIndex][key] = value);
  };
}
$('color').oninput = $('color').onchange;
function paintPreview(s = slide()) {
  if (editing && editing.slideIndex === selected && s?.texts[editing.index]) { s = structuredClone(s); s.texts[editing.index].value = editing.value; }
  drawSlide($('preview'), image, s);paintedTextKey=Model.textBlockAt(history.value,playhead)?.key||'';
  const previewSize = $('preview').getBoundingClientRect();
  (s?.texts || []).forEach((t, i) => {
    const box = $('text-layer').children[i];
    if (!box) return;
    const bounds = textBounds($('preview'), t);
    Object.assign(box.style, { left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${bounds.width / 1280 * 100}%`, height: `${bounds.height / 720 * 100}%`, minWidth: t.value ? '40px' : '160px' });
    const editor = box.querySelector('.text-edit');
    editor.style.font = textFont(t, previewSize.height);
    editor.style.lineHeight = '1.25'; editor.style.caretColor = t.color; editor.style.setProperty('--text-color', t.color);
  });
}
function dragPosition(point) {
  return TextAlignment.move(drag.text, (point.x - drag.x) / drag.w, (point.y - drag.y) / drag.h,
    drag.bounds, drag.targets, {x: point.altKey ? 0 : 6 / drag.w, y: point.altKey ? 0 : 6 / drag.h});
}
function paintTextDrag() {
  if (!drag) return;
  drag.frame = null;
  const result = dragPosition(drag.latest), canvas = $('preview');
  canvas.getContext('2d').drawImage(drag.background, 0, 0);
  drawTexts(canvas, [result.text]);
  drag.box.style.transform = `translate(${(result.text.x - drag.text.x) * drag.w}px, ${(result.text.y - drag.text.y) * drag.h}px)`;
  $('text-guides').hidden = false;
  crosshairLines.x.style.left = `${(result.text.x + drag.bounds.width / 2) * 100}%`;
  crosshairLines.y.style.top = `${(result.text.y + drag.bounds.height / 2) * 100}%`;
  for (const [axis, position] of [['x', result.vertical], ['y', result.horizontal]]) {
    guideLines[axis].hidden = position === null;
    if (position !== null) guideLines[axis].style[axis === 'x' ? 'left' : 'top'] = `${position * 100}%`;
  }
}
function endTextDrag() {
  const previous = drag; drag = null;
  if (previous) { cancelAnimationFrame(previous.frame); previous.box.style.transform = ''; previous.box.classList.remove('dragging'); }
  $('text-guides').hidden = true;
  return previous;
}
function cancelTextDrag() { if (drag) { endTextDrag(); refresh(); } }
window.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.latest = {x: e.clientX, y: e.clientY, altKey: e.altKey};
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
  drag.moved = true; drag.box.classList.add('dragging');
  if (drag.frame === null) drag.frame = requestAnimationFrame(paintTextDrag);
});
window.addEventListener('pointerup', e => {
  if (!drag) return;
  const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= 4;
  const result = moved ? dragPosition({x: e.clientX, y: e.clientY, altKey: e.altKey}).text : null;
  const previous = endTextDrag();
  if (moved) {
    editText(p => p.slides[selected].texts[previous.index] = result); $('text-layer').children[previous.index]?.focus();
  } else if (previous.editor && previous.editingOnDown) {
    const editor = previous.editor; editor.focus();
    const caret = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (caret && editor.contains(caret.offsetNode)) {
      const range = document.createRange(); range.setStart(caret.offsetNode, caret.offset); range.collapse(true);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    }
  }
});
window.addEventListener('pointercancel', cancelTextDrag);
window.addEventListener('blur', cancelTextDrag);
function movedText(t, dx, dy) {
  const bounds=textBounds($('preview'),t),rect=$('preview').getBoundingClientRect();
  const width=Math.max(bounds.width/1280,(t.value?40:160)/rect.width),height=Math.max(bounds.height/720,40/rect.height);
  return {...t,x:Math.max(0,Math.min(Math.max(0,1-width),t.x+dx)),y:Math.max(0,Math.min(Math.max(0,1-height),t.y+dy))};
}
function renderTextBoxes() {
  $('text-layer').replaceChildren(...(slide()?.texts || []).map((t, i) => {
    const box = document.createElement('div');
    box.tabIndex = 0; box.setAttribute('role', 'group'); box.className = `text-box${textToolsVisible && i === textIndex ? ' selected' : ''}`;
    box.setAttribute('aria-label', `移動文字 ${i + 1}：${t.value || '空白文字'}。方向鍵微調位置`);
    box.onfocus = () => { if (textIndex !== i || !textToolsVisible) selectTextBox(i); };
    box.hidden = busy || playing;
    const editor = document.createElement('div');
    editor.className = 'text-edit'; editor.contentEditable = 'plaintext-only'; editor.spellcheck = false;
    editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-multiline', 'true'); editor.setAttribute('aria-label', `文字 ${i + 1} 內容`);
    editor.title = '雙擊或按 Enter 編輯文字';
    editor.ondblclick = () => editor.focus();
    editor.textContent = t.value;
    editor.onfocus = () => { selectTextBox(i); editing = { slideIndex: selected, index: i, offset: Model.textOffset(history.value,selected,playhead), value: slide().texts[i].value }; };
    const updateContent = e => {
      if (!editing || editing.index !== i) return;
      editing.value = editor.innerText;
      if (!e.isComposing && editing.value.length > 2000) {
        editing.value = editing.value.slice(0, 2000); editor.textContent = editing.value;
        const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      }
      paintPreview();scheduleSave();
    };
    editor.oninput = updateContent; editor.oncompositionend = updateContent;
    editor.onblur = () => { if (editing?.index === i) { commitText(); paintPreview(); } };
    box.append(editor);
    box.onpointerdown = e => {
      if (e.button !== 0 || busy || playing) return;
      const editingOnDown = document.activeElement === editor;
      e.preventDefault(); commitText(); document.activeElement.blur(); selectTextBox(i); box.focus({preventScroll: true});
      const r = $('preview').getBoundingClientRect(), text = structuredClone(slide().texts[i]);
      const measured = textBounds($('preview'), text);
      const targets = {x: [0, 1/3, .5, 2/3, 1], y: [0, 1/3, .5, 2/3, 1]};
      for (const [otherIndex, other] of slide().texts.entries()) if (otherIndex !== i) {
        const bounds = textBounds($('preview'), other);
        const width = Math.max(bounds.width / 1280, (other.value ? 40 : 160) / r.width), height = Math.max(bounds.height / 720, 40 / r.height);
        targets.x.push(other.x, other.x + width / 2, other.x + width);
        targets.y.push(other.y, other.y + height / 2, other.y + height);
      }
      const background = document.createElement('canvas'); background.width = 1280; background.height = 720;
      drawSlide(background, image, {texts: slide().texts.filter((_t, index) => index !== i)});
      drag = {index: i, x: e.clientX, y: e.clientY, text, box, w: r.width, h: r.height, background, targets,
        bounds: {width: Math.max(measured.width / 1280, (text.value ? 40 : 160) / r.width),
          height: Math.max(measured.height / 720, 40 / r.height)},
        editor: e.target.closest('.text-edit'), editingOnDown, moved: false, frame: null};
    };
    box.onkeydown = e => {
      if (e.key === 'Escape' && drag?.box === box) { e.preventDefault(); cancelTextDrag(); return; }
      if (e.key === 'Enter' && e.target === box && !busy && !playing) { e.preventDefault(); editor.focus(); return; }
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[e.key];
      if (!direction || busy || playing || e.target.closest('.text-edit')) return;
      e.preventDefault(); textIndex = i;
      const step = e.shiftKey ? 10 : 1;
      editText(p => p.slides[selected].texts[i] = movedText(p.slides[selected].texts[i], direction[0] * step / 1280, direction[1] * step / 720));
      $('text-layer').children[i]?.focus();
    };
    return box;
  }));
}
function placeToolbar() {
  const toolbar = $('text-toolbar');
  if (toolbar.hidden) return;
  if (!toolbarPosition) { const r = $('preview').getBoundingClientRect(); toolbarPosition = { x: r.left + 12, y: r.top + 12 }; }
  toolbarPosition.x = Math.max(8, Math.min(window.innerWidth - toolbar.offsetWidth - 8, toolbarPosition.x));
  toolbarPosition.y = Math.max(8, Math.min(window.innerHeight - toolbar.offsetHeight - 8, toolbarPosition.y));
  Object.assign(toolbar.style, { left: `${toolbarPosition.x}px`, top: `${toolbarPosition.y}px`, bottom: 'auto' });
}
$('toolbar-handle').onpointerdown = e => {
  if (e.button !== 0) return;
  e.preventDefault(); commitText();
  const r = $('text-toolbar').getBoundingClientRect();
  toolbarDrag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
  e.currentTarget.setPointerCapture(e.pointerId);
};
$('toolbar-handle').onpointermove = e => {
  if (!toolbarDrag) return;
  toolbarPosition = { x: toolbarDrag.left + e.clientX - toolbarDrag.x, y: toolbarDrag.top + e.clientY - toolbarDrag.y };
  placeToolbar();
};
$('toolbar-handle').onpointerup = () => { toolbarDrag = null;scheduleSave(); };
$('toolbar-handle').onpointercancel = () => { toolbarDrag = null; };
$('toolbar-handle').onkeydown = e => {
  const delta = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }[e.key];
  if (!delta) return;
  e.preventDefault(); toolbarPosition.x += delta[0] * (e.shiftKey ? 10 : 1); toolbarPosition.y += delta[1] * (e.shiftKey ? 10 : 1); placeToolbar();
};
window.addEventListener('resize', placeToolbar);
document.querySelector('.preview-area').onpointerdown = e => {
  if (e.target.closest('.text-box, .text-toolbar')) return;
  document.activeElement.blur(); commitText(); selectTextBox(-1);
};
new ResizeObserver(() => paintPreview()).observe($('preview'));
function seek(time) {
  stop(); const p=history.value;playhead=Math.max(0,Math.min(Model.totalDuration(p),time));
  selected=Model.photoAt(p,Math.max(0,playhead-1e-6));textIndex=-1;textToolsVisible=false;refresh();
}
$('rewind').onclick = () => seek(Model.playbackRange(history.value).start);
$('play').onclick = () => run(async () => {
  if(playing){stop();return;}
  const request = ++playRequest;
  const p=history.value;Model.validate(p);const total=Model.totalDuration(p);
  const range=Model.playbackRange(p);
  if(playhead<range.start||playhead>=range.end)playhead=range.start;
  selected=Model.photoAt(p,playhead);textToolsVisible=false;
  if(p.music){
    const source = await window.desktop.audioSource(p.music); if (request !== playRequest) return;
    audio.src=source;audio.currentTime=p.musicEdit.start+playhead%(p.musicEdit.end-p.musicEdit.start);audio.volume=Model.musicLevel(p.musicEdit,playhead,total);
    try { await audio.play(); } catch (e) { if (request !== playRequest) return; throw e; }
    if (request !== playRequest) return;
  }
  playing=true;started=performance.now()-playhead*1000;$('play').textContent='■ 停止';refresh();
  timer=setInterval(()=>{
    playhead=Math.min(range.end,(performance.now()-started)/1000);timeline.setHead(playhead);scheduleSave();displayTime();
    if(p.music){const m=p.musicEdit,wanted=m.start+playhead%(m.end-m.start);if(Math.abs(audio.currentTime-wanted)>.08||audio.currentTime>=m.end)audio.currentTime=wanted;audio.volume=Model.musicLevel(m,playhead,total);}
    if(playhead>=range.end){stop();return;}
    const index=Model.photoAt(p,playhead),key=Model.textBlockAt(p,playhead)?.key||'';if(index!==selected||key!==paintedTextKey){selected=index;refresh();}
  },30);
});
$('cancel').onclick = () => { cancelled = true; run(() => window.desktop.cancel()); };
$('export').onclick = () => run(async () => {
  stop(); let p = structuredClone(history.value); Model.validate(p); busy = true; cancelled = false; refresh();
  try {
    if(p.selection){status('正在準備剪裁範圍…');const range=Model.playbackRange(p);p=await window.desktop.crop(p,range.start,range.end);}
    if(cancelled)throw Error('輸出已取消');
    const segments=Model.renderSegments(p);
    if (!await window.desktop.begin(p)) return;
    const canvas = document.createElement('canvas'); [canvas.width, canvas.height] = Model.sizes[p.resolution];
    for (let i = 0; i < segments.length; i++) {
      if (cancelled) throw Error('輸出已取消');
      const img = await loadImage(segments[i].asset); await document.fonts.ready;
      drawSlide(canvas, img, segments[i]);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('無法合成圖片');
      if (cancelled) throw Error('輸出已取消');
      await window.desktop.frame(i, await blob.arrayBuffer());
      status(`準備畫面 ${i + 1} / ${segments.length}`); $('progress').value = (i + 1) / segments.length * .2;
    }
    status('正在編碼影片…'); await window.desktop.finish(); status('影片輸出完成。');
  } catch (e) { await window.desktop.cancel(); throw e; }
  finally { busy = false; refresh(); }
});
const timeline=createTimeline(()=>history.value,id=>thumbnails.get(id),selectPhoto,
  (from,to)=>edit(p=>{const [clip]=p.slides.splice(from,1);p.slides.splice(to,0,clip);selectedPhotos.clear();selectedPhotos.add(clip.asset);selectionAnchor=clip.asset;selected=to;playhead=Model.photoStart(p,to);textIndex=-1;textToolsVisible=false;}),
  (i,value)=>edit(p=>{selectedPhotos.clear();selectedPhotos.add(p.slides[i].asset);selectionAnchor=p.slides[i].asset;p.slides[i].duration=value;selected=i;playhead=Model.photoStart(p,i);textIndex=-1;textToolsVisible=false;}),
  i=>removePhotos(new Set([history.value.slides[i].asset])),stop,seek,asset=>selectedPhotos.has(asset),changeRange);
const musicTools = createMusicEditor(() => history.value, edit, () => $('play').click(), status);
window.desktop.progress(value => { $('progress').value = .2 + value * .8; status(`正在編碼 ${Math.round(value * 100)}%`); });
function applyProject(saved){
  projectGeneration++;loading++;editing=null;image=null;assetID=null;selectedPhotos.clear();selectionAnchor=null;thumbnails.clear();musicTools.reset();
  history.restore(saved.state);const ui=saved.ui;selected=ui.selected;playhead=ui.playhead;textIndex=ui.textIndex;textToolsVisible=ui.textToolsVisible;toolbarPosition=ui.toolbarPosition;
  $('music-editor').hidden=!ui.musicOpen;
}
async function loadThumbnails(){
  const generation=projectGeneration;
  for(const s of history.value.slides){
    try{const image=await loadImage(s.asset);if(generation!==projectGeneration)return;const thumb=document.createElement('canvas');thumb.width=128;thumb.height=72;drawSlide(thumb,image,{texts:[]});const url=thumb.toDataURL();thumbnails.set(s.asset,url);for(const node of document.querySelectorAll('.select-slide img'))if(node.dataset.asset===s.asset){node.src=url;node.hidden=false;}}
    catch(e){if(generation!==projectGeneration)return;status(`來源照片無法讀取，編輯紀錄仍保留：${s.name}`);}
  }
}
async function initialize(){
  busy=true;refresh();
  try{
    const restored=await window.desktop.restore();if(restored.error){saveEnabled=false;status(restored.error);}
    if(restored.snapshot)applyProject(restored.snapshot);
    restoring=false;busy=false;refresh();if(restored.snapshot)$('timeline-scroll').scrollLeft=restored.snapshot.ui.scrollLeft;
    await loadThumbnails();
  }catch(e){saveEnabled=false;restoring=false;busy=false;refresh();status(`無法恢復編輯：${e.message}`);}
}
async function projectCommand(action){
  document.activeElement.blur();stop();switchingProject=true;busy=true;refresh();
  try{
    await flushSave();
    if(action==='save'||action==='save-as'){status(await window.desktop.saveProject(snapshot(),action==='save-as')?(action==='save-as'?'專案已另存。':'專案已儲存。'):'');}
    else{
      let saved;
      if(action==='new'){
        if(!await window.desktop.newProject(snapshot()))return;
        saved={state:{project:Model.createProject(),textUndo:[],textRedo:[]},ui:{selected:-1,playhead:0,textIndex:-1,textToolsVisible:false,toolbarPosition:null,musicOpen:false,scrollLeft:0}};
      }else{saved=await window.desktop.openProject(snapshot());if(!saved)return;}
      applyProject(saved);saveEnabled=true;refresh();$('timeline-scroll').scrollLeft=saved.ui.scrollLeft;status('');loadThumbnails();
    }
  }catch(e){status(`專案操作失敗：${e.message}`);}
  finally{switchingProject=false;busy=false;refresh();await flushSave();}
}
$('project-menu').onclick=()=>window.desktop.projectMenu();
window.desktop.onProjectCommand(action=>{if(busy||restoring||!['new','open','save','save-as'].includes(action))return;projectTask=projectCommand(action).finally(()=>{projectTask=null;});});
$('timeline-scroll').addEventListener('scroll',scheduleSave);
window.desktop.onCloseRequested(async()=>{if(restoring)await initialized;if(projectTask)await projectTask;commitText();if(await flushSave())await window.desktop.closeReady();});
const initialized=initialize();

