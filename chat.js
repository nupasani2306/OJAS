// Chat page: conversation UI for the OJAS assistant. Messages and replies go through the
// OJAS backend (POST /api/chat), which stores the conversation; a copy is cached in this browser.
(function () {
  const store = ojasStore;

  const session = store.get('ojas.session', {}) || {};
  const name = store.get('ojas.profile', {}).name || session.name || 'OJAS user';

  /* ---------- Replies ---------- */

  // The server saves the question, writes the reply (demo answers until an AI is connected
  // in routes/chat.py generate_reply) and saves that too.
  async function getReply(text) {
    const { reply } = await apiFetch('/api/chat', { method: 'POST', body: { message: text } });
    return reply.message;
  }

  /* ---------- Conversation ---------- */
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const send = form.querySelector('.chat-send');
  const suggestions = document.getElementById('chat-suggestions');
  const welcome = () => ({ role: 'assistant', text: `Hi ${name}! I'm your OJAS assistant. How can I help you today?`, time: Date.now() });

  let messages = store.get('ojas.chat', null) || [welcome()];
  let busy = false;

  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const botIcon = '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15.5h5"/></svg>';

  function bubble(msg) {
    const row = document.createElement('div');
    row.className = `chat-row ${msg.role === 'user' ? 'from-user' : 'from-bot'}${msg.error ? ' is-error' : ''}`;

    const text = document.createElement('div');
    text.className = 'chat-bubble';
    text.textContent = msg.text;

    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    const avatar = document.createElement('span');
    avatar.className = 'chat-avatar';
    if (msg.role === 'user') avatar.textContent = initials(name);
    else avatar.innerHTML = botIcon;
    const time = document.createElement('small');
    time.textContent = timeOf(msg.time);
    meta.append(avatar, time);

    row.append(text, meta);
    return row;
  }

  function typing() {
    const row = document.createElement('div');
    row.className = 'chat-row from-bot';
    row.id = 'typing';
    row.innerHTML = `<div class="chat-bubble chat-typing" aria-label="Assistant is typing"><i></i><i></i><i></i></div>
      <div class="chat-meta"><span class="chat-avatar">${botIcon}</span></div>`;
    return row;
  }

  function render() {
    log.innerHTML = '';
    messages.forEach((m) => log.append(bubble(m)));
    if (busy) log.append(typing());
    suggestions.hidden = messages.some((m) => m.role === 'user');
    log.scrollTop = log.scrollHeight;
  }

  function save() {
    store.set('ojas.chat', messages.filter((m) => !m.error).slice(-100));
  }

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    messages.push({ role: 'user', text, time: Date.now() });
    busy = true;
    save();
    render();
    try {
      const reply = await getReply(text);
      messages.push({ role: 'assistant', text: reply, time: Date.now() });
    } catch (err) {
      messages.push({ role: 'assistant', text: `Sorry, I could not reply just now. ${err.message}`, time: Date.now(), error: true });
    }
    busy = false;
    save();
    render();
    updateSend();
  }

  /* ---------- Composer ---------- */
  function grow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }
  const updateSend = () => { send.disabled = busy || !input.value.trim(); };

  input.addEventListener('input', () => { grow(); updateSend(); });
  input.addEventListener('keydown', (e) => {
    // Enter sends; Shift+Enter adds a new line.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy || !input.value.trim()) return;
    const text = input.value;
    input.value = '';
    grow();
    updateSend();
    ask(text);
  });

  suggestions.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) ask(btn.textContent);
  });

  document.getElementById('clear-chat').addEventListener('click', async () => {
    if (busy || !confirm('Clear this conversation?')) return;
    try {
      await apiFetch('/api/chat', { method: 'DELETE' });
    } catch (err) {
      ojasToast(err.status === 409 ? 'Chat history cannot be deleted until the database update is applied.' : err.message);
      return;
    }
    messages = [welcome()];
    save();
    render();
  });

  /* ---------- Load ---------- */
  render();
  apiFetch('/api/chat').then(({ messages: rows }) => {
    if (busy) return;
    const history = rows.map((r) => ({ role: r.sender === 'user' ? 'user' : 'assistant', text: r.message, time: Date.parse(r.created_at) }));
    messages = [{ ...welcome(), time: history.length ? history[0].time : Date.now() }, ...history];
    save();
    render();
  }).catch((err) => ojasToast(err.message));
})();
