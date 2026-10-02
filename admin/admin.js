(function(){
  'use strict';

  const SESSION_KEY='sakuhin_admin_session_v1';
  const CLIENT_KEY='sakuhin_admin_client_v1';
  const REFRESH_MS=60000;
  const TZ='Asia/Tokyo';

  const state={
    session:'',
    range:'6h',
    autoRefresh:true,
    timer:null,
    voteData:null,
    systemData:null,
    showAllRanking:false
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

  const GAS_DEPLOYMENT_ID='AKfycbwYEyWV-4OGXd3GcJIvPKjY_ccMDlhHOZaiaStYuqXi_XmnA_3fHYASV4bgLuIuTp0Z';
  const ADMIN_API_URL='https://script.google.com/macros/s/'+GAS_DEPLOYMENT_ID+'/exec';

  function gasCall(name){
    const args=[].slice.call(arguments,1);

    return fetch(ADMIN_API_URL,{
      method:'POST',
      redirect:'follow',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:JSON.stringify({
        channel:'admin',
        method:name,
        args:args
      })
    })
      .then(function(response){
        if(!response.ok){
          throw new Error('管理API HTTP '+response.status);
        }
        return response.json();
      })
      .then(function(payload){
        if(!payload||payload.ok!==true){
          throw new Error(
            payload&&payload.error
              ?payload.error
              :'管理APIの実行に失敗しました。'
          );
        }
        return payload.result;
      });
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
      const result=await gasCall('adminDashboardLogin',code,clientId());
      if(!result||!result.ok){
        const retry=result&&result.retryAfterSeconds?(' '+formatAgo(result.retryAfterSeconds).replace('前','後に再試行')):'';
        $('loginMessage').textContent=(result&&result.message?result.message:'認証できませんでした。')+retry;
        return;
      }
      state.session=result.session;
      try{sessionStorage.setItem(SESSION_KEY,state.session);}catch(e){}
      showDashboard();
      await loadAll(true);
    }catch(error){
      $('loginMessage').textContent='認証処理に失敗しました。';
    }finally{
      $('loginButton').disabled=false;
    }
  }

  async function logout(){
    const token=state.session;
    showLogin('');
    if(token){
      try{await gasCall('adminDashboardLogout',token);}catch(e){}
    }
  }

  async function loadAll(manual){
    if(!state.session)return;
    setBusy(true);
    const votePromise=gasCall('getAdminDashboardData',state.session,state.range);
    const systemPromise=gasCall('getAdminSystemMetrics',state.session,'24h');
    const results=await Promise.allSettled([votePromise,systemPromise]);
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
    $('processApiState').textContent=data.processApi&&data.processApi.available
      ?'Apps Script Processes API'
      :'フォールバック監視';

    drawLineChart('systemTrendChart',safeArray(data.trend),[
      {key:'total',label:'実行回数',className:'a'},
      {key:'errors',label:'エラー',className:'danger'}
    ],function(row){
      return formatDateTime(row.timestamp)+'\n実行 '+formatNumber(row.total)+'\nエラー '+formatNumber(row.errors);
    });

    renderStatusBreakdown(data.statusCounts);
    renderFunctionStats(data.functionStats);
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
      ['直近GAS失敗',state.systemData&&state.systemData.latestFailure?formatDateTime(state.systemData.latestFailure.startTime):'なし / 未取得'],
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
      loadAll(false);
    },REFRESH_MS);
  }

  function stopRefresh(){
    if(state.timer){
      clearInterval(state.timer);
      state.timer=null;
    }
  }

  function bind(){
    $('loginForm').addEventListener('submit',function(event){
      event.preventDefault();
      login($('adminCode').value.trim());
    });

    $('logoutButton').addEventListener('click',logout);
    $('refreshButton').addEventListener('click',function(){loadAll(true);});
    $('autoRefreshButton').addEventListener('click',function(){
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

    $('rankingSearch').addEventListener('input',function(){
      renderRanking(state.voteData&&state.voteData.ranking);
    });

    $('rankingLimitButton').addEventListener('click',function(){
      state.showAllRanking=!state.showAllRanking;
      $('rankingLimitButton').setAttribute('aria-pressed',state.showAllRanking?'true':'false');
      $('rankingLimitButton').textContent=state.showAllRanking?'ALL':'TOP 10';
      renderRanking(state.voteData&&state.voteData.ranking);
    });

    $('exportCsvButton').addEventListener('click',exportCsv);
    $('printButton').addEventListener('click',function(){window.print();});
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
    await loadAll(false);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();