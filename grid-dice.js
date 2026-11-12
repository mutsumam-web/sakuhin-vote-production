/* Decorative scroll-depth dice for Production's three-column GRID only.
   Fixed, pointer-transparent Canvas; no changes to card geometry or voting logic. */
(function(){
  'use strict';
  const canvas=document.getElementById('gridDiceCanvas');
  if(!canvas)return;
  const context=canvas.getContext('2d',{alpha:true});
  if(!context)return;

  const root=document.documentElement;
  const motion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
  const TAU=Math.PI*2;
  const colors=['#b4a4ef','#60bdac','#edab85','#dc8cb5','#81a9e8','#e5c77b',
    '#afa1e0','#75b8be','#d9909e','#a0c68d','#ad90d6','#dba98c',
    '#7fc4ae','#a8b6dd','#dca9c3','#7e9fd1'];
  const positions=[[-.25,-.14],[.36,.12],[-.45,.22],[.16,-.27],[.49,-.14],[-.1,.36],
    [.34,.26],[-.37,-.26],[.22,.18],[-.48,.08],[.08,-.38],[.43,.03],
    [-.2,.25],[.17,-.15],[-.38,-.06],[.48,-.21]];
  const starts=[-.27,-.20,-.13,-.06,.01,.08,.15,.22,.29,.36,.43,.50,.57,.64,.71,.78];
  const faces=[
    {center:[0,0,1],u:[1,0,0],v:[0,1,0],normal:[0,0,1],pips:1},
    {center:[0,0,-1],u:[-1,0,0],v:[0,1,0],normal:[0,0,-1],pips:6},
    {center:[1,0,0],u:[0,0,-1],v:[0,1,0],normal:[1,0,0],pips:3},
    {center:[-1,0,0],u:[0,0,1],v:[0,1,0],normal:[-1,0,0],pips:4},
    {center:[0,1,0],u:[1,0,0],v:[0,0,-1],normal:[0,1,0],pips:2},
    {center:[0,-1,0],u:[1,0,0],v:[0,0,1],normal:[0,-1,0],pips:5}
  ];
  const spots={
    1:[[0,0]],2:[[-.28,-.28],[.28,.28]],
    3:[[-.28,-.28],[0,0],[.28,.28]],
    4:[[-.28,-.28],[.28,-.28],[-.28,.28],[.28,.28]],
    5:[[-.28,-.28],[.28,-.28],[0,0],[-.28,.28],[.28,.28]],
    6:[[-.28,-.30],[.28,-.30],[-.28,0],[.28,0],[-.28,.30],[.28,.30]]
  };
  const dice=starts.map(function(start,i){
    return {start,len:i%3===0?.52:.46,tint:[1,3,5].map(function(n){return parseInt(colors[i].slice(n,n+2),16);}),seed:i,home:positions[i]};
  });
  const clamp=function(value,min,max){return Math.max(min,Math.min(max,value));};
  const mix=function(a,b,t){return a+(b-a)*t;};
  function smooth(min,max,value){
    const t=clamp((value-min)/(max-min),0,1);
    return t*t*(3-2*t);
  }
  function rotate(vector,xr,yr,zr){
    let x=vector[0],y=vector[1],z=vector[2];
    let c=Math.cos(xr),s=Math.sin(xr);
    [y,z]=[y*c-z*s,y*s+z*c];
    c=Math.cos(yr);s=Math.sin(yr);
    [x,z]=[x*c+z*s,-x*s+z*c];
    c=Math.cos(zr);s=Math.sin(zr);
    return [x*c-y*s,x*s+y*c,z];
  }

  let width=1,height=1,ratio=1,target=0,visual=0,velocity=0;
  let last=0,clock=0,active=false,frameId=0;
  function isActive(){
    return root.dataset.galleryColumns==='3'&&root.dataset.galleryMode==='grid';
  }
  function setTarget(){
    const max=Math.max(1,root.scrollHeight-root.clientHeight);
    target=clamp(window.scrollY/max,0,1);
    schedule();
  }
  function resize(){
    if(!active)return;
    const nextW=Math.max(1,window.innerWidth);
    const nextH=Math.max(1,window.innerHeight);
    const nextRatio=Math.min(1.6,window.devicePixelRatio||1);
    if(nextW!==width||nextH!==height||nextRatio!==ratio){
      width=nextW;height=nextH;ratio=nextRatio;
      canvas.width=Math.round(width*ratio);
      canvas.height=Math.round(height*ratio);
      context.setTransform(ratio,0,0,ratio,0,0);
    }
    setTarget();
  }
  function syncActive(){
    const next=isActive();
    if(next===active)return;
    active=next;
    canvas.hidden=!next;
    if(next){
      last=0;
      // Entering GRID should not inherit motion from a different gallery mode.
      const max=Math.max(1,root.scrollHeight-root.clientHeight);
      target=visual=clamp(window.scrollY/max,0,1);
      velocity=0;
      resize();
    }else{
      if(frameId)cancelAnimationFrame(frameId);
      frameId=0;
      context.clearRect(0,0,width,height);
    }
  }
  function project(point){
    const factor=850/(850-point[2]);
    return [width/2+point[0]*factor,height/2+point[1]*factor,factor];
  }
  function trace(points){
    context.beginPath();
    points.forEach(function(point,i){
      if(i===0)context.moveTo(point[0],point[1]);
      else context.lineTo(point[0],point[1]);
    });
    context.closePath();
  }
  function drawDie(die,u){
    if(u<0||u>1)return;
    const arrival=smooth(0,.49,u),departure=smooth(.49,1,u);
    const z=mix(-1950,255,arrival)-2210*departure;
    const fog=.12+.88*smooth(-1810,-500,z);
    const alpha=smooth(0,.13,u)*(1-smooth(.87,1,u))*fog*.80;
    if(alpha<.018)return;
    const i=die.seed,side=i%2?-1:1;
    const center=die.home;
    const x0=center[0]*.5,y0=center[1]*.4;
    const x1=center[0]+side*.09,y1=center[1]-side*.06;
    const x2=clamp(center[0]-side*.42,-.85,.85);
    const y2=clamp(center[1]+side*.28,-.8,.8);
    const x=mix(mix(x0,x1,arrival),x2,departure)*width*.58+Math.sin(clock*.48+i*1.77)*6;
    const y=mix(mix(y0,y1,arrival),y2,departure)*height*.51+Math.cos(clock*.42+i*.91)*7;
    const spin=motion&&motion.matches?0:clock;
    const xr=.55+i*.61+u*(i%2?-9.5:9.5)+spin*(.085+i%3*.011);
    const yr=.17+i*.39+u*(i%2?12:-11)+spin*(.11+i%4*.009);
    const zr=i*.43+u*(i%2?-6:7)+spin*.042;
    const half=clamp(Math.min(width*.24,height*.23),68,134)/2;
    const transform=function(point){
      const p=rotate(point,xr,yr,zr);
      return [p[0]+x,p[1]+y,p[2]+z];
    };
    const projected=[];
    faces.forEach(function(face){
      const normal=rotate(face.normal,xr,yr,zr);
      if(normal[2]<.025)return;
      const quad=[];
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(pair){
        const a=pair[0],b=pair[1];
        quad.push(project(transform([
          (face.center[0]+face.u[0]*a+face.v[0]*b)*half,
          (face.center[1]+face.u[1]*a+face.v[1]*b)*half,
          (face.center[2]+face.u[2]*a+face.v[2]*b)*half
        ])));
      });
      projected.push({face,normal,quad,depth:quad.reduce(function(sum,p){return sum+p[2];},0)/4});
    });
    projected.sort(function(a,b){return a.depth-b.depth;});
    context.globalAlpha=alpha;
    projected.forEach(function(item){
      const f=item.face,n=item.normal,q=item.quad;
      const shine=.66+.3*Math.max(0,-.35*n[0]-.6*n[1]+.72*n[2]);
      const rgb=die.tint.map(function(v){return Math.round(clamp(v*shine,0,255));});
      trace(q);context.fillStyle='rgb('+rgb.join(',')+')';context.fill();
      context.lineWidth=clamp(q[0][2],.45,2);
      context.strokeStyle='rgba(255,255,255,.75)';context.stroke();
      spots[f.pips].forEach(function(dot){
        const ring=[];
        for(let j=0;j<12;j++){
          const angle=j*TAU/12;
          const fu=dot[0]*2*half+Math.cos(angle)*half*.125;
          const fv=dot[1]*2*half+Math.sin(angle)*half*.125;
          ring.push(project(transform([
            f.center[0]*(half+.45)+f.u[0]*fu+f.v[0]*fv,
            f.center[1]*(half+.45)+f.u[1]*fu+f.v[1]*fv,
            f.center[2]*(half+.45)+f.u[2]*fu+f.v[2]*fv
          ])));
        }
        trace(ring);context.fillStyle='rgba(25,27,44,.82)';context.fill();
      });
      trace(q);
      const grad=context.createLinearGradient(q[0][0],q[0][1],q[2][0],q[2][1]);
      grad.addColorStop(0,'rgba(255,255,255,.20)');
      grad.addColorStop(1,'rgba(255,255,255,0)');
      context.fillStyle=grad;context.fill();
    });
    context.globalAlpha=1;
  }
  function draw(now){
    frameId=0;
    if(!active||document.hidden)return;
    const delta=last?Math.min((now-last)/1000,.035):1/60;
    last=now;clock+=delta;
    const reduced=motion&&motion.matches;
    if(reduced){visual=target;velocity=0;}
    else{
      velocity+=(target-visual)*77*delta;
      velocity*=Math.exp(-15.7*delta);
      visual+=velocity*delta;
      if(Math.abs(target-visual)<.000005&&Math.abs(velocity)<.00001){
        visual=target;velocity=0;
      }
    }
    context.clearRect(0,0,width,height);
    const visible=dice.map(function(d){return{die:d,u:(visual-d.start)/d.len};})
      .filter(function(item){return item.u>=0&&item.u<=1;});
    visible.sort(function(a,b){return Math.sin(Math.PI*a.u)-Math.sin(Math.PI*b.u);});
    visible.forEach(function(item){drawDie(item.die,item.u);});
    if(!reduced)schedule();
  }
  function schedule(){
    if(active&&!frameId&&!document.hidden)frameId=requestAnimationFrame(draw);
  }
  window.addEventListener('scroll',setTarget,{passive:true});
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',function(){last=0;schedule();});
  new MutationObserver(syncActive).observe(root,{attributes:true,attributeFilter:['data-gallery-columns','data-gallery-mode']});
  if(motion){
    const changed=function(){last=0;schedule();};
    if(motion.addEventListener)motion.addEventListener('change',changed);
    else if(motion.addListener)motion.addListener(changed);
  }
  syncActive();
})();
