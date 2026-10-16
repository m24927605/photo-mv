function createTimeline(getProject, thumbnail, select, reorder, resize, remove, stop, seek, isSelected, changeRange) {
  const field=id=>document.getElementById(id);
  let dragged=null, resizing=null, scale=80, scrubbing=null, rangeDrag=null, blocked=false;
  const head=field('timeline-playhead');
  const position=e=>Math.max(0,Math.min(Model.totalDuration(getProject()),(e.clientX-field('timeline-content').getBoundingClientRect().left)/scale));
  for(const target of [head,field('timeline-ruler')]){
    target.onpointerdown=e=>{if(blocked||e.button!==0||!getProject().slides.length)return;e.preventDefault();e.stopPropagation();scrubbing=e.pointerId;target.setPointerCapture(e.pointerId);seek(position(e));head.classList.add('scrubbing');};
    target.onpointermove=e=>{if(scrubbing!==e.pointerId)return;seek(position(e));};
    target.onpointerup=e=>{if(scrubbing!==e.pointerId)return;seek(position(e));scrubbing=null;head.classList.remove('scrubbing');};
    target.onlostpointercapture=target.onpointercancel=()=>{scrubbing=null;head.classList.remove('scrubbing');};
  }
  head.onkeydown=e=>{
    if(blocked||!getProject().slides.length||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const value=Number(head.getAttribute('aria-valuenow')),total=Model.totalDuration(getProject());
    seek(e.key==='Home'?0:e.key==='End'?total:Math.max(0,Math.min(total,value+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:.1))));
  };
  for(const [id,side] of [['range-left','start'],['range-right','end']]){
    const handle=field(id);
    const update=e=>{const p=getProject(),r=Model.playbackRange(p);const value=Math.round(position(e)*10)/10;changeRange(side==='start'?Math.max(0,Math.min(r.end-.1,value)):r.start,side==='end'?Math.min(Math.floor((Model.totalDuration(p)+1e-6)*10)/10,Math.max(r.start+.1,value)):r.end);};
    handle.onpointerdown=e=>{if(blocked||e.button!==0)return;e.preventDefault();e.stopPropagation();rangeDrag=e.pointerId;handle.setPointerCapture(e.pointerId);update(e);};
    handle.onpointermove=e=>{if(rangeDrag===e.pointerId)update(e);};
    handle.onpointerup=e=>{if(rangeDrag!==e.pointerId)return;update(e);rangeDrag=null;};
    handle.onpointercancel=handle.onlostpointercapture=()=>{rangeDrag=null;};
    handle.onkeydown=e=>{if(blocked||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const p=getProject(),total=Math.floor((Model.totalDuration(p)+1e-6)*10)/10,r=Model.playbackRange(p);const value=Math.round((r[side]+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:.1))*10)/10;changeRange(side==='start'?Math.max(0,Math.min(r.end-.1,value)):r.start,side==='end'?Math.min(total,Math.max(r.start+.1,value)):r.end);};
  }
  function refresh(selected,busy,time) {
    const p=getProject(), total=Model.totalDuration(p);blocked=busy;
    head.setAttribute('aria-disabled',String(busy||!p.slides.length));head.tabIndex=busy||!p.slides.length?-1:0;
    head.setAttribute('aria-valuemax',String(total));
    const width=Math.max(field('timeline-scroll').clientWidth,total*80);
    field('timeline-content').style.width=`${width}px`;
    field('timeline-content').style.setProperty('--track-viewport',`${field('timeline-scroll').clientWidth}px`);
    scale=total?width/total:80;
    setHead(time);
    const range=Model.playbackRange(p),top=field('timeline-ruler').offsetTop;
    head.style.top=`${top}px`;
    for(const [id,value] of [['range-left',range.start],['range-right',range.end]]){const handle=field(id);handle.style.left=`${value*scale}px`;handle.style.top=`${top}px`;handle.title=`${id==='range-left'?'開始播放軸':'結束播放軸'} ${value.toFixed(1)} 秒`;handle.setAttribute('aria-label',`${handle.title}，可左右拖曳`);handle.disabled=busy||!p.slides.length||range.end<.1;}
    const shade=field('timeline-range');shade.style.top=`${top}px`;shade.style.background=`linear-gradient(to right,#0007 0%,#0007 ${total?range.start/total*100:0}%,transparent ${total?range.start/total*100:0}%,transparent ${total?range.end/total*100:100}%,#0007 ${total?range.end/total*100:100}%)`;
    field('timeline-ruler').onclick=e=>{if(!busy)seek(Math.max(0,Math.min(total,(e.clientX-field('timeline-content').getBoundingClientRect().left)/scale)));};
    field('music-track').onpointerdown=e=>{if(!busy&&p.music)seek(Math.max(0,Math.min(total,(e.clientX-field('timeline-content').getBoundingClientRect().left)/scale)));};
    const ticks=[]; const step=total<=10?1:total<=60?5:30;
    for(let t=0;t<=total;t+=step){const tick=document.createElement('span');tick.textContent=`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;tick.style.left=`${t*scale}px`;ticks.push(tick);}
    field('timeline-ruler').replaceChildren(...ticks);
    for(const block of Model.textBlocks(p)) if(block.time>0){
      const marker=document.createElement('button');marker.className='text-cue';marker.textContent='字';marker.style.left=`${block.time*scale}px`;marker.disabled=busy;
      marker.title=`文字區塊 ${block.time.toFixed(2)} 秒：${block.texts.map(t=>t.value).join(' ').slice(0,100)||'無文字'}`;marker.setAttribute('aria-label',marker.title);
      marker.onpointerdown=e=>e.stopPropagation();marker.onclick=e=>{e.stopPropagation();if(!busy)seek(block.time);};field('timeline-ruler').append(marker);
    }
    field('slides').replaceChildren(...p.slides.map((s,i)=>{
      const clip=document.createElement('li');clip.className=`photo-clip${isSelected(s.asset)?' selected':''}`;clip.style.width=`${s.duration*scale}px`;clip.draggable=!busy;
      const pick=document.createElement('button');pick.className='select-slide';pick.disabled=busy;pick.title=s.name;pick.setAttribute('aria-label',`照片 ${i+1}：${s.name}`);
      const image=document.createElement('img');image.alt='';image.draggable=false;image.dataset.asset=s.asset;const url=thumbnail(s.asset);if(url)image.src=url;else image.hidden=true;
      const name=document.createElement('span');name.textContent=s.name;
      const duration=document.createElement('small');duration.textContent=`${s.duration.toFixed(1)} 秒`;
      pick.setAttribute('aria-pressed',String(isSelected(s.asset)));pick.append(image,name,duration);pick.onclick=e=>select(i,e);
      const dropAt=e=>{if(dragged===null || busy)return;e.preventDefault();const r=clip.getBoundingClientRect();let to=i+(e.clientX>r.left+r.width/2?1:0);if(dragged<to)to--;const from=dragged;dragged=null;if(from!==to)reorder(from,to);};
      clip.ondragstart=e=>{if(resizing){e.preventDefault();return;}stop();dragged=i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));clip.classList.add('reordering');};
      clip.ondragend=()=>{dragged=null;clip.classList.remove('reordering');};
      clip.ondragover=e=>{if(dragged!==null){e.preventDefault();e.dataTransfer.dropEffect='move';}};
      clip.ondrop=dropAt;
      const maxDuration=14400-p.slides.reduce((n,c)=>n+c.duration,0)+s.duration;
      for(const [side,direction] of [['left',-1],['right',1]]) {
        const handle=document.createElement('button');handle.className=`photo-edge ${side}`;handle.disabled=busy;handle.setAttribute('aria-label',`照片 ${i+1} ${side==='left'?'左':'右'}側時間把手`);
        handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();stop();clip.draggable=false;resizing={x:e.clientX,duration:s.duration,scroll:field('timeline-scroll').scrollLeft};handle.setPointerCapture(e.pointerId);};
        const next=e=>Math.max(.1,Math.min(maxDuration,Math.round((resizing.duration+direction*(e.clientX-resizing.x+field('timeline-scroll').scrollLeft-resizing.scroll)/scale)*10)/10));
        handle.onpointermove=e=>{if(!resizing)return;const value=next(e);clip.style.width=`${value*scale}px`;duration.textContent=`${value.toFixed(1)} 秒`;};
        handle.onpointerup=e=>{if(!resizing)return;const value=next(e);resizing=null;clip.draggable=!busy;resize(i,value);};
        handle.onpointercancel=()=>{resizing=null;refresh(selected,busy);};
        handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();resize(i,Math.max(.1,Math.min(maxDuration,Math.round((s.duration+(e.key==='ArrowRight'?1:-1)*direction*(e.shiftKey?1:.1))*10)/10)));};
        clip.append(handle);
      }
      const del=document.createElement('button');del.className='photo-delete';del.textContent='×';del.disabled=busy;del.setAttribute('aria-label',`移除照片 ${i+1}`);del.onclick=e=>{e.stopPropagation();remove(i);};
      clip.append(pick,del);return clip;
    }));
  }
  function setHead(time){head.style.left=`${(time||0)*scale}px`;head.setAttribute('aria-valuenow',String(time||0));head.setAttribute('aria-valuetext',`${(time||0).toFixed(1)} 秒`);}
  return {refresh,setHead};
}
