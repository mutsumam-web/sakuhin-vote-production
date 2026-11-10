/* iOS-style artwork notification stack. The document stays the scroll container.
   A collapsed slice of the hero remains sticky above the stacked cards.
   Only nearby artwork cards are mounted; geometry reads remain outside scroll frames. */
(function(){
  'use strict';

  let current=null;
  const EXITING_CARD=1;
  const FRONT_MAX=6;
  const BACK_PEEKS=2;
  const MOTION_RESPONSE_MS=55; // Short, frame-rate-independent easing; no long drag.

  function destroy(){
    if(!current)return;
    const state=current;
    current=null;
    window.removeEventListener('scroll',state.onScroll);
    window.removeEventListener('resize',state.onResize);
    window.removeEventListener('wheel',state.onInteraction);
    window.removeEventListener('touchstart',state.onInteraction);
    if(state.frame)cancelAnimationFrame(state.frame);
    if(state.snapTimer)clearTimeout(state.snapTimer);
    state.container.classList.remove('reel-track');
    state.container.style.removeProperty('--reel-steps');
    state.container.style.removeProperty('--reel-step');
    state.container.style.removeProperty('--reel-footer-height');
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
    const next=document.createElement('button');
    next.type='button';
    next.className='reel-nav-button';
    next.setAttribute('aria-label','次の作品');
    next.textContent='↓';
    controls.append(previous,next);
    header.append(controls);
    stage.append(header,viewport);
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
      cardHeight:64,
      cardGap:9,
      peekStep:18,
      stackInset:0,
      progress:NaN,
      lastFrameTime:0,
      step:1,
      start:0,
      travel:0,
      compactHeight:0,
      expandedHeight:0,
      footerHeight:0,
      compactReveal:'',
      compactActive:false,
      snapTarget:null,
      frame:0,
      snapTimer:0,
      reducedMotion,
      onScroll:null,
      onResize:null,
      onInteraction:null
    };
    current=state;

    function measure(){
      // Use the real footer height; the CSS fallback previously double-reserved
      // safe-area/estimated bar space, leaving a visible empty strip on phones.
      const footer=document.querySelector('.selection-bar');
      if(footer){
        const height=Math.ceil(footer.getBoundingClientRect().height);
        if(height!==state.footerHeight){
          state.footerHeight=height;
          container.style.setProperty('--reel-footer-height',String(height)+'px');
        }
      }
      // Read geometry only on mount/resize, never per scroll frame.
      const track=container.getBoundingClientRect();
      const stageHeight=stage.offsetHeight;
      if(hero&&compactBar){
        state.compactHeight=compactBar.offsetHeight;
        state.expandedHeight=hero.offsetHeight;
        hero.style.setProperty('--reel-hero-top',Math.min(0,state.compactHeight-state.expandedHeight)+'px');
      }
      // Begin rotating exactly when the sticky reel stage reaches its pin top.
      // Previously rotation started after the stage had already stopped moving.
      state.start=track.top+window.scrollY-state.compactHeight;
      state.step=count>1?Math.max(1,(track.height-stageHeight)/(count-1)):1;
    }

    function measureStack(){
      // Card and viewport sizes depend on viewport, not the current artwork.
      // Never force synchronous layout in the scroll animation frame.
      const sample=state.cards.get(state.center);
      if(!sample)return;
      state.cardHeight=sample.offsetHeight||64;
      const availableHeight=viewport.clientHeight;
      const minimumGap=clamp(7,availableHeight*.015,11);
      state.peekStep=clamp(13,availableHeight*.035,20);
      const rearReserve=BACK_PEEKS*state.peekStep+12;
      const usable=Math.max(0,availableHeight-rearReserve);
      const fitted=Math.floor((usable+minimumGap)/(state.cardHeight+minimumGap));
      const nextCount=clamp(1,fitted,FRONT_MAX);
      if(nextCount!==state.frontCount){
        state.frontCount=nextCount;
        const index=state.center;
        state.center=-1;
        renderWindow(index);
      }
      const spare=Math.max(0,usable-state.frontCount*state.cardHeight
        -Math.max(0,state.frontCount-1)*minimumGap);
      const gaps=Math.max(0,state.frontCount-1);
      const extraGap=gaps?Math.min(12,spare/gaps):0;
      state.cardGap=minimumGap+extraGap;
      state.stackInset=spare-extraGap*gaps;
      // 1 CSS pixel of document scrolling = 1 CSS pixel of foreground travel.
      // Match each scroll step to the visible card-to-card spacing.
      container.style.setProperty('--reel-step',
        (state.cardHeight+state.cardGap).toFixed(3)+'px');
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
        // Stable paint order: earlier notifications remain above later ones.
        // Avoid continuous z-index changes during a swipe.
        card.style.zIndex=String(count-index);
        viewport.appendChild(card);
        state.cards.set(index,card);
      });

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

    function frame(timestamp){
      state.frame=0;
      if(current!==state)return;
      if(hero&&compactBar){
        const reveal=Math.max(0,Math.min(1,(window.scrollY-(state.expandedHeight-state.compactHeight-78))/78)).toFixed(3);
        if(reveal!==state.compactReveal){
          state.compactReveal=reveal;
          hero.style.setProperty('--reel-compact-reveal',reveal);
        }
        const active=Number(reveal)>.18;
        if(active!==state.compactActive){
          state.compactActive=active;
          compactBar.inert=!active;
          compactBar.setAttribute('aria-hidden',active?'false':'true');
        }
      }
      const position=(window.scrollY-state.start)/state.step;
      const rawProgress=clamp(0,position,count-1);
      const desired=state.reducedMotion?Math.round(rawProgress):rawProgress;
      const previous=state.progress;
      if(!Number.isFinite(previous)||state.reducedMotion||
         Math.abs(desired-previous)>FRONT_MAX){
        // Initial render, accessibility preference, and large jumps are immediate.
        state.progress=desired;
      }else{
        // Follow touch input promptly but glide across fractional positions.
        // Using elapsed time keeps the response consistent at 60 and 120 Hz.
        const elapsed=state.lastFrameTime
          ?clamp(1,timestamp-state.lastFrameTime,40)
          :16.7;
        const weight=1-Math.exp(-elapsed/MOTION_RESPONSE_MS);
        const eased=previous+(desired-previous)*weight;
        state.progress=Math.abs(desired-eased)<.003?desired:eased;
      }
      state.lastFrameTime=timestamp||0;
      const depthProgress=state.progress;
      // Hit testing and foreground displacement follow the actual scroll.
      // Only depth effects are softly interpolated, so the scroll-to-reel
      // handoff never pauses or loses distance on its first movement.
      const positionProgress=state.reducedMotion?desired:rawProgress;
      const center=Math.round(positionProgress);
      renderWindow(center);
      // Foreground vertical translation is a direct 1:1 scroll mapping;
      // scale and opacity retain the smooth 55ms depth glide.
      const spacing=state.cardHeight+state.cardGap;
      const frontBottom=(state.frontCount-1)*spacing;
      state.cards.forEach(function(card,index){
        const relative=index-positionProgress;
        const behind=Math.max(0,relative-(state.frontCount-1));
        const y=state.stackInset+(relative<0
          ?relative*spacing
          :behind>0
            ?frontBottom+behind*state.peekStep
            :relative*spacing);
        const depthRelative=index-depthProgress;
        // Foreground cards retain exact 1:1 scroll travel. Only the passive
        // rear peeks trail by at most one peek interval, fading the lag to zero
        // at the moment a card becomes independently tappable.
        const rearBlend=clamp(0,
          relative-(state.frontCount-.5),1);
        const rearLag=!state.reducedMotion&&!card.classList.contains('is-active')
          ?clamp(-1,positionProgress-depthProgress,1)*state.peekStep*rearBlend
          :0;
        // Let the last two foreground cards subtly recede into the rear
        // stack. These visual-only depth effects keep the 55ms glide even
        // while card positions respond directly to finger movement.
        const softDepth=Math.max(0,
          depthRelative-(state.frontCount-2));
        const scale=depthRelative<0
          ?1+Math.max(-1,depthRelative)*.035
          :1-Math.min(3.5,softDepth)*.018;
        // Leaving cards disappear behind the clipped viewport/banner.
        // Fading them as well provides no useful transition, but forces
        // extra opacity compositing while scrolling.
        const opacity=depthRelative<0
          ?1
          :Math.max(.7,1-Math.min(2,softDepth)*.032
              -Math.min(2,Math.max(0,softDepth-2))*.094);
        card.style.transform='translate(-50%,0) translate3d(0,'+(y+rearLag).toFixed(1)+'px,0) scale('+scale.toFixed(3)+')';
        const opacityValue=String(opacity);
        if(card.style.opacity!==opacityValue)card.style.opacity=opacityValue;
      });
      // Stop once depth catches up; no perpetual background animation.
      if(!state.reducedMotion&&Math.abs(desired-depthProgress)>.003)schedule();
    }

    function schedule(){
      if(!state.frame)state.frame=requestAnimationFrame(frame);
    }

    function snap(){
      state.snapTimer=0;
      if(current!==state||count<2||state.snapTarget!==null)return;
      if(document.body.classList.contains('work-detail-active')||
         document.body.classList.contains('vote-confirm-active'))return;
      const position=(window.scrollY-state.start)/state.step;
      if(position<=0||position>=count-1)return;
      const nearest=Math.round(position);
      // Avoid a hard tug at the normal-scroll -> reel transition.
      // Correct only tiny residual offsets, not intentional partial swipes.
      if(nearest===0||Math.abs(position-nearest)>.12||
         Math.abs(position-nearest)<.015)return;
      const target=state.start+nearest*state.step;
      state.snapTarget=target;
      window.scrollTo({
        top:target,
        behavior:state.reducedMotion?'instant':'smooth'
      });
    }

    function onScroll(){
      schedule();
      if(state.snapTarget!==null){
        if(Math.abs(window.scrollY-state.snapTarget)<1.5)state.snapTarget=null;
        else return; // Never launch a second snap while smooth scrolling.
      }
      if(state.snapTimer)clearTimeout(state.snapTimer);
      state.snapTimer=setTimeout(snap,190);
    }

    function onInteraction(){
      if(state.snapTarget===null)return;
      state.snapTarget=null;
      // Interrupt a programmatic smooth snap when the visitor swipes again.
      window.scrollTo({top:window.scrollY,behavior:'instant'});
    }

    function onResize(){
      measure();
      measureStack();
      measure(); // The new card-sized --reel-step changes the track height.
      state.progress=NaN;
      state.lastFrameTime=0;
      schedule();
    }

    function go(delta){
      const target=Math.max(0,Math.min(count-1,state.center+delta));
      if(state.snapTimer)clearTimeout(state.snapTimer);
      state.snapTimer=0;
      state.snapTarget=state.start+target*state.step;
      window.scrollTo({
        top:state.snapTarget,
        behavior:state.reducedMotion?'instant':'smooth'
      });
    }

    previous.addEventListener('click',function(){go(-1);});
    next.addEventListener('click',function(){go(1);});
    state.onScroll=onScroll;
    state.onResize=onResize;
    state.onInteraction=onInteraction;
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onResize,{passive:true});
    window.addEventListener('wheel',onInteraction,{passive:true});
    window.addEventListener('touchstart',onInteraction,{passive:true});
    measure();
    renderWindow(0);
    measureStack();
    measure(); // Calibrate the track to the actual card-to-card spacing.
    // Initialize card transforms synchronously. WebKit may expose the mounted
    // cards before a queued animation frame, leaving every card at top:0.
    frame();
  }

  window.SakuhinReel={mount,destroy};
})();
