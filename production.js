const MAX_VOTES=3;
const DEFAULT_VOTE_CYCLE_ID='2026';
let voteCycleId=DEFAULT_VOTE_CYCLE_ID;
const API_BASE=(window.__SAKUHIN_API_BASE__||'https://sakuhin-vote-api.mutsumam.workers.dev').replace(/\/$/,'');
const DEFAULT_DISPLAY_SETTINGS=Object.freeze({
  heroTopline:'山口駐屯地創設71周年記念行事',
  heroTitleJp:'作品展',
  heroTitleEn:'ART EXHIBITION',
  heroSide:'日常に、小さな美を。',
  heroCaption:'2026.9.20 山口駐屯地グランドから朝日を望む',
  headerImageKey:'',
  headerLayout:'standard',
  heroTitleScale:100,
  heroCopyScale:100,
  footerText:'作品展投票システム',
  poweredByText:'駐屯地曹友会×厚生班',
  themeBg:'#eeeae0',
  backgroundMode:'solid',
  themeInk:'#1f3c31',
  themeAccent:'#244f40',
  themeAccentStrong:'#173b30'
});
let displaySettings={...DEFAULT_DISPLAY_SETTINGS};

async function rpcCall(method){
  const args=[].slice.call(arguments,1);
  const response=await fetch(API_BASE+'/api/rpc',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({method:method,args:args})
  });

  let payload=null;
  try{payload=await response.json();}catch(e){}

  if(!response.ok||!payload||payload.ok!==true){
    const code=payload&&payload.error?payload.error:'HTTP_'+response.status;
    throw new Error(code);
  }

  return payload.result;
}

let works=[];
let selected=[];
let activeDetailValue='';

function displayAssetUrl(key){
  const value=String(key||'').trim();
  if(!value)return'';
  return API_BASE+'/assets/'+value.split('/').map(encodeURIComponent).join('/');
}

function normalizeDisplaySettings(value){
  const source=value&&typeof value==='object'?value:{};
  const text=function(key,fallback){
    const result=String(source[key]==null?'':source[key]).trim();
    return result||fallback;
  };
  const color=function(key,fallback){
    const result=String(source[key]||'').trim();
    return /^#[0-9a-fA-F]{6}$/.test(result)?result:fallback;
  };
  return{
    heroTopline:text('heroTopline',DEFAULT_DISPLAY_SETTINGS.heroTopline),
    heroTitleJp:text('heroTitleJp',DEFAULT_DISPLAY_SETTINGS.heroTitleJp),
    heroTitleEn:text('heroTitleEn',DEFAULT_DISPLAY_SETTINGS.heroTitleEn),
    heroSide:text('heroSide',DEFAULT_DISPLAY_SETTINGS.heroSide),
    heroCaption:text('heroCaption',DEFAULT_DISPLAY_SETTINGS.heroCaption),
    headerImageKey:String(source.headerImageKey||'').trim(),
    headerLayout:['standard','mosaic','editorial','solar'].includes(source.headerLayout)?source.headerLayout:'standard',
    heroTitleScale:Number.isFinite(Number(source.heroTitleScale))&&source.heroTitleScale!=null
      ?Math.max(75,Math.min(125,Math.round(Number(source.heroTitleScale)))):100,
    heroCopyScale:Number.isFinite(Number(source.heroCopyScale))&&source.heroCopyScale!=null
      ?Math.max(75,Math.min(125,Math.round(Number(source.heroCopyScale)))):100,
    footerText:text('footerText',DEFAULT_DISPLAY_SETTINGS.footerText),
    poweredByText:text('poweredByText',DEFAULT_DISPLAY_SETTINGS.poweredByText),
    themeBg:color('themeBg',DEFAULT_DISPLAY_SETTINGS.themeBg),
    backgroundMode:['gradient','landscape','photoreal_forest'].includes(source.backgroundMode)?source.backgroundMode:'solid',
    themeInk:color('themeInk',DEFAULT_DISPLAY_SETTINGS.themeInk),
    themeAccent:color('themeAccent',DEFAULT_DISPLAY_SETTINGS.themeAccent),
    themeAccentStrong:color('themeAccentStrong',DEFAULT_DISPLAY_SETTINGS.themeAccentStrong)
  };
}

function hexToRgb(value){
  const match=/^#([0-9a-f]{6})$/i.exec(String(value||'').trim());
  if(!match)return{r:0,g:0,b:0};
  const hex=match[1];
  return{
    r:parseInt(hex.slice(0,2),16),
    g:parseInt(hex.slice(2,4),16),
    b:parseInt(hex.slice(4,6),16)
  };
}

function rgbToHex(rgb){
  const part=function(value){
    return Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,'0');
  };
  return'#'+part(rgb.r)+part(rgb.g)+part(rgb.b);
}

function mixHex(from,to,ratio){
  const a=hexToRgb(from);
  const b=hexToRgb(to);
  const t=Math.max(0,Math.min(1,Number(ratio)||0));
  return rgbToHex({
    r:a.r+(b.r-a.r)*t,
    g:a.g+(b.g-a.g)*t,
    b:a.b+(b.b-a.b)*t
  });
}

function rgbaHex(value,alpha){
  const rgb=hexToRgb(value);
  return'rgba('+rgb.r+','+rgb.g+','+rgb.b+','+alpha+')';
}

function themeIsDark(hex){
  const rgb=hexToRgb(hex);
  return rgb.r*.2126+rgb.g*.7152+rgb.b*.0722<85;
}

// Static gradient derived from existing theme colours, shared with Admin preview.
function displayBackgroundGradient(bg,accent){
  const dark=themeIsDark(bg);
  const highlight=mixHex(bg,'#ffffff',dark?.15:.24);
  const glow=mixHex(bg,accent,dark?.42:.25);
  const middle=mixHex(bg,dark?'#ffffff':accent,dark?.09:.10);
  const lower=mixHex(bg,dark?'#000000':'#ffffff',dark?.22:.13);
  // Each layer spans the entire document: a continuous atmospheric canvas, never tiles.
  return 'radial-gradient(ellipse 85% 22% at 14% 10%,'+highlight+' 0%,transparent 100%),'
    +'radial-gradient(ellipse 78% 27% at 92% 45%,'+glow+' 0%,transparent 100%),'
    +'radial-gradient(ellipse 95% 24% at 10% 85%,'+middle+' 0%,transparent 100%),'
    +'linear-gradient(165deg,'+highlight+' 0%,'+bg+' 30%,'+middle+' 66%,'+lower+' 100%)';
}

function displayThemeSurfaces(settings){
  const isStandard=
    settings.themeBg===DEFAULT_DISPLAY_SETTINGS.themeBg&&
    settings.themeInk===DEFAULT_DISPLAY_SETTINGS.themeInk&&
    settings.themeAccent===DEFAULT_DISPLAY_SETTINGS.themeAccent&&
    settings.themeAccentStrong===DEFAULT_DISPLAY_SETTINGS.themeAccentStrong;

  if(isStandard){
    return{
      surface:'#f7f5ef',
      surfaceStrong:'#fffefa',
      barBg:'rgba(239,238,232,.97)',
      screenBg:'rgba(238,234,224,.985)',
      maskBg:'rgba(236,234,225,.97)',
      cardBg:'rgba(255,254,250,.58)',
      cardSelectedBg:'rgba(247,245,239,.78)',
      imagePlaceholder:'#deddd7',
      imageCanvas:'#e9e7e1',
      slotBg:'#dadbd6',
      slotImageBg:'#e4e3dd',
      selectZoneBg:'rgba(17,28,23,.38)',
      selectedZoneBg:'rgba(31,60,49,.72)',
      selectedMaskBg:'rgba(31,60,49,.28)',
      thumbIndexBg:'rgba(20,34,28,.72)'
    };
  }

  const bg=settings.themeBg;
  const ink=settings.themeInk;
  const accent=settings.themeAccent;
  const isDark=themeIsDark(bg);

  if(isDark){
    return{
      surface:mixHex(bg,'#ffffff',.09),
      surfaceStrong:mixHex(bg,'#ffffff',.15),
      barBg:rgbaHex(mixHex(bg,'#ffffff',.07),.97),
      screenBg:rgbaHex(bg,.985),
      maskBg:rgbaHex(mixHex(bg,'#ffffff',.04),.97),
      cardBg:rgbaHex(mixHex(bg,'#ffffff',.09),.94),
      cardSelectedBg:rgbaHex(mixHex(bg,accent,.20),.96),
      imagePlaceholder:mixHex(bg,'#ffffff',.13),
      imageCanvas:mixHex(bg,'#ffffff',.06),
      slotBg:mixHex(bg,'#ffffff',.15),
      slotImageBg:mixHex(bg,'#ffffff',.09),
      selectZoneBg:rgbaHex(mixHex(bg,'#000000',.22),.85),
      selectedZoneBg:rgbaHex(mixHex(accent,'#000000',.55),.9),
      selectedMaskBg:rgbaHex(accent,.18),
      thumbIndexBg:'rgba(10,16,22,.84)'
    };
  }

  return{
    surface:mixHex(bg,'#ffffff',.52),
    surfaceStrong:mixHex(bg,'#ffffff',.92),
    barBg:rgbaHex(mixHex(bg,'#ffffff',.18),.97),
    screenBg:rgbaHex(bg,.985),
    maskBg:rgbaHex(mixHex(bg,'#ffffff',.04),.97),
    cardBg:rgbaHex(mixHex(bg,'#ffffff',.88),.62),
    cardSelectedBg:rgbaHex(mixHex(bg,'#ffffff',.52),.82),
    imagePlaceholder:mixHex(bg,ink,.09),
    imageCanvas:mixHex(bg,'#ffffff',.12),
    slotBg:mixHex(bg,ink,.08),
    slotImageBg:mixHex(bg,'#ffffff',.08),
    selectZoneBg:rgbaHex(mixHex(ink,'#000000',.18),.38),
    selectedZoneBg:rgbaHex(accent,.72),
    selectedMaskBg:rgbaHex(accent,.28),
    thumbIndexBg:rgbaHex(mixHex(ink,'#000000',.12),.72)
  };
}

function applyDisplaySettings(value){
  displaySettings=normalizeDisplaySettings(value);
  const setText=function(id,text){
    const el=document.getElementById(id);
    if(el)el.textContent=text;
  };

  setText('heroTopline',displaySettings.heroTopline);
  setText('heroTitleJp',displaySettings.heroTitleJp);
  setText('heroTitleEn',displaySettings.heroTitleEn);
  setText('heroSide',displaySettings.heroSide);
  setText('heroCaption',displaySettings.heroCaption);

  const appHeader=document.querySelector('.app-header');
  if(appHeader){
    appHeader.dataset.headerLayout=displaySettings.headerLayout;
    if(displaySettings.heroTitleScale!==100){
      appHeader.dataset.headerTitleCustom='true';
    }else{
      delete appHeader.dataset.headerTitleCustom;
    }
    if(displaySettings.heroCopyScale!==100){
      appHeader.dataset.headerCopyCustom='true';
    }else{
      delete appHeader.dataset.headerCopyCustom;
    }
    appHeader.style.setProperty('--header-title-scale',String(displaySettings.heroTitleScale/100));
    appHeader.style.setProperty('--header-copy-scale',String(displaySettings.heroCopyScale/100));
  }

  const heroTitle=document.querySelector('.hero-title');
  if(heroTitle)heroTitle.setAttribute('aria-label',displaySettings.heroTitleJp+' / '+displaySettings.heroTitleEn);

  document.querySelectorAll('.powered-by strong').forEach(function(el){
    el.textContent=displaySettings.poweredByText;
  });

  const root=document.documentElement;
  root.style.setProperty('--bg',displaySettings.themeBg);
  root.style.setProperty('--ink',displaySettings.themeInk);
  root.style.setProperty('--accent',displaySettings.themeAccent);
  root.style.setProperty('--accent-strong',displaySettings.themeAccentStrong);
  const gradientEnabled=displaySettings.backgroundMode!=='solid';
  root.classList.toggle('theme-gradient',gradientEnabled);
  root.classList.toggle('theme-landscape',displaySettings.backgroundMode==='landscape');
  root.classList.toggle('theme-photoreal-forest',displaySettings.backgroundMode==='photoreal_forest');
  if(gradientEnabled){
    root.style.setProperty('--page-gradient',displayBackgroundGradient(displaySettings.themeBg,displaySettings.themeAccent));
  }else{
    root.style.removeProperty('--page-gradient');
  }

  const isDark=themeIsDark(displaySettings.themeBg);
  root.classList.toggle('theme-dark',isDark);
  const darkVars=isDark?{
    '--ink-soft':mixHex(displaySettings.themeInk,displaySettings.themeBg,.25),
    '--muted':mixHex(displaySettings.themeInk,displaySettings.themeBg,.42),
    '--line':rgbaHex(displaySettings.themeInk,.2),
    '--line-strong':rgbaHex(displaySettings.themeInk,.34),
    '--disabled':mixHex(displaySettings.themeBg,'#ffffff',.2),
    '--disabled-ink':mixHex(displaySettings.themeInk,displaySettings.themeBg,.50),
    '--danger':'#ff9992',
    '--accent-contrast':'#101820'
  }:{};
  ['--ink-soft','--muted','--line','--line-strong','--disabled','--disabled-ink','--danger','--accent-contrast'].forEach(function(name){
    if(isDark)root.style.setProperty(name,darkVars[name]);
    else root.style.removeProperty(name);
  });

  const surfaces=displayThemeSurfaces(displaySettings);
  root.style.setProperty('--surface',surfaces.surface);
  root.style.setProperty('--surface-strong',surfaces.surfaceStrong);
  root.style.setProperty('--bar-bg',surfaces.barBg);
  root.style.setProperty('--screen-bg',surfaces.screenBg);
  root.style.setProperty('--mask-bg',surfaces.maskBg);
  root.style.setProperty('--card-bg',surfaces.cardBg);
  root.style.setProperty('--card-selected-bg',surfaces.cardSelectedBg);
  root.style.setProperty('--image-placeholder',surfaces.imagePlaceholder);
  root.style.setProperty('--image-canvas',surfaces.imageCanvas);
  root.style.setProperty('--slot-bg',surfaces.slotBg);
  root.style.setProperty('--slot-image-bg',surfaces.slotImageBg);
  root.style.setProperty('--select-zone-bg',surfaces.selectZoneBg);
  root.style.setProperty('--selected-zone-bg',surfaces.selectedZoneBg);
  root.style.setProperty('--selected-mask-bg',surfaces.selectedMaskBg);
  root.style.setProperty('--thumb-index-bg',surfaces.thumbIndexBg);

  const themeMeta=document.querySelector('meta[name="theme-color"]');
  if(themeMeta)themeMeta.setAttribute('content',displaySettings.themeBg);

  const heroVisual=document.querySelector('.hero-visual');
  if(heroVisual){
    heroVisual.style.backgroundImage=displaySettings.headerImageKey
      ?'url("'+displayAssetUrl(displaySettings.headerImageKey).replace(/"/g,'%22')+'")'
      :'';
  }

  const mask=document.getElementById('votedMask');
  if(mask&&!mask.hidden)applyVotedMaskCopy(storedWinner());
}

function loadDisplaySettings(){
  return rpcCall('getDisplaySettings')
    .then(function(settings){applyDisplaySettings(settings);})
    .catch(function(error){console.error('表示設定を取得できませんでした。',error);});
}

function setCookie(name,value,days){
  const date=new Date();
  date.setTime(date.getTime()+days*86400000);
  document.cookie=name+'='+encodeURIComponent(value)+';expires='+date.toUTCString()+';path=/;SameSite=Lax';
}

function getCookie(name){
  const item=document.cookie.split('; ').find(function(value){
    return value.startsWith(name+'=');
  });
  return item?decodeURIComponent(item.split('=').slice(1).join('=')):'';
}

function normalizeVoteCycleId(value){
  const text=String(value==null?'':value).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(text)?text:DEFAULT_VOTE_CYCLE_ID;
}

function voteDoneKey(){
  return'sakuhin_vote_done_'+voteCycleId;
}

function winnerKey(){
  return'sakuhin_vote_winner_'+voteCycleId;
}

function applyVoteCycleSettings(settings){
  voteCycleId=normalizeVoteCycleId(settings&&settings.voteCycleId);
}

function loadVoteCycleSettings(){
  return rpcCall('getVoteCycleSettings')
    .then(function(settings){applyVoteCycleSettings(settings);})
    .catch(function(error){
      voteCycleId=DEFAULT_VOTE_CYCLE_ID;
      console.error('投票サイクルを取得できませんでした。',error);
    });
}

function hasVoted(){
  const key=voteDoneKey();
  return localStorage.getItem(key)==='1'||getCookie(key)==='1';
}

function markVoted(result){
  const doneKey=voteDoneKey();
  const prizeKey=winnerKey();
  localStorage.setItem(doneKey,'1');
  setCookie(doneKey,'1',3650);

  try{
    if(result&&result.winner===true){
      localStorage.setItem(prizeKey,JSON.stringify(result));
    }else{
      localStorage.removeItem(prizeKey);
    }
  }catch(e){}
}

function storedWinner(){
  try{
    const raw=localStorage.getItem(winnerKey());
    if(!raw)return null;
    const value=JSON.parse(raw);
    return value&&value.winner===true?value:null;
  }catch(e){
    return null;
  }
}

function applyVotedMaskCopy(result){
  const winner=result&&result.winner===true&&result.winnerInfo;
  const check=document.querySelector('.voted-mask-check');
  const kicker=document.querySelector('.voted-mask-kicker');
  const title=document.getElementById('votedMaskTitle');
  const subtitle=document.querySelector('.voted-mask-subtitle');
  const status=document.querySelector('.voted-mask-status');
  const footer=document.querySelector('.voted-mask-footer');

  if(winner){
    check.textContent='★';
    kicker.textContent='PRIZE WINNER';
    title.textContent=String(result.winnerInfo.title||'当選しました！');
    subtitle.textContent=String(result.winnerInfo.eventLabel||'');
    status.textContent='第'+String(result.winnerNumber)+'投票の当選です。';
    footer.textContent=String(result.winnerInfo.message||'係員にこの画面を提示してください。');
    return;
  }

  check.textContent='✓';
  kicker.textContent='VOTE COMPLETE';
  title.textContent='投票済みです';
  subtitle.textContent='ご投票ありがとうございました。';
  status.innerHTML='投票内容を受け付けました。<br>この端末からの追加投票はできません。';
  footer.textContent=displaySettings.footerText;
}

function showVotedMask(result){
  closeWorkDetail();
  closeVoteConfirm();
  const mask=document.getElementById('votedMask');
  if(!mask)return;
  applyVotedMaskCopy(result||storedWinner());
  mask.hidden=false;
  mask.setAttribute('aria-hidden','false');
  document.body.classList.add('voted-mask-active');
}

function hideVotedMask(){
  const mask=document.getElementById('votedMask');
  if(!mask)return;
  mask.hidden=true;
  mask.setAttribute('aria-hidden','true');
  document.body.classList.remove('voted-mask-active');
}

function init(){
  document.getElementById('voteButton').addEventListener('click',openVoteConfirm);
  document.getElementById('adminButton').addEventListener('click',showAdmin);

  document.getElementById('voteConfirmSubmitButton').addEventListener('click',submitVote);
  document.getElementById('voteConfirmBackButton').addEventListener('click',closeVoteConfirm);

  document.querySelectorAll('.selected-thumb-slot').forEach(function(slot){
    slot.addEventListener('click',function(){
      const value=slot.dataset.workValue;
      if(value)toggleSelection(value);
    });
  });

  const detailView=document.getElementById('workDetailView');
  const detailPanel=document.getElementById('workDetailPanel');
  const detailSelectButton=document.getElementById('workDetailSelectButton');
  const detailCloseButton=document.getElementById('workDetailCloseButton');

  detailView.addEventListener('click',function(){
    closeWorkDetail();
  });

  detailPanel.addEventListener('keydown',function(event){
    if(event.key==='Escape'){
      event.preventDefault();
      closeWorkDetail();
    }
  });

  detailSelectButton.addEventListener('click',function(event){
    event.stopPropagation();
    if(activeDetailValue)toggleSelection(activeDetailValue);
    closeWorkDetail();
  });

  detailCloseButton.addEventListener('click',function(event){
    event.stopPropagation();
    closeWorkDetail();
  });

  const votedMaskAdminZone=document.querySelector('.voted-mask-admin-zone');
  if(votedMaskAdminZone){
    votedMaskAdminZone.addEventListener('click',showAdmin);
    votedMaskAdminZone.addEventListener('keydown',function(event){
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();
        showAdmin();
      }
    });
  }

  loadDisplaySettings();
  loadVoteCycleSettings().then(function(){
    loadWorks();
    if(hasVoted())showVotedMask(storedWinner());
    else hideVotedMask();
  });
}

function loadWorks(){
  rpcCall('getChoiceOptions')
    .then(function(data){
      works=Array.isArray(data)?data:[];
      renderWorks();
    })
    .catch(function(error){
      const container=document.getElementById('works');
      container.textContent='作品データを取得できませんでした。';
      container.setAttribute('aria-busy','false');
      console.error(error);
    });
}

function parseChoiceInfo(value){
  const work=works.find(function(item){
    return item&&item.value===value;
  });

  if(work&&(work.title||work.author||work.comment)){
    return{
      title:String(work.title||'').trim(),
      author:String(work.author||'').trim(),
      comment:String(work.comment||'').trim()
    };
  }

  const raw=String(value==null?'':value).trim();
  if(!raw)return{title:'',author:'',comment:''};

  const firstSpace=raw.indexOf(' ');
  if(firstSpace===-1)return{title:raw,author:'',comment:''};

  const title=raw.slice(0,firstSpace).trim();
  const rest=raw.slice(firstSpace+1).trim();
  const secondSpace=rest.indexOf(' ');

  if(secondSpace===-1)return{title:raw,author:'',comment:''};

  return{
    title:title,
    author:rest.slice(0,secondSpace).trim(),
    comment:rest.slice(secondSpace+1).trim()
  };
}

function attachImageFallback(image,imageWrap){
  const fail=function(){
    imageWrap.classList.add('image-unavailable');
  };

  image.addEventListener('error',fail,{once:true});

  if(image.complete&&image.naturalWidth===0)fail();
}

function hideMaxVoteError(){
  const panel=document.getElementById('maxVoteErrorPanel');
  if(!panel)return;

  clearTimeout(window.maxVoteErrorTimer);
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden','true');
}

function showMaxVoteError(){
  const panel=document.getElementById('maxVoteErrorPanel');
  if(!panel)return;

  hideMaxVoteError();
  panel.setAttribute('aria-hidden','false');
  void panel.offsetWidth;
  panel.classList.add('show');

  window.maxVoteErrorTimer=setTimeout(hideMaxVoteError,1800);
}

function renderWorks(){
  const container=document.getElementById('works');
  container.innerHTML='';

  works.forEach(function(work,index){
    const parsed=parseChoiceInfo(work.value);
    const isSelected=selected.includes(work.value);

    const card=document.createElement('article');
    card.className='work-card'+(isSelected?' selected':'');
    card.dataset.workValue=work.value;
    card.dataset.workIndex=String(index);
    card.tabIndex=0;
    card.setAttribute('role','button');
    card.setAttribute('aria-label','詳細表示：'+(parsed.title||('作品 '+String(index+1))));

    const imageWrap=document.createElement('div');
    imageWrap.className='work-image-wrap';

    if(work.image){
      const image=document.createElement('img');
      image.className='work-image';
      image.src=work.image;
      image.alt='作品画像：'+(parsed.title||('作品 '+String(index+1)));
      image.decoding='async';
      image.loading=index<2?'eager':'lazy';
      attachImageFallback(image,imageWrap);
      imageWrap.appendChild(image);
    }

    const selectZone=document.createElement('button');
    selectZone.type='button';
    selectZone.className='work-select-zone';
    selectZone.setAttribute('aria-pressed',isSelected?'true':'false');
    selectZone.setAttribute('aria-label',(isSelected?'選択解除：':'選択：')+(parsed.title||('作品 '+String(index+1))));

    const check=document.createElement('span');
    check.className='select-check';
    check.setAttribute('aria-hidden','true');
    check.textContent='✓';

    const selectLabel=document.createElement('span');
    selectLabel.className='select-zone-label';
    selectLabel.textContent=isSelected?'選択解除':'選択';

    selectZone.appendChild(check);
    selectZone.appendChild(selectLabel);
    selectZone.addEventListener('click',function(event){
      event.stopPropagation();
      toggleSelection(work.value);
    });

    imageWrap.appendChild(selectZone);

    const meta=document.createElement('div');
    meta.className='work-meta';

    const workIndex=document.createElement('span');
    workIndex.className='work-index';
    workIndex.textContent='WORK '+String(index+1).padStart(2,'0');

    const title=document.createElement('h3');
    title.className='work-title';
    title.id='work-title-'+String(index+1);
    title.textContent=parsed.title||('作品 '+String(index+1));
    card.setAttribute('aria-labelledby',title.id);

    meta.appendChild(workIndex);
    meta.appendChild(title);

    if(parsed.author){
      const author=document.createElement('div');
      author.className='work-author';
      author.textContent=parsed.author;
      meta.appendChild(author);
    }

    card.appendChild(imageWrap);
    card.appendChild(meta);

    card.addEventListener('click',function(){
      openWorkDetail(work.value);
    });

    card.addEventListener('keydown',function(event){
      if(event.target!==card)return;
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();
        openWorkDetail(work.value);
      }
    });

    container.appendChild(card);
  });

  container.setAttribute('aria-busy','false');
  updateUI();
}

function openWorkDetail(value){
  const workIndex=works.findIndex(function(work){
    return work.value===value;
  });
  if(workIndex<0)return;

  const work=works[workIndex];
  const parsed=parseChoiceInfo(work.value);
  activeDetailValue=value;

  document.getElementById('workDetailIndex').textContent='WORK '+String(workIndex+1).padStart(2,'0');
  document.getElementById('workDetailTitle').textContent=parsed.title||('作品 '+String(workIndex+1));
  const author=document.getElementById('workDetailAuthor');
  author.textContent=parsed.author||'';
  author.hidden=!parsed.author.trim();

  const comment=document.getElementById('workDetailComment');
  comment.textContent=parsed.comment||'';
  comment.hidden=!parsed.comment.trim();

  const image=document.getElementById('workDetailImage');
  if(work.image){
    image.src=work.image;
    image.alt='作品画像：'+(parsed.title||('作品 '+String(workIndex+1)));
    image.hidden=false;
  }else{
    image.removeAttribute('src');
    image.alt='';
    image.hidden=true;
  }

  const selectButton=document.getElementById('workDetailSelectButton');
  const isSelected=selected.includes(value);
  selectButton.textContent=isSelected?'選択解除':'選択する';
  selectButton.setAttribute('aria-pressed',isSelected?'true':'false');

  const detailView=document.getElementById('workDetailView');
  detailView.hidden=false;
  detailView.setAttribute('aria-hidden','false');
  document.body.classList.add('work-detail-active');

  requestAnimationFrame(function(){
    document.getElementById('workDetailPanel').focus({preventScroll:true});
  });
}

function closeWorkDetail(){
  const detailView=document.getElementById('workDetailView');
  if(!detailView||detailView.hidden)return;

  detailView.hidden=true;
  detailView.setAttribute('aria-hidden','true');
  document.body.classList.remove('work-detail-active');
  activeDetailValue='';
}

function toggleSelection(value){
  if(hasVoted())return;

  const currentIndex=selected.indexOf(value);
  const isSelected=currentIndex>=0;

  if(isSelected){
    selected.splice(currentIndex,1);
  }else{
    if(selected.length>=MAX_VOTES){
      showMaxVoteError();
      return;
    }
    selected.push(value);
  }

  hideMaxVoteError();

  const workIndex=works.findIndex(function(work){
    return work.value===value;
  });
  const card=workIndex>=0?document.querySelectorAll('.work-card')[workIndex]:null;
  if(card){
    const nextSelected=!isSelected;
    card.classList.toggle('selected',nextSelected);

    const zone=card.querySelector('.work-select-zone');
    if(zone){
      const title=card.querySelector('.work-title');
      zone.setAttribute('aria-pressed',nextSelected?'true':'false');
      zone.setAttribute('aria-label',(nextSelected?'選択解除：':'選択：')+(title?title.textContent:'作品'));
      const label=zone.querySelector('.select-zone-label');
      if(label)label.textContent=nextSelected?'選択解除':'選択';
    }
  }

  updateUI();
}

function updateUI(){
  const count=selected.length;
  document.getElementById('selectionStatus').textContent=count+'作品選択中';
  document.getElementById('count').textContent=String(count);
  document.getElementById('voteButton').disabled=count===0;
  renderSelectedThumbs();
}

function renderSelectedThumbs(){
  const slots=document.querySelectorAll('.selected-thumb-slot');

  slots.forEach(function(slot,index){
    slot.innerHTML='';
    slot.classList.remove('filled');
    slot.removeAttribute('aria-label');
    slot.disabled=true;
    delete slot.dataset.workValue;

    const value=selected[index];
    if(!value){
      slot.setAttribute('aria-hidden','true');
      return;
    }

    const work=works.find(function(item){return item.value===value;});
    const workIndex=works.findIndex(function(item){return item.value===value;});
    const parsed=parseChoiceInfo(value);

    slot.classList.add('filled');
    slot.setAttribute('aria-hidden','false');
    slot.setAttribute('aria-label','選択解除：'+(parsed.title||('作品 '+String(workIndex+1))));
    slot.disabled=false;
    slot.dataset.workValue=value;

    if(work&&work.image){
      const image=document.createElement('img');
      image.src=work.image;
      image.alt='';
      image.decoding='async';
      slot.appendChild(image);
    }

    const indexLabel=document.createElement('span');
    indexLabel.className='thumb-index';
    indexLabel.textContent=workIndex>=0?String(workIndex+1).padStart(2,'0'):String(index+1);
    slot.appendChild(indexLabel);
  });

  const selectedTitles=selected.map(function(value){
    return parseChoiceInfo(value).title;
  });

  document.getElementById('selectedThumbs').setAttribute(
    'aria-label',
    selected.length
      ?selected.length+'作品選択中：'+selectedTitles.join('、')
      :'選択中の作品はありません'
  );
}

function renderVoteConfirm(){
  const container=document.getElementById('voteConfirmWorks');
  container.innerHTML='';

  selected.forEach(function(value,selectedIndex){
    const work=works.find(function(item){return item.value===value;});
    const workIndex=works.findIndex(function(item){return item.value===value;});
    const parsed=parseChoiceInfo(value);

    const item=document.createElement('article');
    item.className='vote-confirm-item';

    const thumb=document.createElement('div');
    thumb.className='vote-confirm-thumb';

    if(work&&work.image){
      const image=document.createElement('img');
      image.src=work.image;
      image.alt='';
      image.decoding='async';
      thumb.appendChild(image);
    }

    const copy=document.createElement('div');
    copy.className='vote-confirm-item-copy';

    const indexLabel=document.createElement('div');
    indexLabel.className='vote-confirm-item-index';
    indexLabel.textContent='WORK '+String(workIndex>=0?workIndex+1:selectedIndex+1).padStart(2,'0');

    const title=document.createElement('h3');
    title.className='vote-confirm-item-title';
    title.textContent=parsed.title||('作品 '+String(selectedIndex+1));

    copy.appendChild(indexLabel);
    copy.appendChild(title);

    if(parsed.author){
      const author=document.createElement('div');
      author.className='vote-confirm-item-author';
      author.textContent=parsed.author;
      copy.appendChild(author);
    }

    item.appendChild(thumb);
    item.appendChild(copy);
    container.appendChild(item);
  });
}

function openVoteConfirm(){
  if(selected.length<1||selected.length>MAX_VOTES||hasVoted())return;

  hideMaxVoteError();
  closeWorkDetail();
  renderVoteConfirm();

  const view=document.getElementById('voteConfirmView');
  view.hidden=false;
  view.setAttribute('aria-hidden','false');
  document.body.classList.add('vote-confirm-active');

  requestAnimationFrame(function(){
    document.getElementById('voteConfirmSubmitButton').focus({preventScroll:true});
  });
}

function closeVoteConfirm(){
  const view=document.getElementById('voteConfirmView');
  if(!view||view.hidden)return;

  view.hidden=true;
  view.setAttribute('aria-hidden','true');
  document.body.classList.remove('vote-confirm-active');

  const submitButton=document.getElementById('voteConfirmSubmitButton');
  submitButton.disabled=false;
  submitButton.textContent='投票する';
  submitButton.removeAttribute('aria-busy');
}

function submitVote(){
  if(selected.length<1||selected.length>MAX_VOTES)return;

  hideMaxVoteError();

  const button=document.getElementById('voteConfirmSubmitButton');
  if(!button||button.disabled)return;

  button.disabled=true;
  button.textContent='送信中…';
  button.setAttribute('aria-busy','true');

  rpcCall('submitVoteToForm',selected.slice())
    .then(function(ok){
      if(!ok){
        button.disabled=false;
        button.textContent='投票する';
        button.removeAttribute('aria-busy');
        alert('投票に失敗しました。');
        return;
      }

      markVoted(ok);
      selected=[];
      updateUI();
      button.textContent='投票する';
      button.disabled=true;
      button.removeAttribute('aria-busy');
      closeVoteConfirm();
      showVotedMask(ok);
    })
    .catch(function(error){
      button.disabled=false;
      button.textContent='投票する';
      button.removeAttribute('aria-busy');
      alert('投票に失敗しました。\n'+error.message);
    });
}

function showAdmin(){
  const code=window.prompt('管理者コードを入力してください。');
  if(code===null)return;
  adminReset(code.trim());
}

function adminReset(code){
  rpcCall('adminReset',code)
    .then(function(ok){
      if(!ok){
        alert('管理コードが違います。');
        return;
      }

      const doneKey=voteDoneKey();
      localStorage.removeItem(doneKey);
      localStorage.removeItem(winnerKey());
      document.cookie=doneKey+'=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      hideMaxVoteError();
      closeWorkDetail();
      closeVoteConfirm();
      selected=[];
      hideVotedMask();
      renderWorks();
      updateUI();
    })
    .catch(function(){
      alert('管理コードの確認に失敗しました。');
    });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}

(function(){
  const vv=window.visualViewport;
  if(!vv)return;

  let zooming=false;
  let savedScrollY=0;
  let restorePending=false;
  let restoreTimer=null;

  function onViewportResize(){
    const scale=vv.scale||1;

    if(scale>1.02&&!zooming){
      zooming=true;
      savedScrollY=window.scrollY||window.pageYOffset||0;
      restorePending=false;
      if(restoreTimer){
        clearTimeout(restoreTimer);
        restoreTimer=null;
      }
      return;
    }

    if(zooming&&scale<=1.02&&!restorePending){
      restorePending=true;
      restoreTimer=setTimeout(function(){
        window.scrollTo(0,savedScrollY);
        requestAnimationFrame(function(){
          window.scrollTo(0,savedScrollY);
          zooming=false;
          restorePending=false;
          restoreTimer=null;
        });
      },80);
    }
  }

  vv.addEventListener('resize',onViewportResize,{passive:true});
})();
