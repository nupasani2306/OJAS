// Talks to the OJAS Flask backend. Load before the page's own script.
// Every request carries `Authorization: Bearer <access token>`; an expired token is refreshed
// once automatically, otherwise the user is sent back to sign in.
// To point the app at a deployed backend, set window.OJAS_API_BASE before this script loads.
const OJAS_API = window.OJAS_API_BASE || 'http://127.0.0.1:5000';

const ojasStore = {
  get(key, fallback = null) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
  },
};

function getToken() { return ojasStore.get('ojas.token'); }

function saveTokens(data) {
  ojasStore.set('ojas.token', data.access_token);
  if (data.refresh_token) ojasStore.set('ojas.refreshToken', data.refresh_token);
}

// Removes the tokens and every cached copy of this user's data (so a shared phone never mixes accounts).
function clearTokens() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('ojas.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked */ }
}

function goToSignIn() {
  clearTokens();
  const here = location.pathname.split('/').pop() || 'home.html';
  location.replace(`index.html?next=${encodeURIComponent(here)}`);
}

let refreshing = null;
async function refreshTokens() {
  const refreshToken = ojasStore.get('ojas.refreshToken');
  if (!refreshToken) return false;
  refreshing = refreshing || fetch(`${OJAS_API}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).then(async (res) => {
    if (!res.ok) return false;
    saveTokens(await res.json());
    return true;
  }).catch(() => false).finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

// Use instead of fetch() for every backend call. `options.body` may be an object (sent as JSON) or FormData.
async function apiFetch(path, options = {}, retried = false) {
  const headers = { ...(options.headers || {}) };
  let payload = options.body;
  if (payload && !(payload instanceof FormData) && typeof payload !== 'string') {
    payload = JSON.stringify(payload);
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(OJAS_API + path, { ...options, headers, body: payload });
  } catch {
    throw new Error('Cannot reach the OJAS server. Check that the backend is running.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* no JSON body */ }

  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    if (!retried && await refreshTokens()) return apiFetch(path, options, true);
    goToSignIn();
    throw new Error('Your session expired. Please sign in again.');
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Local time-zone offset for date-based endpoints (minutes, as JavaScript reports it).
const ojasTz = () => new Date().getTimezoneOffset();

// Loads server data into the browser cache in the shapes the pages already read
// (profile, medical info, contacts, settings), so the QR code, SOS share and forms stay in sync.
const ojasSync = {
  profileToCache(profile, medical) {
    const p = profile || {};
    const m = medical || {};
    ojasStore.set('ojas.profile', {
      name: p.full_name || '',
      age: p.age != null ? String(p.age) : '',
      dob: p.date_of_birth || '',
      blood: m.blood_group || '',
      height: p.height_cm != null ? String(Number(p.height_cm)) : '',
      weight: p.weight_kg != null ? String(Number(p.weight_kg)) : '',
      phone: p.phone || '',
    });
    ojasStore.set('ojas.medical', {
      allergies: m.allergies || '', conditions: m.medical_conditions || '',
      medications: m.medications || '', notes: m.emergency_notes || '',
    });
    if (p.photo_url) ojasStore.set('ojas.photo', p.photo_url);
    const session = ojasStore.get('ojas.session');
    if (session && p.full_name) ojasStore.set('ojas.session', { ...session, name: p.full_name });
  },

  async profile() {
    const [{ profile }, { medical_info: medical }] = await Promise.all([apiFetch('/api/profile'), apiFetch('/api/medical')]);
    this.profileToCache(profile, medical);
    return { profile, medical };
  },

  contactsToCache(contacts) {
    const toLocal = (c) => ({ id: c.id, name: c.name, relation: c.relationship || 'Other', phone: c.phone });
    const groups = {
      emergency: contacts.filter((c) => c.use_for_emergency).map(toLocal),
      sos: contacts.filter((c) => c.use_for_sos).map(toLocal),
    };
    ojasStore.set('ojas.contactGroups', groups);
    return groups;
  },

  async contacts() {
    const { contacts } = await apiFetch('/api/emergency/contacts');
    return this.contactsToCache(contacts);
  },

  async settings() {
    const { settings, migration_applied: migrated } = await apiFetch('/api/settings');
    if (settings.sos_message) ojasStore.set('ojas.sosMessage', settings.sos_message);
    if (settings.emergency_message) ojasStore.set('ojas.emergencyMessage', settings.emergency_message);
    if (migrated) {
      ojasStore.set('ojas.workoutGoal', settings.weekly_workout_goal);
      ojasStore.set('ojas.qrContacts', settings.qr_include_contacts);
    }
    return { settings, migrated };
  },

  // Save settings; until the database migration is applied, keep them in this browser only.
  async saveSettings(values) {
    try {
      await apiFetch('/api/settings', { method: 'PUT', body: values });
      return true;
    } catch (err) {
      if (err.status === 409 && err.data && err.data.migration_needed) return false;
      throw err;
    }
  },
};

// Small message at the bottom of the screen (errors and confirmations).
function ojasToast(message, kind = 'error') {
  let box = document.getElementById('ojas-toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'ojas-toast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  box.textContent = message;
  box.className = `ojas-toast is-${kind} is-shown`;
  clearTimeout(box._timer);
  box._timer = setTimeout(() => { box.className = `ojas-toast is-${kind}`; }, 4000);
}

// Emergency alerts: opens the phone's Messages app addressed to every contact in a group,
// with the message (and a map link when the location is known) already typed in.
// The person taps Send; a web page cannot send an SMS by itself.
const ojasAlert = {
  firstName() {
    const p = ojasStore.get('ojas.profile', {}) || {};
    const s = ojasStore.get('ojas.session', {}) || {};
    return (p.name || s.name || 'OJAS user').trim().split(/\s+/)[0];
  },

  defaultMessage(kind) {
    const name = this.firstName();
    return kind === 'sos'
      ? `SOS! ${name} needs immediate help. Please check on me or call emergency services.`
      : `This is ${name}. I need help urgently. Please call me or come to my location as soon as possible.`;
  },

  // kind: 'sos' (SOS message → SOS contacts) or 'emergency' (Emergency message → Emergency contacts).
  message(kind) {
    return ojasStore.get(kind === 'sos' ? 'ojas.sosMessage' : 'ojas.emergencyMessage') || this.defaultMessage(kind);
  },

  contacts(kind) {
    const groups = ojasStore.get('ojas.contactGroups', {}) || {};
    return Array.isArray(groups[kind]) ? groups[kind] : [];
  },

  isPhone() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  // Current position, or null. Kept short so the Messages app still opens from the button press.
  locate(timeout = 2500) {
    if (!navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (v) => { clearTimeout(timer); resolve(v); };
      const timer = setTimeout(() => resolve(null), timeout + 200);
      navigator.geolocation.getCurrentPosition((pos) => done(pos.coords), () => done(null),
        { timeout, maximumAge: 5 * 60 * 1000, enableHighAccuracy: true });
    });
  },

  smsLink(numbers, body) {
    const text = encodeURIComponent(body);
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel') {
      return `sms:/open?addresses=${numbers.join(',')}&body=${text}`;
    }
    return `sms:${numbers.join(';')}?body=${text}`;
  },

  // Returns { coords } once the message is handed over, or null (with a toast) when there is nobody to send to.
  async send(kind, coords) {
    const contacts = this.contacts(kind);
    const numbers = contacts.map((c) => String(c.phone || '').replace(/[^\d+]/g, '')).filter(Boolean);
    if (!numbers.length) {
      ojasToast(`Add ${kind === 'sos' ? 'SOS' : 'emergency'} contacts on the Emergency page first.`);
      return null;
    }
    const where = coords === undefined ? await this.locate() : coords;
    const body = where
      ? `${this.message(kind)}\n\nMy location: https://maps.google.com/?q=${where.latitude.toFixed(6)},${where.longitude.toFixed(6)}`
      : this.message(kind);

    if (this.isPhone()) {
      location.href = this.smsLink(numbers, body);
    } else {
      // On a computer there is no Messages app: show what would be sent.
      const list = contacts.map((c) => `${c.name}: ${c.phone}`).join('\n');
      alert(`Open OJAS on your phone to send this by SMS.\n\nTo:\n${list}\n\n${body}`);
    }
    return { coords: where };
  },
};
