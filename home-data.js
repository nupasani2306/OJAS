// Home page data from the OJAS backend: today's metric cards, the band card, the SOS button
// and the fall alert.
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

  /* ---------- SOS button: SOS message → SOS contacts ---------- */
  // Opens the Messages app with every SOS contact and the SOS message filled in, then logs the alert.
  const logAlert = async (type, coords) => {
    try {
      const { event } = await apiFetch('/api/emergency/events', {
        method: 'POST',
        body: { event_type: type, ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}) },
      });
      // SENT = handed to the Messages app (the person still taps Send there).
      await apiFetch(`/api/emergency/events/${event.id}`, { method: 'PATCH', body: { status: 'SENT' } });
    } catch { /* logging must never block the alert */ }
  };

  const sos = document.querySelector('.sos');
  let sosBusy = false;
  if (sos) {
    sos.addEventListener('click', async () => {
      if (sosBusy) return;
      sosBusy = true;
      try {
        const sent = await ojasAlert.send('sos');
        if (sent) logAlert('SOS', sent.coords);
      } finally {
        sosBusy = false;
      }
    });
  }

  /* ---------- Fall detected by the band: Emergency message → Emergency contacts ---------- */
  // The band reports a fall as a PENDING "FALL" event. Ask the person straight away; one tap opens
  // the Messages app with the Emergency message (a browser only opens it from a tap).
  const fallModal = document.getElementById('fall-alert');
  const handled = new Set(JSON.parse(sessionStorage.getItem('ojas.handledFalls') || '[]'));
  let fallEvent = null;

  function showFall(event) {
    fallEvent = event;
    document.getElementById('fall-time').textContent =
      new Date(event.triggered_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    fallModal.hidden = false;
    document.body.classList.add('modal-open');
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
    document.getElementById('fall-send').focus();
  }

  function closeFall(status) {
    const event = fallEvent;
    fallEvent = null;
    fallModal.hidden = true;
    document.body.classList.remove('modal-open');
    handled.add(event.id);
    sessionStorage.setItem('ojas.handledFalls', JSON.stringify([...handled]));
    if (status) apiFetch(`/api/emergency/events/${event.id}`, { method: 'PATCH', body: { status } }).catch(() => {});
  }

  async function checkFalls() {
    if (!fallModal || fallEvent || document.hidden) return;
    try {
      const { events } = await apiFetch('/api/emergency/events');
      const recent = Date.now() - 15 * 60 * 1000;
      const fall = events.find((e) => e.event_type === 'FALL' && e.status === 'PENDING'
        && Date.parse(e.triggered_at) > recent && !handled.has(e.id));
      if (fall) showFall(fall);
    } catch { /* try again on the next check */ }
  }

  if (fallModal) {
    document.getElementById('fall-send').addEventListener('click', async () => {
      const event = fallEvent;
      const coords = event.latitude != null && event.longitude != null
        ? { latitude: Number(event.latitude), longitude: Number(event.longitude) } : undefined;
      const sent = await ojasAlert.send('emergency', coords);
      if (sent) closeFall('SENT');
    });
    document.getElementById('fall-ok').addEventListener('click', () => closeFall('CANCELLED'));
    checkFalls();
    setInterval(checkFalls, 20000);
    document.addEventListener('visibilitychange', checkFalls);
  }

  load();
})();
