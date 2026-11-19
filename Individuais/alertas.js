(function(){
 const path=location.pathname.toLowerCase();
 const config=path.includes('memoria')?{url:'/metricas/memoria',key:'ram_percentual',label:'Memória RAM',warn:80,critical:90,unit:'%'}:path.includes('disco')?{url:'/metricas/disco',key:'disco_percentual',label:'Disco',warn:80,critical:90,unit:'%'}:{url:'/metricas/rede',key:'download_mbps',label:'Rede',warn:80,critical:150,unit:' Mbps'};
 let lastLevel='normal';const rows=[];
 async function check(){try{const base=typeof API_URL!=='undefined'?API_URL:'';const response=await fetch(`${base}${config.url}`);if(!response.ok)throw Error();let data=await response.json();if(Array.isArray(data))data=data.at(-1);if(!data)return;let value=Number(data[config.key]??0);let level=value>=config.critical?'critical':value>=config.warn?'warning':'normal';if(level!==lastLevel&&level!=='normal'){rows.unshift({time:data.horario||new Date().toLocaleTimeString('pt-BR'),level,value});rows.splice(4);render()}lastLevel=level}catch(_){}}
 function render(){const body=document.getElementById('recentAlerts');if(!body)return;document.getElementById('alertCount').textContent=rows.length;body.innerHTML=rows.length?rows.map(item=>`<tr><td>${item.time}</td><td><span class="alert-level alert-level--${item.level}">${item.level==='critical'?'CRÍTICO':'ATENÇÃO'}</span></td><td>${item.value.toFixed(1)}${config.unit}</td></tr>`).join(''):'<tr><td colspan="3">Nenhum alerta recente</td></tr>'}
 check();setInterval(check,3000);
})();
