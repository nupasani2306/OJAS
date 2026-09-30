// Home page: "My Medical ID" QR code (next to the profile icon).
// The QR holds a link to medical-card.html with the basic medical details packed into the
// part of the link after "#". Anyone who scans it sees those details; nothing is stored on a server.
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
  const sheet = $('qr-sheet');
  if (!sheet || typeof qrcode !== 'function') return;

  const form = $('qr-form');
  const includeContacts = $('qr-include-contacts');

  // Short keys keep the link (and so the QR code) small. medical-card.js reads the same keys.
  function payload() {
    const p = store.get('ojas.profile', {}) || {};
    const med = store.get('ojas.medical', {}) || {};
    const data = { v: 1, u: Date.now() };
    const put = (k, v) => { if (v && String(v).trim()) data[k] = String(v).trim(); };
    put('n', p.name || 'Neha');
    put('a', p.age); put('b', p.blood); put('h', p.height); put('w', p.weight);
    put('al', med.allergies); put('c', med.conditions); put('m', med.medications); put('no', med.notes);

    if (includeContacts.checked) {
      const groups = store.get('ojas.contactGroups', null);
      let contacts = groups && Array.isArray(groups.emergency) ? groups.emergency : store.get('ojas.contacts', []);
      if (!Array.isArray(contacts)) contacts = [];
      const list = contacts.slice(0, 3).map((c) => [c.name, c.relation || '', c.phone]);
      if (!list.length && p.emergency) list.push(['Emergency contact', '', p.emergency]);
      if (list.length) data.ec = list;
    }
    return data;
  }

  function encode(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function cardUrl(data) {
    return `${new URL('medical-card.html', location.href).href}#d=${encode(data)}`;
  }

  function render() {
    const data = payload();
    const url = cardUrl(data);

    const qr = qrcode(0, 'M'); // type 0 = smallest size that fits
    qr.addData(url);
    qr.make();
    // Whole-pixel squares with sharp edges stay crisp on every screen, which cameras read best.
    const box = $('qr-code');
    const margin = 2;
    const cell = Math.max(3, Math.floor(224 / (qr.getModuleCount() + margin * 2)));
    box.innerHTML = qr.createSvgTag(cell, cell * margin);
    const svg = box.querySelector('svg');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');

    $('qr-name').textContent = data.n;
    $('qr-preview').href = url;

    const chips = $('qr-chips');
    chips.innerHTML = '';
    [['Blood', data.b], ['Age', data.a && `${data.a} yrs`], ['Allergies', data.al ? 'Yes' : null]]
      .filter(([, v]) => v)
      .forEach(([k, v]) => {
        const chip = document.createElement('span');
        chip.textContent = `${k}: ${v}`;
        chips.append(chip);
      });

    const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
    $('qr-host-note').hidden = !local;
    return url;
  }

  function open(show) {
    sheet.hidden = !show;
    if (show) { editing(false); render(); $('qr-close').focus(); }
  }

  function editing(on) {
    form.hidden = !on;
    $('qr-actions').hidden = on;
    if (on) {
      const med = store.get('ojas.medical', {}) || {};
      ['allergies', 'conditions', 'medications', 'notes'].forEach((k) => { form.elements[k].value = med[k] || ''; });
      form.elements.allergies.focus();
    }
  }

  $('open-qr').addEventListener('click', () => open(true));
  $('qr-close').addEventListener('click', () => open(false));
  $('qr-backdrop').addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) open(false); });

  $('qr-edit').addEventListener('click', () => editing(true));
  $('qr-form-cancel').addEventListener('click', () => editing(false));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const med = {};
    ['allergies', 'conditions', 'medications', 'notes'].forEach((k) => { med[k] = form.elements[k].value.trim(); });
    store.set('ojas.medical', med);
    editing(false);
    render();
  });

  includeContacts.checked = store.get('ojas.qrContacts', true) !== false;
  includeContacts.addEventListener('change', () => {
    store.set('ojas.qrContacts', includeContacts.checked);
    render();
  });

  $('qr-share').addEventListener('click', async () => {
    const url = render();
    if (navigator.share) {
      try { await navigator.share({ title: 'My OJAS Medical ID', url }); } catch { /* cancelled */ }
    } else if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(url); $('qr-share').textContent = 'Link copied'; } catch { /* blocked */ }
      setTimeout(() => { $('qr-share').textContent = 'Share'; }, 2000);
    }
  });
})();
