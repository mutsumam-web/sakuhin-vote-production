(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const nf=new Intl.NumberFormat('ja-JP');

  function num(value){
    const n=Number(value);
    return Number.isFinite(n)&&n>=0?n:null;
  }

  function percent(used,limit){
    const u=num(used),l=num(limit);
    return u==null||l==null||l<=0?null:u/l*100;
  }

  function bytes(value){
    const n=num(value);
    if(n==null)return'—';
    if(n<1024)return nf.format(n)+' B';
    if(n<1024**2)return(n/1024).toFixed(1)+' KB';
    if(n<1024**3)return(n/1024**2).toFixed(1)+' MB';
    return(n/1024**3).toFixed(2)+' GB';
  }

  function setMeter(prefix,pct){
    const badge=$(prefix+'Badge');
    const bar=$(prefix+'Bar');
    if(pct==null){
      badge.textContent='未取得';
      badge.className='badge';
      bar.style.width='0%';
      bar.className='';
      return;
    }
    const shown=Math.min(999,pct);
    badge.textContent=shown.toFixed(shown>=10?0:1)+'%';
    const state=pct>=90?'danger':pct>=70?'warn':'normal';
    badge.className='badge '+state;
    bar.className=state==='normal'?'':state;
    bar.style.width=Math.min(100,pct)+'%';
  }

  function render(data){
    $('updatedAt').textContent=data.collectedAt
      ?'最終取得 '+new Date(data.collectedAt).toLocaleString('ja-JP')
      :'未取得';

    const gh=data.githubActions||{};
    $('githubValue').textContent=gh.usedMinutes==null
      ?'未取得'
      :nf.format(Math.ceil(gh.usedMinutes))+' / '+(gh.limitMinutes==null?'—':nf.format(gh.limitMinutes))+' min';
    $('githubMeta').textContent=gh.status==='ok'&&gh.exact===true
      ?'全repoアカウント実測 / '+String(gh.plan||'unknown')
      :'公式Billing API実測のみ・現在未取得';
    setMeter('github',percent(gh.usedMinutes,gh.limitMinutes));

    const workers=data.workers||{};
    $('workersValue').textContent=workers.requestsToday==null
      ?'未取得'
      :nf.format(workers.requestsToday)+' / '+nf.format(workers.limitRequests||100000);
    setMeter('workers',percent(workers.requestsToday,workers.limitRequests));

    const d1=data.d1||{};
    $('d1Value').textContent='R '+(d1.rowsReadToday==null?'—':nf.format(d1.rowsReadToday))
      +' / W '+(d1.rowsWrittenToday==null?'—':nf.format(d1.rowsWrittenToday));
    $('d1Meta').textContent='Read 500万/日・Write 10万/日・Storage '
      +(d1.storageBytes==null?'—':bytes(d1.storageBytes))+' / 5 GB';
    const d1p=[percent(d1.rowsReadToday,d1.rowsReadLimit),percent(d1.rowsWrittenToday,d1.rowsWrittenLimit),percent(d1.storageBytes,d1.storageLimitBytes)]
      .filter(v=>v!=null);
    setMeter('d1',d1p.length?Math.max(...d1p):null);

    const r2=data.r2||{};
    $('r2Value').textContent=r2.storageBytes==null?'未取得':bytes(r2.storageBytes)+' / 10 GB';
    setMeter('r2',percent(r2.storageBytes,r2.storageLimitBytes));

    const repos=Array.isArray(data.repositories)?data.repositories:[];
    $('repoState').textContent=gh.repositoriesComplete===true
      ?nf.format(repos.length)+' repositories / exact'
      :'repo内訳 未取得';
    $('repoRows').innerHTML='';
    if(!repos.length){
      const tr=document.createElement('tr');
      tr.innerHTML='<td colspan="3">GitHub Billing APIの全repo実測値を取得できていません。</td>';
      $('repoRows').appendChild(tr);
    }else{
      for(const repo of repos){
        const tr=document.createElement('tr');
        const name=document.createElement('td');
        const minutes=document.createElement('td');
        const visibility=document.createElement('td');
        name.textContent=repo.repository||'—';
        minutes.textContent=nf.format(num(repo.minutes)||0);
        visibility.textContent=repo.private===true?'Private':repo.private===false?'Public':'—';
        tr.append(name,minutes,visibility);
        $('repoRows').appendChild(tr);
      }
    }

    const pcts=[
      percent(gh.usedMinutes,gh.limitMinutes),
      percent(workers.requestsToday,workers.limitRequests),
      ...(d1p.length?[Math.max(...d1p)]:[]),
      percent(r2.storageBytes,r2.storageLimitBytes)
    ].filter(v=>v!=null);
    const max=pcts.length?Math.max(...pcts):null;
    const overall=$('overallBadge');
    if(max==null){
      overall.textContent='PARTIAL';
      overall.className='badge warn';
    }else{
      const state=max>=90?'danger':max>=70?'warn':'normal';
      overall.textContent=max>=90?'WARNING':max>=70?'CAUTION':'NORMAL';
      overall.className='badge '+state;
    }
  }

  fetch('./latest.json?ts='+Date.now(),{cache:'no-store'})
    .then(response=>{if(!response.ok)throw new Error('HTTP_'+response.status);return response.json();})
    .then(render)
    .catch(error=>{
      $('updatedAt').textContent='取得失敗';
      $('overallBadge').textContent='UNAVAILABLE';
      $('overallBadge').className='badge danger';
      console.error(error);
    });
})();
