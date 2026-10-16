/* Read-only quota trends and health checks. No collector secrets are exposed here. */
(function(){
  'use strict';
  const root=document.getElementById('usageTrendPanel');
  if(!root)return;
  const API_BASE=(window.__SAKUHIN_API_BASE__||'https://sakuhin-vote-api.mutsumam.workers.dev').replace(/\/$/,'');
  const $=id=>document.getElementById(id);
  const nf=new Intl.NumberFormat('ja-JP');
  const tz='Asia/Tokyo';
  let running=false;
  let lastAdminHealth=null;
  let lastSnapshot=null;
  let lastApiHealth=null;

  const metricDefs=[
    {id:'workers',title:'Workers リクエスト',unit:'件',kind:'day',account:'workers.requestsToday',project:'project.workers.requestsToday',limit:'workers.limitRequests',note:'Cloudflareアカウントの日次無料枠。画像取得もWorker呼び出しに含まれる。'},
    {id:'d1read',title:'D1 読み取り行数',unit:'行',kind:'day',account:'d1.rowsReadToday',project:'project.d1.rowsReadToday',limit:'d1.rowsReadLimit',note:'SQLが読み取った行数。ページ閲覧数ではない。'},
    {id:'d1write',title:'D1 書き込み行数',unit:'行',kind:'day',account:'d1.rowsWrittenToday',project:'project.d1.rowsWrittenToday',limit:'d1.rowsWrittenLimit',note:'投票確定などの保存で消費。'},
    {id:'d1storage',title:'D1 保存容量',unit:'bytes',kind:'all',account:'d1.storageBytes',project:'project.d1.storageBytes',limit:'d1.storageLimitBytes',note:'現在のデータベース保存容量。'},
    {id:'r2storage',title:'R2 保存容量',unit:'bytes',kind:'all',account:'r2.storageBytes',project:'project.r2.storageBytes',limit:'r2.storageLimitBytes',note:'現在容量と無料枠10GB-monthの参考比較。正確な月間課金量ではない。'},
    {id:'r2classa',title:'R2 Class A 操作',unit:'件',kind:'month',account:'r2.classAOperations',project:'project.r2.classAOperations',limit:'r2.classALimit',note:'月間のアップロード・一覧取得等。未取得なら表示しない。'},
    {id:'r2classb',title:'R2 Class B 操作',unit:'件',kind:'month',account:'r2.classBOperations',project:'project.r2.classBOperations',limit:'r2.classBLimit',note:'月間の画像取得等。未取得なら表示しない。'},
    {id:'actions',title:'GitHub Actions 無料枠対象時間',unit:'分',kind:'month',account:'githubActions.quotaUsedMinutes',project:'project.githubActions.quotaUsedMinutes',limit:'githubActions.limitMinutes',note:'Privateリポジトリの課金対象分数。公開リポジトリの標準実行時間は除外。'}
  ];
  function get(obj,path){
    return path.split('.').reduce((value,key)=>value&&typeof value==='object'?value[key]:undefined,obj);
  }
  function valid(value){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);
    return Number.isFinite(n)&&n>=0?n:null;
  }
  function fmt(value,unit){
    const n=valid(value);
    if(n===null)return '未取得';
    if(unit==='bytes'){
      if(n>=1024*1024*1024)return(n/(1024*1024*1024)).toFixed(2)+' GB';
      if(n>=1024*1024)return(n/(1024*1024)).toFixed(1)+' MB';
      return nf.format(Math.round(n))+' B';
    }
    return nf.format(Math.round(n))+' '+unit;
  }
  function when(value){
    const d=new Date(value);
    return Number.isFinite(d.getTime())
      ?new Intl.DateTimeFormat('ja-JP',{timeZone:tz,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)
      :'時刻未取得';
  }
  function samePeriod(point,latest,kind){
    if(kind==='all')return true;
    const date=String(point.at||'').slice(0,10),end=String(latest.at||'').slice(0,10);
    return kind==='day'?date===end:date.slice(0,7)===end.slice(0,7);
  }
  function elem(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function svgNode(name,attrs){
    const el=document.createElementNS('http://www.w3.org/2000/svg',name);
    for(const [key,value] of Object.entries(attrs||{}))el.setAttribute(key,String(value));
    return el;
  }
  function drawChart(container,def,rows,latest){
    const w=800,h=226,left=72,right=22,top=21,bottom=40;
    const plotWidth=w-left-right,plotHeight=h-top-bottom;
    const pairs=rows.map(x=>({at:x.at,a:valid(get(x,def.account)),p:valid(get(x,def.project))}));
    const maxObserved=pairs.reduce((max,p)=>Math.max(max,p.a||0,p.p||0),0);
    const limit=valid(get(latest,def.limit));
    const scale=Math.max(1,maxObserved*1.12,limit?limit*1.08:0);
    const times=pairs.map(p=>Date.parse(p.at)).filter(Number.isFinite);
    const minTime=times.length?Math.min(...times):0,maxTime=times.length?Math.max(...times):1;
    const px=t=>left+((t-minTime)/(maxTime-minTime||1))*plotWidth;
    const py=n=>top+plotHeight-(n/scale)*plotHeight;
    const svg=svgNode('svg',{viewBox:'0 0 '+w+' '+h,role:'img','aria-label':def.title+' の使用量推移'});
    if(limit){
      for(const ratio of [0.7,0.9,1]){
        const line=svgNode('line',{x1:left,x2:w-right,y1:py(limit*ratio),y2:py(limit*ratio),class:'quota-reference quota-reference-'+Math.round(ratio*100)});
        svg.appendChild(line);
        const label=svgNode('text',{x:7,y:py(limit*ratio)+4,class:'quota-axis-label'});
        label.textContent=Math.round(ratio*100)+'%';
        svg.appendChild(label);
      }
    }
    for(const [key,css] of [['a','quota-line-account'],['p','quota-line-project']]){
      const points=pairs.filter(x=>x[key]!==null&&Number.isFinite(Date.parse(x.at)));
      if(points.length>1){
        const poly=svgNode('polyline',{points:points.map(x=>px(Date.parse(x.at))+','+py(x[key])).join(' '),class:css});
        svg.appendChild(poly);
      }
      for(const p of points){
        const circle=svgNode('circle',{cx:px(Date.parse(p.at)),cy:py(p[key]),r:3.9,class:css+'-point'});
        const title=svgNode('title');
        title.textContent=when(p.at)+' / '+(key==='a'?'アカウント全体':'作品展')+'：'+fmt(p[key],def.unit);
        circle.appendChild(title);
        svg.appendChild(circle);
      }
    }
    if(times.length){
      const start=svgNode('text',{x:left,y:h-11,class:'quota-time-label'});
      start.textContent=when(new Date(minTime).toISOString());
      svg.appendChild(start);
      const end=svgNode('text',{x:w-right,y:h-11,'text-anchor':'end',class:'quota-time-label'});
      end.textContent=when(new Date(maxTime).toISOString());
      svg.appendChild(end);
    }
    container.replaceChildren(svg);
    if(pairs.length<2){
      container.appendChild(elem('p','quota-chart-empty','履歴は記録開始後に増えていきます。現在は取得済みの実測点のみを表示。'));
    }
  }
  function status(used,limit){
    if(used===null||limit===null||limit<=0)return 'unknown';
    const pct=used/limit*100;
    return pct>=100?'danger':pct>=90?'danger':pct>=70?'caution':'normal';
  }
  function renderMetric(def,points,latest){
    const body=$('usageTrends');
    const article=elem('article','quota-trend-card');
    article.appendChild(elem('h3','quota-trend-heading',def.title));
    const account=valid(get(latest,def.account));
    const project=valid(get(latest,def.project));
    const limit=valid(get(latest,def.limit));
    const stats=elem('div','quota-trend-stats');
    stats.appendChild(elem('span','quota-series-project','作品展：'+fmt(project,def.unit)));
    stats.appendChild(elem('span','quota-series-account','全体：'+fmt(account,def.unit)));
    article.appendChild(stats);
    const remaining=account!==null&&limit!==null?Math.max(0,limit-account):null;
    const pct=account!==null&&limit?account/limit*100:null;
    const details=elem('p','quota-trend-note','無料枠目安：'+fmt(limit,def.unit)+' ／ 残り目安：'+fmt(remaining,def.unit)
      +(pct!==null?' ／ '+pct.toFixed(1)+'%':'')+' （契約プランは別途確認）');
    details.dataset.level=status(account,limit);
    article.appendChild(details);
    const graph=elem('div','quota-chart');
    const rows=points.filter(p=>samePeriod(p,latest,def.kind));
    drawChart(graph,def,rows,latest);
    article.appendChild(graph);
    article.appendChild(elem('p','quota-trend-note',def.note));
    body.appendChild(article);
  }
  function healthItem(name,value,message){
    const row=elem('div','usage-health-row');
    row.dataset.level=value;
    row.appendChild(elem('strong','',name));
    row.appendChild(elem('span','usage-health-label',value.toUpperCase()));
    row.appendChild(elem('small','',message));
    $('usageHealthDetails').appendChild(row);
  }
  function renderHealth(snapshot,api){
    const target=$('usageHealthDetails');
    target.replaceChildren();
    healthItem('公開API / D1接続',api==='ok'?'normal':api==='error'?'danger':'unknown',
      api==='ok'?'Worker /health へのHTTP疎通とD1 SELECT 1を確認。R2の接続確認は含まない。'
      :api==='error'?'Worker /health に失敗。公開投票の疎通を確認してください。':'確認できませんでした。');
    const age=Date.now()-Date.parse(snapshot.collectedAt);
    const fresh=Number.isFinite(age)&&age>=0;
    healthItem('集計データの鮮度',!fresh?'unknown':age>12*3600000?'danger':age>7*3600000?'caution':'normal',
      '中央集計：'+when(snapshot.collectedAt)+'（約6時間ごとに定期更新。画面更新では再集計されません）');
    for(const def of metricDefs){
      const a=valid(get(snapshot,def.account)),lim=valid(get(snapshot,def.limit));
      const key='残量 '+def.title,kind=status(a,lim);
      healthItem(key,kind, a===null||lim===null?'公式集計値または制限値を取得できませんでした。'
        :'アカウント全体 '+fmt(a,def.unit)+' / '+fmt(lim,def.unit)+'。残り目安 '+fmt(Math.max(0,lim-a),def.unit)+'。');
    }
    const requests=valid(get(snapshot,'workers.requestsToday')),errors=valid(get(snapshot,'workers.errorsToday'));
    const errorRate=requests&&errors!==null?errors/requests*100:null;
    healthItem('Worker HTTPエラー',errorRate===null?'unknown':errorRate>=10?'danger':errorRate>=3?'caution':'normal',
      errorRate===null?'エラー集計未取得':errorRate.toFixed(2)+'% / '+fmt(errors,'件')+'。認証失敗なども含まれます。');
    if(lastAdminHealth){
      healthItem('管理API監視',lastAdminHealth.status==='NORMAL'?'normal':lastAdminHealth.status==='WARNING'?'danger':'caution',
        (lastAdminHealth.reasons||[]).join(' / ')||'管理API監視結果');
    }else healthItem('管理API監視','unknown','既存システム管理のAPI監視情報を取得待ち。');
    const availableR2=valid(get(snapshot,'r2.storageBytes'));
    healthItem('R2メトリクス',''+(availableR2===null?'unknown':'normal'),
      availableR2===null?'R2容量の集計を取得できませんでした。':'R2利用統計取得済み。個別画像の取得テストとは異なります。');
    const problems=Array.isArray(snapshot.errors)?snapshot.errors:[];
    if(problems.length)healthItem('データ収集の一部失敗','caution','一部メトリクスが未取得。中央モニターで確認してください。');
  }
  async function getJson(url){
    const response=await fetch(url+'?ts='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return response.json();
  }
  async function refresh(){
    if(running)return;
    running=true;
    $('usageChartsRefresh').disabled=true;
    $('usageChartsRefresh').textContent='更新中…';
    $('usageChartsState').textContent='中央集計の取得中…';
    const responses=await Promise.allSettled([
      getJson('../platform-usage/latest.json'),
      getJson('../platform-usage/history.json'),
      fetch(API_BASE+'/health',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('API HTTP '+r.status)))
    ]);
    if(responses[0].status==='fulfilled'){
      const latest=responses[0].value;
      const hist=responses[1].status==='fulfilled'&&Array.isArray(responses[1].value.points)?responses[1].value.points:[];
      const points=hist.filter(p=>p&&Number.isFinite(Date.parse(p.at))).slice(-200);
      if(!points.some(p=>p.at===latest.collectedAt))points.push({...latest,at:latest.collectedAt});
      points.sort((a,b)=>a.at.localeCompare(b.at));
      $('usageTrends').replaceChildren();
      metricDefs.forEach(def=>renderMetric(def,points,{...latest,at:latest.collectedAt}));
      lastSnapshot=latest;
      lastApiHealth=responses[2].status==='fulfilled'&&responses[2].value&&responses[2].value.ok===true?'ok':'error';
      renderHealth(latest,lastApiHealth);
      $('usageChartsState').textContent='表示更新 '+when(new Date().toISOString())+' / 公式集計 '+when(latest.collectedAt);
    }else{
      $('usageChartsState').textContent='公式利用量を取得できませんでした。既存の表示は保持しています。';
      if(!lastSnapshot)$('usageTrends').replaceChildren(elem('p','quota-chart-empty','利用量の取得に失敗しました。'));
    }
    running=false;
    $('usageChartsRefresh').disabled=false;
    $('usageChartsRefresh').textContent='表示を更新';
  }
  $('usageChartsRefresh').addEventListener('click',refresh);
  window.addEventListener('sakuhin:system-health',event=>{
    lastAdminHealth=event&&event.detail?event.detail:null;
    if(lastSnapshot)renderHealth(lastSnapshot,lastApiHealth);
  });
  refresh();
})();