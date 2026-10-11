/* Single artwork reel: document scrolling is the only scroll container.
   The hero remains in normal flow; the sticky reel stage occupies the gallery.
   Only three artwork cards (current and neighbours) are mounted at once.
   Geometry is cached: scrolling reads scrollY, not bounding boxes. */
(function(){
  'use strict';

  let current=null;
  const WINDOW_RADIUS=1;

  function destroy(){
    if(!current)return;
    const state=current;
    current=null;
    window.removeEventListener('scroll',state.onScroll);
    window.removeEventListener('resize',state.onResize);
    if(state.frame)cancelAnimationFrame(state.frame);
    if(state.snapTimer)clearTimeout(state.snapTimer);
    state.container.classList.remove('reel-track');
    state.container.style.removeProperty('--reel-steps');
  }

  function mount(options){
    destroy();
    const container=options.container;
    const works=options.works;
    const count=works.length;
    if(!count)return;

    container.classList.add('reel-track');
    container.style.setProperty('--reel-steps',String(count-1));

    const stage=document.createElement('section');
    stage.className='reel-stage';
    stage.setAttribute('aria-label','作品鑑賞スロットリール');

    const header=document.createElement('div');
    header.className='reel-stage-header';
    const kicker=document.createElement('span');
    kicker.className='reel-stage-kicker';
    kicker.textContent='ART REEL';
    const counter=document.createElement('span');
    counter.className='reel-stage-counter';
    counter.setAttribute('aria-live','polite');
    header.append(kicker,counter);

    const viewport=document.createElement('div');
    viewport.className='reel-viewport';
    viewport.setAttribute('aria-label','中央の作品を選択または詳細表示');

    const controls=document.createElement('div');
    controls.className='reel-controls';
    const previous=document.createElement('button');
    previous.type='button';
    previous.className='reel-nav-button';
    previous.setAttribute('aria-label','前の作品');
    previous.textContent='↑';
    const hint=document.createElement('span');
    hint.className='reel-hint';
    hint.textContent='上下にスワイプして鑑賞';
    const next=document.createElement('button');
    next.type='button';
    next.className='reel-nav-button';
    next.setAttribute('aria-label','次の作品');
    next.textContent='↓';
    controls.append(previous,hint,next);
    stage.append(header,viewport,controls);
    container.replaceChildren(stage);

    const reducedMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state={
      container,stage,viewport,counter,previous,next,works,
      createCard:options.createCard,
      cards:new Map(),
      center:-1,
      progress:NaN,
      step:1,
      start:0,
      radius:0,
      frame:0,
      snapTimer:0,
      reducedMotion,
      onScroll:null,
      onResize:null
    };
    current=state;

    function measure(){
      // Read geometry only on mount or viewport resize, never per scroll frame.
      const track=container.getBoundingClientRect();
      const stageHeight=stage.offsetHeight;
      state.start=track.top+window.scrollY;
      state.step=count>1?Math.max(1,(track.height-stageHeight)/(count-1)):1;
      state.radius=Math.min(viewport.clientHeight*.43,300);
    }

    function renderWindow(center){
      if(center===state.center)return;
      state.center=center;
      const desired=new Set();
      for(let index=Math.max(0,center-WINDOW_RADIUS);index<=Math.min(count-1,center+WINDOW_RADIUS);index++){
        desired.add(index);
      }
      state.cards.forEach(function(card,index){
        if(!desired.has(index)){
          card.remove();
          state.cards.delete(index);
        }
      });
      desired.forEach(function(index){
        if(state.cards.has(index))return;
        const card=state.createCard(works[index],index,true);
        card.classList.add('reel-card');
        viewport.appendChild(card);
        state.cards.set(index,card);
      });
      // Focus/accessibility attributes only change when the central work changes.
      state.cards.forEach(function(card,index){
        const active=index===center;
        card.classList.toggle('is-current',active);
        card.inert=!active;
        card.setAttribute('aria-hidden',active?'false':'true');
        card.tabIndex=active?0:-1;
        const zone=card.querySelector('.work-select-zone');
        if(zone)zone.tabIndex=active?0:-1;
      });
      counter.textContent='WORK '+String(center+1).padStart(2,'0')+' / '+String(count).padStart(2,'0');
      previous.disabled=center<=0;
      next.disabled=center>=count-1;
    }

    function frame(){
      state.frame=0;
      if(current!==state)return;
      const position=(window.scrollY-state.start)/state.step;
      const progress=Math.max(0,Math.min(count-1,position));
      const center=Math.round(progress);
      renderWindow(center);
      // No style writes if the scroll position is unchanged or outside the reel.
      // Reduced-motion users only receive updates when the selected work changes.
      const visualProgress=state.reducedMotion?center:progress;
      if(Math.abs(visualProgress-state.progress)<.001)return;
      state.progress=visualProgress;

      const radius=state.radius;
      state.cards.forEach(function(card,index){
        const relative=index-visualProgress;
        const magnitude=Math.abs(relative);
        const angle=Math.max(-84,Math.min(84,relative*40));
        const radians=angle*Math.PI/180;
        const y=state.reducedMotion?relative*radius*.7:Math.sin(radians)*radius;
        const z=state.reducedMotion?0:(Math.cos(radians)-1)*radius*1.35;
        const rotation=state.reducedMotion?0:-angle;
        card.style.transform='translate(-50%,-50%) translate3d(0,'+y.toFixed(1)+'px,'+z.toFixed(1)+'px) rotateX('+rotation.toFixed(1)+'deg)';
        card.style.opacity=String(Math.max(.04,1-magnitude*.42));
        card.style.zIndex=String(100-Math.round(magnitude*10));
      });
    }

    function schedule(){
      if(!state.frame)state.frame=requestAnimationFrame(frame);
    }

    function snap(){
      if(current!==state||count<2)return;
      if(document.body.classList.contains('work-detail-active')||
         document.body.classList.contains('vote-confirm-active'))return;
      const position=(window.scrollY-state.start)/state.step;
      if(position<=0||position>=count-1)return;
      const nearest=Math.round(position);
      if(Math.abs(position-nearest)<.015)return;
      window.scrollTo({
        top:state.start+nearest*state.step,
        behavior:state.reducedMotion?'instant':'smooth'
      });
    }

    function onScroll(){
      schedule();
      if(state.snapTimer)clearTimeout(state.snapTimer);
      state.snapTimer=setTimeout(snap,190);
    }

    function onResize(){
      measure();
      state.progress=NaN; // Updated radius/viewport size requires fresh transforms.
      schedule();
    }

    function go(delta){
      const target=Math.max(0,Math.min(count-1,state.center+delta));
      window.scrollTo({
        top:state.start+target*state.step,
        behavior:state.reducedMotion?'instant':'smooth'
      });
    }

    previous.addEventListener('click',function(){go(-1);});
    next.addEventListener('click',function(){go(1);});
    state.onScroll=onScroll;
    state.onResize=onResize;
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onResize,{passive:true});
    measure();
    schedule();
  }

  window.SakuhinReel={mount,destroy};
})();
