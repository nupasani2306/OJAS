// Metric history pages (heart rate, SpO₂, steps, calories, sleep, water).
// Each page sets <body data-metric="...">. Data comes from the OJAS backend via fetchHistory() below;
// a metric with no readings yet shows the empty states.
(function () {
  const METRICS = {
    heart: {
      title: 'Heart Rate', unit: 'bpm', chart: 'line', summary: ['Average', 'Lowest', 'Highest'],
      format: (v) => `${Math.round(v)}`,
    },
    spo2: {
      title: 'Blood Oxygen (SpO₂)', unit: '%', chart: 'line', summary: ['Average', 'Lowest', 'Highest'],
      format: (v) => `${Math.round(v)}`,
    },
    steps: {
      title: 'Steps', unit: 'steps', chart: 'bar', summary: ['Total', 'Daily average', 'Best day'],
      format: (v) => Math.round(v).toLocaleString(),
    },
    calories: {
      title: 'Calories', unit: 'kcal', chart: 'bar', summary: ['Total', 'Daily average', 'Best day'],
      format: (v) => Math.round(v).toLocaleString(),
    },
    sleep: {
      title: 'Sleep', unit: '', chart: 'bar', summary: ['Average', 'Shortest', 'Longest'],
      format: (v) => `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`, // value in minutes
    },
    water: {
      title: 'Water', unit: 'L', chart: 'bar', summary: ['Total', 'Daily average', 'Best day'],
      format: (v) => (Math.round(v * 10) / 10).toFixed(1),
    },
  };

  // General reference ranges for adults at rest, shown beside heart rate and SpO2 readings.
  // tone: 'ok' (within range), 'warn' (outside it), 'alert' (well outside it).
  const NOTES = {
    heart: (v) => {
      if (v < 40) return { tone: 'alert', label: 'Well below typical range', text: 'Well below the typical resting range (60–100 bpm). If you feel dizzy, faint or unwell, seek medical advice.' };
      if (v < 60) return { tone: 'warn', label: 'Below typical range', text: 'Below the typical resting range (60–100 bpm). This can be normal for athletes and during sleep.' };
      if (v <= 100) return { tone: 'ok', label: 'Typical resting range', text: 'Within the generally normal resting range (60–100 bpm).' };
      if (v <= 120) return { tone: 'warn', label: 'Above typical range', text: 'Above the typical resting range (60–100 bpm). This can follow activity, stress, caffeine or fever.' };
      return { tone: 'alert', label: 'Well above typical range', text: 'Well above the typical resting range (60–100 bpm). If this happens at rest or with symptoms, seek medical advice.' };
    },
    spo2: (v) => {
      if (v >= 95) return { tone: 'ok', label: 'Typical range', text: 'Within the generally normal range (95–100%).' };
      if (v >= 90) return { tone: 'warn', label: 'Below typical range', text: 'Below the typical range (95–100%). Measure again while still; if it stays low, talk to a doctor.' };
      return { tone: 'alert', label: 'Low', text: 'Low (below 90%). If it stays low or you feel short of breath, seek medical help promptly.' };
    },
  };
  const DISCLAIMER = 'These notes compare readings with general reference ranges for adults at rest. '
    + 'They are not a medical diagnosis. Talk to a doctor about your own readings, especially if you have symptoms.';

  function noteEl(note, full) {
    const el = document.createElement(full ? 'p' : 'small');
    el.className = `hx-note is-${note.tone}${full ? ' hx-note-latest' : ''}`;
    el.textContent = full ? note.text : note.label;
    return el;
  }

  const RANGES = { day: 'Today', week: 'This week', month: 'This month' };

  // Returns the history for one metric and range ('day' | 'week' | 'month') in this shape:
  //   {
  //     latest:   { value: 78, time: 1727700000000 } | null,
  //     points:   [{ label: 'Mon', value: 72 }, ...],   // one per chart bucket, oldest first
  //     readings: [{ time: 1727700000000, value: 78 }, ...], // newest first
  //   }
  // Values use the units above (sleep in minutes, water in litres).
  async function fetchHistory(metric, range) {
    const { latest, points, readings } = await apiFetch(`/api/health/history/${metric}?range=${range}&tz=${ojasTz()}`);
    return { latest, points, readings };
  }

  const key = document.body.dataset.metric;
  const m = METRICS[key];
  if (!m) return;
  const source = window.ojasHistorySource || fetchHistory; // lets a test supply data
  const $ = (id) => document.getElementById(id);
  const withUnit = (v) => (m.unit ? `${m.format(v)} ${m.unit}` : m.format(v));

  document.title = `OJAS – ${m.title} history`;
  $('latest-unit').textContent = m.unit;
  m.summary.forEach((label, i) => { $(`sum-label-${i}`).textContent = label; });

  let range = 'week';

  async function load() {
    document.querySelectorAll('.hx-tabs button').forEach((b) => {
      const on = b.dataset.range === range;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('chart-title').textContent = RANGES[range];

    let data;
    try {
      data = await source(key, range);
    } catch {
      data = null;
    }
    render(data || { latest: null, points: [], readings: [] }, !data);
  }

  function render(data, failed) {
    const notes = NOTES[key];
    // Latest value
    const oldNote = document.querySelector('.hx-note-latest');
    if (oldNote) oldNote.remove();
    if (data.latest) {
      if (notes) $('latest-time').after(noteEl(notes(data.latest.value), true));
      $('latest-value').textContent = m.format(data.latest.value);
      $('latest-time').textContent = `Last synced ${new Date(data.latest.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
    } else {
      $('latest-value').textContent = '—';
      $('latest-time').textContent = 'Waiting for your OJAS Band to sync';
    }

    // Summary tiles
    const values = data.points.map((p) => p.value).filter((v) => typeof v === 'number');
    const sums = values.length ? summarize(values) : null;
    [0, 1, 2].forEach((i) => {
      const cell = $(`sum-${i}`);
      cell.textContent = sums ? m.format(sums[i]) : '—';
      if (sums && m.unit) {
        const unit = document.createElement('small');
        unit.className = 'hx-unit';
        unit.textContent = ` ${m.unit}`;
        cell.append(unit);
      }
    });

    // Chart
    drawChart(data.points);
    $('chart-empty').hidden = data.points.length > 0;
    $('chart-empty-text').textContent = failed
      ? 'Could not load data. Please try again later.'
      : 'No data yet. Readings will appear here once your band syncs.';

    // Readings list
    const list = $('readings');
    list.innerHTML = '';
    data.readings.slice(0, 50).forEach((r) => {
      const li = document.createElement('li');
      const when = document.createElement('span');
      when.textContent = new Date(r.time).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const val = document.createElement('strong');
      val.textContent = withUnit(r.value);
      if (notes) {
        const right = document.createElement('div');
        right.className = 'hx-reading-value';
        right.append(val, noteEl(notes(r.value), false));
        li.append(when, right);
      } else {
        li.append(when, val);
      }
      list.append(li);
    });
    $('readings-empty').hidden = data.readings.length > 0;
    if (notes && !$('hx-disclaimer')) {
      const p = document.createElement('p');
      p.id = 'hx-disclaimer';
      p.className = 'hx-disclaimer';
      p.textContent = DISCLAIMER;
      $('readings-empty').after(p);
    }
  }

  function summarize(values) {
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (m.summary[0] === 'Total') return [total, avg, max];
    return [avg, min, max];
  }

  /* ---------- Chart (single series, drawn in SVG) ---------- */
  const W = 320, H = 160, PAD_L = 30, PAD_B = 22, PAD_T = 10;
  const tip = $('chart-tip');

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 3, 4, 5, 6, 8, 10].map((s) => s * p).find((s) => s >= v); // even steps keep the midpoint round
  }

  function drawChart(points) {
    const svg = $('chart');
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
    svg.innerHTML = '';

    const values = points.map((p) => p.value);
    const lo = m.chart === 'line' && values.length ? Math.max(0, Math.floor((Math.min(...values) * 0.9) / 10) * 10) : 0;
    const hi = !values.length ? 100
      : key === 'sleep' ? niceMax(Math.max(...values) / 60) * 60 // whole hours
      : lo + niceMax(Math.max(...values) - lo);
    const plotW = W - PAD_L - 6, plotH = H - PAD_B - PAD_T;
    const y = (v) => PAD_T + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

    // Gridlines + y labels (3 ticks)
    [lo, (lo + hi) / 2, hi].forEach((t, i) => {
      svg.append(el('line', { x1: PAD_L, x2: W - 6, y1: y(t), y2: y(t), class: i === 0 ? 'hx-axis' : 'hx-grid' }));
      if (values.length) {
        const label = el('text', { x: PAD_L - 6, y: y(t) + 3, class: 'hx-tick', 'text-anchor': 'end' });
        label.textContent = key === 'sleep' ? `${Math.round(t / 60)}h`
          : hi < 10 ? String(Math.round(t * 10) / 10) : Math.round(t).toLocaleString();
        svg.append(label);
      }
    });

    const n = points.length;
    if (!n) {
      svg.setAttribute('aria-label', `${m.title}: no data yet`);
      return;
    }
    svg.setAttribute('aria-label', `${m.title}, ${RANGES[range].toLowerCase()}: ${points.map((p) => `${p.label} ${withUnit(p.value)}`).join(', ')}`);

    const step = plotW / n;
    const cx = (i) => PAD_L + step * i + step / 2;
    const labelEvery = Math.ceil(n / 7);

    if (m.chart === 'line') {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
      svg.append(el('path', { d, class: 'hx-line' }));
    }

    points.forEach((p, i) => {
      if (m.chart === 'bar') {
        const bw = Math.min(22, step * 0.6);
        const top = y(p.value);
        const h = Math.max(0, PAD_T + plotH - top);
        // bar with 4px rounded top, square base
        const r = Math.min(4, h, bw / 2);
        const x0 = cx(i) - bw / 2, base = PAD_T + plotH;
        svg.append(el('path', { class: 'hx-bar', d: `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z` }));
      } else {
        svg.append(el('circle', { cx: cx(i), cy: y(p.value), r: 4, class: 'hx-dot' }));
      }
      if (i % labelEvery === 0) {
        const t = el('text', { x: cx(i), y: H - 6, class: 'hx-tick', 'text-anchor': 'middle' });
        t.textContent = p.label;
        svg.append(t);
      }
      // Hit target wider than the mark
      const hit = el('rect', { x: PAD_L + step * i, y: PAD_T, width: step, height: plotH, class: 'hx-hit', tabindex: 0, 'aria-label': `${p.label}: ${withUnit(p.value)}` });
      const show = () => {
        tip.textContent = `${p.label} · ${withUnit(p.value)}`;
        tip.hidden = false;
        const box = svg.getBoundingClientRect();
        const parent = svg.parentElement.getBoundingClientRect();
        const scale = box.width / W;
        tip.style.left = `${box.left - parent.left + cx(i) * scale}px`;
        tip.style.top = `${box.top - parent.top + y(p.value) * scale - 8}px`;
      };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
      hit.addEventListener('blur', () => { tip.hidden = true; });
      svg.append(hit);
    });
  }

  document.querySelector('.hx-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.range !== range) { range = b.dataset.range; load(); }
  });

  load();
})();
