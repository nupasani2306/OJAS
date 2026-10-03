// Emergency contacts page: emergency/SOS messages and contact lists, stored in the OJAS backend.
(function () {
  const store = ojasStore;

  // Save a message to the server; before the database migration it is kept on this device only.
  async function saveMessage(field, value) {
    try {
      const saved = await ojasSync.saveSettings({ [field]: value });
      ojasToast(saved ? 'Message saved' : 'Saved on this device only until the database update is applied.', saved ? 'ok' : 'error');
    } catch (err) {
      ojasToast(err.message);
    }
  }

  const profile = store.get('ojas.profile', {}) || {};
  const name = (profile.name || (store.get('ojas.session', {}) || {}).name || 'OJAS user').trim().split(/\s+/)[0];

  /* ---------- Emergency message ---------- */
  const defaultMessage = () =>
    `This is ${name}. I need help urgently. Please call me or come to my location as soon as possible.`;

  const text = document.getElementById('message-text');
  const form = document.getElementById('message-form');
  const input = document.getElementById('message-input');
  const count = document.getElementById('message-count');
  const editBtn = document.getElementById('edit-message');
  let message = store.get('ojas.emergencyMessage', null) || defaultMessage();

  const updateCount = () => { count.textContent = `${input.value.length}/${input.maxLength}`; };

  function editing(on) {
    form.hidden = !on;
    text.hidden = on;
    editBtn.hidden = on;
    if (on) {
      input.value = message;
      updateCount();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  text.textContent = message;
  editBtn.addEventListener('click', () => editing(true));
  document.getElementById('cancel-message').addEventListener('click', () => editing(false));
  document.getElementById('reset-message').addEventListener('click', () => { input.value = defaultMessage(); updateCount(); input.focus(); });
  input.addEventListener('input', updateCount);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    message = input.value.trim() || defaultMessage();
    store.set('ojas.emergencyMessage', message);
    text.textContent = message;
    editing(false);
    saveMessage('emergency_message', message);
  });

  /* ---------- SOS message ---------- */
  const defaultSosMessage = () =>
    `SOS! ${name} needs immediate help. Please check on me or call emergency services.`;
  const sosText = document.getElementById('sos-message-text');
  const sosForm = document.getElementById('sos-message-form');
  const sosInput = document.getElementById('sos-message-input');
  const sosCount = document.getElementById('sos-message-count');
  const editSosBtn = document.getElementById('edit-sos-message');
  let sosMessage = store.get('ojas.sosMessage', null) || defaultSosMessage();

  const updateSosCount = () => { sosCount.textContent = `${sosInput.value.length}/${sosInput.maxLength}`; };
  function editingSos(on) {
    sosForm.hidden = !on;
    sosText.hidden = on;
    editSosBtn.hidden = on;
    if (on) {
      sosInput.value = sosMessage;
      updateSosCount();
      sosInput.focus();
      sosInput.setSelectionRange(sosInput.value.length, sosInput.value.length);
    }
  }

  sosText.textContent = sosMessage;
  editSosBtn.addEventListener('click', () => editingSos(true));
  document.getElementById('cancel-sos-message').addEventListener('click', () => editingSos(false));
  document.getElementById('reset-sos-message').addEventListener('click', () => {
    sosInput.value = defaultSosMessage();
    updateSosCount();
    sosInput.focus();
  });
  sosInput.addEventListener('input', updateSosCount);
  sosForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sosMessage = sosInput.value.trim() || defaultSosMessage();
    store.set('ojas.sosMessage', sosMessage);
    sosText.textContent = sosMessage;
    editingSos(false);
    saveMessage('sos_message', sosMessage);
  });

  /* ---------- Contacts ---------- */
  const contactForm = document.getElementById('contact-form');
  const addContactToggle = document.getElementById('add-contact-toggle');
  let serverContacts = [];   // rows from the backend (with use_for_emergency / use_for_sos)
  let contactGroups = (() => {
    const saved = store.get('ojas.contactGroups', null) || {};
    return {
      emergency: Array.isArray(saved.emergency) ? saved.emergency : [],
      sos: Array.isArray(saved.sos) ? saved.sos : [],
    };
  })();

  function setContacts(contacts) {
    serverContacts = contacts;
    contactGroups = ojasSync.contactsToCache(contacts);
    renderContacts();
  }

  addContactToggle.addEventListener('click', () => {
    contactForm.hidden = !contactForm.hidden;
    if (!contactForm.hidden) contactForm.elements.name.focus();
  });

  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  function renderContactList(type) {
    const list = document.getElementById(`${type}-contact-list`);
    const empty = document.getElementById(`${type}-contact-empty`);
    list.innerHTML = '';
    empty.hidden = contactGroups[type].length > 0;

    contactGroups[type].forEach((contact) => {
      const item = document.createElement('li');
      const avatar = document.createElement('span');
      avatar.className = 'contact-avatar';
      avatar.textContent = initials(contact.name);

      const info = document.createElement('div');
      info.className = 'contact-text';
      const name = document.createElement('strong');
      name.textContent = contact.name;
      const details = document.createElement('small');
      details.textContent = `${contact.relation} · ${contact.phone}`;
      info.append(name, details);

      const remove = document.createElement('button');
      remove.className = 'doc-remove';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${contact.name}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      remove.addEventListener('click', async () => {
        if (!confirm(`Remove ${contact.name} from this list?`)) return;
        const row = serverContacts.find((c) => c.id === contact.id);
        try {
          if (row && row.use_for_emergency && row.use_for_sos) {
            // In both lists: only take it off this one.
            const { contact: updated } = await apiFetch(`/api/emergency/contacts/${contact.id}`, {
              method: 'PUT', body: { [type === 'sos' ? 'use_for_sos' : 'use_for_emergency']: false },
            });
            setContacts(serverContacts.map((c) => (c.id === updated.id ? updated : c)));
          } else {
            await apiFetch(`/api/emergency/contacts/${contact.id}`, { method: 'DELETE' });
            setContacts(serverContacts.filter((c) => c.id !== contact.id));
          }
        } catch (err) {
          ojasToast(err.message);
        }
      });

      item.append(avatar, info, remove);
      list.append(item);
    });
  }

  function renderContacts() {
    renderContactList('emergency');
    renderContactList('sos');
  }

  // A phone number: only digits, spaces, +, -, ( ), with 6 to 15 digits.
  const phoneInput = contactForm.elements.phone;
  const validPhone = (v) => /^[\d\s+()-]+$/.test(v) && (v.match(/\d/g) || []).length >= 6 && (v.match(/\d/g) || []).length <= 15;
  phoneInput.addEventListener('input', () => phoneInput.setCustomValidity(''));

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validPhone(phoneInput.value.trim())) {
      phoneInput.setCustomValidity('Enter a valid phone number (6 to 15 digits).');
      phoneInput.reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(contactForm).entries());
    const submit = contactForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const { contact } = await apiFetch('/api/emergency/contacts', {
        method: 'POST',
        body: { name: data.name.trim(), phone: data.phone.trim(), relationship: data.relation, group: data.messageType },
      });
      setContacts([...serverContacts, contact]);
      contactForm.reset();
      contactForm.hidden = true;
    } catch (err) {
      ojasToast(err.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  renderContacts();

  /* ---------- Load from the server ---------- */
  apiFetch('/api/emergency/contacts').then(({ contacts }) => setContacts(contacts)).catch((err) => ojasToast(err.message));
  ojasSync.settings().then(({ settings }) => {
    if (settings.emergency_message) { message = settings.emergency_message; text.textContent = message; }
    if (settings.sos_message) { sosMessage = settings.sos_message; sosText.textContent = sosMessage; }
  }).catch(() => { /* keep the messages cached on this device */ });
})();
