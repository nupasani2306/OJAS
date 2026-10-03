// Home page data from the OJAS backend: today's metric cards, the band card, and SOS logging.
// Also refreshes the cached profile, contacts and messages that the QR code and SOS share use.
(function () {
  const setAll = (selector, text) => document.querySelectorAll(selector).forEach((el) => { el.textContent = text; });
  const fmtInt = (n) => Math.round(n).toLocaleString();

  function showToday(t) {
    // Metric cards exist twice or three times (the carousel clones them), so update every copy.
    setAll('.metrics-track .metric.heart strong', t.heart_rate ? fmtInt(t.heart_rate.value) : '--');
    setAll('.metrics-track .metric.spo2 strong', t.spo2 ? `${fmtInt(t.spo2.value)}%` : '--');
    setAll('.metrics-track .metric.steps strong', fmtInt(t.steps || 0));
    setAll('.metrics-track .metric.calories strong', fmtInt(t.calories || 0));
    setAll('.metrics-track .metric.water strong', `${((t.water || 0) / 1000).toFixed(1)} L`);
    const sleep = t.sleep_minutes;
    setAll('.metrics-track .metric.sleep strong', sleep == null ? '--' : `${Math.floor(sleep / 60)}h ${Math.round(sleep % 60)}m`);
  }

  function showBand(device) {
    const status = document.getElementById('device-status');
    if (!status || !device) return;   // no band: auth-guard.js already shows "Not connected"
    const seenRecently = device.last_seen_at && Date.now() - Date.parse(device.last_seen_at) < 10 * 60 * 1000;
    const connected = device.is_connected || seenRecently;
    status.classList.toggle('is-off', !connected);
    status.lastChild.textContent = connected ? 'Connected' : 'Not connected';
    const battery = document.querySelector('.device .device-battery strong');
    if (battery) battery.textContent = device.battery_level == null ? '--' : `${device.battery_level}%`;
    const fill = document.querySelector('.device .batt i');
    if (fill && device.battery_level != null) fill.style.width = `${device.battery_level}%`;
  }

  async function load() {
    const [today, devices] = await Promise.allSettled([
      apiFetch(`/api/health/today?tz=${ojasTz()}`),
      apiFetch('/api/devices'),
    ]);
    if (today.status === 'fulfilled') showToday(today.value.today);
    if (devices.status === 'fulfilled') {
      const device = devices.value.devices[0];
      if (device) {
        ojasStore.set('ojas.device', { id: device.id, code: device.device_uid.replace(/^OJAS-/, ''), name: device.device_name, pairedAt: Date.parse(device.paired_at) });
      }
      showBand(device);
    }
    // Keep the QR code and SOS share up to date (errors here are not shown on the home page).
    Promise.allSettled([ojasSync.profile(), ojasSync.contacts(), ojasSync.settings()]).then(() => {
      const session = ojasStore.get('ojas.session');
      const first = session && session.name ? session.name.trim().split(/\s+/)[0] : '';
      if (first) document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = first; });
    });
  }

  // Log every SOS press on the server (with location if the person allows it).
  const sos = document.querySelector('.sos');
  if (sos) {
    sos.addEventListener('click', () => {
      const send = (coords) => apiFetch('/api/emergency/events', {
        method: 'POST',
        body: { event_type: 'SOS', ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}) },
      }).catch(() => { /* the share sheet still opens even if logging fails */ });
      if (!navigator.geolocation) { send(null); return; }
      navigator.geolocation.getCurrentPosition((pos) => send(pos.coords), () => send(null), { timeout: 5000, maximumAge: 60000 });
    });
  }

  load();
})();
