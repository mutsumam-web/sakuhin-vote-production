/* iOS-style artwork notification stack. The document stays the scroll container.
   A collapsed slice of the hero remains sticky above the stacked cards.
   Only nearby artwork cards are mounted; geometry reads remain outside scroll frames. */
(function(){
  'use strict';

  let current=null;
  const EXITING_CARD=1;
  const FRONT_MAX=3;
  const BACK_PEEKS=2;

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
    if(state.hero){
      state.hero.style.removeProperty('--reel-hero-top');
      state.hero.style.removeProperty('--reel-compact-reveal');
    }
    if(state.compactBar){
      state.compactBar.inert=true;
      state.compactBar.setAttribute('aria-hidden','true');
    }
  }

  function clamp(min,value,max){return Math.max(min,Math.min(max,value));}

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
    stage.setAttribute('aria-label','通知カード型の作品一覧');

    const header=document.createElement('div');
    header.className='reel-stage-header';
    const kicker=document.createElement('span');
    kicker.className='reel-stage-kicker';
    kicker.textContent='ARTWORK NOTIFICATIONS';
    const counter=document.createElement('span');
    counter.className='reel-stage-counter';
    counter.setAttribute('aria-live','polite');
    header.append(kicker,counter);

    const viewport=document.createElement('div');
    viewport.className='reel-viewport';
    viewport.setAttribute('aria-label','手前の作品カードはそれぞれ選択・詳細表示できます');

    const controls=document.createElement('div');
    controls.className='reel-controls';
    const previous=document.createElement('button');
    previous.type='button';
    previous.className='reel-nav-button';
    previous.setAttribute('aria-label','前の作品');
    previous.textContent='↑';
    const hint=document.createElement('span');
    hint.className='reel-hint';
    hint.textContent='手前のカードはすべて選択できます';
    const next=document.createElement('button');
    next.type='button';
    next.className='reel-nav-button';
    next.setAttribute('aria-label','次の作品');
    next.textContent='↓';
    controls.append(previous,hint,next);
    stage.append(header,viewport,controls);
    container.replaceChildren(stage);

    const reducedMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hero=document.querySelector('.app-header');
    const compactBar=hero&&hero.querySelector('.hero-compact-bar');
    const state={
      container,stage,viewport,counter,previous,next,works,hero,compactBar,
      createCard:options.createCard,
      cards:new Map(),
      center:-1,
      frontCount:FRONT_MAX,
      cardHeight:160,
      cardGap:10,
      peekStep:18,
      progress:NaN,
      step:1,
      start:0,
      travel:0,
      compactHeight:0,
      expandedHeight:0,
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
      // Card geometry is measured on virtual-window changes, not each scroll frame.
      if(hero&&compactBar){
        state.compactHeight=compactBar.offsetHeight;
        state.expandedHeight=hero.offsetHeight;
        hero.style.setProperty('--reel-hero-top',Math.min(0,state.compactHeight-state.expandedHeight)+'px');
      }
    }

    function renderWindow(center){
      if(center===state.center)return;
      state.center=center;
      const desired=new Set();
      const last=Math.min(count-1,center+state.frontCount+BACK_PEEKS-1);
      for(let index=Math.max(0,center-EXITING_CARD);index<=last;index++){
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

      // Work out how many complete, tappable cards fit above the two peeks.
      // Read only when the virtual window changes or the viewport is resized.
      const sample=state.cards.get(center);
      if(sample){
        state.cardHeight=sample.offsetHeight||160;
        state.cardGap=clamp(8,viewport.clientHeight*.019,13);
        state.peekStep=clamp(13,viewport.clientHeight*.035,20);
        const usable=Math.max(0,viewport.clientHeight-(BACK_PEEKS*state.peekStep+12));
        const fitted=Math.floor((usable+state.cardGap)/(state.cardHeight+state.cardGap));
        const nextCount=clamp(1,fitted,FRONT_MAX);
        if(nextCount!==state.frontCount){
          state.frontCount=nextCount;
          state.center=-1;
          renderWindow(center);
          return;
        }
      }

      state.cards.forEach(function(card,index){
        const active=index>=center&&index<center+state.frontCount;
        card.classList.toggle('is-current',index===center);
        card.classList.toggle('is-active',active);
        card.inert=!active;
        card.setAttribute('aria-hidden',active?'false':'true');
        card.tabIndex=active?0:-1;
        const zone=card.querySelector('.work-select-zone');
        if(zone)zone.tabIndex=active?0:-1;
      });
      const end=Math.min(count,center+state.frontCount);
      counter.textContent='WORK '+String(center+1).padStart(2,'0')+'–'+String(end).padStart(2,'0')+' / '+String(count).padStart(2,'0');
      previous.disabled=center<=0;
      next.disabled=center>=count-1;
    }

    function frame(){
      state.frame=0;
      if(current!==state)return;
      if(hero&&compactBar){
        const reveal=Math.max(0,Math.min(1,(window.scrollY-(state.expandedHeight-state.compactHeight-78))/78));
        hero.style.setProperty('--reel-compact-reveal',reveal.toFixed(3));
        const active=reveal>.18;
        compactBar.inert=!active;
        compactBar.setAttribute('aria-hidden',active?'false':'true');
      }
      const position=(window.scrollY-state.start)/state.step;
      const progress=Math.max(0,Math.min(count-1,position));
      const center=Math.round(progress);
      renderWindow(center);
      // No style writes if the scroll position is unchanged or outside the reel.
      // Reduced-motion users only receive updates when the selected work changes.
      const visualProgress=state.reducedMotion?center:progress;
      if(Math.abs(visualProgress-state.progress)<.001)return;
      state.progress=visualProgress;

      const spacing=state.cardHeight+state.cardGap;
      const frontBottom=(state.frontCount-1)*spacing;
      state.cards.forEach(function(card,index){
        const relative=index-visualProgress;
        const behind=Math.max(0,relative-(state.frontCount-1));
        const y=relative<0
          ?relative*spacing
          :behind>0
            ?frontBottom+behind*state.peekStep
            :relative*spacing;
        const scale=relative<0
          ?1+Math.max(-1,relative)*.035
          :1-Math.min(BACK_PEEKS,behind)*.036;
        const opacity=relative<0
          ?Math.max(0,1+relative)
          :Math.max(.7,1-behind*.12);
        card.style.transform='translate(-50%,0) translate3d(0,'+y.toFixed(1)+'px,0) scale('+scale.toFixed(3)+')';
        card.style.opacity=String(opacity);
        card.style.zIndex=String(relative<0?120:behind>0?40-Math.floor(behind*4):100-Math.floor(relative*8));
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
      state.center=-1; // Recompute the number of fully visible cards on rotation.
      state.progress=NaN;
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
