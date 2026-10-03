// Home page data: today's metric cards and the band card, live from the OJAS Band over Bluetooth
// (band.js) and from the OJAS backend; the SOS button; and fall alerts saved on the server.
// Also refreshes the cached profile, contacts and messages that the QR code and SOS share use.
(function () {
  const setAll = (selector, text) => document.querySelectorAll(selector).forEach((el) => { el.textContent = text; });
  const fmtInt = (n) => Math.round(n).toLocaleString();

  let today = null;          // GET /api/health/today (null until loaded)
  let serverDevice = null;   // the paired band as saved on the server

  /* ---------- Metric cards ---------- */
  // While the band is connected, heart rate and SpO2 come straight from it; "--" means the band has
  // no valid reading right now (no finger on the sensor, still measuring). Otherwise the cards show
  // the latest values saved on the server. Steps = saved today + counted by the band, not saved yet.
  function renderMetrics() {
    // Metric cards exist twice or three times (the carousel clones them), so update every copy.
    const live = ojasBand.status === 'connected';
    const v = ojasBand.vitals;
    if (live) {
      setAll('.metrics-track .metric.heart strong', v && v.hr != null ? fmtInt(v.hr) : '--');
      setAll('.metrics-track .metric.spo2 strong', v && v.spo2 != null ? `${fmtInt(v.spo2)}%` : '--');
    } else if (today) {
      setAll('.metrics-track .metric.heart strong', today.heart_rate ? fmtInt(today.heart_rate.value) : '--');
      setAll('.metrics-track .metric.spo2 strong', today.spo2 ? `${fmtInt(today.spo2.value)}%` : '--');
    }
    if (today || live) setAll('.metrics-track .metric.steps strong', fmtInt(((today && today.steps) || 0) + ojasBand.unsyncedSteps()));
    if (!today) return;
    setAll('.metrics-track .metric.calories strong', fmtInt(today.calories || 0));
    setAll('.metrics-track .metric.water strong', `${((today.water || 0) / 1000).toFixed(1)} L`);
    const sleep = today.sleep_minutes;
    setAll('.metrics-track .metric.sleep strong', sleep == null ? '--' : `${Math.floor(sleep / 60)}h ${Math.round(sleep % 60)}m`);
  }

  /* ---------- Band card ---------- */
  const statusEl = document.getElementById('device-status');
  const card = statusEl && statusEl.closest('.device');
  let connectBtn = null;

  function setBattery(level) {
    const block = card && card.querySelector('.device-battery');
    if (!block) return;
    block.hidden = false;
    block.querySelector('strong').textContent = level == null ? '--' : `${level}%`;
    const fill = block.querySelector('.batt i');
    if (fill) fill.style.width = level == null ? '0%' : `${level}%`;
  }

  function renderBand() {
    if (!statusEl) return;
    if (!ojasBand.supported) {
      // No Bluetooth in this browser: show what the server knows (auth-guard.js handles "no band").
      if (!serverDevice) return;
      const seenRecently = serverDevice.last_seen_at && Date.now() - Date.parse(serverDevice.last_seen_at) < 10 * 60 * 1000;
      const connected = serverDevice.is_connected && seenRecently;
      statusEl.classList.toggle('is-off', !connected);
      statusEl.lastChild.textContent = connected ? 'Connected' : 'Not connected';
      setBattery(serverDevice.battery_level);
      return;
    }

    const st = ojasBand.status;
    statusEl.classList.toggle('is-off', st !== 'connected');
    statusEl.lastChild.textContent = { connected: 'Connected', connecting: 'Connecting…' }[st] || 'Not connected';

    if (!connectBtn) {
      connectBtn = document.createElement('button');
      connectBtn.type = 'button';
      connectBtn.className = 'device-connect';
      connectBtn.textContent = 'Connect band';
      connectBtn.addEventListener('click', async () => {
        try {
          await ojasBand.connect();
        } catch (err) {
          if (err.name !== 'NotFoundError') ojasToast(err.message);   // NotFoundError = picker closed
        }
      });
      card.append(connectBtn);
    }
    connectBtn.hidden = st === 'connected' || st === 'connecting';
    const battery = card.querySelector('.device-battery');
    if (st === 'connected') setBattery(ojasBand.battery != null ? ojasBand.battery : null);
    else if (battery) battery.hidden = true;
  }

  ojasBand.on('status', () => { renderBand(); renderMetrics(); });
  ojasBand.on('vitals', () => { renderBand(); renderMetrics(); });
  ojasBand.on('synced', ({ steps }) => {
    if (today) today.steps = (today.steps || 0) + steps;
    renderMetrics();
  });
  // Live values go stale if the band stops sending; re-check every few seconds.
  setInterval(renderMetrics, 5000);

  async function load() {
    const [todayRes, devices] = await Promise.allSettled([
      apiFetch(`/api/health/today?tz=${ojasTz()}`),
      apiFetch('/api/devices'),
    ]);
    if (todayRes.status === 'fulfilled') today = todayRes.value.today;
    if (devices.status === 'fulfilled') {
      serverDevice = devices.value.devices[0] || null;
      if (serverDevice) {
        ojasStore.set('ojas.device', { id: serverDevice.id, code: serverDevice.device_uid.replace(/^OJAS-/, ''), name: serverDevice.device_name, pairedAt: Date.parse(serverDevice.paired_at) });
      }
    }
    renderMetrics();
    renderBand();
    // Keep the QR code and SOS share up to date (errors here are not shown on the home page).
    Promise.allSettled([ojasSync.profile(), ojasSync.contacts(), ojasSync.settings()]).then(() => {
      const session = ojasStore.get('ojas.session');
      const first = session && session.name ? session.name.trim().split(/\s+/)[0] : '';
      if (first) document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = first; });
    });
  }

  /* ---------- SOS button: SOS message → SOS contacts (band.js ojasAlerts) ---------- */
  const sos = document.querySelector('.sos');
  if (sos) sos.addEventListener('click', () => ojasAlerts.sosButton());

  /* ---------- Fall events saved on the server ---------- */
  // Band alerts arrive over Bluetooth (band.js). This also catches a PENDING fall saved on the
  // server some other way, and shows it in the same dialog.
  async function checkFalls() {
    if (document.hidden || ojasAlerts.active) return;
    try {
      const { events } = await apiFetch('/api/emergency/events');
      const recent = Date.now() - 15 * 60 * 1000;
      const fall = events.find((e) => e.event_type === 'FALL' && e.status === 'PENDING' && Date.parse(e.triggered_at) > recent);
      if (fall) ojasAlerts.fromServer(fall);
    } catch { /* try again on the next check */ }
  }
  checkFalls();
  setInterval(checkFalls, 20000);
  document.addEventListener('visibilitychange', checkFalls);

  renderBand();
  load();
})();
