/* Production three-column GRID only: one descending serpentine leader track.
 * Followers share the track; local curls, brief edge foreground and
 * per-cube tumbling do not affect work cards, vote handling or layout.
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
  // One descending serpentine route, not 18 independent trajectories.
  // Small local curls are part of the shared path, so every follower
  // traverses them in exactly the leader's order.
  const SAMPLE_COUNT=2048,track=[];
  let totalLength=0;
  const curls=[
    {at:0.31,width:0.095,radius:0.059},
    {at:0.71,width:0.103,radius:0.051}
  ];
  const wobble=[
    {frequency:3,phase:.8,x:.009,y:.008},
    {frequency:5,phase:2.3,x:.004,y:.004}
  ];
  function path(t){
    const a=t*tau;
    let x=.433*Math.sin(a*1.27-.48)+.024*Math.sin(a*2.13+.6);
    let y=-.89+1.78*t;
    for(const n of wobble){
      x+=n.x*Math.sin(a*n.frequency+n.phase);
      y+=n.y*Math.sin(a*n.frequency+n.phase*1.17);
    }
    for(const curl of curls){
      const q=(t-curl.at)/curl.width+.5;
      if(q>0&&q<1){
        const envelope=Math.sin(Math.PI*q)**2;
        x+=curl.radius*(Math.cos(tau*q)-1)*envelope;
        y+=curl.radius*Math.sin(tau*q)*envelope;
      }
    }
    // Cubes emerge momentarily ahead of cards only near a lateral edge.
    // Center crossings, curls and most of the route remain behind.
    const edge=smooth((Math.abs(x)-.36)/.077);
    const z=-680+751*edge;
    return [x,y,z];
  }
  for(let i=0;i<=SAMPLE_COUNT;i++){
    const p=path(i/SAMPLE_COUNT);
    if(i){
      const prior=track[i-1].p;
      totalLength+=Math.hypot((p[0]-prior[0])*900,(p[1]-prior[1])*1230,(p[2]-prior[2])*.32);
    }
    track.push({p,d:totalLength});
  }
  function atFraction(value){
    const wrapped=((value%1)+1)%1;
    const d=wrapped*totalLength;
    let low=0,high=track.length-1;
    while(low+1<high){const mid=(low+high)>>1; if(track[mid].d<=d)low=mid;else high=mid;}
    const a=track[low],b=track[high],t=(d-a.d)/Math.max(1e-8,b.d-a.d);
    return [mix(a.p[0],b.p[0],t),mix(a.p[1],b.p[1],t),mix(a.p[2],b.p[2],t)];
  }
  const cubes=Array.from({length:18},(_,i)=>({
    index:i,
    gap:i*.019,
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
  function drawOne(cube,trackPos,localU,head){
    const [tx,ty,z]=trackPos;
    const depth=760/(760-z);
    const progress=((localU%1)+1)%1;
    const entry=smooth(progress/.075)*(1-smooth((progress-.925)/.075));
    if(entry<.02)return;
    // Each cube occasionally executes one complete individual tumble.
    // The extra angle is 0 or 2PI outside the event window, keeping
    // orientation continuous when the per-cube cycle wraps.
    const event=((head*cube.rollRate+cube.rollOffset)%1+1)%1;
    const eventStep=smooth((event-.33)/.15);
    const eventPulse=smooth((event-.33)/.06)*(1-smooth((event-.42)/.06));
    const shrink=1-.19*eventPulse;
    const pointSize=clamp((w<500?31:39)*cube.size*depth*shrink,7,w<500?38:49);
    const visibility=clamp((pointSize-9)/10,0,1)*entry;
    if(visibility<.03)return;
    const x=tx*w+Math.sin(elapsed*.43+cube.rotSeed)*1.25;
    const y=ty*h+Math.cos(elapsed*.37+cube.rotSeed)*1.35;
    const screenX=w*.5+x*depth,screenY=h*.49+y*depth;
    if(screenX<-pointSize||screenX>w+pointSize||
       screenY<-pointSize||screenY>h+pointSize)return;
    const half=(pointSize/depth)/2,i=cube.index;
    const extraTurn=reduced.matches?0:tau*eventStep;
    const xr=cube.rotSeed*.53+elapsed*(.19+(i%5)*.013)+phase*(i%2?-2.1:2.0)+extraTurn;
    const yr=cube.rotSeed*.34+elapsed*(.13+(i%7)*.009)-phase*(i%2?2.4:1.7);
    const zr=cube.rotSeed*.12+elapsed*(.045+(i%3)*.009);
    const trans=v=>{const p=rotate(v,xr,yr,zr);return [p[0]*half+x,p[1]*half+y,p[2]*half+z];};
    // Only a short lateral-edge passage draws on top of artwork.
    const near=z>48&&Math.abs(screenX-w*.5)>w*.415;
    const ctx=near?fctx:bctx;
    const opacity=(near?.84:.77)*visibility;
    const sortable=[];
    for(const face of faces){
      const n=rotate(face.n,xr,yr,zr);if(n[2]<=.02)continue;
      const vertices=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>projected(trans([
        face.c[0]+face.u[0]*a+face.v[0]*b,
        face.c[1]+face.u[1]*a+face.v[1]*b,
        face.c[2]+face.u[2]*a+face.v[2]*b
      ])));
      sortable.push({face,n,vertices,mean:vertices.reduce((s,p)=>s+p[2],0)/4});
    }
    sortable.sort((a,b)=>a.mean-b.mean);
    for(const {face,n,vertices} of sortable){
      const light=clamp(.77+n[2]*.19-n[0]*.09-n[1]*.08,.58,1);
      const g=Math.round(245*light),blue=Math.round(251*light);
      ctx.save();ctx.globalAlpha=opacity;
      polygon(ctx,vertices);ctx.fillStyle=`rgb(${g},${Math.min(255,g+1)},${blue})`;ctx.fill();
      ctx.strokeStyle='rgba(110,122,140,.45)';ctx.lineWidth=.65;ctx.stroke();
      faceMark(ctx,vertices,cube.labels[face.i],1);
      ctx.restore();
    }
    drawCount++;
  }
  function render(now){
    raf=0;if(!enabled||document.hidden)return;
    const dt=last?clamp((now-last)/1000,0,.035):1/60;
    last=now;elapsed+=dt;
    if(reduced.matches){eased=target;velocity=0;}else{
      velocity+=(target-eased)*65*dt;
      velocity*=Math.exp(-12*dt);
      eased+=velocity*dt;
      if(Math.abs(target-eased)<.000005&&Math.abs(velocity)<.00001){
        eased=target;velocity=0;
      }
    }
    if(!reduced.matches){
      const pace=.025+.010*Math.sin(phase*tau*1.7+.2)+.004*Math.sin(phase*tau*3.2);
      phase+=Math.max(.009,pace)*dt;
    }
    const head=phase+eased*2.85;
    bctx.clearRect(0,0,w,h);fctx.clearRect(0,0,w,h);
    const positioned=cubes.map(c=>({c,u:head-c.gap,p:atFraction(head-c.gap)}))
      .sort((a,b)=>a.p[2]-b.p[2]);
    drawCount=0;
    for(const item of positioned)drawOne(item.c,item.p,item.u,head);
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
    route:'descending-serpentine',curls:curls.length,
    frontCanvasHidden:front.hidden,
    pointerEvents:getComputedStyle(front).pointerEvents
  });
})();
