(function (root) {
  const sizes = { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080], '2K': [2560, 1440], '4K': [3840, 2160] };
  const platformFonts = {
    win32: ['Microsoft JhengHei', 'PMingLiU', 'DFKai-SB', 'Arial', 'Georgia', 'Times New Roman'],
    darwin: ['PingFang TC', 'Songti TC', 'Kaiti TC', 'Arial', 'Georgia', 'Times New Roman']
  };
  const fonts = [...new Set(Object.values(platformFonts).flat())];
  function createProject(){return {slides:[],music:null,musicName:'',musicEdit:null,resolution:'4K',lossless:false};}
  function validateProject(project, allowEmpty) {
    if (!project || !Array.isArray(project.slides) || (!allowEmpty && !project.slides.length) || project.slides.length > 300 || !sizes[project.resolution] || typeof project.lossless !== 'boolean') throw Error('請加入 1–300 張照片並選擇有效解析度');
    let duration = 0;
    for (const slide of project.slides) {
      if (typeof slide.asset !== 'string' || !Number.isFinite(slide.duration) || slide.duration < .1 || slide.duration > 14400 || Math.abs(slide.duration * 10 - Math.round(slide.duration * 10)) > 1e-6 || !Array.isArray(slide.texts) || slide.texts.length > 20) throw Error('照片時間必須為 0.1–14400 秒（0.1 秒單位），文字最多 20 段');
      duration += slide.duration;
      validateTexts(slide.texts);
      if (slide.textOverride !== undefined && typeof slide.textOverride !== 'boolean') throw Error('文字區塊標記不合法');
      if (slide.textChanges !== undefined) validateTextChanges(slide.textChanges);
    }
    if (duration > 14400) throw Error('影片不得超過 4 小時');
    if (project.music) {
      const m = project.musicEdit;
      if (typeof project.music !== 'string' || !m || !['duration', 'start', 'end', 'volume', 'fadeIn', 'fadeOut'].every(k => Number.isFinite(m[k])) || m.duration <= 0 || m.start < 0 || m.end <= m.start || m.end > m.duration || m.volume < 0 || m.volume > 1 || m.fadeIn < 0 || m.fadeOut < 0 || m.fadeIn > 14400 || m.fadeOut > 14400) throw Error('音樂裁切、音量或淡入淡出設定不合法');
    }

    const total = totalDuration(project);
    if(project.selection){const r=project.selection;if(![r.start,r.end].every(Number.isFinite)||r.start<0||r.end<=r.start||r.end>14400)throw Error('時間軸選取範圍不合法');}
    if (total > 14400) throw Error('影片不得超過 4 小時');
    return Math.round(total * 30);
  }
  function validate(project){return validateProject(project,false);}
  function validateDraft(project){return validateProject(project,true);}
  function validateTexts(texts) {
    if(!Array.isArray(texts)||texts.length>20) throw Error('文字資料不合法');
    const ids = new Set();
    for (const t of texts) {
        if (t.id !== undefined) { if (typeof t.id !== 'string' || !t.id || ids.has(t.id)) throw Error('文字識別資料不合法'); ids.add(t.id); }
        if (typeof t.value !== 'string' || t.value.length > 2000 || !fonts.includes(t.font) || !/^#[0-9a-f]{6}$/i.test(t.color) || !Number.isFinite(t.size) || !Number.isFinite(t.size) || t.size <= 0 || t.size > .3 || !Number.isFinite(t.x) || !Number.isFinite(t.y) || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1 || typeof t.bold !== 'boolean' || typeof t.italic !== 'boolean' || typeof t.underline !== 'boolean') throw Error('文字內容或樣式不合法');
      }
  }
  function validateTextChanges(changes) {
    if (!Array.isArray(changes)) throw Error('文字時間區塊不合法');
    let previous = 0;
    for (const block of changes) {
      if (!block || !Number.isFinite(block.at) || block.at <= previous || block.at > 14400 || Math.abs(block.at * 30 - Math.round(block.at * 30)) > 1e-6) throw Error('文字時間區塊不合法');
      validateTexts(block.texts); previous = block.at;
    }
  }
  function validateTextState(state) {
    if (!Array.isArray(state) || state.length > 300) throw Error('文字步驟資料不合法');
    const assets = new Set();
    for (const item of state) {
      if (!item || typeof item.asset !== 'string' || assets.has(item.asset) || typeof item.textOverride !== 'boolean') throw Error('文字步驟資料不合法');
      assets.add(item.asset); validateTexts(item.texts); validateTextChanges(item.textChanges);
    }
  }
  function textBlocks(project) {
    const blocks = []; let start = 0;
    project.slides.forEach((slide, index) => {
      if (slide.texts.length || slide.textOverride) blocks.push({time: start, index, offset: 0, texts: slide.texts, key: `${slide.asset}:0`});
      for (const block of slide.textChanges || []) if (block.at < slide.duration - 1e-6) blocks.push({time: start + block.at, index, offset: block.at, texts: block.texts, key: `${slide.asset}:${block.at}`});
      start += slide.duration;
    });
    return blocks;
  }
  function textBlockAt(project, time) {
    let result = null;
    for (const block of textBlocks(project)) { if (block.time > time + 1e-6) break; result = block; }
    return result;
  }
  function textsAt(project, time) { return textBlockAt(project, time)?.texts || []; }
  function textOffset(project, index, time) {
    return Math.max(0, Math.min(project.slides[index].duration - 1/30, Math.round((time - photoStart(project, index)) * 30) / 30));
  }
  function captureTextState(project) {
    return structuredClone(project.slides.map(s => ({asset: s.asset, texts: s.texts, textOverride: Boolean(s.textOverride), textChanges: s.textChanges || []})));
  }
  function restoreTextState(project, state) {
    const next = structuredClone(project), saved = new Map(state.map(s => [s.asset, s]));
    for (const slide of next.slides) {
      const item = saved.get(slide.asset);
      slide.texts = item ? structuredClone(item.texts) : [];
      if (item?.textOverride) slide.textOverride = true; else delete slide.textOverride;
      if (item?.textChanges.length) slide.textChanges = structuredClone(item.textChanges); else delete slide.textChanges;
    }
    return next;
  }
  function changeText(project, index, offset, change) {
    const next = structuredClone(project), slide = next.slides[index];
    if (!slide || !Number.isFinite(offset) || offset < 0 || offset >= slide.duration || Math.abs(offset * 30 - Math.round(offset * 30)) > 1e-6) throw Error('文字編輯時間不合法');
    const before = textsAt(project, photoStart(project, index) + offset), base = slide.texts;
    slide.texts = structuredClone(before); change(next); const texts = slide.texts; slide.texts = base;
    validateTexts(texts);
    if (JSON.stringify(before) === JSON.stringify(texts)) return project;
    if (offset === 0) { slide.texts = texts; slide.textOverride = true; }
    else {
      slide.textChanges = [...(slide.textChanges || []).filter(b => b.at !== offset), {at: offset, texts}].sort((a,b) => a.at-b.at);
    }
    const later = textBlocks(next).filter(b => b.time > photoStart(project, index) + offset + 1e-6);
    for (const id of new Set([...before, ...texts].map(t => t.id).filter(Boolean))) {
      const old = before.find(t => t.id === id), updated = texts.find(t => t.id === id);
      if (JSON.stringify(old) === JSON.stringify(updated)) continue;
      for (const block of later) {
        const position = block.texts.findIndex(t => t.id === id);
        // An explicit later edit or deletion ends this text's inheritance.
        if (old && (position < 0 || JSON.stringify(block.texts[position]) !== JSON.stringify(old))) break;
        if (!old) block.texts.push(structuredClone(updated));
        else if (updated) block.texts[position] = structuredClone(updated);
        else block.texts.splice(position, 1);
        validateTexts(block.texts);
      }
    }
    return next;
  }
  function history(initial) {
    let current = structuredClone(initial), past = [], future = [];
    return {
      get value() { return current; },
      snapshot(draft) {
        const next = draft ? changeText(current, draft.slideIndex, draft.offset, p => p.slides[draft.slideIndex].texts[draft.index].value = draft.value.slice(0,2000)) : current;
        return structuredClone({project: next, textUndo: next === current ? past : [...past, captureTextState(current)], textRedo: next === current ? future : []});
      },
      restore(saved) { current = structuredClone(saved.project); past = structuredClone(saved.textUndo || []); future = structuredClone(saved.textRedo || []); },
      canUndoText() { return past.length > 0; },
      canRedoText() { return future.length > 0; },
      edit(change) { const next = structuredClone(current); change(next); current = next; },
      editText(index, change, offset = 0) {
        const next = changeText(current, index, offset, change); if (next === current) return;
        past.push(captureTextState(current)); future = []; current = next;
      },
      undoText() { if (!past.length) return; future.push(captureTextState(current)); current = restoreTextState(current, past.pop()); },
      redoText() { if (!future.length) return; past.push(captureTextState(current)); current = restoreTextState(current, future.pop()); }
    };
  }
  function renderSegments(project) {
    const blocks = textBlocks(project), segments = []; let start = 0;
    for (const slide of project.slides) {
      const first = Math.round(start * 30), last = first + Math.round(slide.duration * 30);
      const cuts = [first, ...blocks.map(b => Math.round(b.time * 30)).filter(frame => frame > first && frame < last), last];
      for (let i=0;i<cuts.length-1;i++) segments.push({asset: slide.asset, name: slide.name, duration: (cuts[i+1]-cuts[i])/30, texts: structuredClone(textsAt(project, cuts[i]/30))});
      start += slide.duration;
    }
    return segments;
  }
  function trimProject(project,start,end){
    validate(project);const total=totalDuration(project);
    if(![start,end].every(Number.isFinite)||start<0||end<=start||end>total+1e-6||end-start<.1-1e-6||[start,end].some(v=>Math.abs(v*10-Math.round(v*10))>1e-6))throw Error('剪裁範圍必須在影片內，至少 0.1 秒');
    const next=structuredClone(project);let position=0;
    next.slides=next.slides.flatMap(s=>{
      const originalStart=position, left=Math.max(start,position), right=Math.min(end,position+s.duration);position+=s.duration;
      if(right<=left)return [];
      const offset=left-originalStart, changes=(s.textChanges||[]).filter(b=>b.at>offset+1e-6&&b.at<right-originalStart-1e-6).map(b=>({...b,at:Math.round((b.at-offset)*30)/30}));
      const clip={...s,duration:Math.round((right-left)*30)/30};delete clip.textChanges;if(changes.length)clip.textChanges=changes;
      if(left===start){clip.texts=structuredClone(textsAt(project,start));clip.textOverride=true;}
      return [clip];
    });
    if(next.music)next.musicEdit={duration:Math.round((end-start)*10)/10,start:0,end:Math.round((end-start)*10)/10,volume:1,fadeIn:0,fadeOut:0};
    delete next.selection;return next;
  }
  function playbackRange(p){
    const total=totalDuration(p);if(!p.selection||!total)return {start:0,end:total};
    const end=Math.min(total,Math.max(.1,p.selection.end));return {start:Math.max(0,Math.min(p.selection.start,end-.1)),end};
  }
  function totalDuration(p) { return p.slides.reduce((n,s)=>n+s.duration,0); }
  function photoStart(p,index) {return p.slides.slice(0,index).reduce((n,s)=>n+s.duration,0);}
  function photoAt(p,time) {let end=0;return p.slides.findIndex(s=>{end+=s.duration;return time<end;});}
  function musicFades(m,duration){return {fadeIn:Math.min(m.fadeIn,duration),fadeOut:Math.min(m.fadeOut,duration)};}
  function musicLevel(m, time, duration) {
    const {fadeIn,fadeOut}=musicFades(m,duration);
    return m.volume * (fadeIn ? Math.min(1, Math.max(0, time / fadeIn)) : 1) * (fadeOut ? Math.min(1, Math.max(0, (duration - time) / fadeOut)) : 1);
  }
  const api = { createProject, sizes, fonts, platformFonts, validate, validateDraft, validateTexts, validateTextState, history, textBlocks, textBlockAt, textsAt, textOffset, renderSegments, musicFades, musicLevel, trimProject, playbackRange, totalDuration, photoStart, photoAt };
  if (typeof module !== 'undefined') module.exports = api; else root.Model = api;
})(globalThis);
