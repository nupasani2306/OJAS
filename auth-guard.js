// Loaded in the <head> of every app page (not medical-card.html, which anyone who scans the QR may open).
// Sends signed-out visitors to the sign-in page, then fills in the user's name, the band status
// and the sign-out button. The token itself is checked by the server on every API call (api.js).
(function () {
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const session = read('ojas.session');
  if (!session || !read('ojas.token')) {
    const here = location.pathname.split('/').pop() || 'home.html';
    location.replace(`index.html?next=${encodeURIComponent(here + location.search + location.hash)}`);
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const first = (session.name || '').trim().split(/\s+/)[0];
    if (first) document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = first; });

    // Home device card: real pairing state instead of a fixed "Connected".
    // Where the browser has Bluetooth, band.js / home-data.js run the card (live connection) instead.
    const status = document.getElementById('device-status');
    const bluetooth = !!(navigator.bluetooth && window.isSecureContext);
    if (status && !bluetooth && !read('ojas.device')) {
      status.classList.add('is-off');
      status.lastChild.textContent = 'Not connected';
      const card = status.closest('.device');
      const link = document.createElement('a');
      link.className = 'device-connect';
      link.href = 'index.html?mode=connect';
      link.textContent = 'Connect band';
      card.querySelector('.device-battery').replaceWith(link);
    }

    document.querySelectorAll('[data-sign-out]').forEach((btn) => btn.addEventListener('click', () => {
      if (!confirm('Sign out of OJAS on this device?')) return;
      const done = () => { clearTokens(); location.replace('index.html'); };
      apiFetch('/api/auth/logout', { method: 'POST' }).then(done, done);   // revoke this session on the server
    }));
  });
})();
