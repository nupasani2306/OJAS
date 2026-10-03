// OJAS Band over Bluetooth (Web Bluetooth, Chrome/Edge). Load after api.js on every app page.
//
//   ESP32-C3 band ──BLE notify──▶ ojasBand (this file) ──events──▶ page UI (home-data.js)
//                                      │                     └──▶ ojasAlerts (fall / SOS dialog)
//                                      └──▶ Flask API: readings every minute, band battery/connection
//
// One connection per page: ojasBand is the only object that talks to the band. Pages listen with
// ojasBand.on('vitals' | 'status' | 'alert' | 'synced', handler). Values are only what the band
// sends; a reading the band marks invalid (or with no finger on the sensor) is reported as null.
const OJAS_BLE = {
  name: 'OJAS-Band',
  service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  vitals: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  alert: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  command: '6e400004-b5a3-f393-e0a9-e50e24dcca9e',
};

const ojasBand = (() => {
  const events = new EventTarget();
  const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
  const decoder = new TextDecoder();

  const supported = !!(navigator.bluetooth && window.isSecureContext);
  const STALE_MS = 10000;          // no vitals for this long → treat live values as unknown
  const UPLOAD_MS = 60000;         // save readings to the server once a minute
  const BATTERY_UPLOAD_MS = 120000;
  const RETRY_DELAYS = [1, 2, 5, 10, 20, 30];  // seconds between reconnect attempts

  const state = {
    status: supported ? 'disconnected' : 'unsupported',   // unsupported | disconnected | connecting | connected
    vitals: null,                  // last parsed packet (see parseVitals)
    vitalsAt: 0,
  };
  let device = null;
  let chars = { vitals: null, alert: null, command: null };
  let opening = null;
  let userDisconnect = false;
  let retryTimer = null;
  let retryCount = 0;

  function setStatus(status) {
    if (state.status === status) return;
    state.status = status;
    emit('status', status);
  }

  /* ---------- Vitals parsing ---------- */
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const flag = (v) => v === 1 || v === true || v === '1';

  // {"hr":72,"spo2":98,"hrValid":1,"spo2Valid":1,"contact":1,"finger":1,"steps":1234,"bat":85}
  function parseVitals(raw) {
    const finger = raw.finger === undefined ? true : flag(raw.finger);
    const hr = num(raw.hr);
    const spo2 = num(raw.spo2);
    const steps = num(raw.steps);
    const bat = num(raw.bat);
    return {
      finger,
      contact: raw.contact === undefined ? null : flag(raw.contact),
      hr: finger && flag(raw.hrValid) && hr > 0 ? hr : null,
      spo2: finger && flag(raw.spo2Valid) && spo2 > 0 && spo2 <= 100 ? spo2 : null,
      steps: steps != null && steps >= 0 ? Math.floor(steps) : null,
      battery: bat != null && bat >= 0 && bat <= 100 ? Math.round(bat) : null,
      at: Date.now(),
    };
  }

  // A notification normally holds one whole JSON object. If a packet arrives split in pieces
  // (small BLE packet size), join the pieces until the object is complete.
  let buffer = '';
  let badPackets = 0;
  // The first packets of each connection are written to the browser console (F12 → Console)
  // so the band's data can be checked while setting up.
  let logged = 0;
  let packetAt = 0;
  const logPacket = (label, text) => {
    if (logged < 15) { logged += 1; console.info(`[OJAS band] ${label}:`, text); }
  };
  function readJson(dataView) {
    const text = decoder.decode(dataView).replace(/\0/g, '').trim();
    logPacket('vitals packet', JSON.stringify(text));
    packetAt = Date.now();
    if (!text) return null;
    buffer = text.startsWith('{') ? text : buffer + text;
    if (buffer.length > 2048) buffer = '';
    try {
      const obj = JSON.parse(buffer);
      buffer = '';
      badPackets = 0;
      return obj;
    } catch {
      badPackets += 1;
      if (badPackets === 6) {
        console.warn('[OJAS band] vitals keep arriving incomplete:', JSON.stringify(text));
        emit('problem', 'incomplete-data');
      }
      return null;
    }
  }

  let notifiedAt = 0;      // last vitals *notification* (as opposed to a read)
  let parsedAt = 0;
  let reading = false;     // a readValue() is in progress (Chrome reports its result as an event too)
  let handled = 0;
  function onVitals(e) {
    handled += 1;
    if (e.type === 'characteristicvaluechanged' && !reading) notifiedAt = Date.now();
    const raw = readJson(e.target.value);
    if (!raw || typeof raw !== 'object') return;
    if (!['hr', 'spo2', 'steps', 'bat', 'finger'].some((k) => k in raw)) {
      logPacket('not OJAS vitals (expected hr, spo2, steps, bat, finger)', Object.keys(raw).join(', '));
      return;
    }
    const v = parseVitals(raw);
    parsedAt = v.at;
    if (logged < 15) logPacket('parsed', JSON.stringify(v));
    state.vitals = v;
    state.vitalsAt = v.at;
    trackSteps(v.steps);
    trackReadings(v);
    trackBattery(v.battery);
    emit('vitals', v);
  }

  /* ---------- Alerts ---------- */
  let lastAlert = { code: null, at: 0 };
  function onAlert(e) {
    const text = decoder.decode(e.target.value).replace(/\0/g, '').trim().toUpperCase();
    console.info('[OJAS band] alert:', JSON.stringify(text));
    const match = text.match(/FALL_PENDING|CANCEL+ED|FALL|SOS/);
    if (!match) return;
    const code = match[0].startsWith('CANCEL') ? 'CANCELLED' : match[0];
    // The band re-sends FALL and SOS every few seconds until the app answers ACK.
    if (code === 'FALL' || code === 'SOS') command('ACK');
    // The same notification delivered twice in a row is one alert. Repeats of an emergency
    // (the band re-sends FALL / SOS until ACK) are handled in ojasAlerts.
    if (code === lastAlert.code && Date.now() - lastAlert.at < 2000) return;
    lastAlert = { code, at: Date.now() };
    emit('alert', code);
  }

  // Commands the band understands: ACK (stop re-sending the last FALL/SOS), CANCEL (cancel a
  // pending fall), BUZZ, RESETSTEPS. Writes are queued so two never overlap.
  let commandQueue = Promise.resolve();
  function command(text) {
    const ch = chars.command;
    if (!ch || state.status !== 'connected') return Promise.resolve(false);
    const bytes = new TextEncoder().encode(text);
    commandQueue = commandQueue.then(async () => {
      try {
        if (ch.writeValueWithoutResponse && ch.properties && ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(bytes);
        else if (ch.writeValueWithResponse) await ch.writeValueWithResponse(bytes);
        else await ch.writeValue(bytes);
        console.info('[OJAS band] command sent:', text);
        return true;
      } catch (err) {
        console.warn('[OJAS band] command failed:', text, err.message);
        return false;
      }
    });
    return commandQueue;
  }

  /* ---------- Connection ---------- */
  function attach(d) {
    if (device === d) return;
    if (device) device.removeEventListener('gattserverdisconnected', onDisconnected);
    device = d;
    device.addEventListener('gattserverdisconnected', onDisconnected);
  }

  async function subscribe(service, uuid, handler, key) {
    const ch = await service.getCharacteristic(uuid);
    if (chars[key]) chars[key].removeEventListener('characteristicvaluechanged', chars[key]._ojasHandler);
    ch.removeEventListener('characteristicvaluechanged', handler);
    ch.addEventListener('characteristicvaluechanged', handler);
    ch._ojasHandler = handler;
    chars[key] = ch;
    await ch.startNotifications();
    return ch;
  }

  function open() {
    if (opening) return opening;
    clearTimeout(retryTimer);
    userDisconnect = false;
    setStatus('connecting');
    opening = (async () => {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(OJAS_BLE.service);
      const vitals = await subscribe(service, OJAS_BLE.vitals, onVitals, 'vitals');
      await subscribe(service, OJAS_BLE.alert, onAlert, 'alert');
      try { chars.command = await service.getCharacteristic(OJAS_BLE.command); } catch { chars.command = null; }
      retryCount = 0;
      buffer = '';
      logged = 0;
      packetAt = 0;
      notifiedAt = 0;
      parsedAt = 0;
      const p = vitals.properties || {};
      console.info('[OJAS band] connected to', device.name, '— vitals characteristic:',
        { notify: !!p.notify, indicate: !!p.indicate, read: !!p.read });
      setStatus('connected');
      emit('connected', { name: device.name });
      deviceUpdate({ is_connected: true }, true);
      // Show the current values straight away if the band allows reading them.
      if (p.read) await readVitals(vitals);
      watchVitals(vitals);
    })().catch((err) => {
      setStatus('disconnected');
      if (device && !userDisconnect) scheduleReconnect();
      throw err;
    }).finally(() => { opening = null; });
    return opening;
  }

  // If no notifications arrive (for example the band's notify setup is incomplete), read the
  // characteristic every 2 s instead, as long as the band allows reading it. Also say so once.
  let pollTimer = null;
  async function readVitals(vitals) {
    const before = handled;
    reading = true;
    try {
      const value = await vitals.readValue();
      if (handled === before) onVitals({ type: 'read', target: { value } });   // no event was fired for it
    } catch { /* wait for the next notification */ } finally {
      reading = false;
    }
  }

  function watchVitals(vitals) {
    clearInterval(pollTimer);
    const started = Date.now();
    let warned = false;
    pollTimer = setInterval(async () => {
      if (state.status !== 'connected') { clearInterval(pollTimer); return; }
      const quiet = Date.now() - Math.max(notifiedAt, started) > 4000;
      if (quiet && vitals.properties && vitals.properties.read) {
        await readVitals(vitals);
      }
      if (!warned && Date.now() - started > 10000 && Date.now() - parsedAt > 10000) {
        warned = true;
        console.warn('[OJAS band] connected, but no readable vitals received in 10 s.',
          packetAt ? 'Packets arrive but could not be read (see "vitals packet" above).' : 'No vitals packets arrived.');
        emit('problem', packetAt ? 'unreadable-data' : 'no-data');
      }
    }, 2000);
  }

  function onDisconnected() {
    clearInterval(pollTimer);
    setStatus('disconnected');
    emit('disconnected');
    flush();
    deviceUpdate({ is_connected: false }, true);
    if (!userDisconnect) scheduleReconnect();
  }

  function scheduleReconnect() {
    clearTimeout(retryTimer);
    const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)] * 1000;
    retryCount += 1;
    retryTimer = setTimeout(() => {
      if (!device || userDisconnect || state.status === 'connected') return;
      open().catch(() => { /* open() schedules the next try */ });
    }, delay);
  }

  // Must be called from a tap/click: Chrome shows its device picker.
  async function connect() {
    if (!supported) {
      throw new Error(navigator.bluetooth
        ? 'Bluetooth needs a secure page: open OJAS at http://localhost or over https.'
        : 'This browser cannot use Bluetooth. Use Chrome (Android, Windows, Mac or ChromeOS).');
    }
    const picked = await navigator.bluetooth.requestDevice({
      filters: [{ name: OJAS_BLE.name }, { namePrefix: 'OJAS' }],
      optionalServices: [OJAS_BLE.service],
    });
    attach(picked);
    return open();
  }

  // Reconnect to a band this site was already allowed to use, without the picker
  // (works where Chrome supports navigator.bluetooth.getDevices()).
  async function autoConnect() {
    if (!supported || !navigator.bluetooth.getDevices) return false;
    try {
      const known = await navigator.bluetooth.getDevices();
      const band = known.find((d) => d.name === OJAS_BLE.name) || known.find((d) => (d.name || '').startsWith('OJAS'));
      if (!band) return false;
      attach(band);
      open().catch(() => { /* retried automatically */ });
      return true;
    } catch {
      return false;
    }
  }

  function disconnect() {
    userDisconnect = true;
    clearTimeout(retryTimer);
    if (device && device.gatt.connected) device.gatt.disconnect();
    else setStatus('disconnected');
  }

  /* ---------- Saving to the server ---------- */
  const STEPS_KEY = 'ojas.bandSteps';
  // The band's step count is a running total. Keep the last total seen and the steps not yet saved.
  function trackSteps(total) {
    if (total == null) return;
    const s = ojasStore.get(STEPS_KEY, { last: null, unsynced: 0 });
    let delta;
    if (s.last == null) delta = total;           // first time: count the band's total so far
    else if (total >= s.last) delta = total - s.last;
    else delta = total;                          // band restarted and counts from zero again
    s.last = total;
    s.unsynced += delta;
    ojasStore.set(STEPS_KEY, s);
  }
  const unsyncedSteps = () => ojasStore.get(STEPS_KEY, { unsynced: 0 }).unsynced || 0;

  let latestValid = { hr: null, spo2: null };
  function trackReadings(v) {
    if (v.hr != null) latestValid.hr = { value: v.hr, at: v.at };
    if (v.spo2 != null) latestValid.spo2 = { value: v.spo2, at: v.at };
  }

  const pairedDeviceId = () => (ojasStore.get('ojas.device') || {}).id || null;

  let uploading = false;
  async function flush(keepalive = false) {
    if (uploading || !getToken()) return;
    const now = Date.now();
    const readings = [];
    if (latestValid.hr && now - latestValid.hr.at < UPLOAD_MS) readings.push({ metric: 'heart_rate', value: latestValid.hr.value });
    if (latestValid.spo2 && now - latestValid.spo2.at < UPLOAD_MS) readings.push({ metric: 'spo2', value: latestValid.spo2.value });
    const steps = unsyncedSteps();
    if (steps > 0) readings.push({ metric: 'steps', value: steps });
    if (!readings.length) return;

    uploading = true;
    latestValid = { hr: null, spo2: null };
    const deviceId = pairedDeviceId();
    try {
      await apiFetch('/api/health/readings', {
        method: 'POST',
        keepalive,
        body: { source: 'band', ...(deviceId ? { device_id: deviceId } : {}), readings },
      });
      if (steps > 0) {
        const s = ojasStore.get(STEPS_KEY, { last: null, unsynced: 0 });
        s.unsynced = Math.max(0, s.unsynced - steps);
        ojasStore.set(STEPS_KEY, s);
      }
      emit('synced', { steps });
    } catch (err) {
      console.warn('[OJAS band] could not save readings:', err.message);   // steps stay unsynced and are retried
    } finally {
      uploading = false;
    }
  }

  let battery = { value: null, sentAt: 0, sentValue: null };
  function trackBattery(value) {
    if (value == null) return;
    battery.value = value;
    if (value === battery.sentValue) return;
    // The first value after connecting is saved at once; later changes at most every 2 minutes.
    if (battery.sentValue == null || Date.now() - battery.sentAt > BATTERY_UPLOAD_MS) deviceUpdate({}, true);
  }

  // Keep the paired band's battery / connection state on the server (only if the band is paired).
  function deviceUpdate(extra, force) {
    const id = pairedDeviceId();
    if (!id || !getToken()) return;
    if (!force && Date.now() - battery.sentAt < BATTERY_UPLOAD_MS) return;
    battery.sentAt = Date.now();
    battery.sentValue = battery.value;
    const body = { last_seen_at: new Date().toISOString(), ...extra };
    if (battery.value != null) body.battery_level = battery.value;
    if (state.status === 'connected' && extra.is_connected === undefined) body.is_connected = true;
    apiFetch(`/api/devices/${id}`, { method: 'PUT', body }).catch(() => { /* not critical */ });
  }

  if (supported) {
    setInterval(() => flush(), UPLOAD_MS);
    window.addEventListener('pagehide', () => flush(true));
  }

  return {
    supported,
    get status() { return state.status; },
    get name() { return device ? device.name : null; },
    // Latest vitals, or null when not connected or the band has gone quiet.
    get vitals() {
      return state.status === 'connected' && state.vitals && Date.now() - state.vitalsAt < STALE_MS ? state.vitals : null;
    },
    get battery() { return battery.value; },
    unsyncedSteps,
    connect,
    command,
    autoConnect,
    disconnect,
    flush,
    on(type, handler) { events.addEventListener(type, (e) => handler(e.detail)); },
  };
})();

/* ==========================================================================
   Emergency alerts: SOS and falls, from the band, the SOS button and the server.

   SOS          → the SOS message to the SOS contacts opens straight away (no confirmation).
   FALL_PENDING → warning with a countdown and "Cancel emergency"; if nobody cancels, the
                  emergency message goes to the emergency contacts when the countdown ends.
   FALL         → (the band's own countdown ended) open the emergency message now.
   CANCELLED    → the fall was cancelled on the band: stop the countdown.

   Sending: the event is saved (/api/emergency/events), the server returns the message and the
   contacts (/api/emergency/events/<id>/message), and the phone's Messages app opens with them.
   ========================================================================== */
const ojasAlerts = (() => {
  const FALL_COUNTDOWN_S = 10;      // same as CANCEL_WINDOW_MS in the band firmware
  const BAND_REPEAT_MS = 60000;     // the same band alert again within this time is the same emergency

  const handled = new Set(JSON.parse(sessionStorage.getItem('ojas.handledAlerts') || '[]'));
  const remember = (id) => {
    if (!id) return;
    handled.add(id);
    sessionStorage.setItem('ojas.handledAlerts', JSON.stringify([...handled].slice(-50)));
  };

  let modal = null;
  let actions = {};                 // what the two dialog buttons do right now
  let visibleKind = null;           // 'countdown' | 'sending' | 'result' | null
  let countdown = null;             // { endsAt, timer } while a possible fall is being counted down
  const lastBand = { sos: 0, fall: 0 };
  const sending = { sos: false, fall: false };

  /* ---------- Dialog ---------- */
  function build() {
    if (modal) return modal;
    modal = document.getElementById('fall-alert');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'docs-modal fall-modal';
      modal.id = 'fall-alert';
      modal.hidden = true;
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <section class="docs-dialog fall-dialog" role="alertdialog" aria-modal="true" aria-labelledby="fall-title" aria-describedby="fall-text">
          <span class="fall-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18h.01"/></svg>
          </span>
          <h2 id="fall-title"></h2>
          <p id="fall-text" aria-live="polite"></p>
          <button type="button" class="btn-primary fall-send" id="fall-send"></button>
          <button type="button" class="btn-ghost fall-ok" id="fall-ok"></button>
        </section>`;
      document.body.append(modal);
    }
    modal.querySelector('#fall-send').addEventListener('click', () => actions.primary && actions.primary());
    modal.querySelector('#fall-ok').addEventListener('click', () => actions.secondary && actions.secondary());
    return modal;
  }

  // view({ kind, title, html, ok, primary: [label, fn], secondary: [label, fn] })
  function view({ kind, title, html, ok = false, primary = null, secondary = null }) {
    const m = build();
    visibleKind = kind;
    m.querySelector('.fall-dialog').classList.toggle('is-ok', ok);
    m.querySelector('.fall-icon svg').innerHTML = ok
      ? '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
      : '<path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18h.01"/>';
    m.querySelector('#fall-title').textContent = title;
    m.querySelector('#fall-text').innerHTML = html;
    const [p, s] = [m.querySelector('#fall-send'), m.querySelector('#fall-ok')];
    p.hidden = !primary;
    s.hidden = !secondary;
    if (primary) p.textContent = primary[0];
    if (secondary) s.textContent = secondary[0];
    actions = { primary: primary && primary[1], secondary: secondary && secondary[1] };
    const opening = m.hidden;
    m.hidden = false;
    document.body.classList.add('modal-open');
    if (opening && primary) p.focus();
  }

  function hide() {
    visibleKind = null;
    actions = {};
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  const buzz = () => { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Server ---------- */
  // Save a FALL or SOS event (with the location when the phone can get it).
  function logEvent(type) {
    return ojasAlert.locate().then((coords) => apiFetch('/api/emergency/events', {
      method: 'POST',
      body: { event_type: type, ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}) },
    }).then(({ event }) => { remember(event.id); return event; })).catch(() => null);
  }

  function patch(event, status) {
    if (event) apiFetch(`/api/emergency/events/${event.id}`, { method: 'PATCH', body: { status } }).catch(() => {});
  }

  /* ---------- Sending ---------- */
  // kind: 'sos' (SOS message → SOS contacts) or 'fall' (emergency message → emergency contacts).
  // The event is saved, the server returns the message text and contacts, and the phone's
  // Messages app is opened with them straight away (the person taps Send there). If the phone
  // blocks opening it automatically, the "Open Messages" button does it in one tap.
  async function dispatch(kind, { event = null } = {}) {
    if (sending[kind]) return;
    sending[kind] = true;
    const sos = kind === 'sos';
    try {
      view({ kind: 'sending', title: sos ? 'Preparing SOS…' : 'Preparing emergency message…', html: 'Getting your contacts and location.' });
      buzz();
      const ev = event || await logEvent(sos ? 'SOS' : 'FALL');
      let msg = null;
      if (ev) {
        remember(ev.id);
        try {
          msg = await apiFetch(`/api/emergency/events/${ev.id}/message`);
        } catch (err) {
          if (err.data && err.data.no_contacts) {
            view({
              kind: 'result',
              title: 'No contacts to alert',
              html: esc(err.message),
              primary: ['Add contacts', () => { location.href = 'emergency.html'; }],
              secondary: ['Close', hide],
            });
            return;
          }
          if (err.status === 409) { hide(); return; }   // cancelled meanwhile
          // otherwise (offline): use the contacts and message saved on this device
        }
      }

      const handedOver = () => {
        patch(ev, 'SENT');   // SENT = handed to the Messages app
        view({
          kind: 'result',
          ok: true,
          title: 'Messages opened',
          html: `Your ${sos ? 'SOS' : 'emergency'} message is ready. Tap <strong>Send</strong> in Messages.`,
          primary: ['OK', hide],
          secondary: ['Open Messages again', open],
        });
      };
      async function open() {
        if (msg) ojasAlert.openMessages(msg.phones, msg.text);
        else if (!(await ojasAlert.send(sos ? 'sos' : 'emergency'))) return;
        handedOver();
      }

      const who = msg ? msg.names.map(esc).join(', ') : `your ${sos ? 'SOS' : 'emergency'} contacts`;
      view({
        kind: 'result',
        title: sos ? 'Send your SOS' : 'Send your emergency message',
        html: `Opening Messages with your ${sos ? 'SOS' : 'emergency'} message to <strong>${who}</strong>. `
          + 'Tap <strong>Send</strong> there. If it did not open, tap the button below.',
        primary: ['Open Messages', open],
        secondary: ['Close', hide],
      });

      // Open it straight away. If the phone switches to the Messages app, the page is hidden.
      if (msg && ojasAlert.isPhone()) {
        const opened = () => { if (document.hidden) { document.removeEventListener('visibilitychange', opened); handedOver(); } };
        document.addEventListener('visibilitychange', opened);
        setTimeout(() => document.removeEventListener('visibilitychange', opened), 4000);
        try { ojasAlert.openMessages(msg.phones, msg.text); } catch { /* the button still works */ }
      }
    } finally {
      sending[kind] = false;
    }
  }

  /* ---------- Fall countdown ---------- */
  function startCountdown() {
    if (countdown || sending.fall) return;
    countdown = { endsAt: Date.now() + FALL_COUNTDOWN_S * 1000 };
    const tick = () => {
      if (!countdown) return;
      const left = Math.max(0, Math.ceil((countdown.endsAt - Date.now()) / 1000));
      view({
        kind: 'countdown',
        title: 'Possible fall detected',
        html: `Your emergency message to your emergency contacts opens in <strong class="fall-count">${left}</strong> s.`,
        primary: ['Cancel emergency', () => cancelCountdown(false)],
      });
      if (left === 0) escalateFall();
    };
    countdown.timer = setInterval(tick, 250);
    tick();
    buzz();
  }

  function stopCountdown() {
    if (!countdown) return;
    clearInterval(countdown.timer);
    countdown = null;
  }

  function cancelCountdown(fromBand) {
    if (!countdown) return;
    stopCountdown();
    if (!fromBand) ojasBand.command('CANCEL');   // so the band does not send FALL
    hide();
    ojasToast(fromBand ? 'Emergency cancelled on the band.' : 'Emergency cancelled.', 'ok');
  }

  function escalateFall() {
    stopCountdown();
    if (Date.now() - lastBand.fall < BAND_REPEAT_MS) return;   // this fall was already sent
    lastBand.fall = Date.now();
    dispatch('fall');
  }

  /* ---------- Entry points ---------- */
  // Alerts from the band's Alert characteristic.
  function fromBand(code) {
    if (code === 'FALL_PENDING') {
      if (Date.now() - lastBand.fall < BAND_REPEAT_MS) return;
      startCountdown();
    } else if (code === 'FALL') {
      escalateFall();
    } else if (code === 'SOS') {
      stopCountdown();                                          // SOS replaces a pending fall
      if (Date.now() - lastBand.sos < BAND_REPEAT_MS) return;   // repeat of the same SOS
      lastBand.sos = Date.now();
      dispatch('sos');
    } else if (code === 'CANCELLED') {
      cancelCountdown(true);
    }
  }

  // The SOS button in the app.
  function sosButton() {
    stopCountdown();
    dispatch('sos');
  }

  // A PENDING event already on the server that nobody handled (for example saved while
  // this page was closed): send it now.
  function fromServer(event) {
    if (visibleKind || handled.has(event.id)) return;
    remember(event.id);
    dispatch(event.event_type === 'SOS' ? 'sos' : 'fall', { event });
  }

  return { fromBand, fromServer, sosButton, get active() { return visibleKind; } };
})();

ojasBand.on('alert', (code) => ojasAlerts.fromBand(code));
ojasBand.on('problem', (kind) => ojasToast({
  'incomplete-data': 'The band\'s data is arriving incomplete. See the README "OJAS Band" section.',
  'unreadable-data': 'The band is sending data the app cannot read. Press F12 → Console to see it.',
  'no-data': 'Connected, but the band is not sending readings. Press F12 → Console for details.',
}[kind]));
document.addEventListener('DOMContentLoaded', () => { ojasBand.autoConnect(); });
