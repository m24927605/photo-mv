function createMusicEditor(getProject, edit, preview, reportError) {
  const field=id=>document.getElementById(id);
  let sourceKey='', trackKey='', selectionDrag=null;
  function stamp(seconds){const m=Math.floor(seconds/60),s=(seconds%60).toFixed(2).padStart(5,'0');return `${m}:${s}`;}
  function labels(){
    const m=getProject().musicEdit;if(!m)return;
    const start=Number(field('music-start').value),end=Number(field('music-end').value);
    field('clip-time').textContent=`保留 ${stamp(start)} ～ ${stamp(end)} · ${(end-start).toFixed(2)} 秒`;
    field('volume-value').value=`${field('music-volume').value}%`;
    Object.assign(field('clip-region').style,{left:`${start/m.duration*100}%`,width:`${(end-start)/m.duration*100}%`});
  }
  async function sourceWave(){
    const id=getProject().music;if(!id || id===sourceKey)return;
    sourceKey=id;field('source-waveform').hidden=true;field('source-wave-status').hidden=false;field('source-wave-status').textContent='載入聲波…';
    try{const url=await window.desktop.sourceWave(id);if(sourceKey!==id||!url)return;field('source-waveform').src=url;field('source-waveform').hidden=false;field('source-wave-status').hidden=true;}
    catch(e){if(sourceKey===id){sourceKey='';field('source-wave-status').textContent='聲波無法載入';reportError(e.message);}}
  }
  async function trackWave(){
    const p=getProject();if(!p.music || !p.slides.length){field('project-waveform').hidden=true;field('track-wave-status').textContent=p.music?'加入照片':'';trackKey='';return;}
    const key=JSON.stringify([p.music,p.musicEdit,Model.totalDuration(p)]);if(key===trackKey)return;
    trackKey=key;field('project-waveform').hidden=true;field('track-wave-status').textContent='聲波載入中…';
    try{const url=await window.desktop.trackWave(p);if(trackKey!==key||!url)return;field('project-waveform').src=url;field('project-waveform').hidden=false;field('track-wave-status').textContent=p.musicName;}
    catch(e){if(trackKey===key){trackKey='';field('track-wave-status').textContent='聲波無法載入';reportError(e.message);}}
  }
  function refresh(busy){
    const p=getProject(),m=p.musicEdit;
    field('music-heading').disabled=busy||!p.music;field('music-track').disabled=busy||!p.music;
    trackWave();
    if(!p.music||!m){field('music-editor').hidden=true;sourceKey='';return;}
    const total=Model.totalDuration(p),fades=Model.musicFades(m,total);
    field('music-start').max=Math.max(0,m.duration-.01);field('music-end').max=m.duration;
    field('music-fade-in').max=total;field('music-fade-out').max=total;
    for(const [id,value] of [['music-start',m.start],['music-end',m.end],['music-volume',m.volume*100],['music-fade-in',fades.fadeIn],['music-fade-out',fades.fadeOut]]){field(id).value=value;field(id).disabled=busy;}
    field('music-listen').disabled=busy;labels();if(!field('music-editor').hidden)sourceWave();
  }
  function commit(){
    const p=getProject(),m={...p.musicEdit,start:Number(field('music-start').value),end:Number(field('music-end').value),volume:Number(field('music-volume').value)/100,fadeIn:Number(field('music-fade-in').value),fadeOut:Number(field('music-fade-out').value)};
    try{Model.validate({...p,musicEdit:m,selection:undefined});edit(next=>next.musicEdit=m);}catch(e){reportError(e.message);refresh(false);}
  }
  for(const id of ['music-start','music-end','music-volume','music-fade-in','music-fade-out']){
    field(id).oninput=()=>{if(id==='music-start')field(id).value=Math.min(Number(field(id).value),Number(field('music-end').value)-.01);if(id==='music-end')field(id).value=Math.max(Number(field(id).value),Number(field('music-start').value)+.01);labels();};
    field(id).onchange=commit;
  }
  const region=field('clip-region');
  region.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const m=getProject().musicEdit;selectionDrag={x:e.clientX,start:m.start,end:m.end,width:field('wave-editor').clientWidth};region.setPointerCapture(e.pointerId);};
  region.onpointermove=e=>{if(!selectionDrag)return;const d=selectionDrag,m=getProject().musicEdit,length=d.end-d.start;const start=Math.max(0,Math.min(m.duration-length,d.start+(e.clientX-d.x)/d.width*m.duration));field('music-start').value=start;field('music-end').value=start+length;labels();};
  region.onpointerup=()=>{if(!selectionDrag)return;selectionDrag=null;commit();};
  region.onpointercancel=()=>{selectionDrag=null;refresh(false);};
  region.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const m=getProject().musicEdit,length=m.end-m.start;const start=Math.max(0,Math.min(m.duration-length,m.start+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:.1)));field('music-start').value=start;field('music-end').value=start+length;commit();};
  const open=()=>{field('music-editor').hidden=false;sourceWave();};
  field('music-heading').onclick=open;
  field('music-track').onclick=open;
  field('close-music').onclick=()=>{field('music-editor').hidden=true;};
  field('music-listen').onclick=preview;
  return {refresh,reset(){sourceKey='';trackKey='';selectionDrag=null;field('source-waveform').hidden=true;field('project-waveform').hidden=true;}};
}
