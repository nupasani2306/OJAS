// Profile page: personal info, profile photo and documents, stored in the OJAS backend.
// The last loaded values are cached in the browser so the page (and the Medical ID QR) show instantly.
(function () {
  const store = ojasStore;

  /* ---------- Personal info ---------- */
  const FIELDS = [
    ['age', 'Age', (v) => `${v} yrs`],
    ['blood', 'Blood group', (v) => v],
    ['height', 'Height', (v) => `${v} cm`],
    ['weight', 'Weight', (v) => `${v} kg`],
    ['phone', 'Phone', (v) => v],
  ];

  const list = document.getElementById('info-list');
  const nameEl = document.getElementById('profile-name');
  const form = document.getElementById('info-form');
  const editBtn = document.getElementById('edit-info');
  const formActions = document.getElementById('profile-form-actions');
  const infoCard = document.getElementById('info-card');
  let info = store.get('ojas.profile', { name: '' });

  function renderInfo() {
    nameEl.textContent = info.name || 'Your name';
    list.innerHTML = '';
    FIELDS.forEach(([key, label, format]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      if (info[key]) dd.textContent = format(info[key]);
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

  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    const values = Object.fromEntries(new FormData(form).entries());
    Object.keys(values).forEach((k) => { values[k] = String(values[k]).trim(); });
    if (!values.name) { ojasToast('Please enter your name.'); form.elements.name.focus(); return; }

    saving = true;
    try {
      const [{ profile }, { medical_info: medical }] = await Promise.all([
        apiFetch('/api/profile', {
          method: 'PUT',
          body: {
            full_name: values.name,
            date_of_birth: values.dob || null,
            height_cm: values.height ? Number(values.height) : null,
            weight_kg: values.weight ? Number(values.weight) : null,
            phone: values.phone || null,
          },
        }),
        apiFetch('/api/medical', { method: 'PUT', body: { blood_group: values.blood || null } }),
      ]);
      ojasSync.profileToCache({ ...profile, photo_url: store.get('ojas.photo') }, medical);
      info = store.get('ojas.profile');
      renderInfo();
      openForm(false);
      ojasToast('Profile saved', 'ok');
    } catch (err) {
      ojasToast(err.message);
    } finally {
      saving = false;
    }
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

  // Shrink the picture before uploading (a profile photo never needs more than 480 px).
  function resize(file, size = 480) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('resize failed'))), 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    photoInput.value = '';
    if (!file) return;
    let blob;
    try {
      blob = await resize(file);
    } catch {
      ojasToast('That image could not be opened. Please try another one.');
      return;
    }
    const previous = store.get('ojas.photo', null);
    showPhoto(URL.createObjectURL(blob));   // show it straight away
    try {
      const formData = new FormData();
      formData.append('file', blob, 'profile.jpg');
      const { photo_url: url } = await apiFetch('/api/profile/photo', { method: 'POST', body: formData });
      store.set('ojas.photo', url);
      ojasToast('Photo updated', 'ok');
    } catch (err) {
      showPhoto(previous);
      ojasToast(err.message);
    }
  });

  /* ---------- Documents ---------- */
  const docInput = document.getElementById('doc-input');
  const docList = document.getElementById('doc-list');
  const docEmpty = document.getElementById('doc-empty');
  const allDocList = document.getElementById('all-doc-list');
  const allDocEmpty = document.getElementById('all-doc-empty');
  const docsModal = document.getElementById('docs-modal');
  let docs = [];

  async function openDocument(doc) {
    // Open the tab first (browsers block pop-ups opened after an await), then point it at the signed link.
    const tab = window.open('', '_blank');
    try {
      const { url } = await apiFetch(`/api/documents/${doc.id}/url`);
      if (tab) tab.location = url; else location.href = url;
    } catch (err) {
      if (tab) tab.close();
      ojasToast(err.message);
    }
  }

  function createDocRow(doc) {
    const li = document.createElement('li');

    const icon = document.createElement('span');
    icon.className = 'doc-icon';
    icon.textContent = (doc.document_name.split('.').pop() || 'file').slice(0, 4).toUpperCase();

    const text = document.createElement('div');
    text.className = 'doc-text';
    const name = document.createElement('a');
    name.href = '#';
    name.textContent = doc.document_name;
    name.addEventListener('click', (e) => { e.preventDefault(); openDocument(doc); });
    text.append(name);

    const remove = document.createElement('button');
    remove.className = 'doc-remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${doc.document_name}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    remove.addEventListener('click', async () => {
      if (!confirm(`Delete "${doc.document_name}"?`)) return;
      try {
        await apiFetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
        docs = docs.filter((d) => d.id !== doc.id);
        renderDocs();
      } catch (err) {
        ojasToast(err.message);
      }
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

  docInput.addEventListener('change', async () => {
    const files = Array.from(docInput.files);
    docInput.value = '';
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const { document } = await apiFetch('/api/documents/upload', { method: 'POST', body: formData });
        docs.unshift(document);
        renderDocs();
      } catch (err) {
        ojasToast(`${file.name}: ${err.message}`);
      }
    }
  });

  /* ---------- Load ---------- */
  renderInfo();
  showPhoto(store.get('ojas.photo', null));
  renderDocs();

  ojasSync.profile().then(() => {
    info = store.get('ojas.profile');
    renderInfo();
    showPhoto(store.get('ojas.photo', null));
  }).catch((err) => ojasToast(err.message));

  apiFetch('/api/documents').then(({ documents }) => {
    docs = documents;
    renderDocs();
  }).catch((err) => ojasToast(err.message));
})();
