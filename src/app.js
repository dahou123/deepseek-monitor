// ==================== DOM ====================
const $=id=>document.getElementById(id);
const balNum=$('balanceNum'), monCons=$('monthlyConsumption'), todayCons=$('todayConsumption');
const lastUpd=$('lastUpdated'), balSub=$('balanceSub'), dot=$('statusDot');
const refreshBtn=$('refreshBtn'), rechargeBtn=$('rechargeBtn'), settingsBtn=$('settingsBtn');
const closeBtn=$('closeBtn'), overlay=$('settingsOverlay'), sClose=$('settingsClose');
const keyInput=$('apiKeyInput'), toggleKey=$('toggleKey'), intervalSel=$('refreshInterval');
const thresholdSlider=$('thresholdSlider'), thresholdVal=$('thresholdVal');
const autoStartChk=$('autoStartChk'), saveBtn=$('saveBtn'), saveInd=$('saveInd');
const exportBtn=$('exportBtn'), chartEl=$('chartContainer');

// ==================== 格式化 ====================
const fmt=v=>v==null?'--':(isNaN(v)?'--':v.toFixed(2));

// ==================== 刷新 ====================
async function load() {
  try {
    loading(true); dot.className='status-dot loading';
    const r=await window.electronAPI.fetchBalance();
    if(!r.success){
      dot.className='status-dot error';
      balSub.textContent=r.error||'失败';
      const c=await window.electronAPI.getCached();
      if(c)update(c);
      loading(false);return;
    }
    update(r.data);
    dot.className='status-dot '+(r.data.is_available?'connected':'error');
    if(r.data.daily_consumption)drawChart(r.data.daily_consumption);
  } catch(e){dot.className='status-dot error';balSub.textContent=e.message||'错误';}
  finally{loading(false);}
}

function update(d){
  balNum.textContent=fmt(d.balance);
  balSub.textContent=d.last_updated?'更新 '+d.last_updated:'启动后获取';
  lastUpd.textContent=d.last_updated?.split(' ')[1]||'--';
  monCons.textContent=d.monthly_consumption!=null?'¥'+fmt(d.monthly_consumption):'--';
  if(d.daily_consumption?.length){
    const t=d.daily_consumption[d.daily_consumption.length-1];
    todayCons.textContent='¥'+fmt(t.consumption);
  } else todayCons.textContent='--';
}

function loading(v){refreshBtn.disabled=v;refreshBtn.textContent=v?'⟳ ...':'⟳ 刷新';refreshBtn.style.opacity=v?'0.5':'1';}

// ==================== 柱状图 ====================
function drawChart(data){
  if(!data||data.length===0){chartEl.innerHTML='<div class="chart-empty">持续使用后将显示趋势</div>';return;}
  const max=Math.max(...data.map(d=>d.consumption),0.01);
  const n=data.length,w=n*38+16,h=45,bw=24,gap=14;
  let bars='',labels='';
  for(let i=0;i<n;i++){
    const d=data[i],x=8+i*(bw+gap),bh=Math.max((d.consumption/max)*(h-10),d.consumption>0?4:1),y=h-6-bh;
    const isLast=i===n-1;
    if(d.consumption>0){
      bars+=`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="url(#bg)" opacity="0.9"/>`;
    } else bars+=`<rect x="${x}" y="${h-5}" width="${bw}" height="1.5" rx="1" fill="rgba(255,255,255,0.04)"/>`;
    labels+=`<text x="${x+bw/2}" y="${h+8}" text-anchor="middle" fill="var(--text-faint)" font-size="${isLast?'8':'7'}" font-weight="${isLast?'600':'400'}">${d.date}${isLast?'·今':''}</text>`;
  }
  chartEl.innerHTML=`<svg viewBox="0 0 ${w} ${h+18}" style="width:100%"><defs><linearGradient id="bg" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#3B5BDB"/><stop offset="100%" stop-color="#6B83FF"/></linearGradient></defs><g transform="translate(0,2)">${bars}${labels}</g></svg>`;
}

// ==================== 设置 ====================
async function loadSettings(){
  const s=await window.electronAPI.getSettings();
  if(s.apiKey)keyInput.value=s.apiKey;
  intervalSel.value=s.refreshInterval||'60';
  thresholdSlider.value=s.alertThreshold??2;
  thresholdVal.textContent='¥'+(s.alertThreshold??2);
  autoStartChk.checked=s.autoStart||false;
}
thresholdSlider.addEventListener('input',()=>{thresholdVal.textContent='¥'+thresholdSlider.value;});
async function save(){
  await window.electronAPI.saveSettings(keyInput.value.trim(),parseInt(intervalSel.value),parseInt(thresholdSlider.value),autoStartChk.checked);
  saveInd.classList.add('show');setTimeout(()=>saveInd.classList.remove('show'),2000);
  load();
}

// ==================== 事件 ====================
settingsBtn.addEventListener('click',()=>overlay.classList.add('active'));
sClose.addEventListener('click',()=>overlay.classList.remove('active'));
closeBtn.addEventListener('click',()=>window.electronAPI.hideWindow());
overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.classList.remove('active');});
saveBtn.addEventListener('click',save);
rechargeBtn.addEventListener('click',()=>window.electronAPI.openRecharge());
exportBtn.addEventListener('click',async()=>{
  const p=await window.electronAPI.exportCSV();
  if(p){balSub.textContent='✓ 已导出到桌面';setTimeout(()=>load(),3000);}
});
toggleKey.addEventListener('click',()=>{keyInput.type=keyInput.type==='password'?'text':'password';toggleKey.textContent=keyInput.type==='password'?'👁':'🙈';});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(overlay.classList.contains('active'))overlay.classList.remove('active');else window.electronAPI.hideWindow();}
  if(e.key==='Enter'&&overlay.classList.contains('active'))save();
});
window.electronAPI.onRefreshBalance(()=>load());

// ==================== 启动 ====================
(async function init(){
  await loadSettings();
  const c=await window.electronAPI.getCached();
  if(c){update(c);if(c.daily_consumption)drawChart(c.daily_consumption);}
  load();
})();
