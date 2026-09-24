// Profile page: personal info, profile photo and document list, remembered in this browser.
(function () {
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
  };

  /* ---------- Personal info ---------- */
  const FIELDS = [
    ['age', 'Age', (v) => `${v} yrs`],
    ['blood', 'Blood group', (v) => v],
    ['height', 'Height', (v) => `${v} cm`],
    ['weight', 'Weight', (v) => `${v} kg`],
    ['emergency', 'Emergency contact', (v) => v],
  ];

  const list = document.getElementById('info-list');
  const nameEl = document.getElementById('profile-name');
  const form = document.getElementById('info-form');
  const editBtn = document.getElementById('edit-info');
  const formActions = document.getElementById('profile-form-actions');
  const infoCard = document.getElementById('info-card');
  let info = store.get('ojas.profile', { name: 'Neha' });

  function renderInfo() {
    nameEl.textContent = info.name || 'Your name';
    list.innerHTML = '';
    let filled = 0;
    FIELDS.forEach(([key, label, format]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      if (info[key]) { dd.textContent = format(info[key]); filled++; }
      else { dd.textContent = 'Not added'; dd.className = 'empty'; }
      list.append(dt, dd);
    });
  }

  function openForm(open) {
    infoCard.classList.toggle('editing', open);
    form.hidden = !open;
    list.hidden = open;
    formActions.hidden = !open;
    if (open) {
      Object.entries(info).forEach(([k, v]) => { if (form.elements[k]) form.elements[k].value = v; });
      form.elements.name.focus();
    }
  }

  editBtn.addEventListener('click', () => openForm(true));
  document.getElementById('cancel-info').addEventListener('click', () => openForm(false));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    info = Object.fromEntries(new FormData(form).entries());
    Object.keys(info).forEach((k) => { info[k] = String(info[k]).trim(); });
    store.set('ojas.profile', info);
    renderInfo();
    openForm(false);
  });

  /* ---------- Profile photo ---------- */
  const photoInput = document.getElementById('photo-input');
  const photo = document.getElementById('photo-preview');
  const photoEmpty = document.getElementById('photo-empty');

  function showPhoto(src) {
    photo.src = src || '';
    photo.hidden = !src;
    photoEmpty.hidden = !!src;
  }

  // Shrink the picture so it fits comfortably in browser storage.
  function resize(file, size = 320) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    try {
      const src = await resize(file);
      showPhoto(src);
      store.set('ojas.photo', src);
    } catch {
      alert('That image could not be opened. Please try another one.');
    }
    photoInput.value = '';
  });

  /* ---------- Documents ---------- */
  const docInput = document.getElementById('doc-input');
  const docList = document.getElementById('doc-list');
  const docEmpty = document.getElementById('doc-empty');
  const allDocList = document.getElementById('all-doc-list');
  const allDocEmpty = document.getElementById('all-doc-empty');
  const docsModal = document.getElementById('docs-modal');
  let docs = store.get('ojas.documents', []);
  const openable = new Map(); // files picked in this visit can be opened again

  const formatSize = (bytes) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  function createDocRow(doc) {
      const li = document.createElement('li');

      const icon = document.createElement('span');
      icon.className = 'doc-icon';
      icon.textContent = (doc.name.split('.').pop() || 'file').slice(0, 4).toUpperCase();

      const text = document.createElement('div');
      text.className = 'doc-text';
      const name = document.createElement(openable.has(doc.id) ? 'a' : 'strong');
      name.textContent = doc.name;
      if (openable.has(doc.id)) { name.href = openable.get(doc.id); name.target = '_blank'; name.rel = 'noopener'; }
      text.append(name);

      const remove = document.createElement('button');
      remove.className = 'doc-remove';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${doc.name}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      remove.addEventListener('click', () => {
        docs = docs.filter((d) => d.id !== doc.id);
        if (openable.has(doc.id)) { URL.revokeObjectURL(openable.get(doc.id)); openable.delete(doc.id); }
        store.set('ojas.documents', docs);
        renderDocs();
      });

      li.append(icon, text, remove);
      return li;
  }

  function renderDocs() {
    docList.innerHTML = '';
    allDocList.innerHTML = '';
    docEmpty.hidden = docs.length > 0;
    allDocEmpty.hidden = docs.length > 0;
    docs.slice(0, 3).forEach((doc) => docList.append(createDocRow(doc)));
    docs.forEach((doc) => allDocList.append(createDocRow(doc)));
  }

  function setDocsModal(open) {
    docsModal.hidden = !open;
    document.body.classList.toggle('modal-open', open);
  }

  document.getElementById('view-docs').addEventListener('click', () => setDocsModal(true));
  document.getElementById('close-docs').addEventListener('click', () => setDocsModal(false));
  document.getElementById('close-docs-backdrop').addEventListener('click', () => setDocsModal(false));

  docInput.addEventListener('change', () => {
    Array.from(docInput.files).forEach((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      docs.unshift({ id, name: file.name, size: file.size, added: Date.now() });
      openable.set(id, URL.createObjectURL(file));
    });
    store.set('ojas.documents', docs);
    renderDocs();
    docInput.value = '';
  });

  renderInfo();
  showPhoto(store.get('ojas.photo', null));
  renderDocs();
})();
