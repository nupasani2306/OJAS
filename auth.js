// Sign in / sign up page, with an OJAS Band device code that pairs the band right away.
// signUp(), signIn() and pairDevice() are the backend hooks. Until the backend exists they run in
// demo mode: the account lives in this browser and passwords are never stored or checked.
(function () {
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
  };
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- Backend hooks ---------------------------------------------------------------------
  // Replace each body with a call to your API, e.g.
  //   const res = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  //                                                 body: JSON.stringify({ name, contact, password }) });
  //   if (!res.ok) throw new Error((await res.json()).message);
  //   return await res.json();   // { user: { name, contact }, token }
  // Throw an Error with a readable message to show it under the form.

  async function signUp({ name, contact }) {
    await wait(400);
    const account = { name, contact: contact.toLowerCase(), createdAt: Date.now() };
    store.set('ojas.account', account);
    return { user: { name, contact: account.contact } };
  }

  async function signIn({ contact }) {
    await wait(400);
    const account = store.get('ojas.account', null);
    if (!account || account.contact !== contact.toLowerCase()) {
      throw new Error('No account found with that email or phone. Check it, or sign up.');
    }
    return { user: { name: account.name, contact: account.contact } };
  }

  // Backend: look the code up (devices table), check it is not paired to someone else,
  // link it to this user and return the band's details.
  async function pairDevice(code) {
    await wait(1600);
    return { code, name: 'OJAS Band', pairedAt: Date.now() };
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
  const session = store.get('ojas.session', null);
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
    fail($('signin-form'), null, 'Password reset will work once the OJAS backend is connected.');
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
  const validContact = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\+?[\d\s()-]{6,20}$/.test(v) && (v.match(/\d/g) || []).length >= 6;

  // A new account names the profile; signing in only fills the name if the profile has none.
  function startSession(user, isNewAccount) {
    store.set('ojas.session', { name: user.name, contact: user.contact, signedInAt: Date.now() });
    const profile = store.get('ojas.profile', null) || {};
    if (isNewAccount || !profile.name) store.set('ojas.profile', { ...profile, name: user.name });
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
    if (!validContact(contact.value.trim())) return fail(form, contact, 'Enter a valid email or phone number.');
    if (!password.value) return fail(form, password, 'Enter your password.');
    if (addDevice.checked) { const err = codeError(deviceCode.value); if (err) return fail(form, deviceCode, err); }
    form.querySelector('.auth-error').hidden = true;
    busy(form, true, 'Signing in…');
    try {
      const { user } = await signIn({ contact: contact.value.trim(), password: password.value });
      startSession(user, false);
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
    if (!validContact(contact.value.trim())) return fail(form, contact, 'Enter a valid email or phone number.');
    if (password.value.length < 8) return fail(form, password, 'Use at least 8 characters for your password.');
    if (confirm.value !== password.value) return fail(form, confirm, 'The passwords don’t match.');
    if (!later.checked) { const err = codeError(deviceCode.value); if (err) return fail(form, deviceCode, `${err} Or tick “I'll connect my band later”.`); }
    form.querySelector('.auth-error').hidden = true;
    busy(form, true, 'Creating account…');
    try {
      const { user } = await signUp({ name: name.value.trim(), contact: contact.value.trim(), password: password.value });
      startSession(user, true);
      if (later.checked) { location.replace(next); return; }
      const result = await pairAndGo(formatCode(deviceCode.value), next);
      if (result !== true) {
        // Account exists now; send them to connect the band from the connect step.
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
