const MAX_VOTES=3;
const STORAGE_KEY='sakuhin_vote_done_v15';
const API_BASE=(window.__SAKUHIN_API_BASE__||'https://sakuhin-vote-api.mutsumam.workers.dev').replace(/\/$/,'');

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

function hasVoted(){
  return localStorage.getItem(STORAGE_KEY)==='1'||getCookie('sakuhin_vote_done')==='1';
}

function markVoted(){
  localStorage.setItem(STORAGE_KEY,'1');
  setCookie('sakuhin_vote_done','1',3650);
}

function showVotedMask(){
  closeWorkDetail();
  closeVoteConfirm();
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

  loadWorks();

  if(hasVoted())showVotedMask();
  else hideVotedMask();
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
    card.appendChild(selectZone);

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
  initGalleryPosition();
  updateUI();
}

function initGalleryPosition(){
  const label=document.getElementById('galleryPosition');
  const cards=Array.from(document.querySelectorAll('.work-card'));
  if(!label||!cards.length)return;
  const update=function(){
    let bestIndex=0;
    let bestDistance=Infinity;
    cards.forEach(function(card,index){
      const rect=card.getBoundingClientRect();
      const distance=Math.abs(rect.top-window.innerHeight*.28);
      if(distance<bestDistance){bestDistance=distance;bestIndex=index;}
    });
    label.textContent=String(bestIndex+1)+' / '+String(cards.length);
  };
  update();
  if(!window.galleryPositionBound){
    window.galleryPositionBound=true;
    window.addEventListener('scroll',function(){requestAnimationFrame(update);},{passive:true});
  }
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
  document.getElementById('selectionStatus').textContent=count+' / '+MAX_VOTES+' 選択中';
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
  submitButton.textContent='この内容で投票する';
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
        button.textContent='この内容で投票する';
        button.removeAttribute('aria-busy');
        alert('投票に失敗しました。');
        return;
      }

      markVoted();
      selected=[];
      updateUI();
      button.textContent='この内容で投票する';
      button.disabled=true;
      button.removeAttribute('aria-busy');
      closeVoteConfirm();
      showVotedMask();
    })
    .catch(function(error){
      button.disabled=false;
      button.textContent='この内容で投票する';
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

      localStorage.removeItem(STORAGE_KEY);
      document.cookie='sakuhin_vote_done=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
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
