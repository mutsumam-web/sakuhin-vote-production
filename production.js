const MAX_VOTES=3;
const STORAGE_KEY="sakuhin_vote_done_v15";
const VOTE_TREND_REFRESH_MS=60000;

let works=[];
let selected=[];

function setCookie(name,value,days){
  const date=new Date();
  date.setTime(date.getTime()+days*86400000);
  document.cookie=name+'='+encodeURIComponent(value)+';expires='+date.toUTCString()+';path=/;SameSite=Lax';
}

function getCookie(name){
  const item=document.cookie.split('; ').find(value=>value.startsWith(name+'='));
  return item?decodeURIComponent(item.split('=').slice(1).join('=')):'';
}

function hasVoted(){
  return localStorage.getItem(STORAGE_KEY)==='1'||getCookie('sakuhin_vote_done')==='1';
}

function markVoted(){
  localStorage.setItem(STORAGE_KEY,'1');
  setCookie('sakuhin_vote_done','1',3650);
}

function showVotedMask(){
  const mask=document.getElementById('votedMask');
  if(!mask)return;
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
  document.getElementById('voteButton').addEventListener('click',submitVote);
  document.getElementById('adminButton').addEventListener('click',showAdmin);

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

  loadWorks();
  loadVoteTrend();
  setInterval(loadVoteTrend,VOTE_TREND_REFRESH_MS);
  if(hasVoted()){
    showVotedMask();
  }else{
    hideVotedMask();
  }
}

function loadVoteTrend(){
  const status=document.getElementById('voteTrendStatus');
  if(!status)return;

  status.textContent='SYNC ACTIVE';

  google.script.run
    .withSuccessHandler(function(data){
      const rows=Array.isArray(data)?data:[];
      renderVoteTrend(rows);
      const total=document.getElementById('voteTrendTotal');
      if(total){
        const totalVotes=rows.reduce(function(sum,item){
          return sum+Math.max(0,Number(item.count)||0);
        },0);
        total.textContent='TOTAL '+totalVotes;
      }
      status.textContent='LIVE / '+new Date().toLocaleTimeString('ja-JP',{
        hour:'2-digit',
        minute:'2-digit'
      });
    })
    .withFailureHandler(function(error){
      status.textContent='DATA ERROR';
      renderVoteTrendError();
      console.error(error);
    })
    .getVoteIntervalData();
}

function renderVoteTrend(data){
  const svg=document.getElementById('voteTrendChart');
  if(!svg)return;

  while(svg.firstChild)svg.removeChild(svg.firstChild);

  if(!data.length){
    renderVoteTrendError('投票データなし');
    return;
  }

  const width=1000;
  const height=140;
  const left=104;
  const right=20;
  const top=18;
  const bottom=34;
  const chartWidth=width-left-right;
  const chartHeight=height-top-bottom;

  svg.setAttribute('viewBox','0 0 '+width+' '+height);
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');

  const values=data.map(function(item){return Number(item.count)||0;});
  const maxValue=Math.max.apply(null,values.concat([4]));
  const yMax=Math.max(4,Math.ceil(maxValue/2)*2);

  function el(tag,attrs){
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.keys(attrs||{}).forEach(function(key){
      node.setAttribute(key,attrs[key]);
    });
    return node;
  }

  function xFor(index){
    if(data.length<=1)return left+chartWidth/2;
    return left+(index/(data.length-1))*chartWidth;
  }

  function yFor(value){
    return top+chartHeight-(value/yMax)*chartHeight;
  }

  // Axis labels are sized in SVG user-units as a proportion of the
  // SVG coordinate width. No CSS vmin and no viewport->SVG conversion.
  // This keeps the text on the same scale as the graph itself.
  const axisFontSize=width*0.012;
  const xAxisFontSize=width*0.012;

  for(let value=0;value<=yMax;value+=2){
    const y=yFor(value);

    svg.appendChild(el('line',{
      x1:left,x2:width-right,y1:y,y2:y,
      class:'trend-grid'
    }));

    const label=el('text',{
      x:left-10,
      y:y+axisFontSize*0.35,
      'text-anchor':'end',
      class:'trend-y-label',
      'font-size':axisFontSize,
      'font-family':'system-ui, -apple-system, "Segoe UI", sans-serif',
      'font-weight':'700',
      'letter-spacing':'0',
      'fill':'#79f6ff'
    });
    label.textContent=String(value);
    svg.appendChild(label);
  }

  data.forEach(function(item,index){
    const x=xFor(index);

    svg.appendChild(el('line',{
      x1:x,x2:x,y1:top,y2:height-bottom,
      class:'trend-tick'
    }));

    const label=el('text',{
      x:x,
      y:height-3,
      'text-anchor':'middle',
      class:'trend-x-label',
      'font-size':xAxisFontSize,
      'font-family':'system-ui, -apple-system, "Segoe UI", sans-serif',
      'font-weight':'700',
      'letter-spacing':'0',
      'fill':'#79f6ff'
    });
    label.textContent=new Date(item.timestamp).toLocaleTimeString('ja-JP',{
      hour:'2-digit',
      minute:'2-digit'
    });
    svg.appendChild(label);
  });

  const points=data.map(function(item,index){
    return xFor(index)+','+yFor(Number(item.count)||0);
  }).join(' ');

  svg.appendChild(el('polyline',{
    points:points,
    class:'trend-line'
  }));
}

function renderVoteTrendError(message){
  const svg=document.getElementById('voteTrendChart');
  if(!svg)return;

  while(svg.firstChild)svg.removeChild(svg.firstChild);

  svg.setAttribute('viewBox','0 0 1000 140');
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');

  const text=document.createElementNS('http://www.w3.org/2000/svg','text');
  text.setAttribute('x','500');
  text.setAttribute('y','62');
  text.setAttribute('text-anchor','middle');
  text.setAttribute('class','trend-empty');
  text.textContent=message||'投票データを取得できませんでした';
  svg.appendChild(text);
}

function loadWorks(){
  google.script.run
    .withSuccessHandler(function(data){
      works=Array.isArray(data)?data:[];
      renderWorks();
    })
    .withFailureHandler(function(error){
      const container=document.getElementById('works');
      container.textContent='作品データを取得できませんでした。';
      container.setAttribute('aria-busy','false');
      console.error(error);
    })
    .getChoiceOptions();
}

function parseChoiceInfo(value){
  const raw=String(value==null?'':value).trim();
  if(!raw)return{title:'',author:'',comment:''};

  const firstSpace=raw.indexOf(' ');
  if(firstSpace===-1)return{title:raw,author:'',comment:''};

  const title=raw.slice(0,firstSpace).trim();
  const rest=raw.slice(firstSpace+1).trim();
  const secondSpace=rest.indexOf(' ');

  if(secondSpace===-1)return{title:raw,author:'',comment:''};

  const author=rest.slice(0,secondSpace).trim();
  const comment=rest.slice(secondSpace+1).trim();

  return{title,author,comment};
}

function attachImageFallback(image,imageWrap){
  const fail=function(){
    imageWrap.classList.add('image-unavailable');
  };

  image.addEventListener('error',fail,{once:true});

  if(image.complete && image.naturalWidth===0){
    fail();
  }
}

function showMaxVoteError(){
  const panel=document.getElementById('maxVoteErrorPanel');
  if(!panel)return;

  panel.classList.remove('show');
  panel.setAttribute('aria-hidden','false');
  void panel.offsetWidth;
  panel.classList.add('show');

  clearTimeout(window.maxVoteErrorTimer);
  window.maxVoteErrorTimer=setTimeout(function(){
    panel.classList.remove('show');
    panel.setAttribute('aria-hidden','true');
  },1100);
}

function renderWorks(){
  const container=document.getElementById('works');
  container.innerHTML='';

  works.forEach(function(work,index){
    const isSelected=selected.includes(work.value);
    const parsed=parseChoiceInfo(work.value);

    const wrapper=document.createElement('article');
    wrapper.className='work-card'+(isSelected?' selected':'');
    wrapper.dataset.workIndex=String(index);
    wrapper.dataset.workValue=work.value;

    const number=document.createElement('div');
    number.className='work-number';
    number.textContent=String(index+1).padStart(2,'0');
    number.setAttribute('aria-label','作品番号 '+String(index+1));

    const imageWrap=document.createElement('div');
    imageWrap.className='work-image-wrap';

    if(work.image){
      const image=document.createElement('img');
      image.className='work-image';
      image.alt='作品画像：'+(parsed.title||('作品 '+String(index+1)));
      image.decoding='async';
      if(index===0){
        image.loading='eager';
        if('fetchPriority' in image) image.fetchPriority='high';
      }else{
        image.loading='lazy';
      }
      image.src=work.image;
      attachImageFallback(image,imageWrap);
      imageWrap.appendChild(image);
    }else{
      imageWrap.classList.add('no-image');
    }

    const info=document.createElement('div');
    info.className='work-info';

    const infoTop=document.createElement('div');
    infoTop.className='work-info-top';
    infoTop.textContent='WORK '+String(index+1).padStart(2,'0');

    const titleBlock=document.createElement('div');
    titleBlock.className='data-block work-title-block';

    const titleLabel=document.createElement('span');
    titleLabel.className='data-label';
    titleLabel.textContent='TITLE';

    const title=document.createElement('h3');
    title.className='work-title';
    title.id='work-title-'+String(index+1);
    title.textContent=parsed.title||('作品 '+String(index+1));
    wrapper.setAttribute('aria-labelledby',title.id);

    titleBlock.appendChild(titleLabel);
    titleBlock.appendChild(title);

    const authorBlock=document.createElement('div');
    authorBlock.className='data-block work-author-block';

    const authorLabel=document.createElement('span');
    authorLabel.className='work-author-label';
    authorLabel.textContent='ARTIST';

    const author=document.createElement('div');
    author.className='work-author';
    author.textContent=parsed.author||'作者名なし';

    authorBlock.appendChild(authorLabel);
    authorBlock.appendChild(author);

    const commentBlock=document.createElement('div');
    commentBlock.className='data-block work-comment-block';

    const commentLabel=document.createElement('span');
    commentLabel.className='work-comment-label';
    commentLabel.textContent='COMMENT';

    const comment=document.createElement('div');
    comment.className='work-comment is-collapsed';
    comment.id='work-comment-'+String(index+1);
    comment.textContent=parsed.comment;

    commentBlock.appendChild(commentLabel);
    commentBlock.appendChild(comment);

    const hasComment=Boolean(parsed.comment.trim());
    if(!hasComment){
      commentBlock.hidden=true;
    }

    const actions=document.createElement('div');
    actions.className='work-actions'+(hasComment?'':' single-action');

    const button=document.createElement('button');
    button.type='button';
    button.className='select-btn'+(isSelected?' selected':'');
    button.textContent=isSelected?'選択解除':'選択する';
    button.setAttribute('aria-pressed',isSelected?'true':'false');
    button.setAttribute('aria-label',(isSelected?'選択解除：':'選択：')+title.textContent);
    button.onclick=function(){toggleSelection(work.value);};

    const detail=document.createElement('button');
    detail.type='button';
    detail.className='detail-btn';
    detail.textContent='DETAIL';
    detail.setAttribute('aria-expanded','false');
    detail.setAttribute('aria-controls',comment.id);
    detail.hidden=!hasComment;
    detail.onclick=function(){toggleDetail(commentBlock,detail,wrapper);};

    actions.appendChild(button);
    actions.appendChild(detail);

    info.appendChild(infoTop);
    info.appendChild(titleBlock);
    info.appendChild(authorBlock);

    wrapper.appendChild(number);
    wrapper.appendChild(imageWrap);
    wrapper.appendChild(info);
    wrapper.appendChild(actions);
    wrapper.appendChild(commentBlock);
    container.appendChild(wrapper);
  });

  container.setAttribute('aria-busy','false');
  updateUI();
}

function toggleSelection(value){
  if(hasVoted())return;

  const selectedIndex=selected.indexOf(value);
  const wasSelected=selectedIndex>=0;

  if(wasSelected){
    selected.splice(selectedIndex,1);
  }else{
    if(selected.length>=MAX_VOTES){
      showMaxVoteError();
      return;
    }
    selected.push(value);
  }

  if(document.activeElement && typeof document.activeElement.blur==='function'){
    document.activeElement.blur();
  }

  const workIndex=works.findIndex(function(work){return work.value===value;});
  const cards=document.querySelectorAll('.work-card');
  const card=workIndex>=0?cards[workIndex]:null;

  if(card){
    const button=card.querySelector('.select-btn');
    card.classList.toggle('selected',!wasSelected);

    if(button){
      button.classList.toggle('selected',!wasSelected);
      button.textContent=!wasSelected?'選択解除':'選択する';
      button.setAttribute('aria-pressed',!wasSelected?'true':'false');
      const title=card.querySelector('.work-title');
      button.setAttribute('aria-label',(!wasSelected?'選択解除：':'選択：')+(title?title.textContent:'作品'));
    }
  }

  updateUI();
}

function updateUI(){
  document.getElementById('count').textContent=selected.length;

  const selectedElement=document.getElementById('selected');

  if(!selected.length){
    selectedElement.textContent='0 / '+MAX_VOTES+'　選択作品なし';
    selectedElement.setAttribute('aria-label','0 / '+MAX_VOTES+'。選択作品なし');
  }else{
    const selectedTitles=selected.map(function(value){
      return parseChoiceInfo(value).title;
    });
    selectedElement.textContent=selected.length+' / '+MAX_VOTES+'　'+selectedTitles.join(' / ');
    selectedElement.setAttribute('aria-label',selected.length+' / '+MAX_VOTES+'。'+selected.length+'作品選択中。'+selectedTitles.join('、'));
  }

  document.getElementById('voteButton').disabled=selected.length===0;

  const dots=document.querySelectorAll('.capacity-dot');
  dots.forEach(function(dot,index){
    dot.classList.toggle('active',index<selected.length);
  });
}

function toggleDetail(commentBlock,button,card){
  const comment=commentBlock.querySelector('.work-comment');
  // コメントがないカードはDETAIL操作を一切行わない。
  if(!comment || !comment.textContent.trim()) return;
  const expanded=!comment.classList.contains('is-expanded');
  comment.classList.toggle('is-expanded',expanded);
  comment.classList.toggle('is-collapsed',!expanded);
  card.classList.toggle('detail-open',expanded);
  button.textContent=expanded?'閉じる':'DETAIL';
  button.classList.toggle('is-open',expanded);
  button.setAttribute('aria-expanded',expanded?'true':'false');
}

function submitVote(){
  if(selected.length<1||selected.length>MAX_VOTES)return;

  const button=document.getElementById('voteButton');
  if(!button||button.disabled)return;

  button.disabled=true;
  button.textContent='送信中…';
  button.setAttribute('aria-busy','true');

  google.script.run
    .withSuccessHandler(function(ok){
      if(!ok){
        button.disabled=false;
        button.textContent='投票する';
        button.removeAttribute('aria-busy');
        alert('投票に失敗しました。');
        return;
      }

      markVoted();
      selected=[];
      updateUI();
      button.textContent='投票する';
      button.disabled=true;
      button.removeAttribute('aria-busy');
      showVotedMask();
    })
    .withFailureHandler(function(error){
      button.disabled=false;
      button.textContent='投票する';
      button.removeAttribute('aria-busy');
      alert('投票に失敗しました。\n'+error.message);
    })
    .submitVoteToForm(selected);
}

function showAdmin(){
  const code=window.prompt('管理者コードを入力してください。');

  if(code===null)return;

  adminReset(code.trim());
}

function adminReset(code){
  google.script.run
    .withSuccessHandler(function(ok){
      if(!ok){
        alert('管理コードが違います。');
        return;
      }

      localStorage.removeItem(STORAGE_KEY);

      document.cookie='sakuhin_vote_done=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';

      selected=[];

      hideVotedMask();
      renderWorks();
      updateUI();
    })
    .adminReset(code);
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}

/* Chrome pinch-zoom position recovery: restore the pre-zoom document position once, only when returning to 1x. */
(function(){
  const vv = window.visualViewport;
  if(!vv) return;

  let zooming = false;
  let savedScrollY = 0;
  let restorePending = false;
  let restoreTimer = null;

  function onViewportResize(){
    const scale = vv.scale || 1;

    if(scale > 1.02 && !zooming){
      zooming = true;
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      restorePending = false;
      if(restoreTimer){
        clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      return;
    }

    if(zooming && scale <= 1.02 && !restorePending){
      restorePending = true;
      restoreTimer = setTimeout(function(){
        window.scrollTo(0, savedScrollY);
        requestAnimationFrame(function(){
          window.scrollTo(0, savedScrollY);
          zooming = false;
          restorePending = false;
          restoreTimer = null;
        });
      }, 80);
    }
  }

  vv.addEventListener('resize', onViewportResize, {passive:true});
})();
