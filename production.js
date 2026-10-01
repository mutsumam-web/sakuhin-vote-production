const MAX_VOTES=3;
const STORAGE_KEY='sakuhin_vote_done_v15';

let works=[];
let selected=[];

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

  if(hasVoted())showVotedMask();
  else hideVotedMask();
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
  },1800);
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

    const selectMask=document.createElement('button');
    selectMask.type='button';
    selectMask.className='work-select-mask';
    selectMask.setAttribute('aria-pressed',isSelected?'true':'false');
    selectMask.setAttribute('aria-label',(isSelected?'選択解除：':'選択：')+(parsed.title||('作品 '+String(index+1))));

    const hint=document.createElement('span');
    hint.className='select-hint';
    hint.textContent='ここをタップして選択';

    const check=document.createElement('span');
    check.className='select-check';
    check.setAttribute('aria-hidden','true');
    check.textContent='✓';

    selectMask.appendChild(hint);
    selectMask.appendChild(check);
    selectMask.addEventListener('click',function(){
      toggleSelection(work.value);
    });

    imageWrap.appendChild(selectMask);

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

    if(parsed.comment.trim()){
      const detailRow=document.createElement('div');
      detailRow.className='work-detail-row';

      const detail=document.createElement('button');
      detail.type='button';
      detail.className='detail-btn';
      detail.textContent='DETAIL';
      detail.setAttribute('aria-expanded','false');
      detail.setAttribute('aria-controls','work-comment-'+String(index+1));

      const comment=document.createElement('div');
      comment.className='work-comment';
      comment.id='work-comment-'+String(index+1);
      comment.hidden=true;
      comment.textContent=parsed.comment;

      detail.addEventListener('click',function(){
        toggleDetail(comment,detail);
      });

      detailRow.appendChild(detail);
      meta.appendChild(detailRow);
      meta.appendChild(comment);
    }

    card.appendChild(imageWrap);
    card.appendChild(meta);
    container.appendChild(card);
  });

  container.setAttribute('aria-busy','false');
  updateUI();
}

function cssEscape(value){
  if(window.CSS&&typeof window.CSS.escape==='function'){
    return window.CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g,'\\$&');
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

  const card=document.querySelector('.work-card[data-work-value="'+cssEscape(value)+'"]');
  if(card){
    const nextSelected=!isSelected;
    card.classList.toggle('selected',nextSelected);

    const mask=card.querySelector('.work-select-mask');
    if(mask){
      const title=card.querySelector('.work-title');
      mask.setAttribute('aria-pressed',nextSelected?'true':'false');
      mask.setAttribute('aria-label',(nextSelected?'選択解除：':'選択：')+(title?title.textContent:'作品'));
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

    const value=selected[index];
    if(!value){
      slot.setAttribute('aria-hidden','true');
      return;
    }

    const work=works.find(function(item){return item.value===value;});
    const workIndex=works.findIndex(function(item){return item.value===value;});

    slot.classList.add('filled');
    slot.setAttribute('aria-hidden','false');

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

function toggleDetail(comment,button){
  const expanded=comment.hidden;
  comment.hidden=!expanded;
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
    .submitVoteToForm(selected.slice());
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
