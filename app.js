const map = L.map('map', { worldCopyJump: true }).setView([15, 10], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markersLayer = L.layerGroup().addTo(map);
const itemsEl = document.getElementById('items');
const totalItemsEl = document.getElementById('totalItems');
const highRiskEl = document.getElementById('highRisk');
const updatedAtEl = document.getElementById('updatedAt');
const refreshBtn = document.getElementById('refreshBtn');

function riskColor(risk){
  if (risk === 'Nguy hiểm' || risk === 'Cao') return '#ff5a5f';
  if (risk === 'Trung bình') return '#ffcc66';
  return '#55d6be';
}

function riskClass(risk){
  if (risk === 'Nguy hiểm' || risk === 'Cao') return 'high';
  if (risk === 'Trung bình') return 'medium';
  return 'low';
}

function fmtDate(value){
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('vi-VN');
}

function safeText(text){
  return String(text || '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function render(state){
  totalItemsEl.textContent = state.stats?.totalItems ?? 0;
  highRiskEl.textContent = state.stats?.highRisk ?? 0;
  updatedAtEl.textContent = fmtDate(state.updatedAt);

  markersLayer.clearLayers();
  itemsEl.innerHTML = '';

  const items = state.items || [];

  if (items.length === 0) {
    itemsEl.innerHTML = '<div class="item"><div class="title">Chưa có dữ liệu phù hợp</div><div class="meta">Hệ thống chưa trích xuất được ổ dịch từ tin công khai ở lần quét này.</div></div>';
    return;
  }

  const bounds = [];

  items.forEach((item) => {
    const marker = L.circleMarker([item.lat, item.lng], {
      radius: 9,
      color: riskColor(item.risk),
      fillColor: riskColor(item.risk),
      fillOpacity: 0.8,
      weight: 2
    }).bindPopup(`
      <strong>${safeText(item.location)}</strong><br/>
      <div>${safeText(item.title)}</div><br/>
      <div><b>Mức:</b> ${safeText(item.risk)}</div>
      <div><b>Ca ước tính:</b> ${safeText(item.cases || '—')}</div>
      <div><b>Nguồn:</b> ${safeText(item.source)}</div>
      <div><a href="${safeText(item.url)}" target="_blank" rel="noreferrer">Mở bài gốc</a></div>
    `);
    marker.addTo(markersLayer);
    bounds.push([item.lat, item.lng]);

    const a = document.createElement('a');
    a.className = 'item';
    a.href = item.url || '#';
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.innerHTML = `
      <div class="title">${safeText(item.location)} · ${safeText(item.risk)}</div>
      <div class="meta">${safeText(item.summary || item.title)}</div>
      <div class="meta">Nguồn: ${safeText(item.source)} · ${safeText(fmtDate(item.publishedAt))}</div>
      <span class="badge ${riskClass(item.risk)}">${safeText(item.risk)}</span>
    `;
    itemsEl.appendChild(a);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

async function loadData(force=false){
  refreshBtn.disabled = true;
  refreshBtn.textContent = force ? 'Đang cập nhật…' : 'Đang tải…';
  try{
    const res = await fetch(force ? '/api/refresh' : '/api/outbreaks', { method: force ? 'POST' : 'GET' });
    const data = await res.json();
    render(data);
  } catch (err) {
    itemsEl.innerHTML = '<div class="item"><div class="title">Lỗi tải dữ liệu</div><div class="meta">Kiểm tra kết nối mạng hoặc backend.</div></div>';
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Cập nhật ngay';
  }
}

refreshBtn.addEventListener('click', () => loadData(true));
loadData(false);
setInterval(() => loadData(false), 5 * 60 * 1000);
