// Beast Mode: workout tracker. Live workout timer, rest timer, exercises and sets,
// weekly goal, streak, weekly chart, personal records and history, remembered in this browser.
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
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => c != null && el.append(c));
    return el;
  }

  /* ---------- Data ---------- */
  // MET values used to estimate calories: kcal = MET × body weight (kg) × hours.
  const TYPES = {
    Strength: { met: 5, distance: false, exercises: ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull-up', 'Push-up', 'Lunges', 'Bicep Curl', 'Tricep Dip', 'Lat Pulldown', 'Leg Press'] },
    HIIT: { met: 8, distance: false, exercises: ['Burpees', 'Jump Squats', 'Mountain Climbers', 'Kettlebell Swing', 'Box Jumps', 'High Knees'] },
    Running: { met: 9.8, distance: true, exercises: [] },
    Cycling: { met: 7.5, distance: true, exercises: [] },
    Cardio: { met: 7, distance: true, exercises: ['Jump Rope', 'Rowing', 'Elliptical', 'Stair Climber'] },
    Yoga: { met: 3, distance: false, exercises: ['Sun Salutation', 'Warrior Pose', 'Downward Dog', 'Plank'] },
  };
  const ALL_EXERCISES = [...new Set(Object.values(TYPES).flatMap((t) => t.exercises))].sort();

  const profile = store.get('ojas.profile', {});
  const bodyWeight = parseFloat(profile.weight) || 60;

  let history = store.get('ojas.workouts', []);   // finished workouts, newest first
  let active = store.get('ojas.activeWorkout', null);
  let goal = store.get('ojas.workoutGoal', 4);

  const saveHistory = () => store.set('ojas.workouts', history);
  const saveActive = () => store.set('ojas.activeWorkout', active);
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  /* ---------- Dates ---------- */
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  function startOfWeek(t = Date.now()) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d.getTime();
  }
  const DAY = 86400000;
  const weekStart = () => startOfWeek();
  const thisWeek = () => history.filter((w) => w.start >= weekStart() && w.start < weekStart() + 7 * DAY);

  function streak() {
    const days = new Set(history.map((w) => dayKey(w.start)));
    const d = new Date(); d.setHours(12, 0, 0, 0);
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet still keeps the streak
    let n = 0;
    while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------- Formatting ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(s / 3600);
    return hh ? `${hh}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }
  const minutes = (ms) => Math.round(ms / 60000);
  const kcalFor = (type, ms) => Math.round((TYPES[type]?.met || 5) * bodyWeight * (ms / 3600000));
  const volumeOf = (w) => w.exercises.reduce((sum, ex) =>
    sum + ex.sets.filter((s) => s.done).reduce((a, s) => a + (+s.kg || 0) * (+s.reps || 0), 0), 0);
  const fmtNum = (n) => Math.round(n).toLocaleString();

  /* ---------- Weekly goal, streak, stats ---------- */
  function renderSummary() {
    const week = thisWeek();
    const done = week.length;
    const ring = $('goal-arc');
    const circumference = 2 * Math.PI * 50;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - Math.min(done / goal, 1));
    $('goal-done').textContent = done;
    $('goal-target').textContent = goal;
    $('goal-value').textContent = goal;
    $('goal-ring').setAttribute('aria-label', `${done} of ${goal} workouts done this week`);
    $('hero-title').textContent =
      done >= goal ? 'Goal smashed! 🔥' : done === 0 ? "Let's get moving" : `${goal - done} more to go`;
    $('goal-minus').disabled = goal <= 1;
    $('goal-plus').disabled = goal >= 14;

    const s = streak();
    $('streak-days').textContent = s;
    $('streak').setAttribute('aria-label', `${s} day workout streak`);
    $('streak').classList.toggle('is-on', s > 0);

    $('stat-count').textContent = done;
    $('stat-minutes').textContent = fmtNum(week.reduce((a, w) => a + minutes(w.duration), 0));
    $('stat-kcal').textContent = fmtNum(week.reduce((a, w) => a + w.kcal, 0));
  }

  function changeGoal(delta) {
    goal = Math.min(14, Math.max(1, goal + delta));
    store.set('ojas.workoutGoal', goal);
    renderSummary();
  }
  $('goal-minus').addEventListener('click', () => changeGoal(-1));
  $('goal-plus').addEventListener('click', () => changeGoal(1));

  /* ---------- Weekly chart (single series: active minutes per day) ---------- */
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const tip = $('chart-tip');

  function renderChart() {
    const start = weekStart();
    const todayIdx = Math.floor((Date.now() - start) / DAY);
    const values = DAYS.map((_, i) =>
      history.filter((w) => w.start >= start + i * DAY && w.start < start + (i + 1) * DAY)
        .reduce((a, w) => a + minutes(w.duration), 0));
    const max = Math.max(30, ...values);
    const top = Math.ceil(max / 30) * 30; // whole-number ticks: 0, top/2, top

    const chart = $('chart');
    chart.innerHTML = '';
    chart.setAttribute('aria-label', `Active minutes this week: ${DAYS.map((d, i) => `${d} ${values[i]}`).join(', ')}`);

    const grid = h('div', { class: 'bm-grid', 'aria-hidden': 'true' },
      [top, top / 2, 0].map((v) => h('span', {}, h('small', {}, String(v)))));
    const bars = h('div', { class: 'bm-bars' });

    DAYS.forEach((d, i) => {
      const v = values[i];
      const col = h('button', {
        type: 'button',
        class: `bm-col${i === todayIdx ? ' is-today' : ''}`,
        'aria-label': `${d}: ${v} minutes`,
      },
      h('span', { class: 'bm-bar-area' },
        h('span', { class: 'bm-bar', style: `height:${v ? Math.max(3, (v / top) * 100) : 0}%` })),
      h('small', { class: 'bm-day' }, d));
      const show = () => {
        tip.textContent = `${d} · ${v} min`;
        tip.hidden = false;
        const c = col.getBoundingClientRect();
        const p = chart.parentElement.getBoundingClientRect();
        tip.style.left = `${c.left - p.left + c.width / 2}px`;
        tip.style.top = `${c.top - p.top + (col.querySelector('.bm-bar').getBoundingClientRect().top - c.top) - 8}px`;
      };
      col.addEventListener('pointerenter', show);
      col.addEventListener('focus', show);
      col.addEventListener('click', show);
      col.addEventListener('pointerleave', () => { tip.hidden = true; });
      col.addEventListener('blur', () => { tip.hidden = true; });
      bars.append(col);
    });

    chart.append(grid, bars);

    const tbody = $('chart-table').querySelector('tbody');
    tbody.innerHTML = '';
    DAYS.forEach((d, i) => tbody.append(h('tr', {}, h('td', {}, d), h('td', {}, String(values[i])))));
  }

  /* ---------- Personal records ---------- */
  function renderPRs() {
    const best = {};
    history.forEach((w) => w.exercises.forEach((ex) => ex.sets.forEach((s) => {
      const kg = +s.kg || 0;
      if (!s.done || kg <= 0) return;
      const cur = best[ex.name];
      if (!cur || kg > cur.kg || (kg === cur.kg && +s.reps > cur.reps)) best[ex.name] = { kg, reps: +s.reps || 0, date: w.start };
    })));
    const list = $('pr-list');
    list.innerHTML = '';
    const entries = Object.entries(best).sort((a, b) => b[1].kg - a[1].kg);
    $('pr-empty').hidden = entries.length > 0;
    entries.slice(0, 6).forEach(([name, r]) => list.append(
      h('li', {},
        h('span', { class: 'bm-pr-icon', 'aria-hidden': 'true' }, '🏆'),
        h('div', { class: 'contact-text' }, h('strong', {}, name), h('small', {}, new Date(r.date).toLocaleDateString())),
        h('strong', { class: 'bm-pr-value' }, `${r.kg} kg × ${r.reps}`))));
    return best;
  }

  /* ---------- History ---------- */
  function renderHistory() {
    const list = $('history-list');
    list.innerHTML = '';
    $('history-empty').hidden = history.length > 0;
    $('history-count').textContent = `${history.length} workout${history.length === 1 ? '' : 's'}`;

    history.forEach((w) => {
      const vol = volumeOf(w);
      const details = h('div', { class: 'bm-history-details', hidden: true },
        w.exercises.length
          ? w.exercises.map((ex) => {
            const done = ex.sets.filter((s) => s.done);
            return h('p', {}, h('strong', {}, ex.name), ' — ',
              done.length ? done.map((s) => (+s.kg ? `${s.kg}×${s.reps}` : `${s.reps} reps`)).join(', ') : 'no sets done');
          })
          : h('p', {}, 'No exercises logged.'),
        w.distance ? h('p', {}, h('strong', {}, 'Distance'), ` — ${w.distance} km`) : null,
        h('button', {
          type: 'button', class: 'bm-delete',
          onclick: () => {
            if (!confirm(`Delete "${w.name}" from your history?`)) return;
            history = history.filter((x) => x.id !== w.id);
            saveHistory();
            renderAll();
          },
        }, 'Delete workout'));

      const meta = [`${minutes(w.duration)} min`, `${w.kcal} kcal`];
      if (w.distance) meta.push(`${w.distance} km`);
      if (vol) meta.push(`${fmtNum(vol)} kg lifted`);

      const toggle = h('button', { type: 'button', class: 'bm-history-row', 'aria-expanded': 'false' },
        h('span', { class: `bm-type-icon t-${w.type.toLowerCase()}`, 'aria-hidden': 'true' }, w.type[0]),
        h('div', { class: 'contact-text' },
          h('strong', {}, w.name),
          h('small', {}, `${new Date(w.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${meta.join(' · ')}`)),
        h('span', { class: 'bm-chevron', 'aria-hidden': 'true' }));
      toggle.querySelector('.bm-chevron').innerHTML = '<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>';
      toggle.addEventListener('click', () => {
        details.hidden = !details.hidden;
        toggle.setAttribute('aria-expanded', String(!details.hidden));
      });
      list.append(h('li', {}, toggle, details));
    });
  }

  /* ---------- Start sheet ---------- */
  const sheet = $('start-sheet');
  const startForm = $('start-form');
  const typeBox = $('type-options');
  Object.keys(TYPES).forEach((t, i) => typeBox.append(
    h('label', { class: 'bm-type' },
      h('input', { type: 'radio', name: 'type', value: t, checked: i === 0 }),
      h('span', {}, t))));

  const openSheet = (open) => { sheet.hidden = !open; if (open) startForm.elements.type[0].focus(); };
  $('start-btn').addEventListener('click', () => (active ? $('active').scrollIntoView({ behavior: 'smooth' }) : openSheet(true)));
  $('sheet-close').addEventListener('click', () => openSheet(false));
  $('sheet-backdrop').addEventListener('click', () => openSheet(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) openSheet(false); });

  startForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = startForm.elements.type.value;
    const name = startForm.elements.name.value.trim() || `${type} workout`;
    active = { id: uid(), type, name, start: Date.now(), pausedMs: 0, pausedAt: null, distance: '', exercises: [] };
    saveActive();
    startForm.reset();
    openSheet(false);
    renderActive();
    $('active').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- Active workout ---------- */
  const elapsed = () => (active ? Date.now() - active.start - active.pausedMs - (active.pausedAt ? Date.now() - active.pausedAt : 0) : 0);
  let prBest = {};

  function renderActive() {
    $('active').hidden = !active;
    $('start-btn').querySelector('span').textContent = active ? 'Go to workout' : 'Start workout';
    $('start-btn').classList.toggle('is-live', !!active);
    if (!active) return;

    $('active-type').textContent = active.type;
    $('active-name').textContent = active.name;
    $('pause-btn').textContent = active.pausedAt ? 'Resume' : 'Pause';
    $('live-badge').classList.toggle('is-paused', !!active.pausedAt);
    $('live-badge').lastChild.textContent = active.pausedAt ? 'Paused' : 'Live';
    $('distance-row').hidden = !TYPES[active.type].distance;
    $('distance-input').value = active.distance;

    const lib = $('ex-library');
    lib.innerHTML = '';
    [...TYPES[active.type].exercises, ...ALL_EXERCISES.filter((x) => !TYPES[active.type].exercises.includes(x))]
      .forEach((x) => lib.append(h('option', { value: x })));

    renderExercises();
    tick();
  }

  function renderExercises() {
    const box = $('exercises');
    box.innerHTML = '';
    active.exercises.forEach((ex) => {
      const pr = prBest[ex.name];
      const rows = ex.sets.map((s, i) => {
        const kg = h('input', { type: 'number', min: '0', step: '0.5', inputmode: 'decimal', value: s.kg, 'aria-label': `${ex.name} set ${i + 1} weight in kg`, placeholder: '0' });
        const reps = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: s.reps, 'aria-label': `${ex.name} set ${i + 1} reps`, placeholder: '0' });
        kg.addEventListener('input', () => { s.kg = kg.value; saveActive(); });
        reps.addEventListener('input', () => { s.reps = reps.value; saveActive(); });
        const check = h('button', {
          type: 'button', class: `bm-check${s.done ? ' is-done' : ''}`,
          'aria-pressed': String(!!s.done), 'aria-label': `Mark set ${i + 1} done`,
          onclick: () => {
            s.done = !s.done;
            saveActive();
            renderExercises();
            if (s.done) startRest(restDefault); // auto-start rest after a completed set
          },
        });
        check.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';
        return h('div', { class: `bm-set${s.done ? ' is-done' : ''}` }, h('span', { class: 'bm-set-no' }, String(i + 1)), kg, reps, check);
      });

      box.append(h('div', { class: 'bm-ex' },
        h('div', { class: 'bm-ex-head' },
          h('div', {}, h('strong', {}, ex.name), pr ? h('small', { class: 'bm-ex-pr' }, `PR ${pr.kg} kg × ${pr.reps}`) : null),
          h('button', {
            type: 'button', class: 'doc-remove', 'aria-label': `Remove ${ex.name}`,
            onclick: () => { active.exercises = active.exercises.filter((x) => x !== ex); saveActive(); renderExercises(); },
          })),
        h('div', { class: 'bm-set bm-set-head', 'aria-hidden': 'true' }, h('span', {}, 'Set'), h('span', {}, 'kg'), h('span', {}, 'Reps'), h('span', {}, '✓')),
        rows,
        h('div', { class: 'bm-ex-actions' },
          h('button', {
            type: 'button', class: 'text-btn',
            onclick: () => {
              const last = ex.sets[ex.sets.length - 1];
              ex.sets.push({ kg: last ? last.kg : '', reps: last ? last.reps : '', done: false });
              saveActive();
              renderExercises();
            },
          }, '+ Add set'),
          ex.sets.length > 1 ? h('button', {
            type: 'button', class: 'bm-link',
            onclick: () => { ex.sets.pop(); saveActive(); renderExercises(); },
          }, 'Remove last') : null)));
    });
    box.querySelectorAll('.doc-remove').forEach((b) => { b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'; });
  }

  $('add-ex-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('ex-input');
    const typed = input.value.trim();
    if (!typed || !active) return;
    const name = ALL_EXERCISES.find((x) => x.toLowerCase() === typed.toLowerCase()) || typed;
    active.exercises.push({ name, sets: [{ kg: '', reps: '', done: false }] });
    saveActive();
    input.value = '';
    renderExercises();
  });

  $('distance-input').addEventListener('input', (e) => { active.distance = e.target.value; saveActive(); });

  $('pause-btn').addEventListener('click', () => {
    if (active.pausedAt) { active.pausedMs += Date.now() - active.pausedAt; active.pausedAt = null; }
    else active.pausedAt = Date.now();
    saveActive();
    renderActive();
  });

  $('discard-btn').addEventListener('click', () => {
    if (!confirm('Discard this workout? It will not be saved.')) return;
    active = null;
    saveActive();
    stopRest();
    renderActive();
  });

  $('finish-btn').addEventListener('click', () => {
    const duration = elapsed();
    if (duration < 60000 && !confirm('This workout is under a minute. Save it anyway?')) return;
    const exercises = active.exercises
      .map((ex) => ({ name: ex.name, sets: ex.sets.filter((s) => s.done || +s.kg || +s.reps) }))
      .filter((ex) => ex.sets.length);
    history.unshift({
      id: active.id, type: active.type, name: active.name, start: active.start, duration,
      kcal: kcalFor(active.type, duration),
      distance: parseFloat(active.distance) > 0 ? Math.round(parseFloat(active.distance) * 100) / 100 : null,
      exercises,
    });
    saveHistory();
    active = null;
    saveActive();
    stopRest();
    renderAll();
    $('hero').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------- Rest timer ---------- */
  let restEnd = null;
  let restDefault = 90;

  function startRest(sec) {
    restDefault = sec;
    restEnd = Date.now() + sec * 1000;
    $('rest-btns').hidden = true;
    $('rest-live').hidden = false;
    tick();
  }
  function stopRest() {
    restEnd = null;
    $('rest-btns').hidden = false;
    $('rest-live').hidden = true;
  }
  $('rest-btns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) startRest(+b.dataset.rest); });
  $('rest-add').addEventListener('click', () => { restEnd += 15000; tick(); });
  $('rest-skip').addEventListener('click', stopRest);

  function tick() {
    if (active) $('timer').textContent = clock(elapsed());
    if (restEnd) {
      const left = restEnd - Date.now();
      if (left <= 0) {
        stopRest();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } else {
        $('rest-time').textContent = clock(left + 999).replace(/^0/, '');
      }
    }
  }
  setInterval(tick, 250);

  /* ---------- Render all ---------- */
  function renderAll() {
    renderSummary();
    renderChart();
    prBest = renderPRs();
    renderHistory();
    renderActive();
  }
  renderAll();
})();
