// Emergency contacts page: editable emergency message and contact list, remembered in this browser.
(function () {
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
  };

  // Name comes from the profile page.
  const profile = store.get('ojas.profile', { name: 'Neha' });
  const name = profile.name || 'Neha';
  document.getElementById('user-name').textContent = name;

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
  });

  /* ---------- Contacts ---------- */
  const contactForm = document.getElementById('contact-form');
  const list = document.getElementById('contact-list');
  const empty = document.getElementById('contact-empty');
  const counter = document.getElementById('contact-count');
  let contacts = store.get('ojas.contacts', []);

  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  function render() {
    list.innerHTML = '';
    empty.hidden = contacts.length > 0;
    counter.textContent = contacts.length;

    contacts.forEach((c) => {
      const li = document.createElement('li');

      const avatar = document.createElement('span');
      avatar.className = 'contact-avatar';
      avatar.textContent = initials(c.name);

      const info = document.createElement('div');
      info.className = 'contact-text';
      const strong = document.createElement('strong');
      strong.textContent = c.name;
      const small = document.createElement('small');
      small.textContent = `${c.relation} · ${c.phone}`;
      info.append(strong, small);

      const call = document.createElement('a');
      call.className = 'contact-call';
      call.href = `tel:${c.phone.replace(/[^\d+]/g, '')}`;
      call.setAttribute('aria-label', `Call ${c.name}`);
      call.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/></svg>';

      const remove = document.createElement('button');
      remove.className = 'doc-remove';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${c.name}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      remove.addEventListener('click', () => {
        if (!confirm(`Remove ${c.name} from your emergency contacts?`)) return;
        contacts = contacts.filter((x) => x.id !== c.id);
        store.set('ojas.contacts', contacts);
        render();
      });

      li.append(avatar, info, call, remove);
      list.append(li);
    });
  }

  // A phone number: only digits, spaces, +, -, ( ), with 6 to 15 digits.
  const phoneInput = contactForm.elements.phone;
  const validPhone = (v) => /^[\d\s+()-]+$/.test(v) && (v.match(/\d/g) || []).length >= 6 && (v.match(/\d/g) || []).length <= 15;
  phoneInput.addEventListener('input', () => phoneInput.setCustomValidity(''));

  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validPhone(phoneInput.value.trim())) {
      phoneInput.setCustomValidity('Enter a valid phone number (6 to 15 digits).');
      phoneInput.reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(contactForm).entries());
    contacts.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: data.name.trim(),
      relation: data.relation,
      phone: data.phone.trim(),
    });
    store.set('ojas.contacts', contacts);
    contactForm.reset();
    render();
  });

  render();
})();
