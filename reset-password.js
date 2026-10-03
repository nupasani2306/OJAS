// Reset password page, opened from the link in the Supabase reset email.
// The link carries a short-lived recovery token (in the URL after #). It is removed from the
// address bar straight away and only sent to the OJAS backend with the new password.
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('reset-form');

  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const token = hash.get('access_token');
  const linkError = hash.get('error_description') || query.get('error_description');
  history.replaceState(null, '', location.pathname);   // do not leave the token in the address bar or history
  window.addEventListener('hashchange', () => location.reload());   // a new link opened in this tab

  function message(title, text, linkLabel, href) {
    form.hidden = true;
    $('reset-message').hidden = false;
    $('reset-message-title').textContent = title;
    $('reset-message-text').textContent = text;
    $('reset-message-link').textContent = linkLabel;
    $('reset-message-link').href = href;
  }

  if (!token || hash.get('type') !== 'recovery') {
    message(
      'This reset link is not valid',
      linkError ? `${linkError.replace(/\+/g, ' ')}. Request a new link from the sign-in page.`
        : 'Open the link from your password reset email, or request a new one from the sign-in page.',
      'Request a new link', 'index.html',
    );
    return;
  }
  form.hidden = false;
  form.elements.password.focus();

  document.querySelectorAll('.auth-show').forEach((btn) => btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? 'Show' : 'Hide';
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  }));

  const errorBox = form.querySelector('.auth-error');
  form.addEventListener('input', () => { errorBox.hidden = true; });
  function fail(text, input) {
    errorBox.textContent = text;
    errorBox.hidden = false;
    if (input) input.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { password, confirm } = form.elements;
    if (password.value.length < 8) return fail('Use at least 8 characters.', password);
    if (password.value !== confirm.value) return fail('The two passwords do not match.', confirm);

    const button = form.querySelector('.auth-submit');
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const res = await fetch(`${OJAS_API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: password.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          message('This reset link has expired', data.message || 'Request a new link from the sign-in page.', 'Request a new link', 'index.html');
          return;
        }
        throw new Error(data.message || 'Could not change the password.');
      }
      clearTokens();   // any old session on this device signs in again with the new password
      message('Password changed', data.message || 'Sign in with your new password.', 'Sign in', 'index.html');
    } catch (err) {
      fail(err.message === 'Failed to fetch' ? 'Cannot reach the OJAS server. Check that the backend is running.' : err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Save new password';
    }
  });
})();
