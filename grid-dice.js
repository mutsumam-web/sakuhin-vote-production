/* Production three-column GRID only: shared ribbon orbit with long sweeping
 * straights and tight curling turns. All 18 cubes stay on screen until the
 * end-of-page exit, with brief edge foreground and independent tumbling.
 * No voting, card geometry, or GRID layout code is changed.
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
  // Eight long traversals joined by eight compact U-turns. The
  // head and all 17 followers use this ONE continuous closed course.
  // No looping off-screen: only the final page-exit moves cubes away.
  const sweeps=[
    [[-.36,-.29],[ .36,-.30]], // left-to-right, upper
    [[ .36,-.07],[-.36,-.01]], // right-to-left, upper-middle
    [[-.36, .23],[ .36, .32]], // long lower diagonal
    [[ .36, .15],[-.36, .30]], // counter sweep
    [[-.36, .04],[ .36,-.16]], // long rising diagonal
    [[ .36,-.34],[-.36,-.18]], // upper traverse
    [[-.36, .12],[ .36, .22]], // mid-lower traverse
    [[ .36, .34],[-.36, .29]]  // final lower return
  ];
  const SAMPLE_COUNT=2080,track=[];
  let totalLength=0;
  const curlCount=sweeps.length;
  function addSample(p,turn){
    if(track.length){
      const q=track[track.length-1].p;
      totalLength+=Math.hypot(
        (p[0]-q[0])*950,
        (p[1]-q[1])*1190,
        (p[2]-q[2])*.18
      );
    }
    track.push({p,d:totalLength,turn});
  }
  function depthFor(x){
    const edge=smooth((Math.abs(x)-.345)/.075);
    return -230+270*edge;
  }
  function straight(a,b,t,index){
    const x=mix(a[0],b[0],t);
    const y=mix(a[1],b[1],t)+Math.sin(Math.PI*t)**2 *
      (.004*Math.sin(index*1.91));
    return [x,y,depthFor(x)];
  }
  function curledTurn(a,b,t,index){
    // Enter horizontally, make a compact curl at the outside end,
    // then leave horizontally in the reverse direction.
    const side=a[0]>0?1:-1;
    const theta=-Math.PI/2+Math.PI*t;
    const envelope=Math.sin(Math.PI*t)**4;
    const curl=0.015*envelope;
    const x=side*(.36+.051*Math.cos(theta))+
      side*curl*Math.sin(tau*t);
    const y=(a[1]+b[1])/2+(b[1]-a[1])/2*Math.sin(theta)+
      (index%2?1:-1)*curl*(1-Math.cos(tau*t));
    return [x,y,depthFor(x)];
  }
  for(let i=0;i<sweeps.length;i++){
    const [a,b]=sweeps[i],next=sweeps[(i+1)%sweeps.length][0];
    for(let k=0;k<156;k++)addSample(straight(a,b,k/156,i),0);
    for(let k=0;k<104;k++)addSample(curledTurn(b,next,k/104,i),1);
  }
  addSample(straight(sweeps[0][0],sweeps[0][1],0,0),0);
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
  function drawOne(cube,trackPos,head){
    const [tx,ty,z]=trackPos;
    const depth=760/(760-z);
    // Cubes never disappear along normal orbit segments. The only
    // intentional fade/exit occurs in the last ~5% of page scroll.
    const exitStart=.946+cube.index*.0017;
    const exit=smooth((eased-exitStart)/Math.max(.001,1-exitStart));
    if(exit>=.999)return;
    const event=((head*cube.rollRate+cube.rollOffset)%1+1)%1;
    const eventStep=smooth((event-.33)/.15);
    const eventPulse=smooth((event-.33)/.06)*(1-smooth((event-.42)/.06));
    const shrink=1-.19*eventPulse;
    const pointSize=clamp((w<500?31:39)*cube.size*depth*shrink,14,w<500?38:49);
    const x=tx*w+Math.sin(elapsed*.43+cube.rotSeed)*1.25;
    const y=ty*h+Math.cos(elapsed*.37+cube.rotSeed)*1.35;
    const screenX=w*.5+x*depth;
    const screenY=h*.49+y*depth+exit*h*.95;
    const half=(pointSize/depth)/2,i=cube.index;
    const extraTurn=reduced.matches?0:tau*eventStep;
    const xr=cube.rotSeed*.53+elapsed*(.19+(i%5)*.013)+phase*(i%2?-2.1:2.0)+extraTurn;
    const yr=cube.rotSeed*.34+elapsed*(.13+(i%7)*.009)-phase*(i%2?2.4:1.7);
    const zr=cube.rotSeed*.12+elapsed*(.045+(i%3)*.009);
    const trans=v=>{
      const p=rotate(v,xr,yr,zr);
      return [p[0]*half+x,p[1]*half+y+exit*h*.95/depth,p[2]*half+z];
    };
    const near=z>29&&Math.abs(screenX-w*.5)>w*.39;
    const ctx=near?fctx:bctx;
    const opacity=(near?.84:.77)*(1-smooth(exit));
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
    // Faster on straights, slowing through the curling turns.
    // Two non-synchronous oscillations give non-repeating pace changes.
    if(!reduced.matches){
      const headSample=atFraction(phase+eased*3.1);
      const turnDrag=headSample[3];
      const surge=.035+
        .013*Math.sin(elapsed*.64+.7)+
        .010*Math.sin(elapsed*1.91+1.13);
      phase+=clamp(surge*(1-.44*turnDrag),.010,.067)*dt;
    }
    const head=phase+eased*3.1+
      (reduced.matches?0:.008*Math.sin(eased*tau*3.7));
    bctx.clearRect(0,0,w,h);
    fctx.clearRect(0,0,w,h);
    const positioned=cubes.map(c=>({c,p:atFraction(head-c.gap)}))
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
    route:'wide-orbits-eight-sweeps',curls:curlCount,
    frontCanvasHidden:front.hidden,
    pointerEvents:getComputedStyle(front).pointerEvents,
    lastOnlyExit:eased>=.946,
    orbitProgress:((phase+eased*3.1)%1+1)%1
  });
})();
