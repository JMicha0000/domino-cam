const $ = (id) => document.getElementById(id);

const video = $('video');
const canvas = $('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const startCamera = $('startCamera');
const captureBtn = $('captureBtn');
const detectedScore = $('detectedScore');
const tileCount = $('tileCount');
const confidence = $('confidence');
const detectMode = $('detectMode');
const sensitivity = $('sensitivity');
const minArea = $('minArea');
const maxArea = $('maxArea');
const playerSelect = $('playerSelect');
const scoreInput = $('scoreInput');
const saveScore = $('saveScore');
const manualMinus = $('manualMinus');
const manualPlus = $('manualPlus');
const scoreboard = $('scoreboard');
const historyList = $('historyList');
const resetGame = $('resetGame');
const clearHistory = $('clearHistory');
const cameraHint = $('cameraHint');
const installBtn = $('installBtn');

const STORAGE_KEY = 'jmicha-domino-cam-v2';
const DEFAULT_PLAYERS = ['Equipo A', 'Equipo B', 'Jugador 1', 'Jugador 2'];

let deferredInstallPrompt = null;
let stream = null;
let lastDetections = [];
let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.players) && saved.scores && Array.isArray(saved.history)) {
      return saved;
    }
  } catch (_) {}
  return {
    players: DEFAULT_PLAYERS,
    scores: Object.fromEntries(DEFAULT_PLAYERS.map((name) => [name, 0])),
    history: []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderPlayers() {
  playerSelect.innerHTML = state.players.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  scoreboard.innerHTML = state.players.map((name) => `
    <article class="player-card">
      <b>${escapeHtml(name)}</b>
      <strong>${state.scores[name] || 0}</strong>
      <small>puntos acumulados</small>
    </article>
  `).join('');
}

function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = '<li>No hay anotaciones todavía.</li>';
    return;
  }
  historyList.innerHTML = state.history
    .slice()
    .reverse()
    .map((item) => `<li><mark>${escapeHtml(item.player)}</mark> +${item.points} puntos · ${escapeHtml(item.time)}</li>`)
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Este navegador no permite abrir la cámara. Prueba con Chrome o Safari actualizado.');
    return;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 }
      },
      audio: false
    });
    video.srcObject = stream;
    await new Promise((resolve) => {
      if (video.readyState >= 2) return resolve();
      video.onloadedmetadata = () => resolve();
    });
    await video.play();
    captureBtn.disabled = false;
    cameraHint.innerHTML = '<b>Cámara activa:</b> centra las fichas y presiona “Contar ahora”.';
    fitCanvasToVideo();
  } catch (error) {
    console.error(error);
    alert('No pude abrir la cámara. En teléfono debe abrirse por HTTPS o localhost y aceptar el permiso de cámara.');
  }
}

function fitCanvasToVideo() {
  const rect = video.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(320, Math.round(rect.width * ratio));
  canvas.height = Math.max(320, Math.round(rect.height * ratio));
  drawOverlay();
}

function drawOverlay() {
  // Importante: el canvas va encima del video, así que debe quedar transparente.
  // Si dibujamos el frame de video aquí, parece que la cámara se congeló.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawDetections(ctx, lastDetections, canvas.width, canvas.height);
}

function drawCover(context, source, x, y, w, h) {
  const sourceRatio = source.videoWidth / source.videoHeight;
  const canvasRatio = w / h;
  let sw = source.videoWidth;
  let sh = source.videoHeight;
  let sx = 0;
  let sy = 0;
  if (sourceRatio > canvasRatio) {
    sw = sh * canvasRatio;
    sx = (source.videoWidth - sw) / 2;
  } else {
    sh = sw / canvasRatio;
    sy = (source.videoHeight - sh) / 2;
  }
  context.drawImage(source, sx, sy, sw, sh, x, y, w, h);
}

function captureAndCount() {
  if (!video.videoWidth) return;

  captureBtn.disabled = true;
  captureBtn.textContent = 'Contando...';

  const maxW = 640;
  const scale = Math.min(1, maxW / video.videoWidth);
  const workW = Math.round(video.videoWidth * scale);
  const workH = Math.round(video.videoHeight * scale);
  const workCanvas = document.createElement('canvas');
  workCanvas.width = workW;
  workCanvas.height = workH;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  workCtx.drawImage(video, 0, 0, workW, workH);

  const image = workCtx.getImageData(0, 0, workW, workH);
  const result = analyzeDominoImage(image, workW, workH);

  lastDetections = result.detections.map((d) => ({
    x: d.x / workW,
    y: d.y / workH,
    r: Math.max(5, Math.sqrt(d.area) * 1.35) / Math.min(workW, workH)
  }));

  detectedScore.textContent = result.pips;
  tileCount.textContent = result.estimatedTiles;
  confidence.textContent = result.quality;
  scoreInput.value = result.pips;

  drawOverlay();
  captureBtn.disabled = false;
  captureBtn.textContent = 'Contar ahora';
  cameraHint.innerHTML = result.pips
    ? '<b>Lectura lista:</b> revisa los círculos marcados y corrige manualmente si hace falta.'
    : '<b>No detecté puntos:</b> mejora la luz, acerca la cámara o ajusta la sensibilidad.';
}

function analyzeDominoImage(imageData, width, height) {
  const data = imageData.data;
  const mode = detectMode.value;
  const threshold = Number(sensitivity.value);
  const minA = Number(minArea.value);
  const maxA = Number(maxArea.value);
  const total = width * height;
  const binary = new Uint8Array(total);
  const visited = new Uint8Array(total);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
    if (mode === 'darkOnLight') {
      binary[p] = gray < threshold ? 1 : 0;
    } else {
      binary[p] = gray > threshold ? 1 : 0;
    }
  }

  const detections = [];
  const queue = new Int32Array(total > 800000 ? 800000 : total);
  const step = Math.max(1, Math.round(Math.min(width, height) / 700));

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const start = y * width + x;
      if (!binary[start] || visited[start]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let sumX = 0;
      let sumY = 0;

      while (head < tail && tail < queue.length) {
        const current = queue[head++];
        const cx = current % width;
        const cy = (current / width) | 0;
        area++;
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [current - 1, current + 1, current - width, current + width];
        for (const next of neighbors) {
          if (next <= 0 || next >= total || visited[next] || !binary[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const aspect = bw / bh;
      const fill = area / (bw * bh);
      const maxDim = Math.max(bw, bh);
      const minDim = Math.min(bw, bh);

      const looksLikePip =
        area >= minA &&
        area <= maxA &&
        aspect > 0.42 &&
        aspect < 2.35 &&
        fill > 0.22 &&
        fill < 0.92 &&
        minDim >= 2 &&
        maxDim <= Math.min(width, height) * 0.09;

      if (looksLikePip) {
        detections.push({
          x: sumX / area,
          y: sumY / area,
          area,
          w: bw,
          h: bh
        });
      }
    }
  }

  const merged = mergeCloseDetections(detections, Math.max(8, Math.min(width, height) * 0.018));
  const pips = merged.length;
  const estimatedTiles = estimateTilesFromPips(merged);
  const quality = getQualityLabel(pips, merged);

  return { pips, estimatedTiles, quality, detections: merged };
}

function mergeCloseDetections(detections, distance) {
  const result = [];
  const used = new Set();
  for (let i = 0; i < detections.length; i++) {
    if (used.has(i)) continue;
    const group = [detections[i]];
    used.add(i);
    for (let j = i + 1; j < detections.length; j++) {
      if (used.has(j)) continue;
      const dx = detections[i].x - detections[j].x;
      const dy = detections[i].y - detections[j].y;
      if (Math.hypot(dx, dy) < distance) {
        group.push(detections[j]);
        used.add(j);
      }
    }
    const area = group.reduce((sum, d) => sum + d.area, 0) / group.length;
    result.push({
      x: group.reduce((sum, d) => sum + d.x, 0) / group.length,
      y: group.reduce((sum, d) => sum + d.y, 0) / group.length,
      area
    });
  }
  return result;
}

function estimateTilesFromPips(detections) {
  const pips = detections.length;
  if (!pips) return 0;
  // Estimación práctica: una ficha doble-seis puede tener hasta 12 puntos.
  // En lectura de mano/mesa, este número sirve como aproximación visual; el marcador usa los puntos detectados.
  return Math.max(1, Math.ceil(pips / 12));
}

function getQualityLabel(pips, detections) {
  if (!pips) return 'baja';
  if (pips > 80) return 'revisar';
  const avgArea = detections.reduce((sum, d) => sum + d.area, 0) / detections.length;
  if (avgArea < 10) return 'baja';
  if (avgArea > 1200) return 'revisar';
  return pips <= 40 ? 'buena' : 'media';
}

function drawDetections(context, detections, width, height) {
  if (!detections.length) return;
  context.save();
  context.lineWidth = Math.max(2, width * 0.004);
  context.strokeStyle = '#f8d66d';
  context.fillStyle = 'rgba(248,214,109,.16)';
  detections.forEach((d) => {
    const x = d.x * width;
    const y = d.y * height;
    const r = Math.max(8, d.r * Math.min(width, height));
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  });
  context.restore();
}

function changeManual(delta) {
  const next = Math.max(0, Number(scoreInput.value || 0) + delta);
  scoreInput.value = next;
}

function addScore() {
  const player = playerSelect.value;
  const points = Math.max(0, Number(scoreInput.value || 0));
  if (!player) return;
  state.scores[player] = (state.scores[player] || 0) + points;
  state.history.push({
    player,
    points,
    time: new Date().toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })
  });
  saveState();
  renderPlayers();
  renderHistory();
}

function resetAllScores() {
  if (!confirm('¿Reiniciar el marcador completo?')) return;
  state.scores = Object.fromEntries(state.players.map((name) => [name, 0]));
  state.history = [];
  saveState();
  renderPlayers();
  renderHistory();
}

function clearOnlyHistory() {
  if (!confirm('¿Limpiar solo el historial? El marcador se mantiene.')) return;
  state.history = [];
  saveState();
  renderHistory();
}

detectMode.addEventListener('change', () => {
  sensitivity.value = detectMode.value === 'lightOnDark' ? 172 : 95;
});
startCamera.addEventListener('click', openCamera);
captureBtn.addEventListener('click', captureAndCount);
manualMinus.addEventListener('click', () => changeManual(-1));
manualPlus.addEventListener('click', () => changeManual(1));
saveScore.addEventListener('click', addScore);
resetGame.addEventListener('click', resetAllScores);
clearHistory.addEventListener('click', clearOnlyHistory);
window.addEventListener('resize', fitCanvasToVideo);

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && stream && video.paused) {
    try { await video.play(); } catch (_) {}
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.classList.add('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
  });
}

renderPlayers();
renderHistory();
