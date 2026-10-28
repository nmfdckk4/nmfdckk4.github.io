/**
 * 惠更斯原理與單狹縫繞射 - 數位黑板教學互動系統
 * 核心引擎：波動模擬、惠更斯次波包絡線、雙示範配對相消對照、視角縮放平移、黑板觸控板書
 */

// 物理狀態常數與參數
// =============================================================================
// 🎨 惠更斯波源與次波外觀配色配置 (若欲調整狹縫波源與次波圓環顏色，在此修改即可)
// =============================================================================
const HUYGENS_THEME = {
  sourceDotColor: '#ffffff',              // 狹縫中未選取點波源的核心微粒顏色 (純白)
  sourceHaloColor: 'rgba(255, 255, 255, 0.22)', // 狹縫點源周圍半透明外層光環顏色
  sourceGlowColor: 'rgba(255, 255, 255, 0.7)', // 狹縫波源的外圈光暈色彩
  waveletRingColor: 'rgba(255, 255, 255, ',    // 惠更斯同心次波圓環色彩 (純白)
};

const state = {
  // 物理參數 (內部比例單位)
  slitWidth: 60,       // a: 狹縫寬度 (像素/微米)
  wavelength: 12,      // λ: 波長 (像素/微米)
  numSources: 16,      // N: 惠更斯子波源數量
  thetaDeg: 0,         // θ: 觀測角度 (度)

  // 模擬動態控制
  isPlaying: true,
  wavePhase: 0,        // 當前相位 φ(t)
  waveSpeed: 0.18,     // 相位推進速度 rad/frame

  // 視覺圖層開關
  layers: {
    wavelets: true,    // 惠更斯同心子波圓環
    wavefield: true,   // 連續疊加波場
    rays: true,        // 觀測光線與光程差
    pairing: true,     // 暗紋配對輔助連線
    phasebars: true,   // 狹縫左側各點到達螢幕相位柱狀圖
    labels: true       // 所有標示文字徽章
  },

  // 柱狀圖模式: 'diff' (光程差/相對相位 ΔL/λ) | 'wave' (即時波動位移 cos φ)
  phaseBarMode: 'diff',
  hoveredBarIdx: -1,   // 滑鼠懸停柱狀圖條索引

  // 視角縮放與平移 (Zoom & Pan)
  zoom: 1.0,           // 縮放倍率 (0.7x ~ 3.5x)
  panX: 0,             // 水平偏移
  panY: 0,             // 垂直偏移
  isPanning: false,    // 是否正在滑鼠拖拉平移
  startPanX: 0,
  startPanY: 0,

  // 自由選點: 4 個槽位，每個槽位可勾選啟用並自由選擇點源索引
  freePoints: [
    { enabled: false, idx: 0, color: '#ea00ffff', label: '點 A' },
    { enabled: false, idx: 8, color: '#fb923c', label: '點 B' },
    { enabled: false, idx: 4, color: '#4ade80', label: '點 C' },
    { enabled: false, idx: 12, color: '#c084fc', label: '點 D' },
  ],
  selectedSlot: -1, // 目前鍵盤焦點的槽位 (-1=無)

  // 黑板畫筆標註狀態
  chalkMode: false,
  chalkColor: '#ffea00',
  isDrawing: false,
  lastX: 0,
  lastY: 0
};

// DOM 元素引用
const waveCanvas = document.getElementById('wave-canvas');
const waveCtx = waveCanvas.getContext('2d');
const drawingCanvas = document.getElementById('drawing-canvas');
const drawingCtx = drawingCanvas ? drawingCanvas.getContext('2d') : null;
const intensityCanvas = document.getElementById('intensity-canvas');
const intensityCtx = intensityCanvas.getContext('2d');
const scopeCanvas = document.getElementById('scope-canvas');
const scopeCtx = scopeCanvas ? scopeCanvas.getContext('2d') : null;
const scopeBadge = document.getElementById('scope-badge');
const scopeLegend = document.getElementById('scope-legend');
const simContainer = document.getElementById('sim-container');

// 指標 DOM
const valFirstMin = document.getElementById('val-first-min');
const valPathDiff = document.getElementById('val-path-diff');
const valInterference = document.getElementById('val-interference');
const pairingText = document.getElementById('pairing-text');

// 縮放控制項 DOM
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnFocusSlit = document.getElementById('btn-focus-slit');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const zoomLevelText = document.getElementById('zoom-level-text');
const btnPhasebarMode = document.getElementById('btn-phasebar-mode');

// 底部浮動橫幅 DOM
const bottomHudBanner = document.getElementById('bottom-hud-banner');
const bannerBadge = document.getElementById('banner-badge');
const bannerText = document.getElementById('banner-text');

// 自由選點: 由 JS 動態建立 DOM。舊配對様式已移除。

// 控制項 DOM
const btnPlayPause = document.getElementById('btn-play-pause');
const playIcon = document.getElementById('play-icon');
const playText = document.getElementById('play-text');
const btnStepPrev = document.getElementById('btn-step-prev');
const btnStepNext = document.getElementById('btn-step-next');
const btnReset = document.getElementById('btn-reset');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnChalkMode = document.getElementById('btn-chalk-mode');
const chalkToolbar = document.getElementById('chalk-toolbar');
const btnClearChalk = document.getElementById('btn-clear-chalk');
const btnCloseChalk = document.getElementById('btn-close-chalk');

// 滑桿 DOM
const sliderA = document.getElementById('slider-a');
const sliderLambda = document.getElementById('slider-lambda');
const sliderN = document.getElementById('slider-n');
const sliderTheta = document.getElementById('slider-theta');
const valA = document.getElementById('val-a');
const valLambda = document.getElementById('val-lambda');
const valN = document.getElementById('val-n');
const valTheta = document.getElementById('val-theta');

// 離線波場計算低解析緩衝畫布 (保證 60FPS 流暢渲染)
const bufferCanvas = document.createElement('canvas');
const bufferCtx = bufferCanvas.getContext('2d');
const BUFFER_W = 300;
const BUFFER_H = 180;
bufferCanvas.width = BUFFER_W;
bufferCanvas.height = BUFFER_H;
let bufferImageData = bufferCtx.createImageData(BUFFER_W, BUFFER_H);

// 尺寸自適應調整
function resizeCanvases() {
  const rect = simContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  waveCanvas.width = rect.width * dpr;
  waveCanvas.height = rect.height * dpr;
  waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 保持手繪畫布內容 (若存在)
  if (drawingCanvas && drawingCtx) {
    const tempDraw = document.createElement('canvas');
    tempDraw.width = drawingCanvas.width;
    tempDraw.height = drawingCanvas.height;
    const tempCtx = tempDraw.getContext('2d');
    tempCtx.drawImage(drawingCanvas, 0, 0);

    drawingCanvas.width = rect.width * dpr;
    drawingCanvas.height = rect.height * dpr;
    drawingCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawingCtx.drawImage(tempDraw, 0, 0, rect.width, rect.height);
  }

  // 右側光強畫布
  const intRect = intensityCanvas.parentElement.getBoundingClientRect();
  intensityCanvas.width = intRect.width * dpr;
  intensityCanvas.height = intRect.height * dpr;
  intensityCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 示波器畫布 (130px 高度)
  if (scopeCanvas && scopeCtx) {
    const scopeRect = scopeCanvas.parentElement.getBoundingClientRect();
    const targetW = Math.max(120, scopeRect.width - 28);
    scopeCanvas.width = targetW * dpr;
    scopeCanvas.height = 200 * dpr;
    scopeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

window.addEventListener('resize', () => {
  resizeCanvases();
  renderScreenDisplays();
});

/**
 * 黑板防遮擋文字徽章繪製工具 (專為解決文字與射線/波線交叉重疊問題設計)
 */
function drawTextBadge(ctx, text, x, y, options = {}) {
  const {
    textColor = '#ffffff',
    bgColor = 'rgba(11, 17, 32, 0.95)',
    borderColor = 'rgba(255, 255, 255, 0.4)',
    borderWidth = 1.8,
    font = 'bold 14px "Noto Sans TC", "JetBrains Mono", sans-serif',
    paddingX = 10,
    paddingY = 5,
    borderRadius = 6,
    align = 'center', // 'left', 'center', 'right'
    baseline = 'middle'
  } = options;

  ctx.save();
  ctx.shadowBlur = 0; // 重設光暈，確保文字無光暈暈開
  ctx.font = font;
  ctx.textBaseline = baseline;
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const badgeW = textW + paddingX * 2;
  const badgeH = 26;

  let badgeX = x;
  if (align === 'center') badgeX = x - badgeW * 0.5;
  else if (align === 'right') badgeX = x - badgeW;

  const badgeY = y - badgeH * 0.5;

  // 1. 底色遮罩 (完全覆蓋底層線條，杜絕任何文字與射線交叉重疊)
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, borderRadius);
  ctx.fill();

  // 2. 彩色識別外框
  if (borderWidth > 0 && borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, borderRadius);
    ctx.stroke();
  }

  // 3. 文字內容 (極度清晰高對比)
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.fillText(text, badgeX + paddingX, y);
  ctx.restore();
}

/**
 * 物理計算輔助函數
 */
function getSlitGeometry(w, h) {
  const slitX = w * 0.22;
  const centerY = h * 0.5;
  const halfA = state.slitWidth * 0.5;
  const slitTop = centerY - halfA;
  const slitBottom = centerY + halfA;

  // 計算 N 個惠更斯子波點源位置
  const sources = [];
  const N = state.numSources;
  for (let i = 0; i < N; i++) {
    const y = slitTop + (state.slitWidth / N) * (i + 0.5);
    sources.push({ x: slitX, y: y, index: i });
  }

  const halfN = Math.floor(N / 2);

  // 示範配對 1: 頂端點 (0) ↔ 中間對應點 (halfN)，內部間距 a/2
  const pair1 = {
    top: sources[0],
    bot: sources[halfN]
  };

  // 示範配對 2: 使用 freePoints[1] 索引當作配對 2 的參考點位置
  const p2TopIdx = Math.max(1, Math.min(Math.max(1, halfN - 1), (state.freePoints && state.freePoints[1] ? state.freePoints[1].idx : 4)));
  const p2BotIdx = p2TopIdx + halfN;
  const pair2 = {
    top: sources[Math.min(p2TopIdx, sources.length - 1)],
    bot: sources[Math.min(p2BotIdx, sources.length - 1)]
  };

  return { slitX, centerY, slitTop, slitBottom, sources, halfN, pair1, pair2 };
}

/**
 * 計算波場強度 (ImageData 像素緩衝)
 */
function computeWavefieldBuffer(w, h, geom) {
  const data = bufferImageData.data;
  const scaleX = w / BUFFER_W;
  const scaleY = h / BUFFER_H;
  const slitBufX = geom.slitX / scaleX;
  const centerY = geom.centerY;
  const k = (2 * Math.PI) / state.wavelength;
  const phase = state.wavePhase;
  const sources = geom.sources;
  const N = sources.length;

  let ptr = 0;
  for (let by = 0; by < BUFFER_H; by++) {
    const worldY = by * scaleY;

    for (let bx = 0; bx < BUFFER_W; bx++) {
      const worldX = bx * scaleX;
      let amp = 0;

      if (bx < slitBufX) {
        // 左側入射區：柔和黯淡的平面波朝狹縫傳播 (振幅 0.14，保持深色背景以清晰突顯左側標籤)
        const distToSlit = geom.slitX - worldX;
        amp = Math.cos(k * distToSlit + phase) * 0.14;
      } else {
        // 狹縫右側：惠更斯次波疊加
        let sum = 0;
        for (let s = 0; s < N; s++) {
          const src = sources[s];
          const dx = worldX - src.x;
          const dy = worldY - src.y;
          const dist = Math.hypot(dx, dy);
          const atten = 1 / Math.sqrt(Math.max(dist, 10) * 0.04 + 1);
          sum += Math.cos(k * dist - phase) * atten;
        }
        amp = sum / Math.sqrt(N);
      }

      // 色彩映射：青色亮紋 (波峰) / 深藍暗紋 / 紫藍相間 (波谷)
      let r = 11, g = 17, b = 32, a = 255;
      if (amp > 0) {
        const t = Math.min(amp, 1.2) / 1.2;
        r = Math.floor(11 + t * (0 - 11));
        g = Math.floor(17 + t * (242 - 17));
        b = Math.floor(32 + t * (254 - 32));
      } else {
        const t = Math.min(-amp, 1.2) / 1.2;
        r = Math.floor(11 + t * (168 - 11));
        g = Math.floor(17 + t * (85 - 17));
        b = Math.floor(32 + t * (247 - 32));
      }

      data[ptr++] = r;
      data[ptr++] = g;
      data[ptr++] = b;
      data[ptr++] = a;
    }
  }

  bufferCtx.putImageData(bufferImageData, 0, 0);
}

/**
 * 繪製主波動畫布 (支援視角縮放與滑鼠拖拉平移)
 */
function drawWaveScene() {
  const rect = simContainer.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const geom = getSlitGeometry(w, h);

  waveCtx.clearRect(0, 0, w, h);

  // 進入縮放與平移視角
  waveCtx.save();
  waveCtx.translate(state.panX, state.panY);
  waveCtx.scale(state.zoom, state.zoom);

  // 1. 繪製總疊加波場
  if (state.layers.wavefield) {
    computeWavefieldBuffer(w, h, geom);
    waveCtx.save();
    waveCtx.imageSmoothingEnabled = true;
    waveCtx.imageSmoothingQuality = 'medium';
    waveCtx.drawImage(bufferCanvas, 0, 0, w, h);
    waveCtx.restore();
  } else {
    waveCtx.fillStyle = '#090e1a';
    waveCtx.fillRect(0, 0, w, h);
  }

  // 2. 繪製入射平面波波前輔助線 (柔和黯淡色調，朝向狹縫傳播，突顯左側文字標示)
  waveCtx.save();
  const wl = state.wavelength;
  const phaseCycle = ((state.wavePhase / (2 * Math.PI)) % 1 + 1) % 1;
  const maxPlanes = Math.ceil(geom.slitX / wl) + 2;

  for (let i = 0; i < maxPlanes; i++) {
    // 每個波峰距離狹縫的距離隨時間推進而減少 (往狹縫靠近)
    const distToSlit = (1 - phaseCycle + i) * wl;
    const waveX = geom.slitX - distToSlit;
    if (waveX >= -10 && waveX <= geom.slitX) {
      waveCtx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      waveCtx.lineWidth = 1.6;
      waveCtx.beginPath();
      waveCtx.moveTo(waveX, 0);
      waveCtx.lineTo(waveX, h);
      waveCtx.stroke();
    }
  }

  // 靜態向右箭頭 (固定於每隔一個波長處，不隨相位閃爍)
  waveCtx.fillStyle = 'rgba(56, 189, 248, 0.45)';
  const arrowSpacing = wl * 2;
  const numArrows = Math.floor(geom.slitX / arrowSpacing);
  for (let ai = 0; ai < numArrows; ai++) {
    const arrowX = arrowSpacing * (ai + 0.5);
    [geom.centerY - 85, geom.centerY + 85].forEach(arrowY => {
      waveCtx.beginPath();
      waveCtx.moveTo(arrowX + 10, arrowY);
      waveCtx.lineTo(arrowX + 2, arrowY - 5);
      waveCtx.lineTo(arrowX + 2, arrowY + 5);
      waveCtx.closePath();
      waveCtx.fill();
    });
  }
  waveCtx.restore();

  // 3. 繪製惠更斯同心圓次波 (Wavelet Rings - 近場平滑向外擴展，消除莫爾條紋反向錯覺)
  if (state.layers.wavelets) {
    waveCtx.save();
    const ringSpacing = state.wavelength;
    const phaseProgress = ((state.wavePhase / (2 * Math.PI)) % 1 + 1) % 1;
    // 次波圓環主要展示狹縫近場波前包絡形成原理，向外平滑衰減 (半徑約 240px 內展示近場)
    const maxWaveletR = Math.min(240, w - geom.slitX);
    const numRings = Math.ceil(maxWaveletR / ringSpacing) + 1;

    waveCtx.beginPath();
    waveCtx.rect(geom.slitX, 0, w - geom.slitX, h);
    waveCtx.clip();

    geom.sources.forEach((src, idx) => {
      // 狹縫子波統一顏色 (不再區分上下半部)
      const ringColor = HUYGENS_THEME.waveletRingColor;

      for (let rIdx = 0; rIdx < numRings; rIdx++) {
        // 半徑嚴格單調向外擴張，絕無反向跳動或回繞斷裂
        const radius = (rIdx + phaseProgress) * ringSpacing;
        if (radius < 2 || radius > maxWaveletR) continue;

        // 近場清晰，隨半徑向外自然衰減進入連續波場
        const alpha = Math.max(0, 0.42 * (1 - radius / maxWaveletR));
        if (alpha <= 0.01) continue;

        waveCtx.beginPath();
        waveCtx.strokeStyle = ringColor + alpha + ')';
        waveCtx.lineWidth = 1.3;
        waveCtx.arc(src.x, src.y, radius, -Math.PI / 2, Math.PI / 2);
        waveCtx.stroke();
      }
    });
    waveCtx.restore();
  }

  // 4. 繪製觀測光線、等相位面與角度旋轉把手
  if (state.layers.rays) {
    drawRaysAndPathDiff(geom, w, h);
  }

  // 4.5 繪製暗紋幾何配對相消連線 (當所勾選的點恰發生相消干涉時才標示)
  if (state.layers.pairing) {
    drawPairingLines(geom);
  }

  // 5. 繪製不透明遮光擋板 (Slit Wall)
  drawSlitBarrier(geom, w, h);

  // 5.5 繪製狹縫左方各點到達螢幕相位柱狀圖 (在擋板之後繪製，確保永不被擋板壓在下面)
  if (state.layers.phasebars) {
    drawPhaseBarChart(geom, w, h);
  }

  // 6. 繪製惠更斯點波源 (清晰避碰徽章，勾選點標示 A、B、C、D)
  drawHuygensSources(geom);

  // 離開縮放平移視角
  waveCtx.restore();

  // 更新 HUD 標籤位置
  updateSlitHud(geom);
}

/**
 * 更新自由選點狀態德章列 (取代滑桿面板)
 * 顯示已選 A/B/C/D 點，點擊切換鍵盤焦點，再次點擊德章即可取消
 */
function buildFreePointsStatus() {
  const statusEl = document.getElementById('free-points-status');
  if (!statusEl) return;
  statusEl.innerHTML = '';

  const enabledAny = state.freePoints.some(function (fp) { return fp.enabled; });
  if (!enabledAny) {
    const empty = document.createElement('span');
    empty.className = 'fp-status-empty';
    empty.textContent = '還未選取任何波源點，請點擊左側狹縫中的白色光點';
    statusEl.appendChild(empty);
    return;
  }

  state.freePoints.forEach(function (fp, slotIdx) {
    if (!fp.enabled) return;
    const badge = document.createElement('div');
    badge.className = 'fp-status-badge' + (state.selectedSlot === slotIdx ? ' fp-selected-active' : '');
    badge.style.setProperty('--fp-color', fp.color);
    badge.title = '點擊切換鍵盤焦點；再次點擊取消選取';

    const dot = document.createElement('span');
    dot.className = 'fp-status-dot';
    dot.style.background = fp.color;
    dot.style.boxShadow = '0 0 6px ' + fp.color;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = fp.label.replace('點 ', '') + ' #' + fp.idx;

    const delBtn = document.createElement('span');
    delBtn.className = 'fp-status-del';
    delBtn.textContent = '×';
    delBtn.title = '取消此點';

    badge.appendChild(dot);
    badge.appendChild(labelSpan);
    badge.appendChild(delBtn);
    statusEl.appendChild(badge);

    badge.addEventListener('click', function (e) {
      if (e.target === delBtn) return;
      state.selectedSlot = (state.selectedSlot === slotIdx) ? -1 : slotIdx;
      buildFreePointsStatus();
    });

    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      fp.enabled = false;
      if (state.selectedSlot === slotIdx) state.selectedSlot = -1;
      buildFreePointsStatus();
      renderSuperpositionScope();
    });
  });
}

/**
 * N 變化後更新自由選點索引範圍
 */
function updateFreePointsAfterNChange() {
  const N = state.numSources;
  state.freePoints.forEach(function (fp) {
    fp.idx = Math.max(0, Math.min(N - 1, fp.idx));
  });
  buildFreePointsStatus();
}

/**
 * 繪製不透明狹縫擋板 (大字體標註)
 */
function drawSlitBarrier(geom, w, h) {
  const wallWidth = 14;

  waveCtx.save();
  const wallGrad = waveCtx.createLinearGradient(geom.slitX - wallWidth / 2, 0, geom.slitX + wallWidth / 2, 0);
  wallGrad.addColorStop(0, '#334155');
  wallGrad.addColorStop(0.5, '#64748b');
  wallGrad.addColorStop(1, '#1e293b');

  waveCtx.fillStyle = wallGrad;
  waveCtx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  waveCtx.shadowBlur = 10;

  // 上擋板
  waveCtx.fillRect(geom.slitX - wallWidth / 2, -h * 2, wallWidth, geom.slitTop + h * 2);
  // 下擋板
  waveCtx.fillRect(geom.slitX - wallWidth / 2, geom.slitBottom, wallWidth, h * 3);

  // 狹縫邊緣發光線
  waveCtx.strokeStyle = '#38bdf8';
  waveCtx.lineWidth = 2.5;
  waveCtx.beginPath();
  waveCtx.moveTo(geom.slitX - wallWidth / 2, geom.slitTop);
  waveCtx.lineTo(geom.slitX + wallWidth / 2, geom.slitTop);
  waveCtx.moveTo(geom.slitX - wallWidth / 2, geom.slitBottom);
  waveCtx.lineTo(geom.slitX + wallWidth / 2, geom.slitBottom);
  waveCtx.stroke();

  waveCtx.restore();
}

/**
 * 繪製狹縫中的惠更斯點波源 (清晰避碰徽章，①、②、①'、②' 不重疊)
 */
function drawHuygensSources(geom) {
  waveCtx.save();
  const halfN = geom.halfN;
  const N = geom.sources.length;

  // 整理已勾選的點源與其槽位 (A, B, C, D)
  const enabledMap = new Map();
  state.freePoints.forEach((fp, slotIdx) => {
    if (fp.enabled) {
      const clampedIdx = Math.max(0, Math.min(N - 1, fp.idx));
      enabledMap.set(clampedIdx, { fp, slotIdx });
    }
  });

  // 左側呼出標籤繪製器 (引線 + 高對比黑底彩框徽章 + 清楚亮白文字)
  function drawLeftCallout(fromX, fromY, col, label, fillColor, lineColor, badgeW) {
    const ly = fromY;
    waveCtx.save();
    waveCtx.shadowBlur = 0;

    // 1. 引線 (從點源往左拉到標籤)
    waveCtx.strokeStyle = lineColor;
    waveCtx.lineWidth = 1.6;
    waveCtx.setLineDash([3, 3]);
    waveCtx.beginPath();
    waveCtx.moveTo(fromX - 8, ly);
    waveCtx.lineTo(col + badgeW + 3, ly);
    waveCtx.stroke();
    waveCtx.setLineDash([]);

    // 2. 徽章背景
    waveCtx.fillStyle = 'rgba(11, 17, 32, 0.95)';
    waveCtx.beginPath();
    waveCtx.roundRect(col, ly - 13, badgeW, 26, 6);
    waveCtx.fill();

    // 3. 徽章彩色外框
    waveCtx.strokeStyle = fillColor;
    waveCtx.lineWidth = 2.2;
    waveCtx.beginPath();
    waveCtx.roundRect(col, ly - 13, badgeW, 26, 6);
    waveCtx.stroke();

    // 4. 徽章內部文字 (標示 A、B、C、D)
    waveCtx.fillStyle = '#ffffff';
    waveCtx.font = 'bold 16px "Noto Sans TC", "JetBrains Mono", Arial, sans-serif';
    waveCtx.textAlign = 'center';
    waveCtx.textBaseline = 'middle';
    waveCtx.fillText(label, col + badgeW * 0.5, ly);

    waveCtx.restore();
  }

  const spacing = state.slitWidth / Math.max(1, N);

  geom.sources.forEach((src, idx) => {
    const isSelected = enabledMap.has(idx);
    let dotColor = HUYGENS_THEME.sourceDotColor;
    let slotIdx = 0;
    let label = '';

    if (isSelected) {
      const info = enabledMap.get(idx);
      dotColor = info.fp.color;
      slotIdx = info.slotIdx;
      label = info.fp.label;

      // 已勾選重點波源 (A, B, C, D)：半透明外層 + 鮮豔實心光暈 + 純白內核，層次分明
      // 1. 半透明外層擴展圈
      waveCtx.beginPath();
      waveCtx.arc(src.x, src.y, 8, 0, Math.PI * 2);
      waveCtx.fillStyle = dotColor + '40';
      waveCtx.shadowBlur = 0;
      waveCtx.fill();

      // 2. 實心主點 + 強光暈
      waveCtx.beginPath();
      waveCtx.arc(src.x, src.y, 5.5, 0, Math.PI * 2);
      waveCtx.fillStyle = dotColor;
      waveCtx.shadowColor = dotColor;
      waveCtx.shadowBlur = 14;
      waveCtx.fill();

      // 3. 內核純白焦點
      waveCtx.beginPath();
      waveCtx.arc(src.x, src.y, 2.2, 0, Math.PI * 2);
      waveCtx.fillStyle = '#ffffff';
      waveCtx.shadowBlur = 0;
      waveCtx.fill();

      // 4. 勾選點呼出標籤 (A, B, C, D) 標註於狹縫左側 (若相位柱狀圖開啟，則直接整合於柱狀圖內以避免重疊)
      if (state.layers.labels && !state.layers.phasebars) {
        const col = geom.slitX - 52 - (slotIdx % 2) * 40;
        drawLeftCallout(src.x, src.y, col, label, dotColor, dotColor, 32);
      }
    } else {
      // 未勾選的普通點波源：較小實心核心 + 半透明外層 (折衷清晰度與波前連續感)
      // 依點距動態自適應核心半徑，即使 N=32 
      // 極多時也不會沾黏成整條白塊
      const coreR = Math.max(1.1, Math.min(2.0, spacing * 0.25));
      const haloR = Math.max(2.6, Math.min(5.5, spacing * 0.65));

      // 1. 半透明外層 (形成連續次波前光環，重疊時柔和相融)
      waveCtx.beginPath();
      waveCtx.arc(src.x, src.y, haloR, 0, Math.PI * 2);
      waveCtx.fillStyle = HUYGENS_THEME.sourceHaloColor || 'rgba(255, 255, 255, 0.22)';
      waveCtx.shadowBlur = 0;
      waveCtx.fill();

      // 2. 實心核心精微小白點 (高對比不重疊，顆顆分明)
      waveCtx.beginPath();
      waveCtx.arc(src.x, src.y, coreR, 0, Math.PI * 2);
      waveCtx.fillStyle = HUYGENS_THEME.sourceDotColor;
      waveCtx.shadowColor = HUYGENS_THEME.sourceDotColor;
      waveCtx.shadowBlur = 2.5;
      waveCtx.fill();
      waveCtx.shadowBlur = 0;
    }
  });

  // 鍵盤焦點選取的槽位：加畫搜動外圈指示環
  if (state.selectedSlot >= 0) {
    const selFp = state.freePoints[state.selectedSlot];
    if (selFp && selFp.enabled) {
      const selIdx = Math.max(0, Math.min(N - 1, selFp.idx));
      const selSrc = geom.sources[selIdx];
      const pulse = 0.5 + 0.5 * Math.sin(state.wavePhase * 2.5);
      waveCtx.save();
      waveCtx.beginPath();
      waveCtx.arc(selSrc.x, selSrc.y, 12 + pulse * 4, 0, Math.PI * 2);
      waveCtx.strokeStyle = selFp.color;
      waveCtx.lineWidth = 2.5;
      waveCtx.globalAlpha = 0.65 + pulse * 0.35;
      waveCtx.shadowColor = selFp.color;
      waveCtx.shadowBlur = 16;
      waveCtx.stroke();
      waveCtx.restore();
    }
  }

  waveCtx.restore();
}

/**
 * 繪製觀測光線、等相位面與角度旋轉把手 (防重疊安全佈局)
 */
function drawRaysAndPathDiff(geom, w, h) {
  const thetaRad = (state.thetaDeg * Math.PI) / 180;
  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);
  const rayLen = Math.min(w * 0.65, 480);

  waveCtx.save();

  // 0. 水平中央基準軸線 (θ = 0° 光軸基準線，以便一眼看清觀測角 θ 所夾角度)
  const axisLen = Math.min(w * 0.72, 540);
  waveCtx.save();
  waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  waveCtx.lineWidth = 1.8;
  waveCtx.setLineDash([8, 5]);
  waveCtx.beginPath();
  waveCtx.moveTo(geom.slitX, geom.centerY);
  waveCtx.lineTo(geom.slitX + axisLen, geom.centerY);
  waveCtx.stroke();
  waveCtx.setLineDash([]);

  // 中央軸線頂端白點
  waveCtx.beginPath();
  waveCtx.arc(geom.slitX, geom.centerY, 4, 0, Math.PI * 2);
  waveCtx.fillStyle = '#ffffff';
  waveCtx.fill();

  // 光軸標籤 (高對比膠囊徽章，杜絕與任何射線重疊)
  if (state.layers.labels) {
    drawTextBadge(waveCtx, '水平中央軸線 (θ = 0°)', geom.slitX + axisLen + 8, geom.centerY, {
      textColor: 'rgba(255, 255, 255, 0.92)',
      borderColor: 'rgba(255, 255, 255, 0.4)',
      bgColor: 'rgba(11, 17, 32, 0.92)',
      font: 'bold 12px "Noto Sans TC", sans-serif',
      align: 'left'
    });
  }
  waveCtx.restore();

  // 1. 各點源沿角度 θ 射出的光線束 (輕柔背景線)
  geom.sources.forEach((src, idx) => {
    const isEdge = idx === 0 || idx === geom.sources.length - 1;
    waveCtx.strokeStyle = isEdge ? 'rgba(250, 204, 21, 0.75)' : 'rgba(250, 204, 21, 0.14)';
    waveCtx.lineWidth = isEdge ? 2 : 1;
    waveCtx.setLineDash(isEdge ? [] : [4, 4]);

    waveCtx.beginPath();
    waveCtx.moveTo(src.x, src.y);
    waveCtx.lineTo(src.x + rayLen * cosT, src.y + rayLen * sinT);
    waveCtx.stroke();
  });
  waveCtx.setLineDash([]);

  // 4. 觀測角度旋轉把手座標計算 (先算把手位置，供總光程差防撞檢測)
  const handleR = Math.min(320, rayLen * 0.85);
  const handleX = geom.slitX + handleR * cosT;
  const handleY = geom.centerY + handleR * sinT;

  // 2. 狹縫上下兩端總光程差 (ΔL = a sinθ)
  // 幾何原理 (正確認定落後光線與領先光線)：
  // 當 θ >= 0 時 (光線朝右下射出)，底端光線 (botSrc) 在傳播方向上位居領先，頂端光線 (topSrc) 落後需多走 a·sinθ 光程。
  //   因此：波前垂線從領先的 botSrc 連到頂端光線上；額外光程差高亮段位於頂端光線 (topSrc) 上！
  // 當 θ < 0 時 (光線朝右上射出)，頂端光線 (topSrc) 在傳播方向上位居領先，底端光線 (botSrc) 落後需多走 a·|sinθ| 光程。
  //   因此：波前垂線從領先的 topSrc 連到底端光線上；額外光程差高亮段位於底端光線 (botSrc) 上！
  const topSrc = geom.sources[0];
  const botSrc = geom.sources[geom.sources.length - 1];
  const lagSrc = thetaRad >= 0 ? topSrc : botSrc;   // 需多走光程的光線 (落後波)
  const leadSrc = thetaRad >= 0 ? botSrc : topSrc;  // 較早到達的波前基準點 (領先波)
  const pathDiff = Math.abs(state.slitWidth * sinT);

  // 垂足坐標 (位於落後光線上)
  const footX = lagSrc.x + pathDiff * cosT;
  const footY = lagSrc.y + pathDiff * sinT;

  // 等相位波前垂線 (青綠色)：從領先光線起點 leadSrc 垂直連到落後光線垂足
  waveCtx.strokeStyle = '#4ade80';
  waveCtx.lineWidth = 2.5;
  waveCtx.beginPath();
  waveCtx.moveTo(leadSrc.x, leadSrc.y);
  waveCtx.lineTo(footX, footY);
  waveCtx.stroke();

  // 高亮總光程差區段 (粉紅粗線)：在落後光線上，從 lagSrc 延伸至垂足
  if (Math.abs(state.thetaDeg) > 1.5) {
    waveCtx.strokeStyle = '#f43f5e';
    waveCtx.lineWidth = 4;
    waveCtx.beginPath();
    waveCtx.moveTo(lagSrc.x, lagSrc.y);
    waveCtx.lineTo(footX, footY);
    waveCtx.stroke();

    // 總光程差標籤：置於光束外側安全區
    const midDiffX = lagSrc.x + (pathDiff * cosT) * 0.5;
    const midDiffY = lagSrc.y + (pathDiff * sinT) * 0.5;
    let badgeX = midDiffX + 24;
    // 當 θ >= 0 時落後光線為 topSrc (頂端)，標籤朝上方外側 (-38)；當 θ < 0 時為 botSrc (底端)，標籤朝下方外側 (+38)
    let badgeY = midDiffY + (thetaRad >= 0 ? -38 : 38);

    // 防重疊檢測：若與「⟲ 調角度」把手顯示框接近，加大垂直避讓
    if (Math.abs(badgeX - handleX) < 190 && Math.abs(badgeY - handleY) < 55) {
      badgeY = midDiffY + (thetaRad >= 0 ? -68 : 68);
    }

    if (state.layers.labels) {
      waveCtx.save();
      waveCtx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
      waveCtx.lineWidth = 1.4;
      waveCtx.setLineDash([3, 3]);
      waveCtx.beginPath();
      waveCtx.moveTo(midDiffX, midDiffY);
      waveCtx.lineTo(badgeX, badgeY);
      waveCtx.stroke();
      waveCtx.setLineDash([]);
      waveCtx.restore();

      const diffLambda = (pathDiff / state.wavelength).toFixed(2);
      drawTextBadge(waveCtx, `最大光程差 ΔL = a·sinθ (${diffLambda} λ)`, badgeX, badgeY, {
        textColor: '#fda4af',
        borderColor: '#f43f5e',
        borderWidth: 2,
        bgColor: 'rgba(11, 17, 32, 0.95)',
        font: 'bold 14px "JetBrains Mono", "Noto Sans TC", sans-serif',
        align: 'left'
      });

      // 記錄總光程差標籤位置，提供相消配對標籤進行防碰撞避讓
      state.lastPathDiffBadge = { x: badgeX, y: badgeY, w: 230, h: 32 };
    }
  }

  // 3. 繪製角度 θ 圓弧標記與標籤 (防重疊膠囊徽章)
  if (Math.abs(state.thetaDeg) > 0.5) {
    const arcRadius = 75;
    waveCtx.strokeStyle = '#facc15';
    waveCtx.lineWidth = 2.4;
    waveCtx.beginPath();
    waveCtx.arc(geom.slitX, geom.centerY, arcRadius, 0, thetaRad, thetaRad < 0);
    waveCtx.stroke();

    if (state.layers.labels) {
      const labelAngle = thetaRad * 0.5;
      const labelR = arcRadius + 28;
      const badgeX = geom.slitX + labelR * Math.cos(labelAngle);
      const badgeY = geom.centerY + labelR * Math.sin(labelAngle);

      drawTextBadge(waveCtx, `θ = ${state.thetaDeg.toFixed(1)}°`, badgeX, badgeY, {
        textColor: '#facc15',
        borderColor: '#facc15',
        borderWidth: 2,
        bgColor: 'rgba(11, 17, 32, 0.95)',
        font: 'bold 15px "Noto Sans TC", "JetBrains Mono", sans-serif',
        align: 'left'
      });
    }
  }

  // 4. 繪製觀測角度旋轉把手
  waveCtx.beginPath();
  waveCtx.arc(handleX, handleY, 9, 0, Math.PI * 2);
  waveCtx.fillStyle = '#facc15';
  waveCtx.shadowColor = '#facc15';
  waveCtx.shadowBlur = 12;
  waveCtx.fill();

  waveCtx.strokeStyle = '#ffffff';
  waveCtx.lineWidth = 2.5;
  waveCtx.stroke();

  if (state.layers.labels) {
    drawTextBadge(waveCtx, '⟲ 調角度', handleX + 16, handleY, {
      textColor: '#facc15',
      borderColor: '#facc15',
      borderWidth: 1.5,
      bgColor: 'rgba(11, 17, 32, 0.92)',
      font: 'bold 13px "Noto Sans TC", sans-serif',
      align: 'left'
    });
  }

  waveCtx.restore();
}

/**
 * 繪製暗紋幾何配對分析 (僅在所勾選點恰發生相消干涉時才標示配對)
 */
function drawPairingLines(geom) {
  if (!state.layers.pairing) return;
  const thetaRad = (state.thetaDeg * Math.PI) / 180;
  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);
  if (Math.abs(sinT) < 1e-4) return;

  const enabled = state.freePoints.filter(fp => fp.enabled);
  if (enabled.length < 2) return;

  // 尋找所勾選點對中，是否有任一對恰好發生相消干涉 (光程差為 λ/2, 3λ/2...)
  let bestPair = null;
  let minDiffFromHalf = 999;

  for (let i = 0; i < enabled.length; i++) {
    for (let j = i + 1; j < enabled.length; j++) {
      const pA = enabled[i];
      const pB = enabled[j];
      const srcA = geom.sources[Math.max(0, Math.min(geom.sources.length - 1, pA.idx))];
      const srcB = geom.sources[Math.max(0, Math.min(geom.sources.length - 1, pB.idx))];
      const dy = Math.abs(srcB.y - srcA.y);
      if (dy < 1) continue;
      const dl = dy * Math.abs(sinT);
      const dlLambda = dl / state.wavelength;
      const mHalf = Math.floor(dlLambda) + 0.5;
      const diffFromHalf = Math.abs(dlLambda - mHalf);
      if (diffFromHalf < 0.12 && dl > 0.05 * state.wavelength) {
        if (diffFromHalf < minDiffFromHalf) {
          minDiffFromHalf = diffFromHalf;
          bestPair = { pA, pB, srcA, srcB, dy, dl, dlLambda };
        }
      }
    }
  }

  // 若目前沒有任何勾選點對發生相消干涉，則不干擾畫面
  if (!bestPair) return;

  const { pA, pB, srcA, srcB, dl, dlLambda } = bestPair;
  waveCtx.save();

  const pairRayLen = 260;
  const topSrc = srcA.y < srcB.y ? srcA : srcB;
  const botSrc = srcA.y < srcB.y ? srcB : srcA;
  // 同理：θ >= 0 時頂端光線 (topSrc) 需多走額外光程；θ < 0 時底端光線 (botSrc) 需多走額外光程
  const lagSrc = thetaRad >= 0 ? topSrc : botSrc;
  const leadSrc = thetaRad >= 0 ? botSrc : topSrc;

  // 垂足坐標 (位於落後光線上)
  const footX = lagSrc.x + dl * cosT;
  const footY = lagSrc.y + dl * sinT;

  // 1. 繪製相消配對兩條射線
  waveCtx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
  waveCtx.lineWidth = 2.2;
  waveCtx.setLineDash([5, 3]);
  waveCtx.beginPath();
  waveCtx.moveTo(srcA.x, srcA.y);
  waveCtx.lineTo(srcA.x + pairRayLen * cosT, srcA.y + pairRayLen * sinT);
  waveCtx.moveTo(srcB.x, srcB.y);
  waveCtx.lineTo(srcB.x + pairRayLen * cosT, srcB.y + pairRayLen * sinT);
  waveCtx.stroke();
  waveCtx.setLineDash([]);

  // 2. 等相位波前垂線 (綠色)：從領先光線起點 leadSrc 連到落後光線上的垂足
  waveCtx.strokeStyle = '#4ade80';
  waveCtx.lineWidth = 2;
  waveCtx.beginPath();
  waveCtx.moveTo(leadSrc.x, leadSrc.y);
  waveCtx.lineTo(footX, footY);
  waveCtx.stroke();

  // 3. 高亮配對光程差段 (粉紅粗線)：在落後光線上，從 lagSrc 連到垂足
  waveCtx.strokeStyle = '#f43f5e';
  waveCtx.lineWidth = 4;
  waveCtx.beginPath();
  waveCtx.moveTo(lagSrc.x, lagSrc.y);
  waveCtx.lineTo(footX, footY);
  waveCtx.stroke();

  if (state.layers.labels) {
    const midX = lagSrc.x + (dl * cosT) * 0.5;
    const midY = lagSrc.y + (dl * sinT) * 0.5;
    let badgeX = midX + 24;
    // 配對標籤朝向兩射線之間 (內側) 展開，自然與朝外側的總光程差標籤錯開！
    let badgeY = midY + (thetaRad >= 0 ? 32 : -32);

    // 主動防碰撞檢查：如果與「總光程差標籤」在畫面上有任何重疊風險，主動往反方向安全推開
    if (state.lastPathDiffBadge) {
      const pd = state.lastPathDiffBadge;
      if (Math.abs(badgeX - pd.x) < 220 && Math.abs(badgeY - pd.y) < 44) {
        badgeY = (thetaRad >= 0) ? pd.y + 48 : pd.y - 48;
      }
    }

    waveCtx.save();
    waveCtx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
    waveCtx.lineWidth = 1.2;
    waveCtx.setLineDash([3, 3]);
    waveCtx.beginPath();
    waveCtx.moveTo(midX, midY);
    waveCtx.lineTo(badgeX, badgeY);
    waveCtx.stroke();
    waveCtx.restore();

    drawTextBadge(waveCtx, `相消配對: ${pA.label} ↔ ${pB.label} (ΔL = ${dlLambda.toFixed(2)} λ)`, badgeX, badgeY, {
      textColor: '#fda4af',
      borderColor: '#f43f5e',
      borderWidth: 2,
      bgColor: 'rgba(11, 17, 32, 0.95)',
      font: 'bold 13px "Noto Sans TC", "JetBrains Mono", sans-serif',
      align: 'left'
    });
  }

  waveCtx.restore();
}

/**
 * 繪製狹縫左方各點到達螢幕相位柱狀圖 (橫向柱狀圖)
 * 直觀呈現各子波點源到達遠方屏幕時的相位與光程差，以及對應點間反相相消 (Δφ = 180° / ΔL = λ/2) 的可能性
 */
function drawPhaseBarChart(geom, w, h) {
  if (!state.layers.phasebars) return;
  const sources = geom.sources;
  const N = sources.length;
  if (N === 0) return;

  const thetaRad = (state.thetaDeg * Math.PI) / 180;
  const sinT = Math.sin(thetaRad);
  const absSinT = Math.abs(sinT);
  const k = (2 * Math.PI) / state.wavelength;

  const topY = sources[0].y;
  const botY = sources[N - 1].y;

  // 計算每一點到達遠方螢幕時相對於領先波前的額外光程差 (ΔL_i >= 0) 與相位
  // 當 θ >= 0 時 (光線朝右下射出)，底端點最靠近螢幕 (領先，ΔL = 0)，頂端點需多走 a·sinθ 光程
  // 當 θ < 0 時 (光線朝右上射出)，頂端點最靠近螢幕 (領先，ΔL = 0)，底端點需多走 a·|sinθ| 光程
  const pointData = sources.map((src, idx) => {
    let extraPath = 0;
    if (thetaRad >= 0) {
      extraPath = (botY - src.y) * sinT;
    } else {
      extraPath = (src.y - topY) * absSinT;
    }
    const pathLambda = extraPath / state.wavelength; // ΔL / λ
    const phaseOffset = k * extraPath;               // 相位 φ (rad)
    const phaseCycle = (pathLambda % 1 + 1) % 1;    // 0 ~ 1 循環相位
    const phaseDeg = (pathLambda * 360) % 360;      // 0 ~ 360°
    return {
      idx,
      src,
      extraPath,
      pathLambda,
      phaseOffset,
      phaseCycle,
      phaseDeg
    };
  });

  // 整理自由選點中被勾選的槽位 (A, B, C, D)
  const enabledMap = new Map();
  state.freePoints.forEach((fp, slotIdx) => {
    if (fp.enabled) {
      const clampedIdx = Math.max(0, Math.min(N - 1, fp.idx));
      enabledMap.set(clampedIdx, { fp, slotIdx });
    }
  });

  // 柱狀圖尺寸與定位
  const slitX = geom.slitX;
  const chartRight = slitX - 24; // 與狹縫間距保持 24px 安全距離
  const chartW = Math.min(115, Math.max(76, slitX * 0.48));
  const chartLeft = chartRight - chartW;

  const topBarY = sources[0].y;
  const botBarY = sources[N - 1].y;
  const padTop = 44; // 充足的外框留白，拉開標題與第一根柱條的距離
  const padBot = 24;
  const boxTop = topBarY - padTop;
  const boxBottom = botBarY + padBot;
  const totalBoxH = boxBottom - boxTop;
  const boxLeft = chartLeft - 16;
  const totalBoxW = chartW + 28;
  // 右邊緣 boxLeft + totalBoxW = chartRight + 12 = slitX - 12 (與狹縫邊緣 slitX - 7 保留 5px 安全間隙)

  // 動態刻度：決定 chartW 代表的波長倍數 (至少 1.2λ，確保中央極大與第一暗紋清晰展開)
  const maxPathLambda = (state.slitWidth * absSinT) / state.wavelength;
  const scaleMaxLambda = Math.max(1.2, Math.ceil(maxPathLambda * 1.15 * 2) / 2);
  const pxPerLambda = chartW / scaleMaxLambda;

  waveCtx.save();

  // 1. 繪製半透明深色玻璃擬態外框
  waveCtx.fillStyle = 'rgba(10, 16, 30, 0.94)';
  waveCtx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  waveCtx.lineWidth = 1.5;
  waveCtx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  waveCtx.shadowBlur = 10;
  waveCtx.beginPath();
  waveCtx.roundRect(boxLeft, boxTop, totalBoxW, totalBoxH, 10);
  waveCtx.fill();
  waveCtx.stroke();
  waveCtx.shadowBlur = 0;

  // 2. 標題與模式徽章 (精簡標題，舒適留白)
  waveCtx.fillStyle = '#38bdf8';
  waveCtx.font = 'bold 11px "Noto Sans TC", "JetBrains Mono", sans-serif';
  waveCtx.textAlign = 'left';
  waveCtx.textBaseline = 'middle';
  const modeTitle = state.phaseBarMode === 'diff' ? '在P處各點光程差' : '在P處各點電場';
  waveCtx.fillText(modeTitle, boxLeft + 8, boxTop + 14);

  // 模式微標籤
  waveCtx.font = 'bold 9px "JetBrains Mono", sans-serif';
  waveCtx.fillStyle = 'rgba(56, 189, 248, 0.9)';
  waveCtx.textAlign = 'right';
  const modeBadgeText = state.phaseBarMode === 'diff' ? 'ΔL' : 'cos φ';
  waveCtx.fillText(modeBadgeText, boxLeft + totalBoxW - 8, boxTop + 14);

  // 3. 繪製刻度垂直參考線與標籤 (距離第一根柱條 15px 舒適間隔)
  const isDiffMode = (state.phaseBarMode === 'diff');

  if (isDiffMode) {
    // 基準線 0λ (左側縱軸)
    waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    waveCtx.lineWidth = 1.6;
    waveCtx.beginPath();
    waveCtx.moveTo(chartLeft, topBarY - 6);
    waveCtx.lineTo(chartLeft, botBarY + 6);
    waveCtx.stroke();

    waveCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    waveCtx.font = 'bold 9px "JetBrains Mono", sans-serif';
    waveCtx.textAlign = 'center';
    waveCtx.fillText('0', chartLeft, boxTop + 29);

    // λ/2 (180° 相消參考線 - 粉紅虛線)
    const xHalf = chartLeft + 0.5 * pxPerLambda;
    if (xHalf <= chartRight + 2) {
      waveCtx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
      waveCtx.lineWidth = 1.5;
      waveCtx.setLineDash([3, 3]);
      waveCtx.beginPath();
      waveCtx.moveTo(xHalf, topBarY - 6);
      waveCtx.lineTo(xHalf, botBarY + 6);
      waveCtx.stroke();
      waveCtx.setLineDash([]);

      waveCtx.fillStyle = '#fda4af';
      waveCtx.fillText('λ/2', xHalf, boxTop + 29);
    }

    // 1.0λ (360° 參考線 - 青藍虛線)
    const xOne = chartLeft + 1.0 * pxPerLambda;
    if (xOne <= chartRight + 2) {
      waveCtx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      waveCtx.lineWidth = 1.5;
      waveCtx.setLineDash([3, 3]);
      waveCtx.beginPath();
      waveCtx.moveTo(xOne, topBarY - 6);
      waveCtx.lineTo(xOne, botBarY + 6);
      waveCtx.stroke();
      waveCtx.setLineDash([]);

      waveCtx.fillStyle = '#38bdf8';
      waveCtx.fillText('1λ', xOne, boxTop + 29);
    }

    // 2.0λ (若刻度支援)
    if (scaleMaxLambda >= 2.0) {
      const xTwo = chartLeft + 2.0 * pxPerLambda;
      if (xTwo <= chartRight - 2) {
        waveCtx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
        waveCtx.lineWidth = 1.2;
        waveCtx.setLineDash([2, 3]);
        waveCtx.beginPath();
        waveCtx.moveTo(xTwo, topBarY - 6);
        waveCtx.lineTo(xTwo, botBarY + 6);
        waveCtx.stroke();
        waveCtx.setLineDash([]);

        waveCtx.fillStyle = '#facc15';
        waveCtx.fillText('2λ', Math.min(xTwo, chartRight - 6), boxTop + 29);
      }
    }
  } else {
    // 即時波動位移模式：中央為 0 平衡位置，向右為正 (+1 波峰)，向左為負 (-1 波谷)
    const chartMidX = chartLeft + chartW * 0.5;

    waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    waveCtx.lineWidth = 1.5;
    waveCtx.setLineDash([3, 3]);
    waveCtx.beginPath();
    waveCtx.moveTo(chartMidX, topBarY - 6);
    waveCtx.lineTo(chartMidX, botBarY + 6);
    waveCtx.stroke();
    waveCtx.setLineDash([]);

    waveCtx.font = 'bold 9px "JetBrains Mono", sans-serif';
    waveCtx.textAlign = 'center';
    waveCtx.fillStyle = '#fda4af';
    waveCtx.fillText('-1', chartLeft + 6, boxTop + 29);
    waveCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    waveCtx.fillText('0', chartMidX, boxTop + 29);
    waveCtx.fillStyle = '#38bdf8';
    waveCtx.fillText('+1', chartRight - 6, boxTop + 29);
  }

  // 4. 連接導引虛線：從柱狀圖右側延伸連到狹縫各波源點
  pointData.forEach(d => {
    waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    waveCtx.lineWidth = 1.0;
    waveCtx.setLineDash([2, 2]);
    waveCtx.beginPath();
    waveCtx.moveTo(chartRight, d.src.y);
    waveCtx.lineTo(d.src.x - 7, d.src.y);
    waveCtx.stroke();
  });
  waveCtx.setLineDash([]);

  // 5. 繪製各橫向柱條
  const spacing = state.slitWidth / Math.max(1, N);
  const barH = Math.max(2.4, Math.min(8.0, spacing * 0.68));

  // 互補色彩計算工具：相差 180° (半波長) 呈現互補色對 (青藍 ↔ 珊瑚粉紅，翠綠 ↔ 紫羅蘭)
  function getPhaseColor(cycle, alpha = 1.0) {
    const hue = ((cycle * 360 + 190) % 360).toFixed(0);
    return `hsla(${hue}, 95%, 58%, ${alpha})`;
  }

  // 計算當前是否有懸停點，並找出與其相位差最接近 180° (0.50λ) 的相消夥伴
  let hoveredPartnerIdx = -1;
  let hoveredIsDestructive = false;
  if (state.hoveredBarIdx >= 0 && state.hoveredBarIdx < N) {
    const hData = pointData[state.hoveredBarIdx];
    let minErr = 999;
    for (let j = 0; j < N; j++) {
      if (j === state.hoveredBarIdx) continue;
      const diff = Math.abs(pointData[j].pathLambda - hData.pathLambda);
      const mHalf = Math.floor(diff) + 0.5;
      const err = Math.abs(diff - mHalf);
      if (err < minErr && diff > 0.05) {
        minErr = err;
        hoveredPartnerIdx = j;
        hoveredIsDestructive = (err < 0.12);
      }
    }
  }

  pointData.forEach(d => {
    const i = d.idx;
    const isHovered = (state.hoveredBarIdx === i);
    const isPartner = (hoveredPartnerIdx === i && hoveredIsDestructive);
    const isSelected = enabledMap.has(i);
    const barY = d.src.y - barH * 0.5;

    let barX = chartLeft;
    let barLen = 2;
    let colorStart = '';
    let colorEnd = '';

    if (isDiffMode) {
      barLen = Math.max(2, (d.pathLambda / scaleMaxLambda) * chartW);
      barX = chartLeft;
      colorStart = getPhaseColor(d.phaseCycle, isHovered ? 1.0 : 0.72);
      colorEnd = getPhaseColor(d.phaseCycle, 1.0);
    } else {
      // 即時波動位移
      const chartMidX = chartLeft + chartW * 0.5;
      const disp = Math.cos(state.wavePhase - d.phaseOffset);
      const span = (chartW * 0.48);
      barLen = Math.max(2, Math.abs(disp) * span);
      barX = disp >= 0 ? chartMidX : chartMidX - barLen;
      if (disp >= 0) {
        colorStart = isHovered ? 'rgba(0, 242, 254, 1)' : 'rgba(0, 242, 254, 0.72)';
        colorEnd = '#00f2fe';
      } else {
        colorStart = isHovered ? 'rgba(244, 63, 94, 1)' : 'rgba(244, 63, 94, 0.72)';
        colorEnd = '#f43f5e';
      }
    }

    // 柱狀圖條本體
    waveCtx.save();
    if (isHovered || isPartner) {
      waveCtx.shadowColor = isPartner ? '#f43f5e' : '#facc15';
      waveCtx.shadowBlur = 10;
    } else if (isSelected) {
      const info = enabledMap.get(i);
      waveCtx.shadowColor = info.fp.color;
      waveCtx.shadowBlur = 8;
    }

    const grad = waveCtx.createLinearGradient(barX, 0, barX + barLen, 0);
    grad.addColorStop(0, colorStart);
    grad.addColorStop(1, colorEnd);
    waveCtx.fillStyle = grad;

    waveCtx.beginPath();
    waveCtx.roundRect(barX, barY, barLen, barH, Math.min(barH * 0.5, 4));
    waveCtx.fill();

    // 邊框高亮
    if (isHovered || isPartner || isSelected) {
      waveCtx.strokeStyle = isHovered ? '#ffffff' : (isPartner ? '#fda4af' : enabledMap.get(i).fp.color);
      waveCtx.lineWidth = 1.6;
      waveCtx.stroke();
    }
    waveCtx.restore();

    // 已勾選的自由選點 (A, B, C, D) 標籤徽章：繪製於柱條左側
    if (isSelected) {
      const info = enabledMap.get(i);
      waveCtx.save();
      waveCtx.fillStyle = info.fp.color;
      waveCtx.beginPath();
      waveCtx.arc(boxLeft + 10, d.src.y, 6.5, 0, Math.PI * 2);
      waveCtx.fill();

      waveCtx.fillStyle = '#0b1120';
      waveCtx.font = 'bold 9px "JetBrains Mono", sans-serif';
      waveCtx.textAlign = 'center';
      waveCtx.textBaseline = 'middle';
      waveCtx.fillText(info.fp.label.replace('點 ', ''), boxLeft + 10, d.src.y);
      waveCtx.restore();
    }
  });

  // 6. 相消配對視覺化 (對應相消的可能性)
  const halfN = Math.floor(N / 2);
  const quarterN = Math.floor(N / 4);
  const isNearMin1 = Math.abs(maxPathLambda - 1.0) < 0.15;
  const isNearMin2 = Math.abs(maxPathLambda - 2.0) < 0.15;

  if (isNearMin1 && N >= 6) {
    waveCtx.save();
    // 第一暗紋：狹縫上下兩半部 (相距 a/2) 普遍反相配對 (光程差 λ/2)
    const pairsToShow = [
      { i: 0, j: halfN },
      { i: Math.max(1, Math.floor(halfN * 0.4)), j: Math.max(1, Math.floor(halfN * 0.4)) + halfN }
    ];

    pairsToShow.forEach(pair => {
      if (pair.i < N && pair.j < N) {
        const sA = sources[pair.i];
        const sB = sources[pair.j];

        waveCtx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
        waveCtx.lineWidth = 1.5;
        waveCtx.setLineDash([3, 2]);

        waveCtx.beginPath();
        waveCtx.moveTo(chartLeft - 4, sA.y);
        waveCtx.bezierCurveTo(chartLeft - 18, sA.y, chartLeft - 18, sB.y, chartLeft - 4, sB.y);
        waveCtx.stroke();
      }
    });
    waveCtx.setLineDash([]);
    waveCtx.restore();
  } else if (isNearMin2 && N >= 8 && quarterN >= 1) {
    waveCtx.save();
    // 第二暗紋：狹縫四等分 (相距 a/4) 普遍反相配對 (光程差 λ/2)
    const pairsToShow2 = [
      { i: 0, j: quarterN },
      { i: halfN, j: halfN + quarterN }
    ];

    pairsToShow2.forEach(pair => {
      if (pair.i < N && pair.j < N) {
        const sA = sources[pair.i];
        const sB = sources[pair.j];

        waveCtx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
        waveCtx.lineWidth = 1.5;
        waveCtx.setLineDash([3, 2]);

        waveCtx.beginPath();
        waveCtx.moveTo(chartLeft - 4, sA.y);
        waveCtx.bezierCurveTo(chartLeft - 18, sA.y, chartLeft - 18, sB.y, chartLeft - 4, sB.y);
        waveCtx.stroke();
      }
    });
    waveCtx.setLineDash([]);
    waveCtx.restore();
  }

  // 7. 若滑鼠正在懸停某個柱狀條，顯示精準相位數值與相消對照 Tooltip
  if (state.hoveredBarIdx >= 0 && state.hoveredBarIdx < N) {
    const hData = pointData[state.hoveredBarIdx];
    waveCtx.save();

    // 繪製該點與相消點的連結弧線
    if (hoveredPartnerIdx >= 0 && hoveredIsDestructive) {
      const sA = hData.src;
      const sB = sources[hoveredPartnerIdx];
      waveCtx.strokeStyle = '#f43f5e';
      waveCtx.lineWidth = 2.0;
      waveCtx.beginPath();
      waveCtx.moveTo(chartLeft - 4, sA.y);
      waveCtx.bezierCurveTo(chartLeft - 22, sA.y, chartLeft - 22, sB.y, chartLeft - 4, sB.y);
      waveCtx.stroke();

      // 在弧頂標註相消徽章 (靠左對齊，遠離狹縫擋板)
      const midY = (sA.y + sB.y) * 0.5;
      drawTextBadge(waveCtx, '反相相消 (ΔL = 0.5λ)', chartLeft - 24, midY, {
        textColor: '#fda4af',
        borderColor: '#f43f5e',
        borderWidth: 1.5,
        bgColor: 'rgba(11, 17, 32, 0.96)',
        font: 'bold 11px "Noto Sans TC", sans-serif',
        align: 'right'
      });
    }

    // 柱狀圖左側懸浮標籤 (置於 boxLeft - 8 靠右對齊，指向左側寬敞區域，永不與狹縫擋板重疊)
    const phaseValStr = `${hData.pathLambda.toFixed(2)}λ (${hData.phaseDeg.toFixed(0)}°)`;
    const tipX = boxLeft - 8;
    const tipY = hData.src.y;
    drawTextBadge(waveCtx, `點 #${hData.idx}: ${phaseValStr}`, tipX, tipY, {
      textColor: '#facc15',
      borderColor: '#facc15',
      borderWidth: 1.5,
      bgColor: 'rgba(11, 17, 32, 0.95)',
      font: 'bold 11px "JetBrains Mono", sans-serif',
      align: 'right'
    });

    waveCtx.restore();
  }

  // 8. 底部教學結論狀態提示 (使用嚴格框線裁切與精簡文字，保證不超出框外與牆壁重疊)
  waveCtx.save();
  waveCtx.beginPath();
  waveCtx.roundRect(boxLeft, boxTop, totalBoxW, totalBoxH, 10);
  waveCtx.clip();

  waveCtx.font = 'bold 9.5px "Noto Sans TC", sans-serif';
  waveCtx.textAlign = 'left';
  waveCtx.textBaseline = 'middle';
  const bottomTextY = boxBottom - 10;
  if (Math.abs(maxPathLambda - 1.0) < 0.12) {
    waveCtx.fillStyle = '#fda4af';
    waveCtx.fillText('★ 第一暗紋 (λ/2 相消)', boxLeft + 8, bottomTextY);
  } else if (Math.abs(maxPathLambda - 2.0) < 0.15) {
    waveCtx.fillStyle = '#fda4af';
    waveCtx.fillText('★ 第二暗紋 (a/4 相消)', boxLeft + 8, bottomTextY);
  } else if (maxPathLambda < 0.10) {
    waveCtx.fillStyle = '#fef08a';
    waveCtx.fillText('★ 中央極大 (同相)', boxLeft + 8, bottomTextY);
  } else {
    waveCtx.fillStyle = '#94a3b8';
    waveCtx.fillText(`最大光程差: ${maxPathLambda.toFixed(2)}λ`, boxLeft + 8, bottomTextY);
  }

  waveCtx.restore();

  waveCtx.restore();
}

function updateBottomBanner(isNearMin1, isNearMin2) {
  if (!bottomHudBanner) return;

  if (isNearMin1) {
    bottomHudBanner.style.display = 'flex';
    bannerBadge.textContent = '★ 第一暗紋 (a/2 配對相消)';
    bannerBadge.style.background = 'rgba(0, 242, 254, 0.25)';
    bannerBadge.style.borderColor = 'rgba(0, 242, 254, 0.6)';
    bannerBadge.style.color = '#00f2fe';
    bannerText.innerHTML = '<strong>相距 a/2 配對：</strong>最大光程差 <code>ΔL = (a/2)·sinθ = λ/2</code> ⇒ 上下半部對應點反相 180° 完全相消！';
  } else if (isNearMin2) {
    bottomHudBanner.style.display = 'flex';
    bannerBadge.textContent = '★ 第二暗紋 (a/4 配對相消)';
    bannerBadge.style.background = 'rgba(244, 63, 94, 0.25)';
    bannerBadge.style.borderColor = 'rgba(244, 63, 94, 0.6)';
    bannerBadge.style.color = '#fda4af';
    bannerText.innerHTML = '<strong>狹縫四等分 (相距 a/4)：</strong>最大光程差 <code>2λ</code>，相距 <code>a/4</code> 之對應點光程差恰為 <code>(a/4)·sinθ = λ/2</code> ⇒ 兩兩反相抵銷！';
  } else {
    bottomHudBanner.style.display = 'none';
  }
}

/**
 * 更新 HUD 狹縫標籤
 */
function updateSlitHud(geom) {
  const hudSlitLabel = document.getElementById('hud-slit-label');
  if (hudSlitLabel) {
    const screenSlitX = geom.slitX * state.zoom + state.panX;
    const screenSlitTop = geom.slitTop * state.zoom + state.panY;
    hudSlitLabel.style.transform = `translate(${Math.max(16, screenSlitX - 50)}px, ${Math.max(16, screenSlitTop - 45)}px)`;
  }
}

/**
 * 右側屏幕光強分佈圖 I(θ)
 */
function renderScreenDisplays() {
  const rect = intensityCanvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  intensityCtx.clearRect(0, 0, w, h);

  // 背景網格
  intensityCtx.strokeStyle = '#1e293b';
  intensityCtx.lineWidth = 1;
  const gridStep = 40;
  for (let x = 0; x < w; x += gridStep) {
    intensityCtx.beginPath();
    intensityCtx.moveTo(x, 0);
    intensityCtx.lineTo(x, h);
    intensityCtx.stroke();
  }
  for (let y = 0; y < h; y += gridStep) {
    intensityCtx.beginPath();
    intensityCtx.moveTo(0, y);
    intensityCtx.lineTo(w, y);
    intensityCtx.stroke();
  }

  const maxAngle = 35 * (Math.PI / 180);
  const midY = h * 0.5;
  const a = state.slitWidth;
  const wl = state.wavelength;

  // 繪製 I(θ) 曲線
  intensityCtx.save();
  const curveGrad = intensityCtx.createLinearGradient(0, 0, w, 0);
  curveGrad.addColorStop(0, '#00f2fe');
  curveGrad.addColorStop(0.7, '#38bdf8');
  curveGrad.addColorStop(1, '#facc15');

  intensityCtx.beginPath();
  const maxPlotWidth = w * 0.84;

  for (let py = 0; py < h; py++) {
    const theta = ((py - midY) / (h * 0.5)) * maxAngle;
    const sinT = Math.sin(theta);
    const beta = (Math.PI * a / wl) * sinT;

    let intensity = 1.0;
    if (Math.abs(beta) > 1e-5) {
      intensity = Math.pow(Math.sin(beta) / beta, 2);
    }

    const plotX = intensity * maxPlotWidth;
    if (py === 0) intensityCtx.moveTo(plotX, py);
    else intensityCtx.lineTo(plotX, py);
  }

  intensityCtx.strokeStyle = curveGrad;
  intensityCtx.lineWidth = 3.5;
  intensityCtx.shadowColor = '#00f2fe';
  intensityCtx.shadowBlur = 10;
  intensityCtx.stroke();

  // 填色區域
  intensityCtx.lineTo(0, h);
  intensityCtx.lineTo(0, 0);
  intensityCtx.fillStyle = 'rgba(0, 242, 254, 0.08)';
  intensityCtx.fill();
  intensityCtx.restore();

  // 繪製中央基準線 (θ = 0°)
  intensityCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  intensityCtx.setLineDash([4, 4]);
  intensityCtx.beginPath();
  intensityCtx.moveTo(0, midY);
  intensityCtx.lineTo(w, midY);
  intensityCtx.stroke();
  intensityCtx.setLineDash([]);

  intensityCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  intensityCtx.font = 'bold 13px JetBrains Mono, sans-serif';
  intensityCtx.fillText('θ = 0° (中央極大 I₀)', 12, midY - 8);

  // 第一暗紋標線
  const sinMin1 = wl / a;
  if (sinMin1 <= Math.sin(maxAngle)) {
    const thetaMin1 = Math.asin(sinMin1);
    const pyMinTop = midY - (thetaMin1 / maxAngle) * (h * 0.5);
    const pyMinBot = midY + (thetaMin1 / maxAngle) * (h * 0.5);

    intensityCtx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
    intensityCtx.lineWidth = 1.5;
    intensityCtx.beginPath();
    intensityCtx.moveTo(0, pyMinTop);
    intensityCtx.lineTo(w * 0.45, pyMinTop);
    intensityCtx.moveTo(0, pyMinBot);
    intensityCtx.lineTo(w * 0.45, pyMinBot);
    intensityCtx.stroke();

    intensityCtx.fillStyle = '#fda4af';
    intensityCtx.font = 'bold 12px JetBrains Mono, sans-serif';
    intensityCtx.fillText('第一暗紋 θ₁', w * 0.48, pyMinTop + 4);
    intensityCtx.fillText('第一暗紋 -θ₁', w * 0.48, pyMinBot + 4);
  }

  // 當前觀測角指示光標
  const currentThetaRad = (state.thetaDeg * Math.PI) / 180;
  const curY = midY + (currentThetaRad / maxAngle) * (h * 0.5);
  const curBeta = (Math.PI * a / wl) * Math.sin(currentThetaRad);
  let curI = 1.0;
  if (Math.abs(curBeta) > 1e-5) curI = Math.pow(Math.sin(curBeta) / curBeta, 2);
  const curX = curI * maxPlotWidth;

  intensityCtx.save();
  intensityCtx.strokeStyle = '#facc15';
  intensityCtx.lineWidth = 2;
  intensityCtx.beginPath();
  intensityCtx.moveTo(0, curY);
  intensityCtx.lineTo(w, curY);
  intensityCtx.stroke();

  intensityCtx.fillStyle = '#facc15';
  intensityCtx.shadowColor = '#facc15';
  intensityCtx.shadowBlur = 10;
  intensityCtx.beginPath();
  intensityCtx.arc(curX, curY, 7, 0, Math.PI * 2);
  intensityCtx.fill();

  intensityCtx.fillStyle = '#ffffff';
  intensityCtx.font = 'bold 14px JetBrains Mono, sans-serif';
  intensityCtx.fillText(`I/I₀ = ${(curI * 100).toFixed(1)}%`, Math.min(curX + 14, w - 95), curY - 12);
  intensityCtx.restore();
}

/**
 * 子波疊加示波器 (光強與相量分析儀：不顯示個別波形，只顯示疊加後的強度與相量羅盤)
 */
function renderSuperpositionScope() {
  if (!scopeCanvas || !scopeCtx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = scopeCanvas.width / dpr;
  const h = scopeCanvas.height / dpr;

  scopeCtx.clearRect(0, 0, w, h);

  const thetaRad = (state.thetaDeg * Math.PI) / 180;
  const sinT = Math.sin(thetaRad);
  const k = (2 * Math.PI) / state.wavelength;

  const simEl = document.getElementById('sim-container');
  const simRect = simEl ? simEl.getBoundingClientRect() : { width: 600, height: 400 };
  const geom = getSlitGeometry(simRect.width, simRect.height);
  const N = geom.sources.length;

  const enabledPoints = state.freePoints
    .filter(function (fp) { return fp.enabled; })
    .map(function (fp) {
      const clampedIdx = Math.max(0, Math.min(N - 1, fp.idx));
      const src = geom.sources[clampedIdx];
      const refY = geom.sources[0].y;
      const dy = src.y - refY;
      const extraPath = dy * sinT;
      const phaseOffset = k * extraPath;
      return {
        color: fp.color,
        label: fp.label,
        idx: clampedIdx,
        phaseOffset: phaseOffset,
        cosPhi: Math.cos(phaseOffset),
        sinPhi: Math.sin(phaseOffset)
      };
    });

  if (enabledPoints.length === 0) {
    scopeCtx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    scopeCtx.font = 'bold 13px "Noto Sans TC", sans-serif';
    scopeCtx.textAlign = 'center';
    scopeCtx.textBaseline = 'middle';
    scopeCtx.fillText('請勾選至少一個子波點源 (A/B/C/D)', w / 2, h / 2);
    if (scopeLegend) scopeLegend.innerHTML = '';
    if (scopeBadge) {
      scopeBadge.textContent = '未選點';
      scopeBadge.style.background = 'rgba(100, 116, 139, 0.2)';
      scopeBadge.style.borderColor = 'rgba(100, 116, 139, 0.4)';
      scopeBadge.style.color = '#94a3b8';
    }
    return;
  }

  const nPts = enabledPoints.length;

  // 計算相量向量總和
  let sumCos = 0;
  let sumSin = 0;
  enabledPoints.forEach(function (fp) {
    sumCos += fp.cosPhi;
    sumSin += fp.sinPhi;
  });

  const amp = Math.sqrt(sumCos * sumCos + sumSin * sumSin); // 0 ~ nPts
  const maxAmp = nPts;
  const normAmp = amp / Math.max(1, maxAmp); // 0 ~ 1
  const intensity = amp * amp; // 0 ~ nPts^2
  const maxIntensity = nPts * nPts;
  const normIntensity = intensity / Math.max(1, maxIntensity); // 0 ~ 1

  // ==========================================
  // 1. 左側：相量疊加羅盤 (Phasor Vector Dial)
  // ==========================================
  const dialCx = Math.floor(w * 0.22);
  const dialCy = Math.floor(h * 0.44);
  const dialR = Math.min(Math.floor(w * 0.19), Math.floor(h * 0.38));

  scopeCtx.save();
  // 羅盤背景圓盤
  scopeCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  scopeCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  scopeCtx.lineWidth = 1;
  scopeCtx.beginPath();
  scopeCtx.arc(dialCx, dialCy, dialR, 0, Math.PI * 2);
  scopeCtx.fill();
  scopeCtx.stroke();

  // 羅盤十字軸與虛線同心圓 (0.5 R)
  scopeCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  scopeCtx.beginPath();
  scopeCtx.moveTo(dialCx - dialR, dialCy);
  scopeCtx.lineTo(dialCx + dialR, dialCy);
  scopeCtx.moveTo(dialCx, dialCy - dialR);
  scopeCtx.lineTo(dialCx + dialR, dialCy);
  scopeCtx.stroke();

  scopeCtx.setLineDash([2, 2]);
  scopeCtx.beginPath();
  scopeCtx.arc(dialCx, dialCy, dialR * 0.5, 0, Math.PI * 2);
  scopeCtx.stroke();
  scopeCtx.setLineDash([]);

  // 繪製各勾選點的個別相量箭頭 (起點在原點，長度 dialR * 0.78)
  const vecLen = dialR * 0.78;
  enabledPoints.forEach(function (fp) {
    const vx = dialCx + vecLen * fp.cosPhi;
    const vy = dialCy - vecLen * fp.sinPhi; // Canvas Y 軸向下

    scopeCtx.strokeStyle = fp.color;
    scopeCtx.lineWidth = 1.8;
    scopeCtx.beginPath();
    scopeCtx.moveTo(dialCx, dialCy);
    scopeCtx.lineTo(vx, vy);
    scopeCtx.stroke();

    // 箭頭端點小圓點
    scopeCtx.fillStyle = fp.color;
    scopeCtx.beginPath();
    scopeCtx.arc(vx, vy, 2.5, 0, Math.PI * 2);
    scopeCtx.fill();
  });

  // 繪製合成相量箭頭 (總和相量 A_total，粗金色發光箭頭)
  if (amp > 0.08) {
    const totalScale = (amp / maxAmp) * dialR * 0.92;
    const totalAngle = Math.atan2(sumSin, sumCos);
    const tx = dialCx + totalScale * Math.cos(totalAngle);
    const ty = dialCy - totalScale * Math.sin(totalAngle);

    scopeCtx.save();
    scopeCtx.strokeStyle = '#facc15';
    scopeCtx.lineWidth = 3.0;
    scopeCtx.shadowColor = 'rgba(250, 204, 21, 0.8)';
    scopeCtx.shadowBlur = 8;
    scopeCtx.beginPath();
    scopeCtx.moveTo(dialCx, dialCy);
    scopeCtx.lineTo(tx, ty);
    scopeCtx.stroke();

    // 箭頭前端三角形
    scopeCtx.fillStyle = '#facc15';
    const arrowLen = 7;
    const headAngle = Math.atan2(dialCy - ty, tx - dialCx);
    scopeCtx.beginPath();
    scopeCtx.moveTo(tx, ty);
    scopeCtx.lineTo(
      tx - arrowLen * Math.cos(headAngle - Math.PI / 6),
      ty + arrowLen * Math.sin(headAngle - Math.PI / 6)
    );
    scopeCtx.lineTo(
      tx - arrowLen * Math.cos(headAngle + Math.PI / 6),
      ty + arrowLen * Math.sin(headAngle + Math.PI / 6)
    );
    scopeCtx.closePath();
    scopeCtx.fill();
    scopeCtx.restore();
  } else {
    // 振幅 ≈ 0 完全破壞性相消：中央亮紅點
    scopeCtx.save();
    scopeCtx.fillStyle = '#f43f5e';
    scopeCtx.shadowColor = '#f43f5e';
    scopeCtx.shadowBlur = 10;
    scopeCtx.beginPath();
    scopeCtx.arc(dialCx, dialCy, 4.5, 0, Math.PI * 2);
    scopeCtx.fill();
    scopeCtx.restore();
  }

  // 羅盤下方微文字
  scopeCtx.fillStyle = 'rgba(148, 163, 184, 0.75)';
  scopeCtx.font = 'bold 9px "Noto Sans TC", sans-serif';
  scopeCtx.textAlign = 'center';
  scopeCtx.textBaseline = 'top';
  scopeCtx.fillText('相量疊加 (向量和)', dialCx, dialCy + dialR + 4);
  scopeCtx.restore();

  // ==========================================
  // 2. 右側：疊加後光強儀表與數據卡片
  // ==========================================
  const rightX = dialCx * 2 + 18;
  const rightW = w - rightX - 10;

  // (A) 頂端標題與百分比
  scopeCtx.font = 'bold 11px "Noto Sans TC", sans-serif';
  scopeCtx.textAlign = 'left';
  scopeCtx.textBaseline = 'top';
  scopeCtx.fillStyle = '#94a3b8';
  scopeCtx.fillText('疊加總光強 (Superposed Intensity)', rightX, 10);

  // (B) 光強進度條 (Gauge Bar)
  const barY = 27;
  const barH = 18;
  scopeCtx.save();
  scopeCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  scopeCtx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
  scopeCtx.lineWidth = 1;
  scopeCtx.beginPath();
  scopeCtx.roundRect(rightX, barY, rightW, barH, 5);
  scopeCtx.fill();
  scopeCtx.stroke();

  // 進度填充
  const fillW = Math.max(4, rightW * normIntensity);
  const fillGrad = scopeCtx.createLinearGradient(rightX, 0, rightX + fillW, 0);
  if (normIntensity < 0.05) {
    fillGrad.addColorStop(0, '#f43f5e');
    fillGrad.addColorStop(1, '#e11d48');
  } else {
    fillGrad.addColorStop(0, '#00f2fe');
    fillGrad.addColorStop(0.6, '#38bdf8');
    fillGrad.addColorStop(1, '#facc15');
  }

  scopeCtx.fillStyle = fillGrad;
  scopeCtx.shadowColor = normIntensity < 0.05 ? 'rgba(244, 63, 94, 0.6)' : 'rgba(0, 242, 254, 0.5)';
  scopeCtx.shadowBlur = 6;
  scopeCtx.beginPath();
  scopeCtx.roundRect(rightX + 1, barY + 1, fillW - 2, barH - 2, 4);
  scopeCtx.fill();
  scopeCtx.shadowBlur = 0;

  // 進度條上文字標籤 (百分比)
  scopeCtx.font = 'bold 10px "JetBrains Mono", sans-serif';
  scopeCtx.textBaseline = 'middle';
  const pctStr = `${(normIntensity * 100).toFixed(1)}%`;
  if (fillW > 48) {
    scopeCtx.textAlign = 'right';
    scopeCtx.fillStyle = '#0b1120';
    scopeCtx.fillText(pctStr, rightX + fillW - 6, barY + barH * 0.5);
  } else {
    scopeCtx.textAlign = 'left';
    scopeCtx.fillStyle = normIntensity < 0.05 ? '#fda4af' : '#facc15';
    scopeCtx.fillText(pctStr, rightX + fillW + 6, barY + barH * 0.5);
  }
  scopeCtx.restore();

  // (C) 兩個數值小卡片 (合成振幅 A 與 疊加光強 I)
  const cardY = 52;
  const cardH = 34;
  const cardGap = 8;
  const cardW = (rightW - cardGap) * 0.5;

  // 卡片 1: 振幅 A
  scopeCtx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  scopeCtx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  scopeCtx.lineWidth = 1;
  scopeCtx.beginPath();
  scopeCtx.roundRect(rightX, cardY, cardW, cardH, 5);
  scopeCtx.fill();
  scopeCtx.stroke();

  scopeCtx.font = '9px "Noto Sans TC", sans-serif';
  scopeCtx.fillStyle = '#94a3b8';
  scopeCtx.textAlign = 'left';
  scopeCtx.textBaseline = 'top';
  scopeCtx.fillText('疊加總振幅 A', rightX + 6, cardY + 4);

  scopeCtx.font = 'bold 12px "JetBrains Mono", sans-serif';
  scopeCtx.fillStyle = '#38bdf8';
  scopeCtx.fillText(`${amp.toFixed(2)} A₀`, rightX + 6, cardY + 16);

  // 卡片 2: 光強 I
  const card2X = rightX + cardW + cardGap;
  scopeCtx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  scopeCtx.strokeStyle = 'rgba(250, 204, 21, 0.25)';
  scopeCtx.beginPath();
  scopeCtx.roundRect(card2X, cardY, cardW, cardH, 5);
  scopeCtx.fill();
  scopeCtx.stroke();

  scopeCtx.font = '9px "Noto Sans TC", sans-serif';
  scopeCtx.fillStyle = '#94a3b8';
  scopeCtx.fillText('疊加總光強 I', card2X + 6, cardY + 4);

  scopeCtx.font = 'bold 12px "JetBrains Mono", sans-serif';
  scopeCtx.fillStyle = normIntensity < 0.05 ? '#fda4af' : '#facc15';
  scopeCtx.fillText(`${intensity.toFixed(2)} I₀`, card2X + 6, cardY + 16);

  // (D) 底部干涉狀態膠囊條 (Status Capsule)
  const statusY = 93;
  const statusH = 24;
  scopeCtx.save();
  let statusText = '';
  let statusBg = '';
  let statusBorder = '';
  let statusColor = '';

  if (normIntensity < 0.04) {
    statusText = '💥 完全相消干涉 (振幅抵銷 A ≈ 0)';
    statusBg = 'rgba(244, 63, 94, 0.18)';
    statusBorder = 'rgba(244, 63, 94, 0.5)';
    statusColor = '#fda4af';
  } else if (normIntensity > 0.94) {
    statusText = `⚡ 完全同相相長 (I = ${(normIntensity * 100).toFixed(0)}%)`;
    statusBg = 'rgba(250, 204, 21, 0.18)';
    statusBorder = 'rgba(250, 204, 21, 0.5)';
    statusColor = '#fef08a';
  } else {
    statusText = `🌊 部分干涉疊加 (相對光強 ${(normIntensity * 100).toFixed(1)}%)`;
    statusBg = 'rgba(56, 189, 248, 0.14)';
    statusBorder = 'rgba(56, 189, 248, 0.35)';
    statusColor = '#38bdf8';
  }

  scopeCtx.fillStyle = statusBg;
  scopeCtx.strokeStyle = statusBorder;
  scopeCtx.lineWidth = 1;
  scopeCtx.beginPath();
  scopeCtx.roundRect(rightX, statusY, rightW, statusH, 5);
  scopeCtx.fill();
  scopeCtx.stroke();

  scopeCtx.font = 'bold 10px "Noto Sans TC", sans-serif';
  scopeCtx.fillStyle = statusColor;
  scopeCtx.textAlign = 'center';
  scopeCtx.textBaseline = 'middle';
  scopeCtx.fillText(statusText, rightX + rightW * 0.5, statusY + statusH * 0.5);
  scopeCtx.restore();

  // (E) 更新右上角示波器狀態徽章
  if (scopeBadge) {
    if (normIntensity < 0.04) {
      scopeBadge.textContent = '完全相消 (I ≈ 0)';
      scopeBadge.style.background = 'rgba(244,63,94,0.25)';
      scopeBadge.style.borderColor = 'rgba(244,63,94,0.6)';
      scopeBadge.style.color = '#fda4af';
    } else if (normIntensity > 0.94) {
      scopeBadge.textContent = '完全相長 (I = 100%)';
      scopeBadge.style.background = 'rgba(250,204,21,0.25)';
      scopeBadge.style.borderColor = 'rgba(250,204,21,0.6)';
      scopeBadge.style.color = '#fef08a';
    } else {
      scopeBadge.textContent = `部分疊加 (${(normIntensity * 100).toFixed(0)}%)`;
      scopeBadge.style.background = 'rgba(56,189,248,0.15)';
      scopeBadge.style.borderColor = 'rgba(56,189,248,0.4)';
      scopeBadge.style.color = '#38bdf8';
    }
  }

  // (F) 更新底部圖例 (列出已勾選點的相位與最終疊加強度)
  if (scopeLegend) {
    const items = enabledPoints.map(function (fp) {
      const phaseVal = (fp.phaseOffset / (2 * Math.PI)).toFixed(2);
      return '<span class="legend-item"><span class="dot-indicator" style="background:' + fp.color + ';box-shadow:0 0 6px ' + fp.color + '"></span> ' + fp.label + ' (#' + fp.idx + ', ' + phaseVal + 'λ)</span>';
    });
    items.push('<span class="legend-item"><span class="dot-indicator dot-yellow"></span> 疊加強度: ' + (normIntensity * 100).toFixed(1) + '%</span>');
    scopeLegend.innerHTML = items.join('');
  }
}

function updateMetrics() {
  const a = state.slitWidth;
  const wl = state.wavelength;
  const thetaDeg = state.thetaDeg;
  const thetaRad = (thetaDeg * Math.PI) / 180;
  const sinT = Math.sin(thetaRad);

  // 第一暗紋計算 a sinθ = λ
  const sinMin1 = wl / a;
  if (valFirstMin) {
    if (sinMin1 <= 1) {
      const thetaMin1 = (Math.asin(sinMin1) * 180 / Math.PI).toFixed(1);
      valFirstMin.textContent = `θ₁ ≈ ±${thetaMin1}°`;
    } else {
      valFirstMin.textContent = '不存在 (a < λ)';
    }
  }

  // 光程差 ΔL = a sinθ
  const pathDiff = (a * sinT).toFixed(1);
  const pathDiffLambda = ((a * sinT) / wl).toFixed(2);
  if (valPathDiff) {
    valPathDiff.textContent = `${pathDiffLambda} λ (${pathDiff} μm)`;
  }

  // 當前干涉狀態判定
  const beta = (Math.PI * a / wl) * sinT;
  let curI = 1.0;
  if (Math.abs(beta) > 1e-5) curI = Math.pow(Math.sin(beta) / beta, 2);

  if (valInterference) {
    if (Math.abs(thetaDeg) < 0.8) {
      valInterference.textContent = '中央極大 (完全相長)';
      valInterference.style.color = 'var(--accent-cyan)';
    } else if (Math.abs(Math.abs(a * sinT) - wl) < wl * 0.1) {
      valInterference.textContent = '第一暗紋 (完全相消 0%)';
      valInterference.style.color = 'var(--accent-pink)';
    } else if (Math.abs(Math.abs(a * sinT) - 2 * wl) < wl * 0.1) {
      valInterference.textContent = '第二暗紋 (完全相消 0%)';
      valInterference.style.color = 'var(--accent-pink)';
    } else if (Math.abs(Math.abs(a * sinT) - 1.43 * wl) < wl * 0.12) {
      valInterference.textContent = `第一副極大 (~4.7%)`;
      valInterference.style.color = 'var(--accent-cyan)';
    } else {
      valInterference.textContent = `部分干涉 (I ≈ ${(curI * 100).toFixed(1)}%)`;
      valInterference.style.color = 'var(--text-main)';
    }
  }

  // 同步更新底部 HUD 相消教學橫幅 (第一暗紋 a/2 配對與第二暗紋 a/4 配對)
  const isNearMin1 = Math.abs(Math.abs(a * sinT) - wl) < wl * 0.12;
  const isNearMin2 = Math.abs(Math.abs(a * sinT) - 2 * wl) < wl * 0.12;
  updateBottomBanner(isNearMin1, isNearMin2);
}

/**
 * 更新縮放指示器數值
 */
function updateZoomUI() {
  if (zoomLevelText) {
    zoomLevelText.textContent = `${Math.round(state.zoom * 100)}%`;
  }
}

/**
 * 動畫主迴圈 (RAF)
 */
let animFrameId = null;
function animationLoop() {
  if (state.isPlaying) {
    state.wavePhase += state.waveSpeed;
  }

  try {
    drawWaveScene();
  } catch (err) {
    console.error('drawWaveScene error:', err);
  }

  try {
    renderSuperpositionScope();
  } catch (err) {
    console.error('renderSuperpositionScope error:', err);
  }

  animFrameId = requestAnimationFrame(animationLoop);
}

/**
 * 綁定黑板觸控、滑鼠拖拉平移與介面互動事件
 */
function initEvents() {
  buildFreePointsStatus();
  // 1. 播放 / 暫停
  btnPlayPause.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
      btnPlayPause.classList.remove('paused');
      playIcon.textContent = '⏸';
      playText.textContent = '暫停';
    } else {
      btnPlayPause.classList.add('paused');
      playIcon.textContent = '▶';
      playText.textContent = '播放';
    }
  });

  // 2. 微步前進 / 後退 / 重置
  btnStepPrev.addEventListener('click', () => {
    state.isPlaying = false;
    btnPlayPause.classList.add('paused');
    playIcon.textContent = '▶';
    playText.textContent = '播放';
    state.wavePhase -= Math.PI / 8;
  });

  btnStepNext.addEventListener('click', () => {
    state.isPlaying = false;
    btnPlayPause.classList.add('paused');
    playIcon.textContent = '▶';
    playText.textContent = '播放';
    state.wavePhase += Math.PI / 8;
  });

  btnReset.addEventListener('click', () => {
    state.wavePhase = 0;
    state.thetaDeg = 0;
    sliderTheta.value = 0;
    valTheta.textContent = '0.0°';
    state.zoom = 1.0;
    state.panX = 0;
    state.panY = 0;
    updateZoomUI();
    updateMetrics();
    renderScreenDisplays();
  });

  // 3. 全螢幕切換
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('全螢幕請求受阻:', err);
      });
    } else {
      document.exitFullscreen();
    }
  });

  // 4. 視角縮放控制 (Zoom Toolbar)
  btnZoomIn.addEventListener('click', () => {
    state.zoom = Math.min(3.5, state.zoom + 0.3);
    updateZoomUI();
  });

  btnZoomOut.addEventListener('click', () => {
    state.zoom = Math.max(0.7, state.zoom - 0.3);
    if (state.zoom <= 1.0) { state.panX = 0; state.panY = 0; }
    updateZoomUI();
  });

  btnFocusSlit.addEventListener('click', () => {
    const rect = simContainer.getBoundingClientRect();
    const geom = getSlitGeometry(rect.width, rect.height);
    state.zoom = 2.4;
    // 將狹縫對焦置中展示，預留充足空間給左側相位柱狀圖
    state.panX = rect.width * 0.46 - geom.slitX * state.zoom;
    state.panY = rect.height * 0.50 - geom.centerY * state.zoom;
    updateZoomUI();
  });

  btnZoomReset.addEventListener('click', () => {
    state.zoom = 1.0;
    state.panX = 0;
    state.panY = 0;
    updateZoomUI();
  });

  // 滑鼠滾輪縮放 (以游標為中心縮放)
  simContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    const newZoom = Math.max(0.7, Math.min(3.5, state.zoom * zoomFactor));

    const rect = simContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    state.panX = mouseX - (mouseX - state.panX) * (newZoom / state.zoom);
    state.panY = mouseY - (mouseY - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;
    updateZoomUI();
  }, { passive: false });

  // 5. 柱狀圖模式切換 (光程差 ΔL ↔ 即時波動位移 cos φ)
  if (btnPhasebarMode) {
    btnPhasebarMode.addEventListener('click', () => {
      state.phaseBarMode = (state.phaseBarMode === 'diff' ? 'wave' : 'diff');
      if (state.phaseBarMode === 'diff') {
        btnPhasebarMode.textContent = '📊 模式: 光程差 ΔL';
        btnPhasebarMode.title = '當前：光程差與相對相位。點擊切換為即時波動位移 cos φ';
      } else {
        btnPhasebarMode.textContent = '🌊 模式: 即時電場 cos';
        btnPhasebarMode.title = '當前：即時波動位移。點擊切換為光程差與相對相位 ΔL';
      }
    });
  }

  // 6. 顯示圖層切換 (Toggle Pills)
  document.querySelectorAll('.toggle-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const layer = pill.dataset.layer;
      state.layers[layer] = !state.layers[layer];
      pill.classList.toggle('active', state.layers[layer]);
    });
  });

  // 7. 滑桿參數更新
  sliderA.addEventListener('input', (e) => {
    state.slitWidth = parseFloat(e.target.value);
    valA.textContent = `${state.slitWidth} μm`;
    updateMetrics();
    renderScreenDisplays();
  });

  sliderLambda.addEventListener('input', (e) => {
    state.wavelength = parseFloat(e.target.value);
    valLambda.textContent = `${state.wavelength} μm`;
    updateMetrics();
    renderScreenDisplays();
  });

  sliderN.addEventListener('input', (e) => {
    state.numSources = parseInt(e.target.value, 10);
    valN.textContent = `${state.numSources} 個點`;
    updateFreePointsAfterNChange();
    updateMetrics();
    renderScreenDisplays();
  });

  sliderTheta.addEventListener('input', (e) => {
    state.thetaDeg = parseFloat(e.target.value);
    valTheta.textContent = `${state.thetaDeg.toFixed(1)}°`;
    updateMetrics();
    renderScreenDisplays();
  });

  // sliderP2 removed: handled via free-points UI

  // 8. 滑鼠拖拉平移畫面 (預設全畫面自由拖曳)、狹縫點源點選配對 ② 與 角度把手旋轉
  let isInteracting = false;
  let interactionMode = 'pan'; // 'pan' (拖拉畫面) | 'angle' (旋轉角度)

  function handlePointerStart(clientX, clientY) {
    if (state.chalkMode) return;
    const rect = simContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // 計算世界座標
    const worldX = (x - state.panX) / state.zoom;
    const worldY = (y - state.panY) / state.zoom;
    const geom = getSlitGeometry(rect.width, rect.height);

    // 點擊狹縫中的惠更斯點波源 => 選取/取消 A/B/C/D
    const srcN = geom.sources.length;
    if (!state.chalkMode && srcN > 0) {
      const hitR = Math.max(12, state.slitWidth / srcN * 0.9);
      let clickedSrcIdx = -1;
      for (let si = 0; si < srcN; si++) {
        const src = geom.sources[si];
        if (Math.hypot(worldX - src.x, worldY - src.y) < hitR) {
          clickedSrcIdx = si;
          break;
        }
      }
      if (clickedSrcIdx >= 0) {
        const alreadySlot = state.freePoints.findIndex(function (fp) { return fp.enabled && fp.idx === clickedSrcIdx; });
        if (alreadySlot >= 0) {
          state.selectedSlot = (state.selectedSlot === alreadySlot) ? -1 : alreadySlot;
          if (state.selectedSlot < 0) {
            state.freePoints[alreadySlot].enabled = false;
          }
        } else {
          const emptySlot = state.freePoints.findIndex(function (fp) { return !fp.enabled; });
          if (emptySlot >= 0) {
            state.freePoints[emptySlot].enabled = true;
            state.freePoints[emptySlot].idx = clickedSrcIdx;
            state.selectedSlot = emptySlot;
          } else {
            const overwriteSlot = state.selectedSlot >= 0 ? state.selectedSlot : 0;
            state.freePoints[overwriteSlot].idx = clickedSrcIdx;
            state.selectedSlot = overwriteSlot;
          }
        }
        buildFreePointsStatus();
        renderSuperpositionScope();
        return;
      }
    }

    const thetaRad = (state.thetaDeg * Math.PI) / 180;
    const rayLen = Math.min(rect.width * 0.65, 480);
    const handleR = Math.min(320, rayLen * 0.85);
    const handleX = geom.slitX + handleR * Math.cos(thetaRad);
    const handleY = geom.centerY + handleR * Math.sin(thetaRad);

    const distToHandle = Math.hypot(worldX - handleX, worldY - handleY);

    if (distToHandle < 36) {
      // 點在「⟲ 調角度」把手上：進入旋轉角度模式
      interactionMode = 'angle';
      isInteracting = true;
      simContainer.style.cursor = 'crosshair';
      updateAngleByPointer(clientX, clientY);
    } else {
      // 點在主要畫面的其他任何地方：滑鼠拖拉平移整個畫面 (Pan)!
      interactionMode = 'pan';
      state.isPanning = true;
      state.startPanX = clientX - state.panX;
      state.startPanY = clientY - state.panY;
      simContainer.style.cursor = 'grabbing';
    }
  }

  function handlePointerMove(clientX, clientY) {
    if (state.chalkMode) return;
    if (interactionMode === 'pan' && state.isPanning) {
      // 流暢平移畫面
      state.panX = clientX - state.startPanX;
      state.panY = clientY - state.startPanY;
    } else if (interactionMode === 'angle' && isInteracting) {
      updateAngleByPointer(clientX, clientY);
    } else {
      // 懸停時動態切換游標：柱狀圖條為 pointer，把手上為 pointer，其他為 grab
      const rect = simContainer.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const worldX = (x - state.panX) / state.zoom;
      const worldY = (y - state.panY) / state.zoom;
      const geom = getSlitGeometry(rect.width, rect.height);
      const thetaRad = (state.thetaDeg * Math.PI) / 180;
      const rayLen = Math.min(rect.width * 0.65, 480);
      const handleR = Math.min(320, rayLen * 0.85);
      const handleX = geom.slitX + handleR * Math.cos(thetaRad);
      const handleY = geom.centerY + handleR * Math.sin(thetaRad);

      let foundBar = false;
      if (state.layers.phasebars && geom.sources.length > 0) {
        const slitX = geom.slitX;
        const chartRight = slitX - 24;
        const chartW = Math.min(115, Math.max(76, slitX * 0.48));
        const chartLeft = chartRight - chartW;
        const boxLeft = chartLeft - 16;
        const boxRight = chartRight + 12;
        const topY = geom.sources[0].y;
        const botY = geom.sources[geom.sources.length - 1].y;

        if (worldX >= boxLeft && worldX <= boxRight && worldY >= topY - 34 && worldY <= botY + 24) {
          let bestIdx = -1;
          let minDist = 999;
          geom.sources.forEach((s, idx) => {
            const dist = Math.abs(worldY - s.y);
            if (dist < minDist) {
              minDist = dist;
              bestIdx = idx;
            }
          });
          if (minDist < 20) {
            state.hoveredBarIdx = bestIdx;
            simContainer.style.cursor = 'pointer';
            foundBar = true;
          }
        }
      }

      if (!foundBar && state.hoveredBarIdx !== -1) {
        state.hoveredBarIdx = -1;
      }

      // 檢查是否悬停在狹縫波源上
      let foundSource = false;
      if (!foundBar && geom.sources.length > 0) {
        const hitR2 = Math.max(12, state.slitWidth / geom.sources.length * 0.9);
        for (let si = 0; si < geom.sources.length; si++) {
          const src2 = geom.sources[si];
          if (Math.hypot(worldX - src2.x, worldY - src2.y) < hitR2) {
            simContainer.style.cursor = 'pointer';
            foundSource = true;
            break;
          }
        }
      }

      if (foundBar || foundSource) {
        // 保持 pointer 游標
      } else if (Math.hypot(worldX - handleX, worldY - handleY) < 36) {
        simContainer.style.cursor = 'pointer';
      } else {
        simContainer.style.cursor = 'grab';
      }
    }
  }

  function updateAngleByPointer(clientX, clientY) {
    const rect = simContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const worldX = (x - state.panX) / state.zoom;
    const worldY = (y - state.panY) / state.zoom;
    const geom = getSlitGeometry(rect.width, rect.height);

    const dx = worldX - geom.slitX;
    const dy = worldY - geom.centerY;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    angle = Math.max(-35, Math.min(35, angle));

    state.thetaDeg = angle;
    sliderTheta.value = angle;
    valTheta.textContent = `${angle.toFixed(1)}°`;
    updateMetrics();
    renderScreenDisplays();
  }

  // 滑鼠事件 - 懸停檢測與拖曳平移
  simContainer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handlePointerStart(e.clientX, e.clientY);
  });

  simContainer.addEventListener('mousemove', (e) => {
    handlePointerMove(e.clientX, e.clientY);
  });

  simContainer.addEventListener('mouseleave', () => {
    state.hoveredBarIdx = -1;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isInteracting && !state.isPanning) return; // 拖曳中即使移出容器仍繼續平移
    handlePointerMove(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', (e) => {
    isInteracting = false;
    state.isPanning = false;
    interactionMode = 'pan';
    simContainer.style.cursor = 'grab';
  });

  // 觸控事件 (手機/平板/數位黑板觸控螢幕)
  simContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && (isInteracting || state.isPanning)) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    isInteracting = false;
    state.isPanning = false;
    interactionMode = 'pan';
    simContainer.style.cursor = 'grab';
  });

  // 9. 課堂教學預設情境 (一鍵切換，使用 pointerup 確保在觸控與滑鼠上 100% 觸發)
  function applyPreset(preset) {
    switch (preset) {
      case 'center':
        state.slitWidth = 60;
        state.wavelength = 12;
        state.thetaDeg = 0;
        break;
      case 'min1':
        state.slitWidth = 60;
        state.wavelength = 12;
        state.thetaDeg = (Math.asin(12 / 60) * 180) / Math.PI; // ≈ 11.5°
        break;
      case 'min2':
        state.slitWidth = 60;
        state.wavelength = 12;
        state.thetaDeg = (Math.asin(24 / 60) * 180) / Math.PI; // ≈ 23.6°
        break;
      case 'max1':
        state.slitWidth = 60;
        state.wavelength = 12;
        state.thetaDeg = (Math.asin((1.4303 * 12) / 60) * 180) / Math.PI; // ≈ 16.6°
        break;
      case 'narrow':
        state.slitWidth = 28;
        state.wavelength = 12;
        state.thetaDeg = (Math.asin(12 / 28) * 180) / Math.PI; // ≈ 25.4°
        break;
      case 'wide':
        state.slitWidth = 120;
        state.wavelength = 8;
        state.thetaDeg = (Math.asin(8 / 120) * 180) / Math.PI; // ≈ 3.8°
        break;
      default:
        return;
    }
    sliderA.value = state.slitWidth;
    valA.textContent = `${state.slitWidth} \u03bcm`;
    sliderLambda.value = state.wavelength;
    valLambda.textContent = `${state.wavelength} \u03bcm`;
    sliderTheta.value = state.thetaDeg;
    valTheta.textContent = `${state.thetaDeg.toFixed(1)}\u00b0`;
    updateMetrics();
    renderScreenDisplays();
  }

  document.querySelectorAll('.preset-btn').forEach(btn => {
    // 同時綁定 click 與 touchend，確保在任何設備上都能觸發
    const activate = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyPreset(btn.dataset.preset);
    };
    btn.addEventListener('click', activate);
    btn.addEventListener('touchend', (e) => {
      e.preventDefault(); // 防止 ghost click
      activate(e);
    }, { passive: false });
  });

  // 10. 黑板板書標註模式 (Chalk Pen) - 已於介面精簡移除，保留安全守護
  if (btnChalkMode && drawingCanvas && drawingCtx) {
    btnChalkMode.addEventListener('click', toggleChalkMode);
    if (btnCloseChalk) btnCloseChalk.addEventListener('click', toggleChalkMode);

    function toggleChalkMode() {
      state.chalkMode = !state.chalkMode;
      btnChalkMode.classList.toggle('active', state.chalkMode);
      if (chalkToolbar) chalkToolbar.style.display = state.chalkMode ? 'flex' : 'none';
      drawingCanvas.classList.toggle('drawing-active', state.chalkMode);
    }

    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.chalkColor = dot.dataset.color;
      });
    });

    if (btnClearChalk) {
      btnClearChalk.addEventListener('click', () => {
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
      });
    }

    function startDraw(e) {
      if (!state.chalkMode) return;
      state.isDrawing = true;
      const rect = drawingCanvas.getBoundingClientRect();
      const cx = e.clientX || (e.touches && e.touches[0].clientX);
      const cy = e.clientY || (e.touches && e.touches[0].clientY);
      state.lastX = cx - rect.left;
      state.lastY = cy - rect.top;
    }

    function drawMove(e) {
      if (!state.chalkMode || !state.isDrawing) return;
      const rect = drawingCanvas.getBoundingClientRect();
      const cx = e.clientX || (e.touches && e.touches[0].clientX);
      const cy = e.clientY || (e.touches && e.touches[0].clientY);
      const curX = cx - rect.left;
      const curY = cy - rect.top;

      drawingCtx.save();
      drawingCtx.strokeStyle = state.chalkColor;
      drawingCtx.lineWidth = 3.8;
      drawingCtx.lineCap = 'round';
      drawingCtx.lineJoin = 'round';
      drawingCtx.shadowColor = state.chalkColor;
      drawingCtx.shadowBlur = 5;

      drawingCtx.beginPath();
      drawingCtx.moveTo(state.lastX, state.lastY);
      drawingCtx.lineTo(curX, curY);
      drawingCtx.stroke();
      drawingCtx.restore();

      state.lastX = curX;
      state.lastY = curY;
    }

    function stopDraw() {
      state.isDrawing = false;
    }

    drawingCanvas.addEventListener('mousedown', startDraw);
    drawingCanvas.addEventListener('mousemove', drawMove);
    window.addEventListener('mouseup', stopDraw);

    drawingCanvas.addEventListener('touchstart', startDraw, { passive: false });
    drawingCanvas.addEventListener('touchmove', (e) => {
      if (state.chalkMode) e.preventDefault();
      drawMove(e);
    }, { passive: false });
    window.addEventListener('touchend', stopDraw);
  }

  // 11. 鍵盤 ↑↓ 移動選取點位置 / Del 取消 / Tab 切換焦點
  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    const slot = state.selectedSlot;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (slot < 0) return;
      e.preventDefault();
      const fp = state.freePoints[slot];
      if (!fp || !fp.enabled) return;
      const N = state.numSources;
      fp.idx = (e.key === 'ArrowUp') ? Math.max(0, fp.idx - 1) : Math.min(N - 1, fp.idx + 1);
      buildFreePointsStatus();
      renderSuperpositionScope();
      return;
    }

    if (e.key === 'Delete') {
      if (slot < 0) return;
      e.preventDefault();
      state.freePoints[slot].enabled = false;
      state.selectedSlot = -1;
      buildFreePointsStatus();
      renderSuperpositionScope();
      return;
    }

    if (e.key === 'Tab') {
      const enabledSlots = [];
      state.freePoints.forEach(function (fp, i) { if (fp.enabled) enabledSlots.push(i); });
      if (enabledSlots.length === 0) return;
      e.preventDefault();
      const curIdx = enabledSlots.indexOf(slot);
      state.selectedSlot = e.shiftKey
        ? enabledSlots[(curIdx - 1 + enabledSlots.length) % enabledSlots.length]
        : enabledSlots[(curIdx + 1) % enabledSlots.length];
      buildFreePointsStatus();
      return;
    }

    if (e.key === 'Escape') {
      state.selectedSlot = -1;
      buildFreePointsStatus();
    }
  });

  // 初始化完成
}

// 系統初始化
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvases();
  initEvents();
  updateMetrics();
  updateZoomUI();
  renderScreenDisplays();
  animationLoop();
});
