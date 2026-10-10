(function(){
  'use strict';

  const SESSION_KEY='sakuhin_admin_session_v2';
  const CLIENT_KEY='sakuhin_admin_client_v1';
  const REFRESH_MS=60000;
  const TZ='Asia/Tokyo';
  const DISPLAY_THEME_PRESETS=Object.freeze({
    standard:{label:'標準',bg:'#eeeae0',ink:'#1f3c31',accent:'#244f40',accentStrong:'#173b30'},
    urban:{label:'アーバン',bg:'#eceff1',ink:'#263238',accent:'#455a64',accentStrong:'#263238'},
    cyber:{label:'サイバー',bg:'#eefbff',ink:'#102a43',accent:'#007f99',accentStrong:'#005466'},
    gallery:{label:'ギャラリー',bg:'#f2efe9',ink:'#2f2a26',accent:'#7a1f2b',accentStrong:'#4b121a'},
    atelier:{label:'アトリエ',bg:'#f4eadf',ink:'#3b2a20',accent:'#a44a2d',accentStrong:'#6f2f1f'},
    indigo:{label:'藍',bg:'#edf1f7',ink:'#1e2f45',accent:'#2f4b7c',accentStrong:'#1d2f55'},
    botanical:{label:'ボタニカル',bg:'#edf3eb',ink:'#2d3b2f',accent:'#4f6f52',accentStrong:'#314d36'},
    monochrome:{label:'モノクローム',bg:'#f1f1ef',ink:'#242424',accent:'#5b5b5b',accentStrong:'#2f2f2f'},
    museum:{label:'ミュージアム',bg:'#f3f2ee',ink:'#252a34',accent:'#36558f',accentStrong:'#1f355f'},
    amber:{label:'アンバー',bg:'#f5eddc',ink:'#3b3024',accent:'#9a5c12',accentStrong:'#6a3d0b'},
    midnight:{label:'ミッドナイト',bg:'#0e1625',ink:'#f4f6ff',accent:'#84a9ff',accentStrong:'#4d78db'},
    obsidian:{label:'オブシディアン',bg:'#101214',ink:'#f4f4f0',accent:'#c0bdaf',accentStrong:'#827e75'},
    deepsea:{label:'ディープシー',bg:'#071e2a',ink:'#e9f7ff',accent:'#55c7df',accentStrong:'#177c9a'},
    nightforest:{label:'フォレストナイト',bg:'#0c201a',ink:'#e9f5ec',accent:'#80caa2',accentStrong:'#397d5e'},
    plumnoir:{label:'プラムノワール',bg:'#211222',ink:'#f8eefa',accent:'#d49bda',accentStrong:'#98639f'},
    bordeaux:{label:'ボルドー',bg:'#260f18',ink:'#fbeef2',accent:'#df97b0',accentStrong:'#a15270'},
    copper:{label:'コッパー',bg:'#211814',ink:'#f9f1e8',accent:'#e9aa79',accentStrong:'#a76c47'},
    navygold:{label:'ネイビーゴールド',bg:'#101c31',ink:'#f6f1e6',accent:'#d8bc78',accentStrong:'#9b7a38'},
    charcoal:{label:'チャコール',bg:'#1c2126',ink:'#f3f6f7',accent:'#a4c4c8',accentStrong:'#5b8790'},
    twilight:{label:'トワイライト',bg:'#1a1835',ink:'#f3f1ff',accent:'#b8a7ff',accentStrong:'#7464bf'}
  });

  const state={
    session:'',
    range:'6h',
    autoRefresh:true,
    timer:null,
    voteData:null,
    systemData:null,
    winnerSettings:null,
    displaySettings:null,
    voteCycleSettings:null,
    displayPreviewUrl:'',
    showAllRanking:false,
    works:[],
    worksListCollapsed:false
  };

  const $=function(id){return document.getElementById(id);};

  function clientId(){
    let value='';
    try{value=localStorage.getItem(CLIENT_KEY)||'';}catch(e){}
    if(value)return value;
    if(window.crypto&&typeof window.crypto.randomUUID==='function'){
      value=window.crypto.randomUUID();
    }else{
      value='c-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    }
    try{localStorage.setItem(CLIENT_KEY,value);}catch(e){}
    return value;
  }

  const API_BASE=(window.__SAKUHIN_API_BASE__||'https://sakuhin-vote-api.mutsumam.workers.dev').replace(/\/$/,'');

  async function apiRequest(path,options){
    const config=Object.assign({method:'GET'},options||{});
    const headers=new Headers(config.headers||{});

    if(config.json!==undefined){
      headers.set('Content-Type','application/json');
      config.body=JSON.stringify(config.json);
      delete config.json;
    }

    config.headers=headers;

    const response=await fetch(API_BASE+path,config);
    let payload=null;
    try{payload=await response.json();}catch(e){}

    if(!response.ok||!payload||payload.ok===false){
      const code=payload&&payload.error?payload.error:'HTTP_'+response.status;
      const error=new Error(code);
      error.code=code;
      error.status=response.status;
      throw error;
    }

    return payload;
  }

  async function adminRpc(method){
    const args=[].slice.call(arguments,1);
    const payload=await apiRequest('/api/admin/rpc',{
      method:'POST',
      json:{method:method,args:args}
    });
    return payload.result;
  }

  async function adminRest(path,options){
    const payload=await apiRequest(path,options);
    return payload.result;
  }

  function setBusy(busy){
    $('dashboardShell').classList.toggle('loading',!!busy);
    $('refreshButton').disabled=!!busy;
  }

  function showToast(message){
    const toast=$('toast');
    toast.textContent=message;
    toast.hidden=false;
    clearTimeout(showToast.timer);
    showToast.timer=setTimeout(function(){toast.hidden=true;},3500);
  }

  function formatNumber(value){
    return Number.isFinite(Number(value))?Number(value).toLocaleString('ja-JP'):'—';
  }

  function formatPercent(value,digits){
    const n=Number(value);
    if(!Number.isFinite(n))return'—';
    return n.toFixed(digits==null?1:digits)+'%';
  }

  function formatDuration(ms){
    const n=Number(ms);
    if(!Number.isFinite(n))return'—';
    if(n<1000)return Math.round(n)+' ms';
    return (n/1000).toFixed(n<10000?2:1)+' s';
  }

  function formatDateTime(iso){
    if(!iso)return'—';
    const date=new Date(iso);
    if(Number.isNaN(date.getTime()))return'—';
    return new Intl.DateTimeFormat('ja-JP',{
      timeZone:TZ,
      month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'
    }).format(date);
  }

  function formatShortTime(iso){
    if(!iso)return'—';
    const date=new Date(iso);
    if(Number.isNaN(date.getTime()))return'—';
    return new Intl.DateTimeFormat('ja-JP',{
      timeZone:TZ,
      hour:'2-digit',minute:'2-digit'
    }).format(date);
  }

  function formatAgo(seconds){
    const n=Number(seconds);
    if(!Number.isFinite(n)||n<0)return'—';
    if(n<60)return Math.floor(n)+'秒前';
    if(n<3600)return Math.floor(n/60)+'分前';
    if(n<86400)return Math.floor(n/3600)+'時間前';
    return Math.floor(n/86400)+'日前';
  }

  function escapeHtml(value){
    return String(value==null?'':value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function safeArray(value){
    return Array.isArray(value)?value:[];
  }

  function showDashboard(){
    $('loginShell').hidden=true;
    $('dashboardShell').hidden=false;
    scheduleRefresh();
  }

  function showLogin(message){
    state.session='';
    try{sessionStorage.removeItem(SESSION_KEY);}catch(e){}
    $('dashboardShell').hidden=true;
    $('loginShell').hidden=false;
    $('loginMessage').textContent=message||'';
    $('adminCode').value='';
    $('adminCode').focus();
    stopRefresh();
  }

  async function login(code){
    $('loginButton').disabled=true;
    $('loginMessage').textContent='認証しています…';
    try{
      const result=await adminRpc('adminDashboardLogin',code,clientId());
      if(!result||!result.ok){
        const retry=result&&result.retryAfterSeconds?(' '+formatAgo(result.retryAfterSeconds).replace('前','後に再試行')):'';
        $('loginMessage').textContent=(result&&result.message?result.message:'認証できませんでした。')+retry;
        return;
      }
      state.session=result.session;
      try{sessionStorage.setItem(SESSION_KEY,state.session);}catch(e){}
      showDashboard();
      await Promise.all([loadAll(true),loadWorksManager(),loadWinnerSettings(),loadDisplaySettings(),loadVoteCycleSettings()]);
    }catch(error){
      $('loginMessage').textContent='認証処理に失敗しました。';
    }finally{
      $('loginButton').disabled=false;
    }
  }

  async function logout(){
    const token=state.session;
    if(token){
      try{await adminRpc('adminDashboardLogout',token);}catch(e){}
    }
    showLogin('');
  }

  async function changeAdminCode(event){
    event.preventDefault();
    if(!state.session)return;

    const current=$('currentAdminCode').value.trim();
    const next=$('newAdminCode').value.trim();
    const confirm=$('confirmAdminCode').value.trim();
    const message=$('adminCodeMessage');

    if(!/^\d{4,12}$/.test(next)){
      message.textContent='新しい管理コードは4〜12桁の数字で入力してください。';
      return;
    }

    if(next!==confirm){
      message.textContent='新しい管理コードが一致しません。';
      return;
    }

    const button=$('changeAdminCodeButton');
    button.disabled=true;
    message.textContent='変更しています…';

    try{
      await adminRpc('adminChangeCode',state.session,current,next);
      $('adminCodeForm').reset();
      showLogin('管理コードを変更しました。新しい管理コードで再認証してください。');
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }

      const code=String(error&&error.message?error.message:'');
      message.textContent=code==='ADMIN_CURRENT_CODE_INVALID'
        ?'現在の管理コードが違います。'
        :code==='ADMIN_CODE_FORMAT_INVALID'
          ?'新しい管理コードは4〜12桁の数字で入力してください。'
          :'管理コードを変更できませんでした。';
    }finally{
      button.disabled=false;
    }
  }

  function displayAssetUrl(key){
    const value=String(key||'').trim();
    if(!value)return'';
    return API_BASE+'/assets/'+value.split('/').map(encodeURIComponent).join('/');
  }

  function clearDisplayPreviewUrl(){
    if(state.displayPreviewUrl){
      URL.revokeObjectURL(state.displayPreviewUrl);
      state.displayPreviewUrl='';
    }
  }

  function renderDisplayImagePreview(file){
    const image=$('displayHeaderImagePreview');
    const note=$('displayHeaderImageNote');
    if(!image||!note)return;

    clearDisplayPreviewUrl();

    if(file){
      state.displayPreviewUrl=URL.createObjectURL(file);
      image.src=state.displayPreviewUrl;
      image.hidden=false;
      note.textContent='保存後にこの画像へ切り替わります。';
      return;
    }

    const key=$('displayHeaderImageKey').value.trim();
    if(key){
      image.src=displayAssetUrl(key);
      image.hidden=false;
      note.textContent='カスタム画像を使用中';
      return;
    }

    image.removeAttribute('src');
    image.hidden=true;
    note.textContent='標準画像を使用中';
  }

  function currentDisplayThemeColors(){
    return{
      bg:String($('displayThemeBg').value||'').toLowerCase(),
      ink:String($('displayThemeInk').value||'').toLowerCase(),
      accent:String($('displayThemeAccent').value||'').toLowerCase(),
      accentStrong:String($('displayThemeAccentStrong').value||'').toLowerCase()
    };
  }

  function findDisplayThemePresetKey(){
    const current=currentDisplayThemeColors();
    return Object.keys(DISPLAY_THEME_PRESETS).find(function(key){
      const theme=DISPLAY_THEME_PRESETS[key];
      return theme.bg===current.bg&&
        theme.ink===current.ink&&
        theme.accent===current.accent&&
        theme.accentStrong===current.accentStrong;
    })||'custom';
  }

  function displayBackgroundPreviewGradient(bg,accent){
    const rgb=(hex)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    const toHex=(values)=>'#'+values.map(value=>Math.round(value).toString(16).padStart(2,'0')).join('');
    const mix=(left,right,ratio)=>{
      const a=rgb(left),b=rgb(right);
      return toHex(a.map((value,i)=>value+(b[i]-value)*ratio));
    };
    const values=rgb(bg);
    const dark=values[0]*.2126+values[1]*.7152+values[2]*.0722<85;
    const highlight=mix(bg,'#ffffff',dark?.15:.24);
    const glow=mix(bg,accent,dark?.42:.25);
    const middle=mix(bg,dark?'#ffffff':accent,dark?.09:.10);
    const lower=mix(bg,dark?'#000000':'#ffffff',dark?.22:.13);
    return 'radial-gradient(ellipse 85% 22% at 14% 10%,'+highlight+' 0%,transparent 100%),'
      +'radial-gradient(ellipse 78% 27% at 92% 45%,'+glow+' 0%,transparent 100%),'
      +'radial-gradient(ellipse 95% 24% at 10% 85%,'+middle+' 0%,transparent 100%),'
      +'linear-gradient(165deg,'+highlight+' 0%,'+bg+' 30%,'+middle+' 66%,'+lower+' 100%)';
  }

  function renderDisplayBackgroundPreview(){
    const preview=$('displayBackgroundPreview');
    if(!preview)return;
    const colors=currentDisplayThemeColors();
    const mode=$('displayBackgroundMode').value;
    preview.style.backgroundColor=colors.bg;
    preview.style.backgroundImage=mode==='photoreal_forest'
      ?'url("../assets/photoreal-forest-top.webp")'
      :mode==='landscape'?'url("../assets/scenic-landscape.svg")'
      :mode==='gradient'?'url("../assets/wa-silk.svg"),'+displayBackgroundPreviewGradient(colors.bg,colors.accent):'none';
    preview.style.backgroundSize=mode==='photoreal_forest'?'cover':mode==='landscape'?'100% 100%':mode==='gradient'?'100% 100%,100% 100%':'auto';
    preview.style.backgroundPosition='center top';
    preview.style.backgroundRepeat='no-repeat';
    preview.style.color=colors.ink;
  }

  function renderDisplayThemePreview(){
    const colors=currentDisplayThemeColors();
    const map={
      displayThemePreviewBg:colors.bg,
      displayThemePreviewInk:colors.ink,
      displayThemePreviewAccent:colors.accent,
      displayThemePreviewAccentStrong:colors.accentStrong
    };
    Object.keys(map).forEach(function(id){
      const el=$(id);
      if(el)el.style.backgroundColor=map[id];
    });

    const key=findDisplayThemePresetKey();
    const preset=$('displayThemePreset');
    if(preset)preset.value=key;
    const label=$('displayThemePresetLabel');
    if(label)label.textContent=key==='custom'?'カスタム':DISPLAY_THEME_PRESETS[key].label;
    renderDisplayBackgroundPreview();
  }

  function applyDisplayThemePreset(key){
    const theme=DISPLAY_THEME_PRESETS[key];
    if(!theme)return;
    $('displayThemeBg').value=theme.bg;
    $('displayThemeInk').value=theme.ink;
    $('displayThemeAccent').value=theme.accent;
    $('displayThemeAccentStrong').value=theme.accentStrong;
    renderDisplayThemePreview();
  }

  function renderVoteCycleSettings(settings){
    const value=settings&&typeof settings==='object'?settings:{};
    state.voteCycleSettings=value;
    $('voteCycleId').value=value.voteCycleId||'2026';
    $('voteCycleSummary').textContent=value.updatedAt
      ?'最終更新 '+formatDateTime(value.updatedAt)+' / '+String(value.voteCycleId||'2026')
      :'現在の投票サイクル '+String(value.voteCycleId||'2026');
  }

  async function loadVoteCycleSettings(){
    if(!state.session||!$('voteCycleSettingsForm'))return;
    const message=$('voteCycleSettingsMessage');
    try{
      const settings=await adminRpc('getVoteCycleSettings',state.session);
      renderVoteCycleSettings(settings||{});
      message.textContent='';
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      message.textContent='投票サイクルを取得できませんでした。';
    }
  }

  async function saveVoteCycleSettings(event){
    event.preventDefault();
    if(!state.session)return;

    const input=String($('voteCycleId').value||'').trim().toLowerCase();
    const message=$('voteCycleSettingsMessage');
    const button=$('saveVoteCycleSettingsButton');

    if(!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(input)){
      message.textContent='投票サイクルIDは半角英数字で始め、半角英数字・-・_ の40文字以内で入力してください。';
      return;
    }

    const before=state.voteCycleSettings&&state.voteCycleSettings.voteCycleId
      ?String(state.voteCycleSettings.voteCycleId)
      :'';

    if(before&&before!==input){
      const ok=window.confirm(
        '投票サイクルを「'+before+'」から「'+input+'」へ変更します。\n'+
        '端末の投票済み判定は新しいサイクルへ切り替わります。\n'+
        'D1の投票データは削除されません。続行しますか？'
      );
      if(!ok)return;
    }

    button.disabled=true;
    message.textContent='保存しています…';

    try{
      const saved=await adminRpc('adminUpdateVoteCycleSettings',state.session,{voteCycleId:input});
      renderVoteCycleSettings(saved||{voteCycleId:input});
      message.textContent='投票サイクルを保存しました。';
      showToast('投票サイクルを保存しました。');
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      message.textContent='投票サイクルを保存できませんでした。';
    }finally{
      button.disabled=false;
    }
  }

  function renderDisplayLayoutPreview(){
    const preview=$('displayLayoutPreview');
    if(!preview)return;
    const layout=$('displayHeaderLayout').value;
    const title=Number($('displayHeroTitleScale').value)||100;
    const copy=Number($('displayHeroCopyScale').value)||100;
    preview.dataset.layout=layout;
    preview.style.setProperty('--preview-title-scale',String(title/100));
    preview.style.setProperty('--preview-copy-scale',String(copy/100));
    $('displayHeroTitleScaleValue').textContent=title+'%';
    $('displayHeroCopyScaleValue').textContent=copy+'%';
    $('displayLayoutSampleTitle').textContent=$('displayHeroTitleJp').value||'作品展';
    $('displayLayoutSampleCopy').textContent=$('displayHeroSide').value||'日常に、小さな美を。';
  }

  function renderDisplaySettings(settings){
    const value=settings||{};
    state.displaySettings=value;
    $('displayHeroTopline').value=value.heroTopline||'';
    $('displayHeroTitleJp').value=value.heroTitleJp||'';
    $('displayHeroTitleEn').value=value.heroTitleEn||'';
    $('displayHeroSide').value=value.heroSide||'';
    $('displayHeroCaption').value=value.heroCaption||'';
    $('displayHeaderImageKey').value=value.headerImageKey||'';
    if($('displayHeaderLayout')&&$('displayHeroTitleScale')&&$('displayHeroCopyScale')){
      $('displayHeaderLayout').value=['standard','mosaic','editorial','solar'].includes(value.headerLayout)
        ?value.headerLayout:'standard';
      $('displayHeroTitleScale').value=String(value.heroTitleScale??100);
      $('displayHeroCopyScale').value=String(value.heroCopyScale??100);
      renderDisplayLayoutPreview();
    }
    $('displayHeaderImage').value='';
    $('displayFooterText').value=value.footerText||'';
    $('displayPoweredByText').value=value.poweredByText||'';
    if($('displayBackgroundMode'))$('displayBackgroundMode').value=['gradient','landscape','photoreal_forest'].includes(value.backgroundMode)?value.backgroundMode:'solid';
    if($('displayGalleryColumns'))$('displayGalleryColumns').value=Number(value.galleryColumns)===3?'3':'2';
    $('displayThemeBg').value=value.themeBg||'#eeeae0';
    $('displayThemeInk').value=value.themeInk||'#1f3c31';
    $('displayThemeAccent').value=value.themeAccent||'#244f40';
    $('displayThemeAccentStrong').value=value.themeAccentStrong||'#173b30';
    renderDisplayThemePreview();
    $('displaySettingsSummary').textContent=value.updatedAt
      ?'最終更新 '+formatDateTime(value.updatedAt)
      :'現在のProduction表示を変更します。';
    renderDisplayImagePreview(null);
  }

  async function loadDisplaySettings(){
    if(!state.session||!$('displaySettingsForm'))return;
    const message=$('displaySettingsMessage');
    try{
      const settings=await adminRpc('getDisplaySettings',state.session);
      renderDisplaySettings(settings||{});
      message.textContent='';
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      message.textContent='表示設定を取得できませんでした。';
    }
  }

  async function saveDisplaySettings(event){
    event.preventDefault();
    if(!state.session)return;

    const message=$('displaySettingsMessage');
    const button=$('saveDisplaySettingsButton');
    const file=$('displayHeaderImage').files&&$('displayHeaderImage').files[0]
      ?$('displayHeaderImage').files[0]
      :null;
    let headerImageKey=$('displayHeaderImageKey').value.trim();

    button.disabled=true;
    message.textContent='保存しています…';

    try{
      if(file){
        const ext=assetExtension(file);
        if(!ext)throw new Error('UNSUPPORTED_ASSET_TYPE');
        const key='display/hero/'+randomId()+'.'+ext;
        const asset=await adminRest('/api/admin/assets/'+encodeURIComponent(key),{
          method:'PUT',
          headers:{
            'X-Admin-Session':state.session,
            'Content-Type':file.type
          },
          body:file
        });
        headerImageKey=asset.key;
      }

      const input={
        heroTopline:$('displayHeroTopline').value.trim(),
        heroTitleJp:$('displayHeroTitleJp').value.trim(),
        heroTitleEn:$('displayHeroTitleEn').value.trim(),
        heroSide:$('displayHeroSide').value.trim(),
        heroCaption:$('displayHeroCaption').value.trim(),
        headerImageKey:headerImageKey,
        headerLayout:$('displayHeaderLayout')?$('displayHeaderLayout').value:(state.displaySettings?.headerLayout||'standard'),
        heroTitleScale:$('displayHeroTitleScale')?Number($('displayHeroTitleScale').value):(state.displaySettings?.heroTitleScale||100),
        heroCopyScale:$('displayHeroCopyScale')?Number($('displayHeroCopyScale').value):(state.displaySettings?.heroCopyScale||100),
        footerText:$('displayFooterText').value.trim(),
        poweredByText:$('displayPoweredByText').value.trim(),
        themeBg:$('displayThemeBg').value,
        backgroundMode:$('displayBackgroundMode')?$('displayBackgroundMode').value:(state.displaySettings?.backgroundMode||'solid'),
        galleryColumns:$('displayGalleryColumns')?Number($('displayGalleryColumns').value):(state.displaySettings?.galleryColumns||2),
        themeInk:$('displayThemeInk').value,
        themeAccent:$('displayThemeAccent').value,
        themeAccentStrong:$('displayThemeAccentStrong').value
      };

      if(!input.heroTopline||!input.heroTitleJp||!input.heroTitleEn||!input.heroSide||
         !input.heroCaption||!input.footerText||!input.poweredByText){
        throw new Error('DISPLAY_TEXT_REQUIRED');
      }

      const saved=await adminRpc('adminUpdateDisplaySettings',state.session,input);
      renderDisplaySettings(saved||input);
      message.textContent='表示設定を保存しました。';
      showToast('表示設定を保存しました。');
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      message.textContent='表示設定を保存できませんでした。 '+String(error&&error.message?error.message:'');
    }finally{
      button.disabled=false;
    }
  }

  function readWinnerMilestones(){
    return [...new Set(
      [...document.querySelectorAll('.winner-milestone-input')]
        .map(function(input){return Number(String(input.value||'').trim());})
        .filter(function(item){return Number.isInteger(item)&&item>0&&item<=1000000;})
    )].sort(function(a,b){return a-b;});
  }

  function addWinnerMilestoneRow(value){
    const list=$('winnerMilestoneList');
    if(!list)return;

    const row=document.createElement('div');
    row.className='winner-milestone-row';

    const input=document.createElement('input');
    input.type='number';
    input.className='winner-milestone-input';
    input.inputMode='numeric';
    input.min='1';
    input.max='1000000';
    input.step='1';
    input.placeholder='例：71';
    input.value=value==null?'':String(value);

    const remove=document.createElement('button');
    remove.type='button';
    remove.className='button-ghost winner-remove-button';
    remove.textContent='削除';
    remove.addEventListener('click',function(){
      row.remove();
      if(!list.querySelector('.winner-milestone-input'))addWinnerMilestoneRow('');
    });

    row.appendChild(input);
    row.appendChild(remove);
    list.appendChild(row);
  }

  function renderWinnerMilestoneRows(values){
    const list=$('winnerMilestoneList');
    if(!list)return;
    list.innerHTML='';
    const rows=safeArray(values);
    if(!rows.length){
      addWinnerMilestoneRow('');
      return;
    }
    rows.forEach(function(value){addWinnerMilestoneRow(value);});
  }

  function renderWinnerSettingsSummary(){
    const el=$('winnerSettingsSummary');
    if(!el)return;
    const settings=state.winnerSettings;
    if(!settings){
      el.textContent='—';
      return;
    }

    const current=Number(settings.currentVoteCount)||0;
    const milestones=safeArray(settings.milestones);
    const next=milestones.find(function(item){return Number(item)>current;});
    el.textContent=(settings.enabled?'有効':'無効')
      +' / 現在 '+formatNumber(current)+'件'
      +(next?' / 次回 '+formatNumber(next)+'件目':' / 次回設定なし');
  }

  async function loadWinnerSettings(){
    if(!state.session||!$('winnerSettingsForm'))return;

    const message=$('winnerSettingsMessage');
    try{
      const settings=await adminRpc('getWinnerSettings',state.session);
      state.winnerSettings=settings||null;
      $('winnerEnabled').checked=!!(settings&&settings.enabled);
      $('winnerEventLabel').value=settings&&settings.eventLabel?settings.eventLabel:'';
      renderWinnerMilestoneRows(settings&&settings.milestones);
      $('winnerTitle').value=settings&&settings.winnerTitle?settings.winnerTitle:'';
      $('winnerMessage').value=settings&&settings.winnerMessage?settings.winnerMessage:'';
      message.textContent='';
      renderWinnerSettingsSummary();
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      message.textContent='当選設定を取得できませんでした。';
    }
  }

  async function saveWinnerSettings(event){
    event.preventDefault();
    if(!state.session)return;

    const milestones=readWinnerMilestones();
    const message=$('winnerSettingsMessage');
    const button=$('saveWinnerSettingsButton');

    if(!milestones.length){
      message.textContent='当選する投票番号を1件以上入力してください。';
      return;
    }

    const input={
      enabled:$('winnerEnabled').checked,
      eventLabel:$('winnerEventLabel').value.trim(),
      milestones:milestones,
      winnerTitle:$('winnerTitle').value.trim(),
      winnerMessage:$('winnerMessage').value.trim()
    };

    if(!input.winnerTitle||!input.winnerMessage){
      message.textContent='当選見出しと案内文を入力してください。';
      return;
    }

    button.disabled=true;
    message.textContent='保存しています…';

    try{
      const saved=await adminRpc('adminUpdateWinnerSettings',state.session,input);
      const current=state.winnerSettings&&Number(state.winnerSettings.currentVoteCount)||0;
      state.winnerSettings=Object.assign({},saved,{currentVoteCount:current});
      renderWinnerMilestoneRows(saved&&saved.milestones);
      message.textContent='当選設定を保存しました。';
      renderWinnerSettingsSummary();
      showToast('当選設定を保存しました。');
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      message.textContent='当選設定を保存できませんでした。';
    }finally{
      button.disabled=false;
    }
  }

  async function resetVotes(){
    if(!state.session)return;

    const message=$('resetVotesMessage');
    const button=$('resetVotesButton');

    if(!window.confirm('D1に保存された全投票記録を削除します。作品・画像・管理コードは残ります。続行しますか？')){
      return;
    }

    const code=window.prompt('管理者コードを入力してください。');
    if(code===null)return;

    const current=code.trim();
    if(!current){
      message.textContent='管理者コードを入力してください。';
      return;
    }

    if(!window.confirm('最終確認です。全投票データをリセットします。この操作は元に戻せません。')){
      return;
    }

    button.disabled=true;
    message.textContent='投票データをリセットしています…';

    try{
      const result=await adminRpc('adminResetVotes',state.session,current);

      if(!result||result.ok!==true){
        message.textContent=result&&result.error==='ADMIN_CURRENT_CODE_INVALID'
          ?'管理者コードが違います。'
          :'投票データをリセットできませんでした。';
        return;
      }

      message.textContent='投票データをリセットしました。';
      showToast('投票データをリセットしました。');
      await Promise.all([loadAll(false),loadWinnerSettings()]);
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }

      message.textContent='投票データをリセットできませんでした。';
    }finally{
      button.disabled=false;
    }
  }

  async function loadAll(manual){
    if(!state.session)return;
    setBusy(true);
    const votePromise=adminRpc('getAdminDashboardData',state.session,state.range);
    const systemPromise=adminRpc('getAdminSystemMetrics',state.session);
    const usagePromise=loadUsageQuota();
    const results=await Promise.allSettled([votePromise,systemPromise,usagePromise]);
    let authFailure=false;

    if(results[0].status==='fulfilled'){
      state.voteData=results[0].value;
      renderVoteData(state.voteData);
    }else{
      authFailure=isAuthError(results[0].reason);
      renderVoteFailure(results[0].reason);
    }

    if(results[1].status==='fulfilled'){
      state.systemData=results[1].value;
      renderSystemData(state.systemData);
    }else{
      authFailure=authFailure||isAuthError(results[1].reason);
      renderSystemFailure(results[1].reason);
    }

    if(authFailure){
      showLogin('セッションの有効期限が切れました。再認証してください。');
      setBusy(false);
      return;
    }

    $('lastUpdated').textContent=formatDateTime(new Date().toISOString());
    updateHealth();
    setBusy(false);
    if(manual)showToast('管理データを更新しました。');
  }

  function isAuthError(error){
    const message=String(error&&error.message?error.message:error||'');
    return /ADMIN_AUTH_REQUIRED/.test(message);
  }

  function renderVoteFailure(error){
    $('dashboardNotice').textContent='投票データを取得できませんでした。 '+String(error&&error.message?error.message:'');
    $('voteTrendChart').innerHTML='<div class="chart-empty">投票データ取得エラー</div>';
  }

  function renderSystemFailure(error){
    $('processApiState').textContent='実行履歴を取得できません';
    $('systemTrendChart').innerHTML='<div class="chart-empty">システム実行情報取得エラー</div>';
    $('dashboardNotice').textContent='システム実行情報の取得に失敗しました。 '+String(error&&error.message?error.message:'');
  }

  function renderVoteData(data){
    if(!data)return;
    const kpi=data.kpi||{};
    $('kpiResponses').textContent=formatNumber(kpi.totalResponses);
    $('kpiVotes').textContent=formatNumber(kpi.totalVotes);
    $('kpiWorks').textContent=formatNumber(kpi.worksCount);
    $('kpi30m').textContent=formatNumber(kpi.responsesLast30m);
    $('kpi60mVotes').textContent=formatNumber(kpi.votesLast60m);
    $('kpiLastVoteAgo').textContent=formatAgo(kpi.secondsSinceLastVote);
    $('lastVote').textContent=kpi.lastVoteTime?formatDateTime(kpi.lastVoteTime):'投票なし';

    const trend=data.trend||{};
    $('trendMeta').textContent=(trend.intervalMinutes||30)+'分単位 / '+rangeLabel(state.range);
    drawLineChart('voteTrendChart',safeArray(trend.points),[
      {key:'responses',label:'投票件数',className:'a'},
      {key:'votes',label:'総得票数',className:'b'}
    ],function(row){
      const change=row.previousResponseChangePercent==null?'比較不能':formatPercent(row.previousResponseChangePercent);
      return formatDateTime(row.timestamp)+'\n投票件数 '+formatNumber(row.responses)+'\n総得票数 '+formatNumber(row.votes)+'\n前区間比 '+change;
    });

    renderRanking(data.ranking);
    renderLive(data.live);
    renderMomentum(data.momentum);
    renderRankMovement(data.rankMovement);
    renderCloseRaces(data.closeRaces);
    renderConcentration(data.concentration);
    renderCoSelection(data.coSelection);
    renderAnomalies(data.anomalies);
    renderPatternAnomalies(data.patternAnomalies);
    $('dashboardNotice').textContent=data.notice||'';
  }

  function renderSystemData(data){
    if(!data)return;
    $('kpiGasSuccess').textContent=formatPercent(data.successRate);
    $('kpiGasErrors').textContent=formatNumber(data.errorCount);
    $('kpiGasAvg').textContent=formatDuration(data.averageDurationMs);
    $('kpiGasP95').textContent=formatDuration(data.p95DurationMs);
    $('systemSource').textContent=data.sourceLabel||'—';
    $('processApiState').textContent=data.sourceLabel||'Cloudflare Worker / D1 telemetry';

    drawLineChart('systemTrendChart',safeArray(data.trend),[
      {key:'total',label:'実行回数',className:'a'},
      {key:'errors',label:'エラー',className:'danger'}
    ],function(row){
      return formatDateTime(row.timestamp)+'\n実行 '+formatNumber(row.total)+'\nエラー '+formatNumber(row.errors);
    });

    renderStatusBreakdown(data.statusCounts);
    renderFunctionStats(data.functionStats);
  }

  async function loadUsageQuota(){
    if(!$('usageQuotaGrid'))return;
    try{
      const response=await fetch('../platform-usage/latest.json?ts='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP_'+response.status);
      const raw=await response.json();
      renderUsageQuota({
        collectedAt:raw&&raw.collectedAt?raw.collectedAt:'',
        githubActions:{
          used:raw&&raw.githubActions?raw.githubActions.quotaUsedMinutes:null,
          total:raw&&raw.githubActions?raw.githubActions.usedMinutes:null,
          limit:raw&&raw.githubActions?raw.githubActions.limitMinutes:null,
          metadataComplete:Boolean(raw&&raw.githubActions&&raw.githubActions.repositoryMetadataComplete),
          scope:raw&&raw.githubActions?raw.githubActions.scope:'account_exact'
        },
        workers:{
          used:raw&&raw.workers?raw.workers.requestsToday:null,
          limit:raw&&raw.workers?raw.workers.limitRequests:null
        },
        d1:{
          rowsRead:raw&&raw.d1?raw.d1.rowsReadToday:null,
          rowsReadLimit:raw&&raw.d1?raw.d1.rowsReadLimit:null,
          rowsWritten:raw&&raw.d1?raw.d1.rowsWrittenToday:null,
          rowsWrittenLimit:raw&&raw.d1?raw.d1.rowsWrittenLimit:null,
          storageBytes:raw&&raw.d1?raw.d1.storageBytes:null,
          storageLimitBytes:raw&&raw.d1?raw.d1.storageLimitBytes:null
        },
        r2:{
          storageBytes:raw&&raw.r2?raw.r2.storageBytes:null,
          storageLimitBytes:raw&&raw.r2?raw.r2.storageLimitBytes:null
        }
      });
    }catch(error){
      renderUsageQuota(null);
      console.error('無料枠使用状況を取得できませんでした。',error);
    }
  }

  function quotaPercent(used,limit){
    const u=Number(used);
    const l=Number(limit);
    if(!Number.isFinite(u)||u<0||!Number.isFinite(l)||l<=0)return null;
    return Math.max(0,u/l*100);
  }

  function formatBytes(value){
    const n=Number(value);
    if(!Number.isFinite(n)||n<0)return'—';
    if(n<1024)return formatNumber(n)+' B';
    if(n<1024*1024)return (n/1024).toFixed(1)+' KB';
    if(n<1024*1024*1024)return (n/(1024*1024)).toFixed(1)+' MB';
    return (n/(1024*1024*1024)).toFixed(2)+' GB';
  }

  function setUsageMeter(prefix,percent){
    const badge=$(prefix+'Badge');
    const bar=$(prefix+'Bar');
    if(!badge||!bar)return;
    if(percent==null){
      badge.textContent='未取得';
      badge.className='usage-badge';
      bar.style.width='0%';
      return;
    }
    const shown=Math.min(999,percent);
    badge.textContent=shown.toFixed(shown>=10?0:1)+'%';
    badge.className='usage-badge '+(percent>=90?'usage-danger':percent>=70?'usage-caution':'usage-normal');
    bar.className=percent>=90?'usage-danger':percent>=70?'usage-caution':'usage-normal';
    bar.style.width=Math.min(100,percent)+'%';
  }

  function renderUsageQuota(usage){
    if(!$('usageQuotaGrid'))return;
    const data=usage&&typeof usage==='object'?usage:{};
    $('usageQuotaUpdated').textContent=data.collectedAt
      ?'最終取得 '+formatDateTime(data.collectedAt)
      :'利用量スナップショット未取得';

    const github=data.githubActions||{};
    const githubPercent=quotaPercent(github.used,github.limit);
    $('usageGithubValue').textContent=github.used==null
      ?'無料枠 未判定'
      :formatNumber(Math.ceil(Number(github.used)))+' / '+formatNumber(github.limit||2000)+' min';
    $('usageGithubMeta').textContent=github.used==null
      ?(github.total==null
        ?'GitHub Actions / アカウント実測 未取得'
        :'全repo実測 '+formatNumber(Math.ceil(Number(github.total)))+' min / repo公開区分 未取得')
      :'Private repo無料枠 / 全repo実測 '+formatNumber(Math.ceil(Number(github.total)||0))+' min';
    setUsageMeter('usageGithub',githubPercent);

    const workers=data.workers||{};
    const workerPercent=quotaPercent(workers.used,workers.limit);
    $('usageWorkersValue').textContent=workers.used==null
      ?'—'
      :formatNumber(workers.used)+' / '+formatNumber(workers.limit||100000);
    setUsageMeter('usageWorkers',workerPercent);

    const d1=data.d1||{};
    const readPercent=quotaPercent(d1.rowsRead,d1.rowsReadLimit);
    const writePercent=quotaPercent(d1.rowsWritten,d1.rowsWrittenLimit);
    const storagePercent=quotaPercent(d1.storageBytes,d1.storageLimitBytes);
    const d1Percents=[readPercent,writePercent,storagePercent].filter(function(value){return value!=null;});
    const d1Percent=d1Percents.length?Math.max.apply(null,d1Percents):null;
    $('usageD1Value').textContent=
      'R '+(d1.rowsRead==null?'—':formatNumber(d1.rowsRead))+
      ' / W '+(d1.rowsWritten==null?'—':formatNumber(d1.rowsWritten));
    $('usageD1Meta').textContent=
      'Read 500万/日・Write 10万/日・Storage '+
      (d1.storageBytes==null?'—':formatBytes(d1.storageBytes))+' / 5 GB';
    setUsageMeter('usageD1',d1Percent);

    const r2=data.r2||{};
    const r2Percent=quotaPercent(r2.storageBytes,r2.storageLimitBytes);
    $('usageR2Value').textContent=r2.storageBytes==null
      ?'—'
      :formatBytes(r2.storageBytes)+' / 10 GB';
    setUsageMeter('usageR2',r2Percent);
  }

  function rangeLabel(range){
    return { '3h':'3時間','6h':'6時間','12h':'12時間','24h':'24時間','all':'全期間' }[range]||range;
  }

  function drawLineChart(id,rows,series,tooltipBuilder){
    const el=$(id);
    if(!rows.length){
      el.innerHTML='<div class="chart-empty">表示できるデータがありません</div>';
      return;
    }

    const width=900;
    const height=320;
    const pad={l:48,r:22,t:20,b:52};
    const innerW=width-pad.l-pad.r;
    const innerH=height-pad.t-pad.b;
    let max=0;

    rows.forEach(function(row){
      series.forEach(function(s){
        const v=Number(row[s.key])||0;
        if(v>max)max=v;
      });
    });
    max=Math.max(1,max);
    const niceMax=niceCeil(max);

    function x(i){
      return pad.l+(rows.length<=1?innerW/2:(i/(rows.length-1))*innerW);
    }
    function y(v){
      return pad.t+innerH-(Math.max(0,Number(v)||0)/niceMax)*innerH;
    }

    let html='<svg viewBox="0 0 '+width+' '+height+'" aria-hidden="true">';
    for(let i=0;i<=4;i++){
      const yy=pad.t+(innerH/4)*i;
      const value=Math.round(niceMax*(1-i/4));
      html+='<line class="chart-grid" x1="'+pad.l+'" y1="'+yy+'" x2="'+(width-pad.r)+'" y2="'+yy+'"></line>';
      html+='<text class="chart-axis-label" x="'+(pad.l-8)+'" y="'+(yy+4)+'" text-anchor="end">'+value+'</text>';
    }

    const labelStep=Math.max(1,Math.ceil(rows.length/6));
    rows.forEach(function(row,index){
      if(index%labelStep!==0&&index!==rows.length-1)return;
      html+='<text class="chart-axis-label" x="'+x(index)+'" y="'+(height-18)+'" text-anchor="middle">'+escapeHtml(formatShortTime(row.timestamp))+'</text>';
    });

    series.forEach(function(s){
      const points=rows.map(function(row,index){return x(index)+','+y(row[s.key]);}).join(' ');
      html+='<polyline class="chart-series-'+s.className+'" points="'+points+'"></polyline>';
      rows.forEach(function(row,index){
        const tip=tooltipBuilder?tooltipBuilder(row,s):s.label+' '+row[s.key];
        html+='<circle class="chart-dot-'+s.className+'" cx="'+x(index)+'" cy="'+y(row[s.key])+'" r="3.4"><title>'+escapeHtml(tip)+'</title></circle>';
      });
    });

    html+='</svg>';
    el.innerHTML=html;
  }

  function niceCeil(value){
    const n=Math.max(1,Number(value)||1);
    const magnitude=Math.pow(10,Math.floor(Math.log10(n)));
    const normalized=n/magnitude;
    const step=normalized<=1?1:normalized<=2?2:normalized<=5?5:10;
    return step*magnitude;
  }

  function renderRanking(rows){
    const container=$('rankingChart');
    const query=$('rankingSearch').value.trim().toLocaleLowerCase('ja');
    let list=safeArray(rows).filter(function(item){
      return !query||String(item.title||'').toLocaleLowerCase('ja').includes(query);
    });
    if(!state.showAllRanking)list=list.slice(0,10);
    container.innerHTML='';
    if(!list.length){
      container.innerHTML='<div class="empty-note">該当作品がありません</div>';
      return;
    }
    const max=Math.max.apply(null,list.map(function(item){return Number(item.votes)||0;}).concat([1]));
    list.forEach(function(item){
      const row=document.createElement('div');
      row.className='rank-row';

      const pos=document.createElement('div');
      pos.className='rank-position';
      pos.textContent='#'+item.rank;

      const copy=document.createElement('div');
      copy.className='rank-copy';
      const title=document.createElement('div');
      title.className='rank-title';
      title.textContent=item.title||'作品';
      title.title=item.title||'作品';
      const track=document.createElement('div');
      track.className='rank-track';
      const fill=document.createElement('div');
      fill.className='rank-fill';
      fill.style.width=((Number(item.votes)||0)/max*100)+'%';
      track.appendChild(fill);
      copy.appendChild(title);
      copy.appendChild(track);

      const value=document.createElement('div');
      value.className='rank-value';
      value.innerHTML=escapeHtml(formatNumber(item.votes)+'票')+
        '<small>シェア '+escapeHtml(formatPercent(item.sharePercent))+
        ' / 選択率 '+escapeHtml(formatPercent(item.selectionRatePercent))+'</small>';

      row.appendChild(pos);
      row.appendChild(copy);
      row.appendChild(value);
      container.appendChild(row);
    });
  }

  function renderLive(data){
    const container=$('livePanel');
    const items=[
      ['最終投票',data&&data.lastVoteTime?formatDateTime(data.lastVoteTime):'投票なし'],
      ['直近5分',formatNumber(data&&data.responsesLast5m)+'件'],
      ['直近30分',formatNumber(data&&data.responsesLast30m)+'件'],
      ['30分得票',formatNumber(data&&data.votesLast30m)+'票'],
      ['30分TOP',data&&data.topWorkLast30m?data.topWorkLast30m.title+' / '+formatNumber(data.topWorkLast30m.votes)+'票':'データ不足'],
      ['勢いTOP',data&&data.momentumLeader?data.momentumLeader.title+' / '+data.momentumLeader.label:'データ不足'],
      ['直近API失敗',state.systemData&&state.systemData.latestFailure?formatDateTime(state.systemData.latestFailure.startTime):'なし / 未取得'],
      ['システム',state.systemData&&state.systemData.health?state.systemData.health.status:'—']
    ];
    container.innerHTML='';
    items.forEach(function(item){
      const box=document.createElement('div');
      box.className='live-item';
      const label=document.createElement('span');
      label.textContent=item[0];
      const value=document.createElement('strong');
      value.textContent=item[1];
      box.appendChild(label);
      box.appendChild(value);
      container.appendChild(box);
    });
  }

  function renderMomentum(rows){
    renderSimpleRows('momentumPanel',safeArray(rows).slice(0,8),function(item){
      const change=(Number(item.currentVotes)||0)-(Number(item.previousVotes)||0);
      return{
        title:item.title,
        sub:'直近60分 '+formatNumber(item.currentVotes)+'票 / その前60分 '+formatNumber(item.previousVotes)+'票',
        value:(change>=0?'+':'')+change,
        tag:item.label,
        tagClass:item.level==='surge'||item.level==='up'?'tag-up':item.level==='down'?'tag-down':''
      };
    },'比較に必要な投票データが不足しています');
  }

  function renderRankMovement(rows){
    renderSimpleRows('rankMovementPanel',safeArray(rows).slice(0,10),function(item){
      const past=[];
      if(item.rank30mAgo)past.push('30分前 '+item.rank30mAgo+'位');
      if(item.rank1hAgo)past.push('1時間前 '+item.rank1hAgo+'位');
      if(item.rank3hAgo)past.push('3時間前 '+item.rank3hAgo+'位');
      const ref=item.rank1hAgo||item.rank3hAgo||item.rank30mAgo;
      const delta=ref?ref-item.currentRank:null;
      return{
        title:item.title,
        sub:past.length?past.join(' / '):'比較時点のデータ不足',
        value:item.currentRank+'位'+(delta==null?'':delta>0?' ↑'+delta:delta<0?' ↓'+Math.abs(delta):' →')
      };
    },'順位変動を計算できるデータがありません');
  }

  function renderCloseRaces(rows){
    renderSimpleRows('closeRacePanel',safeArray(rows).slice(0,5),function(item){
      return{
        title:item.upperTitle+' / '+item.lowerTitle,
        sub:'票差 '+formatNumber(item.voteGap)+'票・上位票に対する差 '+formatPercent(item.gapPercent),
        value:formatPercent(item.closenessPercent),
        tag:'接戦度',
        tagClass:item.closenessPercent>=90?'tag-warn':''
      };
    },'比較できる順位データがありません');
  }

  function renderConcentration(data){
    const container=$('concentrationPanel');
    if(!data||!Number.isFinite(Number(data.hhi))){
      container.innerHTML='<div class="empty-note">データ不足</div>';
      return;
    }
    const metrics=[
      ['判定',data.label||'—'],
      ['HHI',Number(data.hhi).toFixed(0)],
      ['正規化エントロピー',Number(data.normalizedEntropy).toFixed(3)],
      ['上位3作品シェア',formatPercent(data.top3SharePercent)]
    ];
    container.innerHTML='';
    metrics.forEach(function(item){
      const box=document.createElement('div');
      box.className='metric-box';
      const label=document.createElement('span');
      label.textContent=item[0];
      const value=document.createElement('strong');
      value.textContent=item[1];
      box.appendChild(label);
      box.appendChild(value);
      container.appendChild(box);
    });
  }

  function renderCoSelection(rows){
    renderSimpleRows('coSelectionPanel',safeArray(rows).slice(0,10),function(item){
      return{
        title:item.workA+' × '+item.workB,
        sub:'同じ投票で同時に選択',
        value:formatNumber(item.count)+'回'
      };
    },'共選択データがありません');
  }

  function renderAnomalies(rows){
    renderSimpleRows('anomalyPanel',safeArray(rows).slice(0,10),function(item){
      return{
        title:formatDateTime(item.timestamp),
        sub:'投票 '+formatNumber(item.responses)+'件 / 通常中央値 '+formatNumber(item.median)+'件 / robust Z '+Number(item.robustZ).toFixed(2),
        value:item.direction==='high'?'通常より多い':'通常より少ない',
        tag:'要確認',
        tagClass:'tag-warn'
      };
    },'現在、時系列上の明確な異常候補はありません');
  }

  function renderPatternAnomalies(rows){
    renderSimpleRows('patternPanel',safeArray(rows).slice(0,10),function(item){
      return{
        title:item.works.join(' / '),
        sub:formatDateTime(item.timestamp)+' の5分間で '+formatNumber(item.count)+'回、区間内 '+formatPercent(item.sharePercent),
        value:'要確認',
        tag:'統計的偏り',
        tagClass:'tag-warn'
      };
    },'現在、同一組み合わせの顕著な集中は検出されていません');
  }

  function renderSimpleRows(id,rows,mapFn,emptyText){
    const container=$(id);
    container.innerHTML='';
    if(!rows.length){
      container.innerHTML='<div class="empty-note">'+escapeHtml(emptyText)+'</div>';
      return;
    }
    rows.forEach(function(item){
      const mapped=mapFn(item);
      const row=document.createElement('div');
      row.className='data-row';
      const copy=document.createElement('div');
      const title=document.createElement('div');
      title.className='data-row-title';
      title.textContent=mapped.title||'—';
      copy.appendChild(title);
      if(mapped.sub){
        const sub=document.createElement('div');
        sub.className='data-row-sub';
        sub.textContent=mapped.sub;
        copy.appendChild(sub);
      }
      if(mapped.tag){
        const tag=document.createElement('span');
        tag.className='tag '+(mapped.tagClass||'');
        tag.textContent=mapped.tag;
        copy.appendChild(tag);
      }
      const value=document.createElement('div');
      value.className='data-row-value';
      value.textContent=mapped.value==null?'—':mapped.value;
      row.appendChild(copy);
      row.appendChild(value);
      container.appendChild(row);
    });
  }

  function renderStatusBreakdown(counts){
    const container=$('statusBreakdown');
    container.innerHTML='';
    const entries=Object.entries(counts||{});
    if(!entries.length){
      container.innerHTML='<span class="status-pill">実行データなし</span>';
      return;
    }
    entries.sort(function(a,b){return b[1]-a[1];}).forEach(function(entry){
      const item=document.createElement('span');
      item.className='status-pill';
      item.textContent=entry[0]+' '+formatNumber(entry[1]);
      container.appendChild(item);
    });
  }

  function renderFunctionStats(rows){
    const body=$('functionStatsBody');
    body.innerHTML='';
    const list=safeArray(rows).slice(0,12);
    if(!list.length){
      const tr=document.createElement('tr');
      const td=document.createElement('td');
      td.colSpan=5;
      td.textContent='関数別データなし';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    list.forEach(function(item){
      const tr=document.createElement('tr');
      [
        item.functionName||'—',
        formatNumber(item.total),
        formatNumber(item.errors),
        formatDuration(item.averageDurationMs),
        formatDuration(item.p95DurationMs)
      ].forEach(function(value){
        const td=document.createElement('td');
        td.textContent=value;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function updateHealth(){
    const data=state.systemData;
    let status='CAUTION';
    let reasons=['システム実行情報が未取得です。'];
    if(data&&data.health){
      status=data.health.status||'CAUTION';
      reasons=safeArray(data.health.reasons);
    }

    const badge=$('systemStatus');
    badge.textContent='SYSTEM '+status;
    badge.className='status-badge '+(
      status==='NORMAL'?'status-normal':
      status==='WARNING'?'status-warning':'status-caution'
    );

    const container=$('healthPanel');
    container.innerHTML='';
    const stateBox=document.createElement('div');
    stateBox.className='health-state';
    const strong=document.createElement('strong');
    strong.textContent=status;
    const source=document.createElement('span');
    source.textContent=data&&data.sourceLabel?data.sourceLabel:'実行情報未取得';
    stateBox.appendChild(strong);
    stateBox.appendChild(source);
    container.appendChild(stateBox);

    const ul=document.createElement('ul');
    ul.className='health-reasons';
    (reasons.length?reasons:['判定理由なし']).forEach(function(reason){
      const li=document.createElement('li');
      li.textContent=reason;
      ul.appendChild(li);
    });
    container.appendChild(ul);

    if(state.voteData)renderLive(state.voteData.live);
  }

  function exportCsv(){
    if(!state.voteData){
      showToast('エクスポートするデータがありません。');
      return;
    }
    const lines=[];
    lines.push(['type','rank','work','votes','share_percent','selection_rate_percent'].join(','));
    safeArray(state.voteData.ranking).forEach(function(item){
      lines.push([
        'ranking',
        item.rank,
        csvCell(item.title),
        item.votes,
        item.sharePercent,
        item.selectionRatePercent
      ].join(','));
    });
    lines.push('');
    lines.push(['type','timestamp','responses','votes'].join(','));
    safeArray(state.voteData.trend&&state.voteData.trend.points).forEach(function(item){
      lines.push(['trend',csvCell(item.timestamp),item.responses,item.votes].join(','));
    });

    const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download='sakuhin-admin-'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }

  function csvCell(value){
    const text=String(value==null?'':value);
    return '"'+text.replace(/"/g,'""')+'"';
  }

  function scheduleRefresh(){
    stopRefresh();
    if(!state.autoRefresh)return;
    state.timer=setInterval(function(){
      Promise.all([loadAll(false),loadWinnerSettings(),loadDisplaySettings(),loadVoteCycleSettings()]);
    },REFRESH_MS);
  }

  function stopRefresh(){
    if(state.timer){
      clearInterval(state.timer);
      state.timer=null;
    }
  }

  async function loadWorksManager(){
    if(!state.session)return;
    try{
      const works=await adminRest('/api/admin/works',{
        headers:{'X-Admin-Session':state.session}
      });
      state.works=safeArray(works);
      renderWorksManager();
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      $('workManagerList').innerHTML='<div class="empty-note">作品一覧を取得できませんでした。</div>';
      $('workEditorMessage').textContent=String(error&&error.message?error.message:error||'');
    }
  }

  function resetWorkEditor(){
    $('workId').value='';
    $('workTitle').value='';
    $('workAuthor').value='';
    $('workComment').value='';
    $('workStatus').value='draft';
    $('workImage').value='';
    $('workEditorMessage').textContent='新しい作品を登録できます。';
    $('saveWorkButton').textContent='登録する';
  }

  function editWork(workId){
    const work=state.works.find(function(item){return String(item.id)===String(workId);});
    if(!work)return;
    $('workId').value=String(work.id);
    $('workTitle').value=work.title||'';
    $('workAuthor').value=work.author||'';
    $('workComment').value=work.comment||'';
    $('workStatus').value=work.enabled?'published':'draft';
    $('workImage').value='';
    $('workEditorMessage').textContent='作品を編集中';
    $('saveWorkButton').textContent='変更を保存';
    $('workTitle').focus();
    $('workEditorForm').scrollIntoView({behavior:'smooth',block:'center'});
  }

  function assetExtension(file){
    const map={
      'image/jpeg':'jpg',
      'image/png':'png',
      'image/webp':'webp',
      'image/gif':'gif',
      'image/avif':'avif'
    };
    return map[file.type]||'';
  }

  function randomId(){
    if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID();
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  }

  async function uploadWorkImage(work,file){
    const ext=assetExtension(file);
    if(!ext)throw new Error('UNSUPPORTED_ASSET_TYPE');
    const key='works/'+String(work.id)+'/'+randomId()+'.'+ext;
    const asset=await adminRest('/api/admin/assets/'+encodeURIComponent(key),{
      method:'PUT',
      headers:{
        'X-Admin-Session':state.session,
        'Content-Type':file.type
      },
      body:file
    });

    const updated=await adminRest('/api/admin/works/'+encodeURIComponent(work.id),{
      method:'PATCH',
      json:{
        session:state.session,
        work:{
          displayOrder:work.displayOrder,
          value:work.value,
          title:work.title,
          author:work.author,
          comment:work.comment,
          imageKey:asset.key,
          enabled:work.enabled
        }
      }
    });

    return updated;
  }

  async function saveWork(event){
    event.preventDefault();
    const id=$('workId').value.trim();
    const current=id
      ?state.works.find(function(item){return String(item.id)===id;})
      :null;
    const work={
      displayOrder:current?current.displayOrder:null,
      value:current?current.value:undefined,
      title:$('workTitle').value.trim(),
      author:$('workAuthor').value.trim(),
      comment:$('workComment').value.trim(),
      imageKey:current?current.imageKey:null,
      enabled:$('workStatus').value==='published'
    };
    const image=$('workImage').files&&$('workImage').files[0]?$('workImage').files[0]:null;

    if(!work.title){
      $('workEditorMessage').textContent='作品名を入力してください。';
      return;
    }

    $('saveWorkButton').disabled=true;
    $('workEditorMessage').textContent='保存しています…';

    try{
      let saved;
      if(current){
        saved=await adminRest('/api/admin/works/'+encodeURIComponent(current.id),{
          method:'PATCH',
          json:{session:state.session,work:work}
        });
      }else{
        saved=await adminRest('/api/admin/works',{
          method:'POST',
          json:{session:state.session,work:work}
        });
      }

      if(image){
        saved=await uploadWorkImage(saved,image);
      }

      await loadWorksManager();
      resetWorkEditor();
      await loadAll(false);
      showToast(current?'作品を更新しました。':'作品を登録しました。');
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      $('workEditorMessage').textContent='保存できませんでした。 '+String(error&&error.message?error.message:'');
    }finally{
      $('saveWorkButton').disabled=false;
    }
  }

  async function deleteWork(workId){
    const work=state.works.find(function(item){return String(item.id)===String(workId);});
    if(!work)return;

    const label=work.title||'無題';
    if(!window.confirm('作品「'+label+'」を削除します。\nこの作品に紐づく投票データも調整されます。\n元に戻せません。'))return;

    try{
      await adminRest('/api/admin/works/'+encodeURIComponent(work.id),{
        method:'DELETE',
        json:{session:state.session}
      });

      if($('workId').value.trim()===String(work.id)){
        resetWorkEditor();
      }

      await Promise.all([loadWorksManager(),loadAll(false)]);
      showToast('作品を削除しました。');
    }catch(error){
      if(isAuthError(error)){
        showLogin('セッションの有効期限が切れました。再認証してください。');
        return;
      }
      showToast('作品を削除できませんでした。');
    }
  }

  async function moveWork(workId,direction){
    const list=state.works.slice();
    const index=list.findIndex(function(item){return String(item.id)===String(workId);});
    const target=index+direction;
    if(index<0||target<0||target>=list.length)return;
    const temp=list[index];
    list[index]=list[target];
    list[target]=temp;

    try{
      await adminRest('/api/admin/works/reorder',{
        method:'POST',
        json:{session:state.session,ids:list.map(function(item){return item.id;})}
      });
      state.works=list;
      renderWorksManager();
      showToast('表示順を更新しました。');
    }catch(error){
      showToast('表示順を更新できませんでした。');
    }
  }

  function setWorksListCollapsed(collapsed){
    state.worksListCollapsed=!!collapsed;
    $('workListWrap').hidden=state.worksListCollapsed;
    $('toggleWorksListButton').setAttribute('aria-expanded',state.worksListCollapsed?'false':'true');
    $('toggleWorksListButton').textContent=state.worksListCollapsed
      ?'作品一覧を表示'
      :'作品一覧を折りたたむ';
  }

  function renderWorksManager(){
    const list=$('workManagerList');
    const works=safeArray(state.works);
    $('workManagerSummary').textContent='作品 '+works.length+'件 / 公開 '+works.filter(function(item){return item.enabled;}).length+'件';
    list.innerHTML='';

    if(!works.length){
      list.innerHTML='<div class="empty-note">作品はまだ登録されていません。</div>';
      return;
    }

    works.forEach(function(work,index){
      const row=document.createElement('article');
      row.className='work-manager-row';

      const thumb=document.createElement('div');
      thumb.className='work-manager-thumb';
      if(work.image){
        const img=document.createElement('img');
        img.src=work.image;
        img.alt='作品画像：'+(work.title||'作品');
        thumb.appendChild(img);
      }else{
        const empty=document.createElement('span');
        empty.textContent='NO IMAGE';
        thumb.appendChild(empty);
      }

      const copy=document.createElement('div');
      copy.className='work-manager-copy';
      const title=document.createElement('h3');
      title.className='work-manager-title';
      title.textContent=work.title||'無題';
      const meta=document.createElement('div');
      meta.className='work-manager-meta';
      meta.textContent=(work.author||'作者未設定')+(work.comment?' / '+work.comment:'');
      const status=document.createElement('span');
      status.className='work-manager-status '+(work.enabled?'status-published':'status-draft');
      status.textContent=work.enabled?'公開':'非公開';
      copy.appendChild(title);
      copy.appendChild(meta);
      copy.appendChild(status);

      const actions=document.createElement('div');
      actions.className='work-manager-actions';
      const edit=document.createElement('button');
      edit.type='button';
      edit.textContent='編集';
      edit.addEventListener('click',function(){editWork(work.id);});
      const up=document.createElement('button');
      up.type='button';
      up.textContent='↑';
      up.disabled=index===0;
      up.addEventListener('click',function(){moveWork(work.id,-1);});
      const down=document.createElement('button');
      down.type='button';
      down.textContent='↓';
      down.disabled=index===works.length-1;
      down.addEventListener('click',function(){moveWork(work.id,1);});
      const remove=document.createElement('button');
      remove.type='button';
      remove.textContent='削除';
      remove.addEventListener('click',function(){deleteWork(work.id);});
      actions.appendChild(edit);
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(remove);

      row.appendChild(thumb);
      row.appendChild(copy);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function bind(){
    const on=(id,type,listener)=>{
      const element=$(id);
      if(element)element.addEventListener(type,listener);
    };
    on('loginForm','submit',function(event){
      event.preventDefault();
      login($('adminCode').value.trim());
    });

    on('logoutButton','click',logout);
    const worksPageButton=$('worksPageButton');
    if(worksPageButton){
      worksPageButton.addEventListener('click',function(){window.location.href='works.html';});
    }
    const dashboardPageButton=$('dashboardPageButton');
    if(dashboardPageButton){
      dashboardPageButton.addEventListener('click',function(){window.location.href='index.html';});
    }
    const settingsPageButton=$('settingsPageButton');
    if(settingsPageButton){
      settingsPageButton.addEventListener('click',function(){window.location.href='settings.html';});
    }
    on('refreshButton','click',function(){Promise.all([loadAll(true),loadWorksManager(),loadWinnerSettings(),loadDisplaySettings(),loadVoteCycleSettings()]);});
    on('autoRefreshButton','click',function(){
      state.autoRefresh=!state.autoRefresh;
      $('autoRefreshButton').setAttribute('aria-pressed',state.autoRefresh?'true':'false');
      $('autoRefreshButton').textContent=state.autoRefresh?'ON / 60s':'OFF';
      scheduleRefresh();
    });

    document.querySelectorAll('[data-range]').forEach(function(button){
      button.addEventListener('click',function(){
        state.range=button.dataset.range;
        document.querySelectorAll('[data-range]').forEach(function(item){
          item.classList.toggle('active',item===button);
        });
        loadAll(false);
      });
    });

    on('rankingSearch','input',function(){
      renderRanking(state.voteData&&state.voteData.ranking);
    });

    on('rankingLimitButton','click',function(){
      state.showAllRanking=!state.showAllRanking;
      $('rankingLimitButton').setAttribute('aria-pressed',state.showAllRanking?'true':'false');
      $('rankingLimitButton').textContent=state.showAllRanking?'ALL':'TOP 10';
      renderRanking(state.voteData&&state.voteData.ranking);
    });

    on('exportCsvButton','click',exportCsv);
    on('printButton','click',function(){window.print();});
    on('workEditorForm','submit',saveWork);
    on('newWorkButton','click',resetWorkEditor);
    on('clearWorkButton','click',resetWorkEditor);
    on('reloadWorksButton','click',loadWorksManager);
    on('toggleWorksListButton','click',function(){
      setWorksListCollapsed(!state.worksListCollapsed);
    });
    on('adminCodeForm','submit',changeAdminCode);
    const voteCycleSettingsForm=$('voteCycleSettingsForm');
    if(voteCycleSettingsForm){
      voteCycleSettingsForm.addEventListener('submit',saveVoteCycleSettings);
    }
    const displaySettingsForm=$('displaySettingsForm');
    if(displaySettingsForm){
      displaySettingsForm.addEventListener('submit',saveDisplaySettings);
      if($('displayBackgroundMode'))$('displayBackgroundMode').addEventListener('change',renderDisplayBackgroundPreview);
      ['displayHeaderLayout','displayHeroTitleScale','displayHeroCopyScale'].forEach(function(id){
        const element=$(id);
        if(element){
          element.addEventListener('input',renderDisplayLayoutPreview);
          element.addEventListener('change',renderDisplayLayoutPreview);
        }
      });
      ['displayHeroTitleJp','displayHeroSide'].forEach(function(id){
        const element=$(id);
        if(element)element.addEventListener('input',renderDisplayLayoutPreview);
      });
      on('displayThemePreset','change',function(){
        const key=this.value;
        if(key==='custom'){
          renderDisplayThemePreview();
          return;
        }
        applyDisplayThemePreset(key);
        $('displaySettingsMessage').textContent='テーマ「'+DISPLAY_THEME_PRESETS[key].label+'」を選択中です。保存するとProductionへ反映されます。';
      });
      ['displayThemeBg','displayThemeInk','displayThemeAccent','displayThemeAccentStrong'].forEach(function(id){
        $(id).addEventListener('input',renderDisplayThemePreview);
        $(id).addEventListener('change',renderDisplayThemePreview);
      });
      on('displayHeaderImage','change',function(){
        const file=this.files&&this.files[0]?this.files[0]:null;
        renderDisplayImagePreview(file);
      });
      on('resetDisplayHeaderImageButton','click',function(){
        $('displayHeaderImageKey').value='';
        $('displayHeaderImage').value='';
        renderDisplayImagePreview(null);
        $('displaySettingsMessage').textContent='標準画像へ戻す設定です。保存すると反映されます。';
      });
    }
    const winnerSettingsForm=$('winnerSettingsForm');
    if(winnerSettingsForm){
      winnerSettingsForm.addEventListener('submit',saveWinnerSettings);
    }
    const addWinnerMilestoneButton=$('addWinnerMilestoneButton');
    if(addWinnerMilestoneButton){
      addWinnerMilestoneButton.addEventListener('click',function(){addWinnerMilestoneRow('');});
    }

    const resetVotesButton=$('resetVotesButton');
    if(resetVotesButton){
      resetVotesButton.addEventListener('click',resetVotes);
    }
  }

  async function init(){
    bind();
    let saved='';
    try{saved=sessionStorage.getItem(SESSION_KEY)||'';}catch(e){}
    if(!saved){
      showLogin('');
      return;
    }
    state.session=saved;
    showDashboard();
    await Promise.all([loadAll(false),loadWorksManager(),loadWinnerSettings(),loadDisplaySettings(),loadVoteCycleSettings()]);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();