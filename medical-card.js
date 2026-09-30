// Medical ID page opened by scanning the QR code on the home page.
// Reads the details from the link after "#d=" (written by medical-qr.js) and shows them.
(function () {
  const $ = (id) => document.getElementById(id);

  function decode(hash) {
    const raw = new URLSearchParams(hash.replace(/^#/, '')).get('d');
    if (!raw) return null;
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data && data.v === 1 ? data : null;
  }

  let data = null;
  try { data = decode(location.hash); } catch { data = null; }

  if (!data) {
    $('mc-invalid').hidden = false;
    return;
  }
  $('mc-content').hidden = false;

  const text = (v) => (v == null ? '' : String(v));
  $('mc-name').textContent = text(data.n) || 'Medical information';
  document.title = `OJAS – Medical ID${data.n ? ` · ${text(data.n)}` : ''}`;
  if (data.u) $('mc-updated').textContent = `Updated ${new Date(data.u).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  $('mc-blood').textContent = text(data.b) || '—';
  $('mc-age').textContent = data.a ? `${text(data.a)} yrs` : '—';
  $('mc-height').textContent = data.h ? `${text(data.h)} cm` : '—';
  $('mc-weight').textContent = data.w ? `${text(data.w)} kg` : '—';

  const details = $('mc-details');
  [['Allergies', data.al, true], ['Medical conditions', data.c], ['Medications', data.m], ['Notes', data.no]]
    .forEach(([label, value, important]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = text(value) || 'None listed';
      if (!value) dd.className = 'empty';
      else if (important) dd.className = 'mc-alert';
      details.append(dt, dd);
    });

  const contacts = Array.isArray(data.ec) ? data.ec : [];
  if (contacts.length) {
    $('mc-contacts-card').hidden = false;
    const list = $('mc-contacts');
    contacts.forEach(([name, relation, phone]) => {
      const li = document.createElement('li');
      const avatar = document.createElement('span');
      avatar.className = 'contact-avatar';
      avatar.textContent = text(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
      const info = document.createElement('div');
      info.className = 'contact-text';
      const strong = document.createElement('strong');
      strong.textContent = text(name);
      const small = document.createElement('small');
      small.textContent = [text(relation), text(phone)].filter(Boolean).join(' · ');
      info.append(strong, small);
      const call = document.createElement('a');
      call.className = 'contact-call';
      call.href = `tel:${text(phone).replace(/[^\d+]/g, '')}`;
      call.setAttribute('aria-label', `Call ${text(name)}`);
      call.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/></svg>';
      li.append(avatar, info, call);
      list.append(li);
    });
  }
})();
