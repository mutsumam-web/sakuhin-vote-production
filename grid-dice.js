/* Production three-column GRID only: a slow, primarily vertical
 * leader-and-followers ribbon with varied columns, gentle S-bends,
 * compact curling hairpins, a brief foreground pass, and final exit.
 * Do not alter artwork cards, the GRID layout, or voting.
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
  // Eight DISTINCT vertical legs, each joined by a compact top/bottom
  // hairpin. Shared arc-length sampling keeps every follower on the
  // leader's exact course; x varies without random per-cube detours.
  const legs=[
    {a:[-.30,-.32],b:[-.12,.33],cx1:-.32,cx2:-.20,curve:.009},
    {a:[ .18, .33],b:[ .29,-.33],cx1: .15,cx2: .33,curve:-.010},
    {a:[ .08,-.33],b:[ .30, .33],cx1: .03,cx2: .33,curve:.013},
    {a:[-.02, .33],b:[-.29,-.33],cx1:-.01,cx2:-.31,curve:-.008},
    {a:[-.07,-.33],b:[ .14, .33],cx1:-.10,cx2: .20,curve:.020},
    {a:[-.24, .33],b:[-.18,-.33],cx1:-.28,cx2:-.18,curve:-.005},
    {a:[ .16,-.33],b:[ .27, .33],cx1: .22,cx2: .21,curve:-.013},
    {a:[-.10, .33],b:[-.27,-.33],cx1:-.14,cx2:-.30,curve:.006}
  ];
  const curlCount=legs.length;
  const SAMPLE_COUNT=2080,track=[];
  let totalLength=0;
  const cubic=(a,b,c,d,t)=>{
    const u=1-t;
    return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;
  };
  function depthFor(x){
    const edge=smooth((Math.abs(x)-.265)/.035);
    return -245+285*edge;
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
    const a=leg.a,b=leg.b,dy=b[1]-a[1];
    const x=cubic(a[0],leg.cx1,leg.cx2,b[0],t)+
      Math.sin(Math.PI*t)**2*leg.curve*Math.sin(tau*t*(index%3===0?1.5:1));
    const y=cubic(a[1],a[1]+dy*.31,b[1]-dy*.31,b[1],t);
    return [x,y,depthFor(x)];
  }
  function turnPoint(a,b,t,index){
    // Smooth U-turn at top/bottom. Extra mini-curl occurs only at
    // selected turns, so the route isn't an identical zigzag repeat.
    const sign=a[1]>0?1:-1;
    const envelope=Math.sin(Math.PI*t)**2;
    const curl=(index===1||index===4||index===6)?0.027:0;
    const x=cubic(a[0],a[0],b[0],b[0],t)+
      curl*envelope*Math.sin(tau*t);
    const y=cubic(a[1],a[1]+sign*.12,b[1]+sign*.12,b[1],t)+
      sign*curl*.65*envelope*(1-Math.cos(tau*t));
    return [x,y,depthFor(x)];
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
    const near=z>16&&Math.abs(screenX-w*.5)>w*.29;
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
    // Approximately one third of v8's scroll response and autonomous
    // orbit speed. Two asynchronous waves add gentle, non-repeating
    // acceleration; hairpins slow to make their tiny curls legible.
    if(!reduced.matches){
      const headSample=atFraction(phase+eased*.94);
      const turnDrag=headSample[3];
      const surge=.012+
        .0048*Math.sin(elapsed*.38+.7)+
        .0031*Math.sin(elapsed*1.07+1.13);
      phase+=clamp(surge*(1-.52*turnDrag),.003,.022)*dt;
    }
    const head=phase+eased*.94+
      (reduced.matches?0:.0035*Math.sin(eased*tau*2.1));
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
    route:'slow-vertical-varied-legs',curls:curlCount,
    frontCanvasHidden:front.hidden,
    pointerEvents:getComputedStyle(front).pointerEvents,
    lastOnlyExit:eased>=.946,
    orbitProgress:((phase+eased*.94)%1+1)%1
  });
})();
