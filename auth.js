// Sign in / sign up page, with an OJAS Band device code that pairs the band right away.
// Accounts, sign-in and band pairing go through the OJAS backend (api.js must load first).
(function () {
  const store = ojasStore;
  const $ = (id) => document.getElementById(id);

  // ---- Backend calls ---------------------------------------------------------------------
  async function signIn({ contact, password }) {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: { email: contact, password } });
    clearTokens();                    // forget any previous account on this device
    saveTokens(data);
    let name = (data.user && data.user.full_name) || contact.split('@')[0];
    try {
      const { profile } = await apiFetch('/api/profile');
      if (profile && profile.full_name) name = profile.full_name;
    } catch { /* profile not readable yet */ }
    await loadDevice();
    return { user: { name, contact } };
  }

  async function signUp({ name, contact, password }) {
    const data = await apiFetch('/api/auth/signup', { method: 'POST', body: { email: contact, password, full_name: name } });
    if (!data.access_token) {
      // "Confirm email" is switched on in Supabase: the account exists but can't sign in yet.
      throw new Error(data.message || 'Check your email to confirm your account, then sign in.');
    }
    clearTokens();
    saveTokens(data);
    return { user: { name, contact } };
  }

  // Cache the user's paired band (the home page shows its status).
  async function loadDevice() {
    try {
      const { devices } = await apiFetch('/api/devices');
      if (devices.length) store.set('ojas.device', toBand(devices[0]));
    } catch { /* shown as "Not connected" */ }
  }

  function toBand(d) {
    return { id: d.id, code: d.device_uid.replace(/^OJAS-/, ''), name: d.device_name, pairedAt: Date.parse(d.paired_at) };
  }

  async function pairDevice(code) {
    const { device } = await apiFetch('/api/devices/pair', { method: 'POST', body: { code } });
    return toBand(device);
  }
  // -----------------------------------------------------------------------------------------

  /* ---------- Device code: OJAS-XXXX-XXXX ---------- */
  // Letters and digits, leaving out 0/O and 1/I, which are easy to mix up on a printed label.
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const clean = (v) => v.toUpperCase().replace(/^OJAS-?/, '').replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const formatCode = (raw) => { const c = clean(raw); return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; };
  function codeError(value) {
    const c = clean(value);
    if (!c) return 'Enter the device code.';
    if (c.length < 8) return 'The device code has 8 characters.';
    if ([...c].some((ch) => !CODE_CHARS.includes(ch))) return 'Device codes don’t use 0, O, 1 or I. Check the code on your band.';
    return '';
  }

  const template = $('device-field');
  ['signin-device', 'signup-device', 'connect-device'].forEach((id, i) => {
    const box = $(id);
    box.append(template.content.cloneNode(true));
    const input = box.querySelector('input');
    const hint = box.querySelector('.auth-hint');
    hint.id = `device-hint-${i}`;
    input.setAttribute('aria-describedby', hint.id);
    input.addEventListener('input', () => {
      const at = input.selectionStart === input.value.length;
      input.value = formatCode(input.value);
      if (at) input.setSelectionRange(input.value.length, input.value.length);
      input.removeAttribute('aria-invalid');
    });
    input.addEventListener('paste', () => setTimeout(() => { input.value = formatCode(input.value); }));
  });

  /* ---------- Where to go after signing in ---------- */
  const params = new URLSearchParams(location.search);
  const next = /^[a-z0-9-]+\.html([?#].*)?$/i.test(params.get('next') || '') && !/^index\.html/i.test(params.get('next'))
    ? params.get('next') : 'home.html';
  const session = getToken() ? store.get('ojas.session', null) : null;
  const device = store.get('ojas.device', null);

  /* ---------- Tabs ---------- */
  const tabs = { signin: [$('tab-signin'), $('signin-form')], signup: [$('tab-signup'), $('signup-form')] };
  function show(mode) {
    Object.entries(tabs).forEach(([key, [tab, form]]) => {
      const on = key === mode;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      form.hidden = !on;
    });
  }
  $('tab-signin').addEventListener('click', () => show('signin'));
  $('tab-signup').addEventListener('click', () => show('signup'));
  $('auth-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const to = $('tab-signin').getAttribute('aria-selected') === 'true' ? 'signup' : 'signin';
    show(to);
    tabs[to][0].focus();
  });

  if (session && params.get('mode') === 'connect' && !device) {
    // Signed in without a band: only the connect step.
    $('auth-tabs').hidden = true;
    $('signin-form').hidden = true;
    $('connect-form').hidden = false;
    $('auth-tagline').textContent = `Hi ${session.name.split(' ')[0]}, let's pair your band.`;
    let pairError = null;
    try { pairError = sessionStorage.getItem('ojas.pairError'); sessionStorage.removeItem('ojas.pairError'); } catch { /* ignore */ }
    if (pairError) {
      const box = $('connect-form').querySelector('.auth-error');
      box.textContent = `Your account was created, but the band could not be connected: ${pairError}`;
      box.hidden = false;
    }
  } else if (session) {
    location.replace(next);
    return;
  } else {
    show(params.get('mode') === 'signup' ? 'signup' : 'signin');
  }

  /* ---------- Small helpers ---------- */
  document.querySelectorAll('.auth-show').forEach((btn) => btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? 'Show' : 'Hide';
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  }));

  document.querySelectorAll('[data-reveals]').forEach((box) => box.addEventListener('change', () => {
    $(box.dataset.reveals).hidden = !box.checked;
    if (box.checked) $(box.dataset.reveals).querySelector('input').focus();
  }));

  const laterBox = $('signup-form').elements.later;
  laterBox.addEventListener('change', () => {
    $('signup-device').classList.toggle('is-off', laterBox.checked);
    $('signup-device').querySelector('input').disabled = laterBox.checked;
  });

  // Clear a form's error as soon as the person starts fixing it.
  ['signin-form', 'signup-form', 'connect-form'].forEach((id) => $(id).addEventListener('input', () => {
    $(id).querySelector('.auth-error').hidden = true;
  }));

  $('forgot-btn').addEventListener('click', () => {
    fail($('signin-form'), null, 'Password reset is not available in the app yet. Ask the OJAS admin to reset it from Supabase.');
  });

  function fail(form, input, message) {
    const box = form.querySelector('.auth-error');
    box.textContent = message;
    box.hidden = false;
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    return false;
  }
  function busy(form, on, label) {
    const btn = form.querySelector('.auth-submit');
    btn.disabled = on;
    if (label) btn.textContent = label;
  }
  const validContact = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);   // the backend uses email accounts

  // A new account names the profile; signing in only fills the name if the profile has none.
  function startSession(user) {
    store.set('ojas.session', { name: user.name, contact: user.contact, signedInAt: Date.now() });
    const profile = store.get('ojas.profile', null) || {};
    store.set('ojas.profile', { ...profile, name: user.name });
  }

  async function pairAndGo(code, goTo) {
    const overlay = $('pairing');
    overlay.hidden = false;
    $('pair-spinner').hidden = false;
    $('pair-tick').hidden = true;
    $('pair-done').hidden = true;
    $('pair-title').textContent = 'Connecting to your OJAS Band…';
    $('pair-detail').textContent = 'Keep the band close to your phone.';
    try {
      const band = await pairDevice(code);
      store.set('ojas.device', band);
      $('pair-spinner').hidden = true;
      $('pair-tick').hidden = false;
      $('pair-title').textContent = 'Band connected';
      $('pair-detail').textContent = `${band.name} · OJAS-${band.code}`;
      $('pair-done').hidden = false;
      $('pair-done').focus();
      $('pair-done').onclick = () => location.replace(goTo);
      return true;
    } catch (err) {
      overlay.hidden = true;
      return err;
    }
  }

  /* ---------- Sign in ---------- */
  $('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const { contact, password, addDevice, deviceCode } = form.elements;
    if (!validContact(contact.value.trim())) return fail(form, contact, 'Enter a valid email address.');
    if (!password.value) return fail(form, password, 'Enter your password.');
    if (addDevice.checked) { const err = codeError(deviceCode.value); if (err) return fail(form, deviceCode, err); }
    form.querySelector('.auth-error').hidden = true;
    busy(form, true, 'Signing in…');
    try {
      const { user } = await signIn({ contact: contact.value.trim(), password: password.value });
      startSession(user);
      if (addDevice.checked) {
        const result = await pairAndGo(formatCode(deviceCode.value), next);
        if (result !== true) { busy(form, false, 'Sign in'); return fail(form, deviceCode, result.message || 'Could not connect the band.'); }
      } else {
        location.replace(next);
      }
    } catch (err) {
      busy(form, false, 'Sign in');
      fail(form, contact, err.message || 'Could not sign in. Please try again.');
    }
  });

  /* ---------- Sign up ---------- */
  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const { name, contact, password, confirm, later, deviceCode } = form.elements;
    if (!name.value.trim()) return fail(form, name, 'Enter your name.');
    if (!validContact(contact.value.trim())) return fail(form, contact, 'Enter a valid email address.');
    if (password.value.length < 8) return fail(form, password, 'Use at least 8 characters for your password.');
    if (confirm.value !== password.value) return fail(form, confirm, 'The passwords don’t match.');
    if (!later.checked) { const err = codeError(deviceCode.value); if (err) return fail(form, deviceCode, `${err} Or tick “I'll connect my band later”.`); }
    form.querySelector('.auth-error').hidden = true;
    busy(form, true, 'Creating account…');
    try {
      const { user } = await signUp({ name: name.value.trim(), contact: contact.value.trim(), password: password.value });
      startSession(user);
      if (later.checked) { location.replace(next); return; }
      const result = await pairAndGo(formatCode(deviceCode.value), next);
      if (result !== true) {
        // Account exists now; send them to connect the band from the connect step.
        try { sessionStorage.setItem('ojas.pairError', result.message || 'unknown error'); } catch { /* ignore */ }
        location.replace('index.html?mode=connect');
      }
    } catch (err) {
      busy(form, false, 'Create account');
      fail(form, contact, err.message || 'Could not create the account. Please try again.');
    }
  });

  /* ---------- Connect a band later ---------- */
  $('connect-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.deviceCode;
    const err = codeError(input.value);
    if (err) return fail(form, input, err);
    form.querySelector('.auth-error').hidden = true;
    busy(form, true, 'Connecting…');
    const result = await pairAndGo(formatCode(input.value), 'home.html');
    if (result !== true) { busy(form, false, 'Connect band'); fail(form, input, result.message || 'Could not connect the band.'); }
  });
})();
