const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

// ==================== 全局 ====================
let tray, mainWindow, apiKey = '', refreshInterval = 60, alertThreshold = 2;
let isQuitting = false;
let autoStart = false, refreshTimer = null, currentBalance = null;

// ==================== 图标 ====================
function makeTrayPixels(r, g, b) {
  const s = 32, buf = Buffer.alloc(s * s * 4, 0);
  const cx = s/2, cy = s/2, rad = s/2 - 1;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.sqrt((x-cx)**2 + (y-cy)**2);
    if (d <= rad) {
      const a = d > rad-1.5 ? Math.max(0,Math.min(255,Math.round((rad-d)*255/1.5))) : 255;
      const i = (y*s + x)*4;
      // Windows 托盘需要 BGRA 格式
      buf[i]=b; buf[i+1]=g; buf[i+2]=r; buf[i+3]=a;
    }
  }
  return buf;
}

/// 生成 icon.ico 文件供桌面快捷方式使用
function generateIconFile(callback) {
  try {
    const zlib = require('zlib');
    const sizes = [16, 32, 48, 64];
    const pngs = sizes.map(s => makePNG(s, 79, 107, 237, zlib));
    
    let offset = 6 + sizes.length * 16;
    const entries = sizes.map((s, i) => {
      const e = Buffer.alloc(16);
      e[0] = s; e[1] = s; e[4] = 1; e[5] = 32;
      e.writeUInt32LE(pngs[i].length, 8);
      e.writeUInt32LE(offset, 12);
      offset += pngs[i].length;
      return e;
    });
    
    const hdr = Buffer.alloc(6);
    hdr[2] = 1; hdr.writeUInt16LE(sizes.length, 4);
    
    const icoPath = path.join(__dirname, 'icon.ico');
    fs.writeFileSync(icoPath, Buffer.concat([hdr, ...entries, ...pngs]));
    if (callback) callback(icoPath);
  } catch(e) { console.error('图标生成失败', e.message); }
}

function makePNG(size, r, g, b, zlib) {
  const cx=size/2, cy=size/2, rad=size/2-1;
  const row=1+size*4; const raw=Buffer.alloc(row*size, 0);
  for (let y=0; y<size; y++) {
    const off=y*row;
    for (let x=0; x<size; x++) {
      const d=Math.sqrt((x-cx)**2+(y-cy)**2);
      if (d<=rad) {
        const a=d>rad-1.5?Math.max(0,Math.min(255,Math.round((rad-d)*255/1.5))):255;
        const i=off+1+x*4; raw[i]=r; raw[i+1]=g; raw[i+2]=b; raw[i+3]=a;
      }
    }
  }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=6;
  const comp=zlib.deflateSync(raw,{level:1});
  const png=Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk(Buffer.from('IHDR'), ihdr),
    pngChunk(Buffer.from('IDAT'), comp),
    pngChunk(Buffer.from('IEND'), Buffer.alloc(0))
  ]);
  return png;
}

function pngChunk(type, data) {
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcData=Buffer.concat([type, data]);
  let c=0xffffffff;
  for (const b of crcData) { c^=b; for(let i=0;i<8;i++) c=c&1?(c>>>1)^0xedb88320:c>>>1; }
  const crcB=Buffer.alloc(4); crcB.writeUInt32BE((c^0xffffffff)>>>0);
  return Buffer.concat([len, type, data, crcB]);
}

// ==================== API ====================
function fetchBalance() {
  return new Promise((resolve, reject) => {
    if (!apiKey) { reject(Error('未配置 API Key')); return; }
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/user/balance',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
      timeout: 10000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) { reject(Error(`API 返回 ${res.statusCode}`)); return; }
          const j = JSON.parse(d);
          const info = j.balance_infos?.[0];
          if (!info) { reject(Error('无余额信息')); return; }
          resolve({ balance: parseFloat(info.total_balance)||0, is_available: j.is_available, last_updated: new Date().toLocaleString('zh-CN',{hour12:false}) });
        } catch(e) { reject(Error('解析失败 '+e.message)); }
      });
    });
    req.on('error', e => reject(Error('网络错误 '+e.message)));
    req.on('timeout', () => { req.destroy(); reject(Error('请求超时')); });
    req.end();
  });
}

// ==================== 历史 ====================
const HIST = 'balance_history.json';
function hp() { return path.join(app.getPath('userData'), HIST); }
function loadH() { try { if (fs.existsSync(hp())) return JSON.parse(fs.readFileSync(hp(),'utf-8')); } catch(e){} return []; }
function saveH(h) { fs.writeFileSync(hp(), JSON.stringify(h), 'utf-8'); }
function record(b) {
  const h = loadH();
  h.push({ timestamp: new Date().toISOString(), balance: b });
  if (h.length > 500) h.splice(0, h.length - 500);
  saveH(h);
}

// ==================== 月度消费 ====================
const MONTH = 'month_start.json';
function mp() { return path.join(app.getPath('userData'), MONTH); }
function ensureMonth(b) {
  const now = new Date(), mk = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  try {
    if (fs.existsSync(mp())) {
      const d = JSON.parse(fs.readFileSync(mp(),'utf-8'));
      if (d.month === mk) return d.balance;
      // 检测充值：如果余额比月初还高，更新月初余额
      if (b > d.balance) { saveMonth(mk, b); return b; }
    }
  } catch(e){}
  saveMonth(mk, b);
  return b;
}
function saveMonth(m, b) { fs.writeFileSync(mp(), JSON.stringify({month:m,balance:b}), 'utf-8'); }

// ==================== 每日消费 ====================
function calcDaily() {
  const h = loadH();
  if (h.length < 2) return [];
  const now = new Date();
  const ds = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = {};
  for (const r of h) {
    const k = ds(new Date(r.timestamp));
    if (!days[k]) days[k] = [];
    days[k].push(r.balance);
  }
  const res = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = ds(d), label = `${d.getMonth()+1}/${d.getDate()}`;
    if (days[k] && days[k].length >= 1) {
      const v = days[k];
      const c = Math.max(0, parseFloat((v[0] - v[v.length-1]).toFixed(2)));
      res.push({ date: label, consumption: c, timestamp: k });
    } else res.push({ date: label, consumption: 0, timestamp: k });
  }
  return res;
}

// ==================== 设置 ====================
function stp() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try {
    if (fs.existsSync(stp())) {
      const d = JSON.parse(fs.readFileSync(stp(),'utf-8'));
      apiKey = d.apiKey || ''; refreshInterval = d.refreshInterval || 60;
      alertThreshold = d.alertThreshold ?? 2; autoStart = d.autoStart || false;
    }
  } catch(e){}
}
function saveSettings(k, interval, threshold, start) {
  apiKey = k; if (interval) refreshInterval = interval;
  if (threshold !== undefined) alertThreshold = threshold;
  if (start !== undefined) autoStart = start;
  fs.writeFileSync(stp(), JSON.stringify({apiKey, refreshInterval, alertThreshold, autoStart}), 'utf-8');
  setAutoStart(autoStart);
}

function setAutoStart(enabled) {
  try {
    const startupDir = require('path').join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const batPath = require('path').join(startupDir, 'DeepSeek Monitor.bat');
    if (enabled) {
      const content = '@echo off\ncd /d "' + __dirname + '"\nstart /min npm start\nexit';
      require('fs').writeFileSync(batPath, content, 'utf-8');
    } else {
      if (require('fs').existsSync(batPath)) require('fs').unlinkSync(batPath);
    }
  } catch(e) { console.error('开机自启设置失败:', e.message); }
}

// ==================== 刷新 ====================
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => mainWindow?.webContents.send('refresh-balance'), refreshInterval * 1000);
}

// ==================== 通知 ====================
function checkAlert(b) {
  if (b > 0 && b <= alertThreshold) {
    try { new Notification({ title: 'DeepSeek 余额不足', body: `当前余额 ¥${b.toFixed(2)}，低于 ¥${alertThreshold} 提醒阈值` }).show(); } catch(e){}
  }
}

// ==================== 托盘 ====================
function updateTray(b, avail) {
  if (!tray || b === null) return;
  console.log('更新托盘: 余额=' + b + ' 阈值=' + alertThreshold + ' 比较=' + (b <= alertThreshold));
  const px = b <= alertThreshold
    ? makeTrayPixels(248, 113, 113)
    : makeTrayPixels(79, 107, 237);
  tray.setImage(nativeImage.createFromBuffer(px, {width:32, height:32}));
  tray.setToolTip(`DeepSeek\n余额 ¥${b.toFixed(2)}${avail ? '' : ' · 不可用'}`);
}

// ==================== CSV 导出 ====================
function exportCSV() {
  const h = loadH();
  if (h.length === 0) return null;
  let csv = '时间,余额\n';
  for (const r of h) csv += `${r.timestamp},${r.balance}\n`;
  const p = path.join(app.getPath('desktop'), `deepseek_balance_${Date.now()}.csv`);
  fs.writeFileSync(p, '\uFEFF' + csv, 'utf-8');
  return p;
}

// ==================== 窗口 ====================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 370, height: 420, resizable: false, frame: false, transparent: true,
    skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('blur', () => mainWindow.hide());
  mainWindow.on('close', e => {
    if (isQuitting) return; // 真正退出时放行
    e.preventDefault();
    mainWindow.hide();
  });
}
function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) { mainWindow.hide(); return; }
  const c = require('electron').screen.getCursorScreenPoint();
  const d = require('electron').screen.getDisplayNearestPoint(c);
  const b = mainWindow.getBounds();
  mainWindow.setPosition(d.workArea.x + d.workArea.width - b.width - 20, d.workArea.y + d.workArea.height - b.height - 160);
  mainWindow.show(); mainWindow.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createFromBuffer(makeTrayPixels(79, 107, 237), {width:32, height:32}));
  tray.setToolTip('DeepSeek Monitor');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示面板', click: toggleWindow },
    { type: 'separator' },
    { label: '刷新', click: () => mainWindow?.webContents.send('refresh-balance') },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', toggleWindow);
}

// ==================== IPC ====================
function setupIPC() {
  ipcMain.handle('get-settings', () => ({ apiKey, refreshInterval, alertThreshold, autoStart }));
  ipcMain.handle('save-settings', (_, k, i, t, s) => { saveSettings(k, i, t, s); startAutoRefresh(); return true; });

  ipcMain.handle('fetch-balance', async () => {
    try {
      const d = await fetchBalance();
      currentBalance = d.balance;
      const startB = ensureMonth(d.balance);
      record(d.balance);
      updateTray(d.balance, d.is_available);
      checkAlert(d.balance);
      const monthly = Math.max(0, parseFloat((startB - d.balance).toFixed(2)));
      const daily = calcDaily();
      return { success: true, data: { balance: d.balance, is_available: d.is_available, last_updated: d.last_updated, monthly_consumption: monthly, daily_consumption: daily } };
    } catch(e) {
      try { new Notification({ title: 'DeepSeek Monitor', body: e.message }).show(); } catch(ex){}
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-cached', () => {
    if (currentBalance === null) return null;
    return { balance: currentBalance, monthly_consumption: Math.max(0, parseFloat((ensureMonth(currentBalance) - currentBalance).toFixed(2))), daily_consumption: calcDaily() };
  });

  ipcMain.handle('open-recharge', () => shell.openExternal('https://platform.deepseek.com/usage'));
  ipcMain.handle('export-csv', () => exportCSV());
  ipcMain.handle('hide-window', () => mainWindow?.hide());
}

// ==================== 启动 ====================
app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createTray();
  setupIPC();
  startAutoRefresh();
  setAutoStart(autoStart);
  generateIconFile();
});
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', e => {
  if (!isQuitting) e.preventDefault();
});
