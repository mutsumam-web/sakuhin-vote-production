/* Production three-column GRID only: an 18-cube single-file ribbon.
 * Each top/bottom encounter makes a complete circular LOOP of the
 * leading cube's route, then a compact vertical U-turn. Every follower
 * traverses the same loop in order; side walls reflect without loops.
 * Entry and exit continue the one route outside the viewport.
 * Artwork, 2-column GRID, reel and voting logic are unchanged.
 */
(function(){
  'use strict';
  const root=document.documentElement;
  const back=document.getElementById('gridDiceCanvas');
  const front=document.getElementById('gridDiceFrontCanvas');
  if(!back || !front)return;
  const bctx=back.getContext('2d',{alpha:true});
  const fctx=front.getContext('2d',{alpha:true});
  if(!bctx || !fctx)return;
  const reduced=window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
  const tau=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
  const mix=(a,b,t)=>a+(b-a)*t;
  const brand=[
    ['JS','#c19919'],['TS','#478dcc'],['VUE','#39b88c'],['SASS','#dc739b'],
    ['CSS','#4b96e0'],['HTML','#df8b56'],['SVG','#b99a58'],['LESS','#657cbb'],
    ['NODE','#7caa61'],['WEB','#7f8a98'],['CP','#6d7e8e'],['GL','#66748c']
  ];
  const faces=[
    {c:[0,0,1],u:[1,0,0],v:[0,1,0],n:[0,0,1],i:0},
    {c:[0,0,-1],u:[-1,0,0],v:[0,1,0],n:[0,0,-1],i:1},
    {c:[1,0,0],u:[0,0,-1],v:[0,1,0],n:[1,0,0],i:2},
    {c:[-1,0,0],u:[0,0,1],v:[0,1,0],n:[-1,0,0],i:3},
    {c:[0,1,0],u:[1,0,0],v:[0,0,-1],n:[0,1,0],i:4},
    {c:[0,-1,0],u:[1,0,0],v:[0,0,1],n:[0,-1,0],i:5}
  ];
  // Eight varied vertical legs: some brush a side wall and reflect by
  // easing horizontal velocity through zero, NOT by making a loop.
  // Each top/bottom turnaround uses a small curl before vertical reversal.
  // The leader and all followers share these samples by arc length.
  const legs=[
    {a:[-.24,-.395],b:[-.13,.395],curve:-.012},
    {a:[ .16, .395],b:[ .27,-.395],wall:{side:1,at:.41}},
    {a:[ .06,-.395],b:[ .25, .395],curve:.028},
    {a:[-.12, .395],b:[-.27,-.395],wall:{side:-1,at:.56}},
    {a:[-.07,-.395],b:[ .18, .395],curve:-.023},
    {a:[-.29, .395],b:[-.21,-.395],wall:{side:-1,at:.48}},
    {a:[ .10,-.395],b:[ .27, .395],wall:{side:1,at:.62}},
    {a:[-.12, .395],b:[-.27,-.395],curve:.018}
  ];
  const curlCount=legs.length;
  const SAMPLE_COUNT=2080,track=[];
  let totalLength=0;
  const cubic=(a,b,c,d,t)=>{
    const u=1-t;
    return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;
  };
  function depthFor(screenX){
    const edge=smooth((Math.abs(screenX)-.376)/.054);
    return -245+285*edge;
  }
  function pathFromScreen(screenX,screenY){
    // Compensate for perspective so the trajectory remains inside
    // the viewport on both narrow phones and wide monitors.
    const z=depthFor(screenX);
    const k=760/(760-z);
    return [screenX/k,screenY/k,z];
  }
  function addSample(p,turn){
    if(track.length){
      const q=track[track.length-1].p;
      totalLength+=Math.hypot(
        (p[0]-q[0])*950,(p[1]-q[1])*1190,(p[2]-q[2])*.16
      );
    }
    track.push({p,d:totalLength,turn});
  }
  function legPoint(leg,t,index){
    const [ax,ay]=leg.a,[bx,by]=leg.b;
    let x;
    if(leg.wall){
      // The lateral reflection has no positional loop or spin pulse.
      // Its horizontal derivative reaches zero at the side wall.
      const at=leg.wall.at,wall=leg.wall.side*.438;
      x=t<=at ? mix(ax,wall,smooth(t/at)) :
        mix(wall,bx,smooth((t-at)/(1-at)));
    }else{
      x=mix(ax,bx,smooth(t))+
        leg.curve*Math.sin(Math.PI*t)**2*Math.sin(tau*t*(index%3===0?1.5:1));
    }
    const y=cubic(ay,ay+(by-ay)*.31,by-(by-ay)*.31,by,t);
    return pathFromScreen(x,y);
  }
  // Draw one *physical* full circle, not an in-place 360° cube spin.
  // The normalized axes use the viewport aspect ratio so this is round
  // in CSS pixels on both phones and wide desktop screens.
  const loopRadiusPx=Math.min(window.innerWidth,window.innerHeight)*.045;
  const loopRx=loopRadiusPx/Math.max(1,window.innerWidth);
  const loopRy=loopRadiusPx/Math.max(1,window.innerHeight);
  const LOOP_PHASE=.60;
  function turnPoint(a,b,t,index){
    const sign=a[1]>0?1:-1;
    const direction=b[0]>=a[0]?1:-1;
    let x,y;
    if(t<LOOP_PHASE){
      // Enter with a vertical tangent, trace a complete 2π circle,
      // then return to the same point with the same vertical tangent.
      const theta=t/LOOP_PHASE*tau;
      x=a[0]+direction*loopRx*(1-Math.cos(theta));
      y=a[1]+sign*loopRy*Math.sin(theta);
    }else{
      // Only after the complete loop do we turn back vertically.
      // U-turn tangents point into, and then out of, the screen.
      const q=(t-LOOP_PHASE)/(1-LOOP_PHASE);
      x=cubic(a[0],a[0],b[0],b[0],q);
      y=a[1]+sign*(.024+(index%3)*.004)*Math.sin(Math.PI*q);
    }
    return pathFromScreen(x,y);
  }
  for(let i=0;i<legs.length;i++){
    const leg=legs[i],next=legs[(i+1)%legs.length];
    for(let k=0;k<180;k++)addSample(legPoint(leg,k/180,i),0);
    for(let k=0;k<80;k++)addSample(turnPoint(leg.b,next.a,k/80,i),1);
  }
  addSample(legPoint(legs[0],0,0),0);
  function atFraction(value){
    const d=(((value%1)+1)%1)*totalLength;
    let low=0,high=track.length-1;
    while(low+1<high){
      const mid=(low+high)>>1;
      if(track[mid].d<=d)low=mid;else high=mid;
    }
    const a=track[low],b=track[high];
    const t=(d-a.d)/Math.max(1e-8,b.d-a.d);
    return [
      mix(a.p[0],b.p[0],t),mix(a.p[1],b.p[1],t),
      mix(a.p[2],b.p[2],t),mix(a.turn,b.turn,t)
    ];
  }
  // The exit attaches to the beginning of the seventh vertical leg,
  // whose direction is down. Both off-screen extensions are sampled
  // by the same distance coordinate as the inner closed route.
  const EXIT_TRACK_AT=track[6*260].d/totalLength;
  const entryAnchor=track[0].p;
  const exitAnchor=atFraction(EXIT_TRACK_AT);
  const screenOf=p=>{
    const depth=760/(760-p[2]);
    return [p[0]*depth,p[1]*depth];
  };
  const entryScreen=screenOf(entryAnchor),exitScreen=screenOf(exitAnchor);
  function externalPosition(u,anchor,screen,entry){
    const delta=entry?u:u-EXIT_TRACK_AT;
    const sx=screen[0],sy=screen[1]+delta*(entry?6.0:7.0);
    const blend=entry?
      smooth((u+.087)/.087):
      smooth(delta/.23);
    const z=entry?
      mix(-710,anchor[2],blend):
      mix(anchor[2],-650,blend);
    const depth=760/(760-z);
    return [sx/depth,sy/depth,z,0,0];
  }
  function atTravel(u){
    if(u<0)return externalPosition(u,entryAnchor,entryScreen,true);
    if(u>EXIT_TRACK_AT)return externalPosition(u,exitAnchor,exitScreen,false);
    return atFraction(u);
  }
  const ENTRY_FINISH=.10,EXIT_BEGIN=.87,EXIT_EXTENSION=.196;
  function scrollTravel(progress){
    if(progress<=ENTRY_FINISH){
      return -.020+.020*smooth(progress/ENTRY_FINISH);
    }
    if(progress<EXIT_BEGIN){
      return EXIT_TRACK_AT*
        smooth((progress-ENTRY_FINISH)/(EXIT_BEGIN-ENTRY_FINISH));
    }
    return EXIT_TRACK_AT+EXIT_EXTENSION*
      smooth((progress-EXIT_BEGIN)/(1-EXIT_BEGIN));
  }
  const cubes=Array.from({length:18},(_,i)=>({
    index:i,
    gap:i*.0036,
    size:.82+(i*17%9)*.042,
    rotSeed:i*2.37+.6,
    rollOffset:((i*0.267+0.11)%1),
    rollRate:.83+(i%5)*.084,
    labels:faces.map((_,f)=>brand[(i*3+f*2)%brand.length])
  }));
  let w=1,h=1,dpr=1,phase=.09,target=0,eased=0,velocity=0,
      last=0,elapsed=0,raf=0,enabled=false,drawCount=0;
  function sizeCanvas(){
    const nextW=Math.max(1,window.innerWidth);
    const nextH=Math.max(1,window.innerHeight);
    const nextDpr=Math.min(1.5,window.devicePixelRatio||1);
    if(w===nextW&&h===nextH&&dpr===nextDpr)return;
    w=nextW;h=nextH;dpr=nextDpr;
    for(const canvas of [back,front]){
      canvas.width=Math.round(w*dpr);
      canvas.height=Math.round(h*dpr);
    }
    bctx.setTransform(dpr,0,0,dpr,0,0);
    fctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function rotate(v,xr,yr,zr){
    let [x,y,z]=v;let a=Math.cos(xr),b=Math.sin(xr);
    [y,z]=[y*a-z*b,y*b+z*a];a=Math.cos(yr);b=Math.sin(yr);
    [x,z]=[x*a+z*b,-x*b+z*a];a=Math.cos(zr);b=Math.sin(zr);
    return [x*a-y*b,x*b+y*a,z];
  }
  function projected(p){
    const k=760/(760-p[2]);
    return [w*.5+p[0]*k,h*.49+p[1]*k,k];
  }
  function polygon(ctx,vertices){
    ctx.beginPath();ctx.moveTo(vertices[0][0],vertices[0][1]);
    for(let j=1;j<vertices.length;j++)ctx.lineTo(vertices[j][0],vertices[j][1]);
    ctx.closePath();
  }
  function faceMark(ctx,vertices,brandInfo,opacity){
    const dx=vertices[1][0]-vertices[0][0],dy=vertices[1][1]-vertices[0][1];
    const ex=vertices[3][0]-vertices[0][0],ey=vertices[3][1]-vertices[0][1];
    if(Math.hypot(dx,dy)<12 || Math.hypot(ex,ey)<9)return;
    const cx=vertices[0][0]+(dx+ex)*.5,cy=vertices[0][1]+(dy+ey)*.5;
    ctx.save();
    ctx.translate(cx,cy);
    ctx.transform(dx/120,dy/120,ex/120,ey/120,0,0);
    const text=brandInfo[0];
    ctx.fillStyle=brandInfo[1];ctx.globalAlpha*=opacity;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`900 ${text.length>3?36:text.length>2?42:56}px system-ui, sans-serif`;
    ctx.fillText(text,0,4);
    ctx.restore();
  }
  function drawOne(cube,trackPos,head){
    const [tx,ty,z]=trackPos;
    const depth=760/(760-z);
    const event=((head*cube.rollRate+cube.rollOffset)%1+1)%1;
    const eventStep=smooth((event-.33)/.15);
    const eventPulse=smooth((event-.33)/.06)*(1-smooth((event-.42)/.06));
    const shrink=1-.19*eventPulse;
    const pointSize=clamp((w<500?21:28)*cube.size*depth*shrink,3.5,w<500?27:36);
    const x=tx*w+Math.sin(elapsed*.43+cube.rotSeed)*1.25;
    const y=ty*h+Math.cos(elapsed*.37+cube.rotSeed)*1.35;
    const screenX=w*.5+x*depth;
    const screenY=h*.49+y*depth;
    const half=(pointSize/depth)/2,i=cube.index;
    const extraTurn=reduced.matches?0:tau*eventStep;
    const xr=cube.rotSeed*.53+elapsed*(.19+(i%5)*.013)+phase*(i%2?-2.1:2.0)+extraTurn;
    const yr=cube.rotSeed*.34+elapsed*(.13+(i%7)*.009)-phase*(i%2?2.4:1.7);
    const zr=cube.rotSeed*.12+elapsed*(.045+(i%3)*.009);
    const trans=v=>{
      const p=rotate(v,xr,yr,zr);
      return [p[0]*half+x,p[1]*half+y,p[2]*half+z];
    };
    // The Canvas viewport, not a visibility fade, clips entry/exit.
    if(screenX+pointSize<0||screenX-pointSize>w||
       screenY+pointSize<0||screenY-pointSize>h)return;
    const near=z>16&&Math.abs(screenX-w*.5)>w*.29;
    const ctx=near?fctx:bctx;
    const opacity=near?.84:.77;
    const sortable=[];
    for(const face of faces){
      const n=rotate(face.n,xr,yr,zr);
      if(n[2]<=.02)continue;
      const vertices=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>
        projected(trans([
          face.c[0]+face.u[0]*a+face.v[0]*b,
          face.c[1]+face.u[1]*a+face.v[1]*b,
          face.c[2]+face.u[2]*a+face.v[2]*b
        ])));
      sortable.push({
        face,n,vertices,
        mean:vertices.reduce((s,p)=>s+p[2],0)/4
      });
    }
    sortable.sort((a,b)=>a.mean-b.mean);
    for(const {face,n,vertices} of sortable){
      const light=clamp(.77+n[2]*.19-n[0]*.09-n[1]*.08,.58,1);
      const g=Math.round(245*light),blue=Math.round(251*light);
      ctx.save();ctx.globalAlpha=opacity;
      polygon(ctx,vertices);
      ctx.fillStyle=`rgb(${g},${Math.min(255,g+1)},${blue})`;
      ctx.fill();
      ctx.strokeStyle='rgba(110,122,140,.45)';
      ctx.lineWidth=.65;ctx.stroke();
      faceMark(ctx,vertices,cube.labels[face.i],1);
      ctx.restore();
    }
    drawCount++;
  }
  function render(now){
    raf=0;
    if(!enabled||document.hidden)return;
    const dt=last?clamp((now-last)/1000,0,.035):1/60;
    last=now;elapsed+=dt;
    if(reduced.matches){eased=target;velocity=0;}
    else{
      velocity+=(target-eased)*65*dt;
      velocity*=Math.exp(-12*dt);
      eased+=velocity*dt;
      if(Math.abs(target-eased)<.000005&&Math.abs(velocity)<.00001){
        eased=target;velocity=0;
      }
    }
    // Preserve v11's measured slow autonomous pace and gentle variation.
    if(!reduced.matches){
      const pace=.012+
        .0048*Math.sin(elapsed*.38+.7)+
        .0031*Math.sin(elapsed*1.07+1.13);
      phase+=clamp(pace,.003,.022)*dt;
    }
    const midWindow=smooth((eased-ENTRY_FINISH)/.09)*
      (1-smooth((eased-.78)/.09));
    // Small bounded self-motion, with no drift at entry/exit junctions.
    const head=scrollTravel(eased)+
      (reduced.matches?0:.007*Math.sin(tau*phase)*midWindow);
    bctx.clearRect(0,0,w,h);
    fctx.clearRect(0,0,w,h);
    const positioned=cubes.map(c=>({c,p:atTravel(head-c.gap)}))
      .sort((a,b)=>a.p[2]-b.p[2]);
    drawCount=0;
    for(const item of positioned)drawOne(item.c,item.p,head);
    if(!reduced.matches)request();
  }
  function request(){
    if(enabled&&!raf&&!document.hidden)raf=requestAnimationFrame(render);
  }
  function readScroll(){
    const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    target=clamp(window.scrollY/max,0,1);
    request();
  }
  function syncActive(){
    const next=root.dataset.galleryColumns==='3'&&root.dataset.galleryMode==='grid';
    if(next===enabled)return;
    enabled=next;
    back.hidden=!next;front.hidden=!next;
    if(!next){
      if(raf)cancelAnimationFrame(raf);
      raf=0;bctx.clearRect(0,0,w,h);fctx.clearRect(0,0,w,h);
      return;
    }
    last=0;velocity=0;
    sizeCanvas();
    const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    target=eased=clamp(window.scrollY/max,0,1);
    request();
  }
  window.addEventListener('scroll',readScroll,{passive:true});
  window.addEventListener('resize',()=>{sizeCanvas();readScroll();},{passive:true});
  document.addEventListener('visibilitychange',()=>{last=0;request();});
  new MutationObserver(syncActive).observe(root,{
    attributes:true,attributeFilter:['data-gallery-columns','data-gallery-mode']
  });
  if(reduced.addEventListener)reduced.addEventListener('change',()=>{last=0;request();});
  else if(reduced.addListener)reduced.addListener(()=>{last=0;request();});
  syncActive();
  // Read-only diagnostics for browser checks. No user information.
  window.__gridCubeDiagnostics=()=>({
    active:enabled,drawCount,progress:target,cubes:cubes.length,
    route:'single-file-full-circular-loops-then-vertical-turns',curls:curlCount,
    frontCanvasHidden:front.hidden,
    pointerEvents:getComputedStyle(front).pointerEvents,
    lastOnlyExit:eased>=EXIT_BEGIN,
    scrollTriggeredEntrance:eased>0,
    offscreenEntrance:true,offscreenExit:true,
    seamlessSequentialTrack:true,
    exitTrackAt:EXIT_TRACK_AT,
    leaderDistance:scrollTravel(eased),
    sideWallReflections:legs.filter(leg=>!!leg.wall).length,
    followerSpacing:.0036,
    topBottomPhysicalLoop:true,loopRadiusPx,
    cubeSizeBase:w<500?21:28,
    orbitProgress:scrollTravel(eased)
  });
})();
