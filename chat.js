// Chat page: conversation UI for the OJAS assistant, remembered in this browser.
// Replies come from getReply() below. It returns demo answers until an AI backend is connected.
(function () {
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
  };

  const profile = store.get('ojas.profile', { name: 'Neha' });
  const name = profile.name || 'Neha';

  /* ---------- Replies ---------- */

  // Connect the AI here. Receives the whole conversation as
  // [{ role: 'user' | 'assistant', text: '...' }, ...] and must return the reply text.
  //
  // Keep API keys off the page: anything in this file can be read by whoever opens it.
  // Call your own backend instead, which holds the key and talks to the AI, e.g.
  //
  //   const res = await fetch('/api/chat', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ messages }),
  //   });
  //   if (!res.ok) throw new Error('Chat request failed');
  //   return (await res.json()).reply;
  async function getReply(messages) {
    const question = messages[messages.length - 1].text.toLowerCase();
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
    return demoReply(question);
  }

  function demoReply(q) {
    const has = (...words) => words.some((w) => q.includes(w));
    if (has('sos', 'emergency', 'help me', 'chest pain', "can't breathe")) {
      return 'If this is an emergency, press and hold the SOS button on the home page, or call your local emergency number right away.';
    }
    if (has('heart', 'pulse', 'bpm')) {
      return 'Your heart rate is 78 bpm. For adults at rest, 60–100 bpm is generally considered normal.';
    }
    if (has('spo2', 'spo₂', 'oxygen')) {
      return 'SpO₂ is the percentage of oxygen in your blood. Yours is 98%. Readings of 95% or higher are usually considered normal.';
    }
    if (has('sleep')) {
      return 'You slept 7h 12m. A few tips: keep a regular bedtime, avoid screens for an hour before bed, and keep your room cool and dark.';
    }
    if (has('water', 'hydrat', 'drink')) {
      return 'You have had 1.8 L today. Many adults need about 2–3 L a day, more when it is hot or you are active.';
    }
    if (has('step', 'walk', 'calorie')) {
      return 'You have walked 4,832 steps and burned 420 kcal so far. A short walk after meals is an easy way to add more.';
    }
    if (has('hi', 'hello', 'hey')) {
      return `Hi ${name}! Ask me about your heart rate, SpO₂, sleep, steps or water.`;
    }
    return "I'm running in demo mode, so I can only answer a few questions for now. Try asking about your heart rate, SpO₂, sleep, steps or water.";
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
      const reply = await getReply(messages.map(({ role, text: t }) => ({ role, text: t })));
      messages.push({ role: 'assistant', text: reply, time: Date.now() });
    } catch {
      messages.push({ role: 'assistant', text: 'Sorry, I could not reply just now. Please try again.', time: Date.now(), error: true });
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

  document.getElementById('clear-chat').addEventListener('click', () => {
    if (busy || !confirm('Clear this conversation?')) return;
    messages = [welcome()];
    save();
    render();
  });

  render();
})();
