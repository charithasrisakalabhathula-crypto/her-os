/* =====================================================================
   My Life OS — Becoming My Best Self
   Vanilla JS · LocalStorage · Notification API · Web Audio API · PWA
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Constants & defaults
  ------------------------------------------------------------------ */
  const STORE_KEY = 'lifeos.v1';
  const TIMER_KEY = 'lifeos.timers.v1';
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const DEFAULT_TARGETS = { workout: 45, study: 180, steps: 10000, water: 3000, sleep: 7, skinAM: 15, skinPM: 15 };
  const DEFAULT_SETTINGS = {
    theme: '',                       // '' = follow device, or 'light' | 'dark'
    targets: Object.assign({}, DEFAULT_TARGETS),
    streakThreshold: 60,
    reminder: {
      enabled: false, interval: 60, start: '07:00', end: '22:00',
      custom: [], glass: 250, sound: true,
      lastAt: 0, snoozeUntil: 0, firedCustom: {}
    },
    badgesSeen: [],
    lastBackup: 0
  };

  const CATS = [
    { key: 'workout', name: 'Workout',  emoji: '🏋️', color: '#C9826B' },
    { key: 'study',   name: 'Study',    emoji: '📚', color: '#8FA06F' },
    { key: 'steps',   name: 'Walking',  emoji: '👟', color: '#C9A26B' },
    { key: 'water',   name: 'Water',    emoji: '💧', color: '#7FA3B5' },
    { key: 'sleep',   name: 'Sleep',    emoji: '🌙', color: '#9B8DB5' },
    { key: 'skin',    name: 'Skincare', emoji: '🧴', color: '#D69A9A' },
    { key: 'food',    name: 'Food',     emoji: '🥗', color: '#B5A15A' },
    { key: 'content', name: 'Content',  emoji: '🎬', color: '#6F9A87' }
  ];

  const QUOTES = [
    'Small steps every day add up to big change.',
    'Consistency is quiet, but it changes everything.',
    "You don't have to be perfect — just present.",
    'Be proud of showing up, even on the slow days.',
    'Tiny habits, tremendous glow-ups.',
    'Rest is productive too.',
    "Today's effort is tomorrow's confidence.",
    'Progress over perfection, always.',
    'Your future self is cheering for you.',
    'Bloom at your own pace.',
    'Drink water. Take a breath. Keep going.',
    'Discipline is a form of self-love.',
    'One good day at a time.',
    "Create before you feel ready.",
    'You are becoming the person you keep promising to be.'
  ];

  const WIN = {
    workout: ['Workout done! Your body says thank you 💪', 'Sweat session complete — strong and glowing!'],
    study:   ['Study goal reached! Your brain is growing 📚', 'Knowledge level up — proud of you!'],
    steps:   ['10k-style victory! Every step counted 👟', 'Step goal smashed — what a walk!'],
    water:   ['Hydration goal reached! You are glowing 💧', 'Water goal done — your skin says thanks!'],
    sleep:   ['Rested and ready — sleep goal met 🌙', 'Beautiful rest. Recovery is productive.'],
    skin:    ['Skincare complete — self-care queen 🧴', 'Glow routine done, morning and night!'],
    food:    ['Both meals in — you nourished yourself 🥗', 'Fed and fuelled. Lovely consistency!'],
    content: ['Shot and edited — creator mode on 🎬', 'Content day complete! Keep creating ✨'],
    all:     ['PERFECT DAY! Every habit complete 🌟', 'You showed up for everything today. Incredible! 🎉']
  };

  /* ------------------------------------------------------------------
     Tiny helpers
  ------------------------------------------------------------------ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (n, min, max) => {
    min = min === undefined ? 0 : min; max = max === undefined ? 1 : max;
    return Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));
  };
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dkey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fromKey = k => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return dkey(d); };
  const monthKeyOf = k => k.slice(0, 7);
  const fmtNum = n => Math.round(n).toLocaleString();
  const fmtMin = m => {
    m = Math.round(m); if (m < 0) m = 0;
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? h + 'h ' + r + 'm' : h + 'h') : r + 'm';
  };
  const fmtWater = ml => ml < 1000 ? Math.round(ml) + ' ml' : parseFloat((ml / 1000).toFixed(2)) + ' L';
  const longDate = k => fromKey(k).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = k => fromKey(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const hmToMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const fmtHM12 = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  function deepFill(def, src) {
    if (Array.isArray(def)) return Array.isArray(src) ? src.slice() : def.slice();
    if (def && typeof def === 'object') {
      const isObj = src && typeof src === 'object' && !Array.isArray(src);
      if (Object.keys(def).length === 0) return isObj ? Object.assign({}, src) : {};
      const out = {};
      Object.keys(def).forEach(k => { out[k] = deepFill(def[k], isObj ? src[k] : undefined); });
      return out;
    }
    if (typeof def === 'number') return (typeof src === 'number' && Number.isFinite(src)) ? src : def;
    return typeof src === typeof def ? src : def;
  }

  const blankDay = () => ({
    workout: 0,
    study: { min: 0, sessions: [] },
    steps: 0,
    water: { ml: 0, log: [] },
    sleep: { bed: '', wake: '', min: 0 },
    skin: { am: false, pm: false, amMin: 0, pmMin: 0 },
    food: { m1: { done: false, name: '', note: '' }, m2: { done: false, name: '', note: '' } },
    content: { shoot: false, edit: false, title: '', platform: 'Instagram', min: 0, note: '' },
    reflection: ''
  });

  /* ------------------------------------------------------------------
     Storage
  ------------------------------------------------------------------ */
  let db = null;
  let storageOK = true;

  function loadDB() {
    let raw = null, rawText = null;
    try {
      rawText = localStorage.getItem(STORE_KEY);
      raw = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      raw = null;
      try { if (rawText) localStorage.setItem(STORE_KEY + '.corrupt', rawText); } catch (e2) { /* ignore */ }
    }
    db = { version: 1, settings: deepFill(DEFAULT_SETTINGS, raw && raw.settings), days: {} };
    sanitizeSettings();
    if (raw && raw.days && typeof raw.days === 'object') {
      Object.keys(raw.days).forEach(k => {
        if (DATE_RE.test(k) && raw.days[k] && typeof raw.days[k] === 'object') db.days[k] = deepFill(blankDay(), raw.days[k]);
      });
    }
  }

  function sanitizeSettings() {
    const t = db.settings.targets;
    Object.keys(DEFAULT_TARGETS).forEach(k => { if (!(t[k] > 0)) t[k] = DEFAULT_TARGETS[k]; });
    if (!(db.settings.streakThreshold >= 10 && db.settings.streakThreshold <= 100)) db.settings.streakThreshold = 60;
    const r = db.settings.reminder;
    if ([30, 45, 60, 90].indexOf(r.interval) < 0) r.interval = 60;
    if ([150, 250, 500].indexOf(r.glass) < 0) r.glass = 250;
    if (hmToMin(r.start) === null) r.start = '07:00';
    if (hmToMin(r.end) === null) r.end = '22:00';
    r.custom = r.custom.filter(x => hmToMin(x) !== null);
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); storageOK = true; }
    catch (e) { storageOK = false; toast('⚠️ Could not save — browser storage is full or blocked'); }
  }

  const getDay = k => db.days[k] || blankDay();

  /* ------------------------------------------------------------------
     Calculations
  ------------------------------------------------------------------ */
  function sleepMinutes(bed, wake) {
    const b = hmToMin(bed), w = hmToMin(wake);
    if (b === null || w === null) return 0;
    return (w - b + 1440) % 1440;
  }

  function pcts(d, t) {
    t = t || db.settings.targets;
    return {
      workout: clamp(d.workout / t.workout),
      study: clamp(d.study.min / t.study),
      steps: clamp(d.steps / t.steps),
      water: clamp(d.water.ml / t.water),
      sleep: clamp(d.sleep.min / (t.sleep * 60)),
      skin: clamp((d.skin.amMin + d.skin.pmMin) / (t.skinAM + t.skinPM)),
      food: ((d.food.m1.done ? 1 : 0) + (d.food.m2.done ? 1 : 0)) / 2,
      content: ((d.content.shoot ? 1 : 0) + (d.content.edit ? 1 : 0)) / 2
    };
  }
  function overall(d) {
    const p = pcts(d);
    return CATS.reduce((s, c) => s + p[c.key], 0) / CATS.length * 100;
  }
  const dayOverall = k => db.days[k] ? overall(db.days[k]) : 0;

  function detail(key, d, t) {
    switch (key) {
      case 'workout': return d.workout + ' / ' + t.workout + ' min';
      case 'study':   return fmtMin(d.study.min) + ' / ' + fmtMin(t.study);
      case 'steps':   return fmtNum(d.steps) + ' / ' + fmtNum(t.steps) + ' steps';
      case 'water':   return fmtWater(d.water.ml) + ' / ' + fmtWater(t.water);
      case 'sleep':   return d.sleep.min ? fmtMin(d.sleep.min) + ' / ' + t.sleep + 'h' : 'not logged · goal ' + t.sleep + 'h';
      case 'skin':    return (d.skin.amMin + d.skin.pmMin) + ' / ' + (t.skinAM + t.skinPM) + ' min';
      case 'food':    return ((d.food.m1.done ? 1 : 0) + (d.food.m2.done ? 1 : 0)) + ' / 2 meals';
      case 'content': return ((d.content.shoot ? 1 : 0) + (d.content.edit ? 1 : 0)) + ' / 2 (shoot, edit)';
    }
    return '';
  }
  function remaining(key, d, t) {
    switch (key) {
      case 'workout': return Math.max(0, t.workout - d.workout) + ' min to go';
      case 'study':   return fmtMin(Math.max(0, t.study - d.study.min)) + ' to go';
      case 'steps':   return fmtNum(Math.max(0, t.steps - d.steps)) + ' steps to go';
      case 'water':   return fmtWater(Math.max(0, t.water - d.water.ml)) + ' to go';
      case 'sleep':   return d.sleep.min ? fmtMin(Math.max(0, t.sleep * 60 - d.sleep.min)) + ' short of goal' : 'Log bedtime & wake-up';
      case 'skin':    return [d.skin.am ? '' : 'morning', d.skin.pm ? '' : 'night'].filter(Boolean).join(' & ') + ' routine pending';
      case 'food':    return [d.food.m1.done ? '' : 'Meal 1', d.food.m2.done ? '' : 'Meal 2'].filter(Boolean).join(' & ') + ' pending';
      case 'content': return [d.content.shoot ? '' : 'shooting', d.content.edit ? '' : 'editing'].filter(Boolean).join(' & ') + ' pending';
    }
    return '';
  }

  function streakInfo() {
    const th = db.settings.streakThreshold;
    const ok = k => !!db.days[k] && overall(db.days[k]) >= th;
    let cur = 0, k = state.todayKey;
    if (!ok(k)) k = addDays(k, -1);
    while (ok(k)) { cur++; k = addDays(k, -1); }
    let best = 0, run = 0, prev = null;
    Object.keys(db.days).sort().forEach(key => {
      if (!ok(key)) { run = 0; prev = null; return; }
      run = (prev && addDays(prev, 1) === key) ? run + 1 : 1;
      prev = key; best = Math.max(best, run);
    });
    return { current: cur, best: Math.max(best, cur) };
  }
  function weekScore() {
    const keys = rangeKeys(state.todayKey, 7);
    return avg(keys.map(dayOverall));
  }
  function rangeKeys(endKey, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i));
    return out;
  }

  /* ------------------------------------------------------------------
     Application state
  ------------------------------------------------------------------ */
  const today0 = dkey();
  const state = {
    view: 'today',
    viewDate: today0,
    todayKey: today0,
    following: true,
    repTab: 'daily',
    repMonth: monthKeyOf(today0),
    calMonth: monthKeyOf(today0),
    calSel: today0,
    quoteIdx: 0
  };

  /* ------------------------------------------------------------------
     Toast, confetti, celebrations
  ------------------------------------------------------------------ */
  let toastT = null;
  function toast(msg) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3400);
  }

  function confetti(x, y, n) {
    if (reduceMotion) return;
    const layer = $('#confetti'); if (!layer) return;
    const colors = ['#C9826B', '#A3B18A', '#DCE5D2', '#E9C8A7', '#493B32', '#7FA3B5'];
    x = clamp(x, 20, window.innerWidth - 20, true); y = clamp(y, 20, window.innerHeight - 20, true);
    for (let i = 0; i < (n || 36); i++) {
      const el = document.createElement('i');
      const a = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 150;
      el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;background:' + colors[i % colors.length] +
        ';--dx:' + (Math.cos(a) * dist).toFixed(0) + 'px;--dy:' + (Math.sin(a) * dist - 70).toFixed(0) +
        'px;--r:' + (Math.random() * 720 - 360).toFixed(0) + 'deg;';
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1500);
    }
  }

  function celebrate(key) {
    const cardEl = key === 'all' ? $('#hero') : $('#card-' + key);
    if (cardEl) {
      cardEl.classList.remove('celebrate'); void cardEl.offsetWidth; cardEl.classList.add('celebrate');
      setTimeout(() => cardEl.classList.remove('celebrate'), 1300);
      const r = cardEl.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + Math.min(r.height / 2, 160), key === 'all' ? 90 : 40);
    }
    toast(pick(WIN[key]));
  }

  const lastPct = {};
  function detectCelebrations(k, p, ov) {
    CATS.forEach(c => {
      const id = k + ':' + c.key, prev = lastPct[id];
      if (prev !== undefined && prev < 1 && p[c.key] >= 1) celebrate(c.key);
      lastPct[id] = p[c.key];
    });
    const id = k + ':all', prev = lastPct[id];
    if (prev !== undefined && prev < 100 && ov >= 100) setTimeout(() => celebrate('all'), 450);
    lastPct[id] = ov;
  }

  /* ------------------------------------------------------------------
     Mutations
  ------------------------------------------------------------------ */
  function edit(key, fn) {
    if (!db.days[key]) db.days[key] = blankDay();
    fn(db.days[key]);
    save();
    afterChange();
  }
  const vk = () => state.viewDate;

  function addWater(d, ml) {
    d.water.ml = Math.max(0, d.water.ml + ml);
    d.water.log.push({ ml: ml, at: nowHM() });
    if (d.water.log.length > 300) d.water.log.shift();
  }

  function afterChange() {
    renderToday();
    checkBadges(false);
  }

  /* ------------------------------------------------------------------
     Timers (persisted so they survive refresh / app close)
  ------------------------------------------------------------------ */
  let timers = null;
  function loadTimers() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(TIMER_KEY)); } catch (e) { raw = null; }
    timers = {};
    ['workout', 'study', 'skin'].forEach(k => {
      const t = raw && raw[k] || {};
      timers[k] = { acc: Number.isFinite(t.acc) && t.acc >= 0 ? t.acc : 0, start: Number.isFinite(t.start) && t.start > 0 ? t.start : 0 };
    });
  }
  function saveTimers() { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timers)); } catch (e) { /* ignore */ } }
  const tElapsed = k => timers[k].acc + (timers[k].start ? Date.now() - timers[k].start : 0);
  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
  }

  function renderTimers() {
    ['workout', 'study', 'skin'].forEach(k => {
      const el = $('#clk-' + k); if (!el) return;
      const t = timers[k], ms = tElapsed(k);
      el.textContent = fmtClock(ms);
      const box = el.closest('.timer'); if (box) box.classList.toggle('running', !!t.start);
      const main = $('[data-timer-main="' + k + '"]');
      if (main) main.textContent = t.start ? '⏸ Pause' : (t.acc > 0 ? '▶ Resume' : '▶ Start');
      const sv = $('[data-timer-save="' + k + '"]'); if (sv) sv.disabled = ms < 1000;
      const rs = $('[data-timer-reset="' + k + '"]'); if (rs) rs.disabled = ms < 1000 && !t.start;
    });
  }

  function timerMain(k) {
    const t = timers[k];
    if (t.start) { t.acc += Date.now() - t.start; t.start = 0; }
    else { t.start = Date.now(); ensureAudio(); }
    saveTimers(); renderTimers();
  }
  function timerReset(k) {
    if (tElapsed(k) > 60000 && !confirm('Reset this timer? The elapsed time will be discarded.')) return;
    timers[k] = { acc: 0, start: 0 }; saveTimers(); renderTimers();
  }
  function timerSave(k) {
    const ms = tElapsed(k);
    let minutes = Math.round(ms / 60000);
    if (minutes < 1 && ms >= 20000) minutes = 1;
    if (minutes < 1) { toast('Timer is under 20 seconds — keep going!'); return; }
    if (k === 'workout') edit(vk(), d => { d.workout += minutes; });
    else if (k === 'study') edit(vk(), d => { d.study.min += minutes; d.study.sessions.push({ min: minutes, at: nowHM(), src: 'timer' }); });
    else {
      const which = $('#skTargetSel').value === 'pm' ? 'pm' : 'am';
      edit(vk(), d => {
        if (which === 'am') { d.skin.am = true; d.skin.amMin = minutes; } else { d.skin.pm = true; d.skin.pmMin = minutes; }
      });
    }
    timers[k] = { acc: 0, start: 0 }; saveTimers(); renderTimers();
    toast('Saved ' + fmtMin(minutes) + (k === 'skin' ? ' of skincare ✨' : ' ✔'));
  }

  /* ------------------------------------------------------------------
     Rendering — Today
  ------------------------------------------------------------------ */
  function ringMarkup() {
    return '<svg viewBox="0 0 36 36" class="ring" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="15.9155"/><circle class="ring-fg" cx="18" cy="18" r="15.9155"/></svg><div class="ring-text">0%</div>';
  }
  function setMiniRing(key, pct) {
    const el = $('[data-ring="' + key + '"]'); if (!el) return;
    el.querySelector('.ring-fg').style.strokeDasharray = (pct * 100).toFixed(1) + ' 100';
    el.querySelector('.ring-text').textContent = Math.round(pct * 100) + '%';
  }
  function paintCard(key, pct) {
    const card = $('#card-' + key); if (!card) return;
    card.classList.toggle('done', pct >= 1);
    const b = card.querySelector('.bar > i'); if (b) b.style.width = (pct * 100).toFixed(1) + '%';
    setMiniRing(key, pct);
  }
  function setVal(el, v) {
    if (!el) return;
    v = String(v);
    if (el !== document.activeElement && el.value !== v) el.value = v;
  }
  function setChecked(el, v) { if (el && el.checked !== !!v) el.checked = !!v; }

  function heroMessage(ov) {
    if (ov >= 100) return 'Perfect day. You showed up for everything. 🌟';
    if (ov >= 75) return 'So close! Finish strong. 🌸';
    if (ov >= 50) return 'Halfway there — lovely progress. 🌿';
    if (ov >= 25) return 'Good start. Keep the momentum. ☀️';
    if (ov > 0) return 'A beginning is a beginning. 🌱';
    return 'A fresh page. Start with one tiny thing.';
  }

  function renderToday() {
    const k = state.viewDate, d = getDay(k), t = db.settings.targets, p = pcts(d), ov = Math.round(overall(d));
    const past = k !== state.todayKey;

    $('#viewBanner').classList.toggle('hidden', !past);
    if (past) $('#viewBannerText').textContent = 'Viewing ' + longDate(k) + ' — changes are saved to this date.';
    $('#resetDay').textContent = past ? 'Reset this day (' + shortDate(k) + ')' : "Reset today's progress";

    // hero
    $('#bigRingFg').style.strokeDasharray = ov + ' 100';
    $('#bigRingPct').textContent = ov + '%';
    $('#heroMsg').textContent = heroMessage(ov);
    const st = streakInfo();
    $('#streakChip').textContent = '🔥 ' + st.current + '-day streak';
    $('#weekChip').textContent = '🌸 Weekly consistency ' + Math.round(weekScore()) + '%';

    // summary chips
    const doneCount = CATS.filter(c => p[c.key] >= 1).length;
    $('#summaryCount').textContent = doneCount + ' of ' + CATS.length + ' complete';
    $('#summary').innerHTML = CATS.map(c =>
      '<button type="button" class="chip-btn' + (p[c.key] >= 1 ? ' done' : '') + '" data-jump="' + c.key + '">' +
      c.emoji + ' ' + c.name + ' <span class="cp">' + (p[c.key] >= 1 ? '✓' : Math.round(p[c.key] * 100) + '%') + '</span></button>'
    ).join('');

    // workout
    $('#wkTarget').textContent = 'Target: ' + t.workout + ' min';
    $('#wkDone').textContent = d.workout;
    $('#wkOf').textContent = '/ ' + t.workout + ' min';
    paintCard('workout', p.workout);

    // study
    $('#stTarget').textContent = 'Target: ' + fmtMin(t.study);
    $('#stDone').textContent = fmtMin(d.study.min);
    $('#stOf').textContent = '/ ' + fmtMin(t.study);
    $('#stRemain').textContent = p.study >= 1 ? 'Goal reached — wonderful focus!' : 'Remaining: ' + fmtMin(t.study - d.study.min);
    $('#studySessions').innerHTML = d.study.sessions.map((s, i) =>
      '<span class="chip">' + esc(s.at || '') + ' · ' + fmtMin(s.min) + (s.src === 'manual' ? ' ✍️' : ' ⏱') +
      '<button type="button" data-del-session="' + i + '" aria-label="Remove this session">×</button></span>'
    ).join('');
    paintCard('study', p.study);

    // steps
    $('#spTarget').textContent = 'Target: ' + fmtNum(t.steps) + ' steps';
    $('#spDone').textContent = fmtNum(d.steps);
    $('#spOf').textContent = '/ ' + fmtNum(t.steps) + ' steps';
    $('#spPct').textContent = Math.round(d.steps / t.steps * 100) + '% of your daily target';
    paintCard('steps', p.steps);

    // water
    $('#wtTarget').textContent = 'Target: ' + fmtWater(t.water);
    $('#wtDone').textContent = fmtWater(d.water.ml);
    $('#wtOf').textContent = '/ ' + fmtWater(t.water);
    $('#wtRemain').textContent = p.water >= 1 ? 'Fully hydrated 🎉' : 'Remaining: ' + fmtWater(t.water - d.water.ml);
    const wl = d.water.log.filter(x => !x.adj);
    $('#wtLog').textContent = wl.length ? 'Last: +' + wl[wl.length - 1].ml + ' ml at ' + (wl[wl.length - 1].at || '') : 'Nothing logged yet';
    $('#glassFill').style.height = (p.water * 100).toFixed(1) + '%';
    $('#glassFill').parentElement.classList.toggle('empty', d.water.ml <= 0);
    paintCard('water', p.water);

    // sleep
    $('#slTarget').textContent = 'Target: ' + t.sleep + 'h';
    setVal($('#bedTime'), d.sleep.bed);
    setVal($('#wakeTime'), d.sleep.wake);
    $('#slDur').textContent = d.sleep.min ? fmtMin(d.sleep.min) : '—';
    $('#slOf').textContent = '/ ' + t.sleep + 'h goal';
    renderSleepHistory();
    paintCard('sleep', p.sleep);

    // skincare
    $('#skTarget').textContent = 'Target: ' + (t.skinAM + t.skinPM) + ' min';
    $('#skAMLabel').textContent = '☀️ Morning routine · ' + t.skinAM + ' min' + (d.skin.am && d.skin.amMin ? ' (done: ' + d.skin.amMin + ')' : '');
    $('#skPMLabel').textContent = '🌙 Night routine · ' + t.skinPM + ' min' + (d.skin.pm && d.skin.pmMin ? ' (done: ' + d.skin.pmMin + ')' : '');
    setChecked($('#skAM'), d.skin.am); setChecked($('#skPM'), d.skin.pm);
    $('#skDone').textContent = (d.skin.amMin + d.skin.pmMin);
    $('#skOf').textContent = '/ ' + (t.skinAM + t.skinPM) + ' min';
    paintCard('skin', p.skin);

    // food
    ['m1', 'm2'].forEach(m => {
      setChecked($('#' + m + 'Done'), d.food[m].done);
      setVal($('#' + m + 'Name'), d.food[m].name);
      setVal($('#' + m + 'Note'), d.food[m].note);
    });
    const meals = (d.food.m1.done ? 1 : 0) + (d.food.m2.done ? 1 : 0);
    $('#fdStatus').textContent = meals + ' of 2 meals' + (meals === 2 ? ' ✓' : '');
    paintCard('food', p.food);

    // content
    setChecked($('#ctShoot'), d.content.shoot); setChecked($('#ctEdit'), d.content.edit);
    setVal($('#ctTitle'), d.content.title);
    setVal($('#ctPlatform'), d.content.platform);
    setVal($('#ctMin'), d.content.min || '');
    setVal($('#ctNote'), d.content.note);
    const ct = (d.content.shoot ? 1 : 0) + (d.content.edit ? 1 : 0);
    $('#ctStatus').textContent = ct + ' of 2 done' + (ct === 2 ? ' ✓' : '');
    renderContentHistory();
    paintCard('content', p.content);

    // reflection
    setVal($('#reflection'), d.reflection);
    $('#refSummary').textContent = 'You completed ' + doneCount + ' of ' + CATS.length + ' habits' + (past ? ' on this day.' : ' today.');

    renderTimers();
    detectCelebrations(k, p, ov);
  }

  function renderSleepHistory() {
    const t = db.settings.targets;
    const keys = Object.keys(db.days).filter(k => db.days[k].sleep.min > 0).sort().reverse().slice(0, 7);
    $('#slHist').innerHTML = keys.length ? keys.map(k => {
      const m = db.days[k].sleep.min;
      return '<div class="mh-row"><span>' + esc(fromKey(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })) + '</span>' +
        '<div class="mh-bar"><i style="width:' + (clamp(m / (t.sleep * 60)) * 100).toFixed(0) + '%"></i></div><span>' + fmtMin(m) + '</span></div>';
    }).join('') : '<p class="hint">Your sleep history will appear here.</p>';
  }

  function renderContentHistory() {
    const keys = Object.keys(db.days).sort().reverse().filter(k => {
      const c = db.days[k].content; return c.shoot || c.edit || c.title || c.min || c.note;
    }).slice(0, 60);
    $('#ctHistory').innerHTML = keys.length ? keys.map(k => {
      const c = db.days[k].content;
      const tags = [c.shoot ? '🎥 Shot' : '', c.edit ? '✂️ Edited' : ''].filter(Boolean).join(' · ');
      return '<button type="button" class="hist-item" data-open-date="' + k + '"><b>' + esc(c.title || 'Untitled') + '</b>' +
        '<small>' + esc(shortDate(k)) + ' · ' + esc(c.platform) + (c.min ? ' · ' + fmtMin(c.min) : '') + (tags ? ' · ' + tags : '') + '</small>' +
        (c.note ? '<small>' + esc(c.note.length > 90 ? c.note.slice(0, 90) + '…' : c.note) + '</small>' : '') + '</button>';
    }).join('') : '<p class="hint">No content logged yet. Shoot, edit, repeat! 🎬</p>';
  }

  /* ------------------------------------------------------------------
     Header: date, clock, greeting, quote
  ------------------------------------------------------------------ */
  function updateClock() {
    const now = new Date();
    $('#clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('#dateText').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const h = now.getHours();
    $('#greeting').textContent = h < 5 ? 'Still up? Be gentle with yourself 🌙' : h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌼' : h < 21 ? 'Good evening 🌆' : 'Good night 🌙';
  }
  function setQuote(i) {
    state.quoteIdx = (i + QUOTES.length) % QUOTES.length;
    $('#quote').textContent = '“' + QUOTES[state.quoteIdx] + '”';
  }

  /* ------------------------------------------------------------------
     Reports (SVG charts, no libraries)
  ------------------------------------------------------------------ */
  function barChart(vals, labels, o) {
    o = o || {};
    const n = vals.length, W = n > 10 ? 720 : 380, H = o.h || 170, padL = 6, padB = 24, padT = 20;
    const max = o.max || Math.max(1, Math.max.apply(null, vals));
    const bw = (W - padL * 2) / Math.max(1, n);
    const fmt = o.fmt || (v => String(Math.round(v)));
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Bar chart') + '" style="--c:' + (o.color || '#C9826B') + '">';
    s += '<line class="grid-line" x1="0" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '"/>';
    if (o.target) {
      const ty = padT + (H - padT - padB) * (1 - Math.min(1, o.target / max));
      s += '<line class="target-line" x1="0" x2="' + W + '" y1="' + ty + '" y2="' + ty + '"/>';
    }
    vals.forEach((v, i) => {
      const h = Math.max(v > 0 ? 3 : 0, (H - padT - padB) * Math.min(1, v / max));
      const x = padL + i * bw + bw * 0.16, w = bw * 0.68, y = H - padB - h;
      s += '<rect class="bar-rect" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(6, w / 2).toFixed(1) + '"><title>' + esc(labels[i]) + ': ' + esc(fmt(v)) + '</title></rect>';
      if (n <= 10) s += '<text class="val" x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle">' + esc(fmt(v)) + '</text>';
      if (n <= 10 || i % 5 === 0 || i === n - 1) s += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
    });
    return s + '</svg>';
  }

  function lineChart(vals, labels, o) {
    o = o || {};
    const n = vals.length, W = 720, H = o.h || 190, padL = 28, padR = 10, padB = 24, padT = 14;
    const max = o.max || 100;
    const X = i => n === 1 ? W / 2 : padL + (W - padL - padR) * i / (n - 1);
    const Y = v => padT + (H - padT - padB) * (1 - clamp(v / max));
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Line chart') + '" style="--c:' + (o.color || '#C9826B') + '">';
    [0, 50, 100].forEach(g => {
      const y = Y(g / 100 * max);
      s += '<line class="grid-line" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/><text x="0" y="' + (y + 3) + '">' + Math.round(g / 100 * max) + '</text>';
    });
    if (n) {
      const pts = vals.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1));
      s += '<path class="area" d="M' + X(0).toFixed(1) + ',' + Y(0) + ' L' + pts.join(' L') + ' L' + X(n - 1).toFixed(1) + ',' + Y(0) + ' Z"/>';
      s += '<polyline class="line" points="' + pts.join(' ') + '"/>';
      vals.forEach((v, i) => {
        if (n <= 31) s += '<circle class="dot" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3"><title>' + esc(labels[i]) + ': ' + Math.round(v) + '%</title></circle>';
        if (i % 5 === 0 || i === n - 1) s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
      });
    }
    return s + '</svg>';
  }

  function donut(pct, small) {
    return '<div class="big-ring small"><svg viewBox="0 0 36 36" class="ring big" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="15.9155"/><circle class="ring-fg" cx="18" cy="18" r="15.9155" style="stroke-dasharray:' + pct + ' 100"/></svg>' +
      '<div class="big-ring-text"><strong>' + pct + '%</strong>' + (small ? '<span>' + esc(small) + '</span>' : '') + '</div></div>';
  }
  function progressRow(c, pct, text) {
    return '<div class="prow" style="--cat:' + c.color + '"><div class="prow-top"><span>' + c.emoji + ' ' + c.name + '</span><span class="muted">' + esc(text) + '</span></div><div class="bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></div></div>';
  }
  const tile = (label, value, sub) => '<div class="tile"><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong><span>' + esc(sub || '') + '</span></div>';
  const dayLabel = k => fromKey(k).toLocaleDateString(undefined, { weekday: 'short' });

  function dailyReport() {
    const k = state.todayKey, d = getDay(k), t = db.settings.targets, p = pcts(d), ov = Math.round(overall(d));
    const done = CATS.filter(c => p[c.key] >= 1), left = CATS.filter(c => p[c.key] < 1);
    return '<div class="report-grid">' +
      '<section class="card center"><h3>' + esc(longDate(k)) + '</h3>' + donut(ov, 'overall') + '<p class="muted">' + done.length + ' of ' + CATS.length + ' habits complete</p></section>' +
      '<section class="card"><h3>Habit progress</h3>' + CATS.map(c => progressRow(c, p[c.key], detail(c.key, d, t) + ' · ' + Math.round(p[c.key] * 100) + '%')).join('') + '</section>' +
      '<section class="card"><h3>✅ Completed tasks</h3>' + (done.length ? '<ul class="task-list done">' + done.map(c => '<li>' + c.emoji + ' ' + c.name + '<small>' + esc(detail(c.key, d, t)) + '</small></li>').join('') + '</ul>' : '<p class="muted">Nothing completed yet — you\'ve got this. 🌱</p>') + '</section>' +
      '<section class="card"><h3>🌿 Remaining tasks</h3>' + (left.length ? '<ul class="task-list todo">' + left.map(c => '<li>' + c.emoji + ' ' + c.name + '<small>' + esc(remaining(c.key, d, t)) + '</small></li>').join('') + '</ul>' : '<p class="muted">Everything is done. Rest well! 🌟</p>') + '</section>' +
      '</div>';
  }

  function weeklyReport() {
    const keys = rangeKeys(state.todayKey, 7), t = db.settings.targets;
    const days = keys.map(getDay), ps = days.map(d => pcts(d));
    const labels = keys.map(dayLabel);
    const ovs = keys.map(dayOverall);
    const score = Math.round(avg(ovs));
    const workoutDays = ps.filter(p => p.workout >= 1).length;
    const th = db.settings.streakThreshold;
    const goodDays = ovs.filter(v => v >= th).length;
    const habitRows = CATS.map(c => {
      const n = ps.filter(p => p[c.key] >= 1).length;
      return progressRow(c, n / 7, n + ' / 7 days');
    }).join('');
    return '<div class="stat-tiles">' +
      tile('Consistency score', score + '%', 'average of the last 7 days') +
      tile('Strong days', goodDays + ' / 7', 'days at ' + th + '% or more') +
      tile('Avg study', fmtMin(avg(days.map(d => d.study.min))), 'per day') +
      tile('Avg steps', fmtNum(avg(days.map(d => d.steps))), 'per day') +
      tile('Avg water', fmtWater(avg(days.map(d => d.water.ml))), 'per day') +
      tile('Workout consistency', workoutDays + ' / 7', 'days you hit ' + t.workout + ' min') +
      '</div>' +
      '<div class="report-grid">' +
      '<section class="card wide"><h3>Overall completion — last 7 days</h3>' + barChart(ovs, labels, { max: 100, color: '#C9826B', fmt: v => Math.round(v) + '%', label: 'Overall completion by day' }) + '</section>' +
      '<section class="card"><h3>Habit consistency</h3>' + habitRows + '</section>' +
      '<section class="card"><h3>📚 Study (minutes)</h3>' + barChart(days.map(d => d.study.min), labels, { target: t.study, max: Math.max(t.study, Math.max.apply(null, days.map(d => d.study.min))), color: '#8FA06F', fmt: v => fmtMin(v), label: 'Study minutes by day' }) + '</section>' +
      '<section class="card"><h3>👟 Steps</h3>' + barChart(days.map(d => d.steps), labels, { target: t.steps, max: Math.max(t.steps, Math.max.apply(null, days.map(d => d.steps))), color: '#C9A26B', fmt: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v), label: 'Steps by day' }) + '</section>' +
      '<section class="card"><h3>💧 Water (ml)</h3>' + barChart(days.map(d => d.water.ml), labels, { target: t.water, max: Math.max(t.water, Math.max.apply(null, days.map(d => d.water.ml))), color: '#7FA3B5', fmt: v => v >= 1000 ? (v / 1000).toFixed(1) + 'L' : v + 'ml', label: 'Water by day' }) + '</section>' +
      '</div>';
  }

  function monthKeys(ym) {
    const p = ym.split('-').map(Number), dim = new Date(p[0], p[1], 0).getDate(), out = [];
    for (let i = 1; i <= dim; i++) { const k = ym + '-' + pad(i); if (k <= state.todayKey) out.push(k); }
    return out;
  }
  function monthlyReport() {
    const ym = state.repMonth, keys = monthKeys(ym), n = Math.max(1, keys.length);
    const days = keys.map(getDay), ps = days.map(d => pcts(d)), ovs = keys.map(dayOverall);
    const first = fromKey(ym + '-01');
    const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const isCurrent = ym >= monthKeyOf(state.todayKey);
    const sum = f => days.reduce((s, d) => s + f(d), 0);
    const rows = CATS.map(c => {
      const cnt = ps.filter(p => p[c.key] >= 1).length;
      return progressRow(c, cnt / n, cnt + ' / ' + keys.length + ' days · ' + Math.round(cnt / n * 100) + '%');
    }).join('');
    const sleepDays = ps.filter(p => p.sleep >= 1).length;
    const contentDays = days.filter(d => d.content.shoot || d.content.edit).length;
    const nav = '<div class="month-nav"><button class="icon-btn" type="button" data-month-nav="-1" aria-label="Previous month">‹</button><h3>' + esc(label) + '</h3>' +
      '<button class="icon-btn" type="button" data-month-nav="1" aria-label="Next month"' + (isCurrent ? ' disabled' : '') + '>›</button></div>';
    if (!keys.length) return nav + '<div class="card center"><p class="muted">Nothing to show for this month yet.</p></div>';
    return nav + '<div class="stat-tiles">' +
      tile('Habit completion', Math.round(avg(ovs)) + '%', 'average daily score') +
      tile('Workout', fmtNum(sum(d => d.workout)) + ' min', 'total this month') +
      tile('Study', parseFloat((sum(d => d.study.min) / 60).toFixed(1)) + ' h', 'total this month') +
      tile('Walking', fmtNum(sum(d => d.steps)), 'total steps') +
      tile('Water', parseFloat((sum(d => d.water.ml) / 1000).toFixed(1)) + ' L', 'total consumed') +
      tile('Sleep consistency', Math.round(sleepDays / n * 100) + '%', sleepDays + ' of ' + keys.length + ' days at goal') +
      tile('Content days', String(contentDays), 'days you shot or edited') +
      '</div>' +
      '<div class="report-grid">' +
      '<section class="card wide"><h3>Daily completion across the month</h3>' + lineChart(ovs, keys.map(k => String(+k.slice(8))), { label: 'Daily completion across the month' }) + '</section>' +
      '<section class="card"><h3>Habit completion</h3>' + rows + '</section>' +
      '<section class="card"><h3>Workout minutes per day</h3>' + barChart(days.map(d => d.workout), keys.map(k => String(+k.slice(8))), { color: '#C9826B', target: db.settings.targets.workout, max: Math.max(db.settings.targets.workout, Math.max.apply(null, days.map(d => d.workout))), label: 'Workout minutes per day' }) + '</section>' +
      '</div>';
  }

  function renderReports() {
    $$('[data-rep-tab]').forEach(b => {
      const on = b.dataset.repTab === state.repTab;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
    });
    $('#reportBody').innerHTML = state.repTab === 'daily' ? dailyReport() : state.repTab === 'weekly' ? weeklyReport() : monthlyReport();
  }

  /* ------------------------------------------------------------------
     Calendar
  ------------------------------------------------------------------ */
  function renderCalendar() {
    const p = state.calMonth.split('-').map(Number), y = p[0], m = p[1];
    const first = new Date(y, m - 1, 1), lead = (first.getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
    $('#calTitle').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    $('#calNext').disabled = state.calMonth >= monthKeyOf(state.todayKey);
    let html = '';
    for (let i = 0; i < lead; i++) html += '<span></span>';
    for (let day = 1; day <= dim; day++) {
      const k = y + '-' + pad(m) + '-' + pad(day), future = k > state.todayKey;
      const ov = db.days[k] ? Math.round(overall(db.days[k])) : 0;
      html += '<button type="button" class="cal-day' + (ov >= 100 ? ' full' : '') + (k === state.todayKey ? ' today' : '') + (k === state.calSel ? ' selected' : '') + '" data-cal-day="' + k + '"' + (future ? ' disabled' : '') +
        ' aria-label="' + esc(longDate(k)) + ', ' + ov + '% complete"><span class="cal-ring" style="--p:' + ov + '"><span class="cal-num">' + day + '</span></span></button>';
    }
    $('#calGrid').innerHTML = html;
    renderCalDetail();
  }

  function renderCalDetail() {
    const k = state.calSel, rec = db.days[k], t = db.settings.targets;
    const head = '<div class="cal-detail-head"><h3>' + esc(longDate(k)) + '</h3><button class="btn primary small" type="button" data-open-date="' + k + '">' + (k === state.todayKey ? 'Open today' : 'Open & edit this day') + '</button></div>';
    if (!rec) { $('#calDetail').innerHTML = head + '<p class="muted">No entries saved for this day.</p>'; return; }
    const p = pcts(rec), ov = Math.round(overall(rec));
    let html = head + '<div class="report-grid"><div class="center" style="display:flex;flex-direction:column;align-items:center">' + donut(ov, 'complete') + '</div><div>' +
      CATS.map(c => progressRow(c, p[c.key], detail(c.key, rec, t))).join('') + '</div></div>';
    const meals = ['m1', 'm2'].map(m => rec.food[m].done || rec.food[m].name ? (rec.food[m].done ? '✓ ' : '') + (rec.food[m].name || 'Meal') : '').filter(Boolean);
    if (meals.length) html += '<div class="ref-box"><b>🥗 Meals:</b> ' + esc(meals.join(' · ')) + '</div>';
    const c = rec.content;
    if (c.title || c.note) html += '<div class="ref-box"><b>🎬 ' + esc(c.title || 'Content') + '</b> (' + esc(c.platform) + ')' + (c.note ? '\n' + esc(c.note) : '') + '</div>';
    if (rec.reflection.trim()) html += '<div class="ref-box"><b>📔 Today I showed up:</b>\n' + esc(rec.reflection) + '</div>';
    $('#calDetail').innerHTML = html;
  }

  /* ------------------------------------------------------------------
     Badges
  ------------------------------------------------------------------ */
  function aggregate() {
    const a = { any: 0, water: 0, steps: 0, study: 0, workout: 0, sleep: 0, skin: 0, food: 0, content: 0, perfect: 0, reflect: 0 };
    Object.keys(db.days).forEach(k => {
      const d = db.days[k], p = pcts(d), ov = overall(d);
      if (ov > 0 || d.reflection.trim()) a.any++;
      if (p.water >= 1) a.water++;
      if (p.steps >= 1) a.steps++;
      if (p.study >= 1) a.study++;
      if (p.workout >= 1) a.workout++;
      if (p.sleep >= 1) a.sleep++;
      if (p.skin >= 1) a.skin++;
      if (p.food >= 1) a.food++;
      if (d.content.shoot || d.content.edit) a.content++;
      if (ov >= 99.99) a.perfect++;
      if (d.reflection.trim().length >= 10) a.reflect++;
    });
    return a;
  }
  function badgeList() {
    const a = aggregate(), s = streakInfo();
    return [
      { id: 'first', emoji: '🌱', name: 'First Step', desc: 'Log your first day of progress', have: a.any, need: 1 },
      { id: 'water', emoji: '💧', name: 'Hydration Hero', desc: 'Reach your water goal on 7 days', have: a.water, need: 7 },
      { id: 'steps', emoji: '👟', name: 'Step Master', desc: 'Reach your step goal on 7 days', have: a.steps, need: 7 },
      { id: 'study', emoji: '📚', name: 'Scholar', desc: 'Hit your study goal on 5 days', have: a.study, need: 5 },
      { id: 'workout', emoji: '🏋️', name: 'Iron Will', desc: 'Complete your workout on 10 days', have: a.workout, need: 10 },
      { id: 'sleep', emoji: '🌙', name: 'Sleeping Beauty', desc: 'Meet your sleep goal on 7 days', have: a.sleep, need: 7 },
      { id: 'skin', emoji: '🧴', name: 'Glow Getter', desc: 'Finish both skincare routines on 7 days', have: a.skin, need: 7 },
      { id: 'food', emoji: '🥗', name: 'Nourished', desc: 'Log both meals on 7 days', have: a.food, need: 7 },
      { id: 'content', emoji: '🎬', name: 'Creator', desc: 'Shoot or edit content on 10 days', have: a.content, need: 10 },
      { id: 'perfect', emoji: '🌟', name: 'Perfect Day', desc: 'Complete every habit in a single day', have: a.perfect, need: 1 },
      { id: 'streak3', emoji: '🔥', name: '3-Day Streak', desc: 'Keep a 3-day streak', have: s.best, need: 3 },
      { id: 'streak7', emoji: '🔥', name: '7-Day Streak', desc: 'Keep a 7-day streak', have: s.best, need: 7 },
      { id: 'streak30', emoji: '🏆', name: '30-Day Streak', desc: 'Keep a 30-day streak', have: s.best, need: 30 },
      { id: 'reflect', emoji: '📔', name: 'Reflector', desc: 'Write reflections on 7 days', have: a.reflect, need: 7 },
      { id: 'backup', emoji: '💾', name: 'Safe & Sound', desc: 'Download a backup of your data', have: db.settings.lastBackup ? 1 : 0, need: 1 }
    ];
  }
  function checkBadges(silent) {
    const seen = db.settings.badgesSeen, fresh = badgeList().filter(b => b.have >= b.need && seen.indexOf(b.id) < 0);
    if (!fresh.length) return;
    fresh.forEach(b => seen.push(b.id));
    save();
    if (!silent) {
      const msg = '🏅 New badge unlocked: ' + fresh[0].name + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' more)' : '');
      setTimeout(() => toast(msg), 2800);   // let any goal-completed message show first
    }
    if (state.view === 'badges') renderBadges();
  }
  function renderBadges() {
    const s = streakInfo(), list = badgeList(), unlocked = list.filter(b => b.have >= b.need).length;
    $('#badgeStats').innerHTML =
      tile('Current streak', s.current + ' days', 'days at ' + db.settings.streakThreshold + '%+') +
      tile('Best streak', s.best + ' days', 'your personal record') +
      tile('Weekly consistency', Math.round(weekScore()) + '%', 'last 7 days') +
      tile('Badges', unlocked + ' / ' + list.length, 'unlocked');
    $('#badgeGrid').innerHTML = list.map(b => {
      const ok = b.have >= b.need;
      return '<div class="badge ' + (ok ? 'unlocked' : 'locked') + '"><div class="b-emoji">' + b.emoji + '</div><h4>' + esc(b.name) + '</h4><p>' + esc(b.desc) + '</p>' +
        '<div class="bar" style="--cat:#A3B18A"><i style="width:' + (clamp(b.have / b.need) * 100) + '%"></i></div><small>' + (ok ? 'Unlocked ✓' : Math.min(b.have, b.need) + ' / ' + b.need) + '</small></div>';
    }).join('');
  }

  /* ------------------------------------------------------------------
     Settings, theme, data
  ------------------------------------------------------------------ */
  function applyTheme() {
    const pref = db.settings.theme;
    const dark = pref ? pref === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', dark ? '#1d1814' : '#F4EFE6');
    const b = $('#themeBtn');
    if (b) { b.textContent = dark ? '☀️' : '🌙'; b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); }
    const sel = $('#set-theme'); if (sel) sel.value = pref || 'system';
  }

  function renderSettings() {
    const t = db.settings.targets;
    $('#set-workout').value = t.workout; $('#set-study').value = t.study; $('#set-steps').value = t.steps;
    $('#set-water').value = t.water; $('#set-sleep').value = t.sleep; $('#set-skinAM').value = t.skinAM; $('#set-skinPM').value = t.skinPM;
    $('#set-streak').value = db.settings.streakThreshold;
    $('#set-theme').value = db.settings.theme || 'system';
    const days = Object.keys(db.days).length;
    $('#storageInfo').textContent = days + ' day' + (days === 1 ? '' : 's') + ' saved in this browser' +
      (db.settings.lastBackup ? ' · last backup ' + new Date(db.settings.lastBackup).toLocaleString() : ' · no backup downloaded yet') +
      (storageOK ? '' : ' · ⚠️ storage unavailable');
  }

  function saveTargetFromInput(id, key, min, max, isFloat) {
    const el = $(id), v = Number(el.value);
    if (!el.value.trim() || !Number.isFinite(v) || v < min || v > max) {
      toast('Enter a value between ' + fmtNum(min) + ' and ' + fmtNum(max)); el.value = db.settings.targets[key]; return;
    }
    db.settings.targets[key] = isFloat ? v : Math.round(v);
    save(); afterChange(); toast('Target updated ✔');
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportJSON() {
    db.settings.lastBackup = Date.now(); save();
    const payload = { app: 'My Life OS', version: 1, exportedAt: new Date().toISOString(), settings: db.settings, days: db.days };
    download('my-life-os-backup-' + dkey() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup downloaded 💾'); renderSettings(); checkBadges(false);
  }

  function exportCSV() {
    const cols = ['date', 'overall_pct', 'workout_min', 'study_min', 'steps', 'water_ml', 'sleep_min', 'bedtime', 'wake_time', 'skincare_am', 'skincare_pm', 'skincare_min',
      'meal1_done', 'meal1_name', 'meal1_notes', 'meal2_done', 'meal2_name', 'meal2_notes', 'shooting', 'editing', 'content_title', 'platform', 'content_min', 'content_notes', 'reflection'];
    const q = v => { v = String(v === undefined || v === null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [cols.join(',')];
    Object.keys(db.days).sort().forEach(k => {
      const d = db.days[k];
      lines.push([k, Math.round(overall(d)), d.workout, d.study.min, d.steps, d.water.ml, d.sleep.min, d.sleep.bed, d.sleep.wake, d.skin.am ? 1 : 0, d.skin.pm ? 1 : 0, d.skin.amMin + d.skin.pmMin,
        d.food.m1.done ? 1 : 0, d.food.m1.name, d.food.m1.note, d.food.m2.done ? 1 : 0, d.food.m2.name, d.food.m2.note,
        d.content.shoot ? 1 : 0, d.content.edit ? 1 : 0, d.content.title, d.content.platform, d.content.min, d.content.note, d.reflection].map(q).join(','));
    });
    download('my-life-os-' + dkey() + '.csv', '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
    toast('CSV exported 📄');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read that file');
    reader.onload = () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { toast('That file is not valid JSON'); return; }
      if (!data || typeof data !== 'object' || !data.days || typeof data.days !== 'object') { toast('This does not look like a My Life OS backup'); return; }
      const keys = Object.keys(data.days).filter(k => DATE_RE.test(k) && data.days[k] && typeof data.days[k] === 'object');
      if (!keys.length) { toast('The backup contains no days'); return; }
      if (!confirm('Restore ' + keys.length + ' day(s) from this backup?\n\nDays with the same date will be replaced by the backup version. Days that are not in the backup stay untouched.')) return;
      try { localStorage.setItem(STORE_KEY + '.beforeImport', JSON.stringify(db)); } catch (e) { /* ignore */ }
      keys.forEach(k => { db.days[k] = deepFill(blankDay(), data.days[k]); });
      if (data.settings && typeof data.settings === 'object') {
        const keepReminderState = { lastAt: db.settings.reminder.lastAt, firedCustom: db.settings.reminder.firedCustom };
        db.settings = deepFill(DEFAULT_SETTINGS, data.settings);
        sanitizeSettings();
        db.settings.reminder.lastAt = keepReminderState.lastAt; db.settings.reminder.firedCustom = keepReminderState.firedCustom;
      }
      save(); applyTheme(); renderAll(); checkBadges(true);
      toast('Backup restored ✔ (' + keys.length + ' days)');
    };
    reader.readAsText(file);
  }

  function resetDay(key) {
    if (!confirm('Reset all progress for ' + longDate(key) + '?\n\nThis clears that day only. Other days are never touched.')) return;
    delete db.days[key];
    Object.keys(lastPct).forEach(id => { if (id.indexOf(key + ':') === 0) delete lastPct[id]; });
    save(); renderAll(); toast('Progress reset for ' + shortDate(key));
  }

  function eraseAll() {
    if (!confirm('Erase ALL My Life OS data from this browser?\n\nThis removes every day, setting and badge. Download a backup first if you might want it again.')) return;
    if (!confirm('Last check — really erase everything? This cannot be undone.')) return;
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(TIMER_KEY); } catch (e) { /* ignore */ }
    loadDB(); loadTimers(); Object.keys(lastPct).forEach(id => delete lastPct[id]);
    applyTheme(); renderAll(); toast('All data erased');
  }

  /* ------------------------------------------------------------------
     Audio (Web Audio API alarm)
  ------------------------------------------------------------------ */
  let audioCtx = null;
  function ensureAudio() {
    try {
      if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; audioCtx = new AC(); }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  function chime() {
    const ctx = ensureAudio(); if (!ctx) return;
    const now = ctx.currentTime, notes = [659.25, 783.99, 987.77, 1318.51];
    notes.forEach((f, i) => {
      const start = now + i * 0.3;
      [[f, 0.22], [f * 2, 0.05]].forEach(pair => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = pair[0];
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(pair[1], start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 1.5);
        o.connect(g); g.connect(ctx.destination);
        o.start(start); o.stop(start + 1.6);
      });
    });
  }

  /* ------------------------------------------------------------------
     Water reminders
  ------------------------------------------------------------------ */
  const alarm = { active: false, test: false, loop: null, stop: null, title: document.title };
  let swReg = null;

  function inWakingHours(date, start, end) {
    const m = date.getHours() * 60 + date.getMinutes(), s = hmToMin(start), e = hmToMin(end);
    if (s === null || e === null || s === e) return true;
    return s < e ? (m >= s && m < e) : (m >= s || m < e);
  }

  function openAlarm(test) {
    if (alarm.active) return;
    alarm.active = true; alarm.test = !!test;
    const d = getDay(state.todayKey), t = db.settings.targets;
    $('#alarmSub').textContent = test ? 'This is a test — nothing will be logged.' : fmtWater(d.water.ml) + ' of ' + fmtWater(t.water) + ' so far today.';
    $('#alarmDrank').textContent = test ? '💧 Looks good' : '💧 I drank ' + db.settings.reminder.glass + ' ml';
    $('#alarm').classList.remove('hidden');
    $('#alarmDrank').focus();
    document.title = '💧 Time to hydrate!';
    if (db.settings.reminder.sound) {
      chime();
      alarm.loop = setInterval(chime, 3600);
      alarm.stop = setTimeout(stopSound, 90000);   // stop looping after 90 s; the dialog stays until dismissed
    }
    try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([200, 100, 200, 100, 300]); } catch (e) { /* ignore */ }
  }
  function stopSound() { clearInterval(alarm.loop); clearTimeout(alarm.stop); alarm.loop = null; alarm.stop = null; }
  function closeAlarm() {
    alarm.active = false; stopSound();
    $('#alarm').classList.add('hidden');
    document.title = alarm.title;
    closeNotifications();
    renderReminderStatus();
  }
  function closeNotifications() {
    try {
      if (swReg && swReg.getNotifications) swReg.getNotifications({ tag: 'lifeos-water' }).then(list => list.forEach(n => n.close())).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  function drankFromAlarm() {
    const test = alarm.test;
    if (!test) {
      const ml = db.settings.reminder.glass;
      edit(state.todayKey, d => addWater(d, ml));
      db.settings.reminder.lastAt = Date.now(); db.settings.reminder.snoozeUntil = 0; save();
      toast('Logged +' + ml + ' ml 💧 Great job!');
    }
    closeAlarm();
  }
  function snoozeAlarm() {
    const r = db.settings.reminder;
    if (!alarm.test) { r.snoozeUntil = Date.now() + 10 * 60000; save(); toast('Snoozed for 10 minutes ⏰'); }
    closeAlarm();
  }

  async function showWaterNotification() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = {
      body: 'Hey! Time to hydrate. Drink some water 💧', icon: 'icon-192.png', badge: 'icon-192.png',
      tag: 'lifeos-water', renotify: true, requireInteraction: true, vibrate: [200, 100, 200],
      data: { url: './' },
      actions: [{ action: 'drank', title: '💧 I drank' }, { action: 'snooze', title: '⏰ Snooze 10 min' }]
    };
    try {
      let reg = swReg;
      if (!reg && 'serviceWorker' in navigator) reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) { await reg.showNotification('My Life OS', opts); return; }
    } catch (e) { /* fall through */ }
    try { delete opts.actions; new Notification('My Life OS', opts); } catch (e) { /* ignore */ }
  }

  let lastTrigger = 0;
  function triggerReminder() {
    const now = Date.now();
    if (alarm.active || now - lastTrigger < 30000) return;     // avoid duplicate alerts
    lastTrigger = now;
    db.settings.reminder.lastAt = now; save();
    openAlarm(false);
    if (!(document.visibilityState === 'visible' && document.hasFocus())) showWaterNotification();
  }

  function reminderTick() {
    const r = db.settings.reminder;
    if (!r.enabled || alarm.active) return;
    const now = new Date(), t = now.getTime();
    if (!inWakingHours(now, r.start, r.end)) { if (r.snoozeUntil && t >= r.snoozeUntil) r.snoozeUntil = 0; return; }   // sleeping hours: stay silent
    if (r.snoozeUntil) {
      if (t >= r.snoozeUntil) { r.snoozeUntil = 0; save(); triggerReminder(); }
      return;
    }
    const minutes = now.getHours() * 60 + now.getMinutes(), today = dkey(now);
    for (const c of r.custom) {
      const cm = hmToMin(c), id = today + ' ' + c;
      if (cm !== null && minutes >= cm && minutes < cm + 10 && !r.firedCustom[id]) {
        r.firedCustom[id] = 1;
        Object.keys(r.firedCustom).forEach(x => { if (x.slice(0, 10) !== today) delete r.firedCustom[x]; });
        save(); triggerReminder(); return;
      }
    }
    if (!r.lastAt) { r.lastAt = t; save(); return; }
    if (t - r.lastAt >= r.interval * 60000) triggerReminder();
  }

  function nextReminderText() {
    const r = db.settings.reminder;
    if (!r.enabled) return 'Reminders are off.';
    const now = new Date();
    if (r.snoozeUntil && r.snoozeUntil > now.getTime()) return 'Snoozed — next alert around ' + fmtHM12(new Date(r.snoozeUntil)) + '.';
    let cand = new Date(Math.max(now.getTime(), (r.lastAt || now.getTime()) + r.interval * 60000));
    if (!inWakingHours(cand, r.start, r.end)) {
      const s = hmToMin(r.start);
      cand = new Date(cand.getFullYear(), cand.getMonth(), cand.getDate(), Math.floor(s / 60), s % 60, 0);
      if (cand.getTime() <= now.getTime()) cand.setDate(cand.getDate() + 1);
      return 'Quiet hours — next reminder at ' + fmtHM12(cand) + (dkey(cand) !== dkey(now) ? ' tomorrow' : '') + '.';
    }
    return 'Next reminder around ' + fmtHM12(cand) + (dkey(cand) !== dkey(now) ? ' tomorrow' : '') + '.';
  }

  function notifStatusText() {
    if (!('Notification' in window)) return 'Notifications are not supported in this browser — the in-app alarm and sound still work while the app is open.';
    if (Notification.permission === 'granted') return '✅ Notifications are allowed.';
    if (Notification.permission === 'denied') return '🚫 Notifications are blocked. Re-enable them in your browser\'s site settings (lock icon next to the address bar).';
    return 'Notifications not enabled yet — tap "Allow notifications".';
  }

  function renderReminderStatus() {
    const r = db.settings.reminder;
    setChecked($('#remEnabled'), r.enabled);
    setVal($('#remInterval'), r.interval); setVal($('#remStart'), r.start); setVal($('#remEnd'), r.end); setVal($('#remGlass'), r.glass);
    setChecked($('#remSound'), r.sound);
    const pill = $('#remPill'); pill.textContent = r.enabled ? 'On · ' + r.interval + ' min' : 'Off'; pill.classList.toggle('on', r.enabled);
    $('#remCustomList').innerHTML = r.custom.map((c, i) => '<span class="chip">' + esc(c) + '<button type="button" data-del-custom="' + i + '" aria-label="Remove ' + esc(c) + '">×</button></span>').join('');
    $('#notifStatus').textContent = notifStatusText();
    $('#notifBtn').classList.toggle('hidden', !('Notification' in window) || Notification.permission === 'granted');
    $('#remNext').textContent = nextReminderText();
  }

  function requestNotifPermission() {
    if (!('Notification' in window)) { renderReminderStatus(); return Promise.resolve('unsupported'); }
    if (Notification.permission !== 'default') { renderReminderStatus(); return Promise.resolve(Notification.permission); }
    return new Promise(resolve => {
      const done = res => { renderReminderStatus(); resolve(res); };
      try {
        const p = Notification.requestPermission(done);
        if (p && typeof p.then === 'function') p.then(done);
      } catch (e) { done(Notification.permission); }
    });
  }

  function handleWaterAction(action) {
    if (action === 'drank') {
      const ml = db.settings.reminder.glass;
      edit(state.todayKey, d => addWater(d, ml));
      db.settings.reminder.lastAt = Date.now(); db.settings.reminder.snoozeUntil = 0; save();
      if (alarm.active) { alarm.test = true; closeAlarm(); }
      toast('Logged +' + ml + ' ml 💧');
    } else if (action === 'snooze') {
      db.settings.reminder.snoozeUntil = Date.now() + 10 * 60000; save();
      if (alarm.active) { alarm.test = true; closeAlarm(); }
      toast('Snoozed for 10 minutes ⏰');
    }
    renderReminderStatus();
  }

  /* ------------------------------------------------------------------
     Navigation / render orchestration
  ------------------------------------------------------------------ */
  function setView(v) {
    state.view = v;
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    $$('.nav-btn').forEach(b => {
      const on = b.dataset.view === v;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (v === 'today') renderToday();
    if (v === 'reports') renderReports();
    if (v === 'calendar') { state.calSel = state.calSel || state.todayKey; renderCalendar(); }
    if (v === 'badges') renderBadges();
    if (v === 'settings') renderSettings();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function openDate(k) {
    if (k === 'today') k = state.todayKey;
    state.viewDate = k; state.following = (k === state.todayKey);
    setView('today');
  }

  function renderAll() {
    renderToday(); renderReminderStatus();
    if (state.view === 'reports') renderReports();
    if (state.view === 'calendar') renderCalendar();
    if (state.view === 'badges') renderBadges();
    if (state.view === 'settings') renderSettings();
  }

  function tick() {
    const k = dkey();
    if (k !== state.todayKey) {                      // a new day began — start fresh, history is untouched
      state.todayKey = k;
      if (state.following) state.viewDate = k;
      state.calMonth = monthKeyOf(k); state.repMonth = monthKeyOf(k); state.calSel = k;
      renderAll();
    }
    updateClock();
    renderTimers();
  }

  /* ------------------------------------------------------------------
     Event wiring
  ------------------------------------------------------------------ */
  function readNum(id, min, max, label) {
    const el = $(id), raw = el.value.trim(), v = Number(raw);
    if (!raw || !Number.isFinite(v) || v < min || v > max) {
      toast('Enter ' + label + ' between ' + fmtNum(min) + ' and ' + fmtNum(max)); el.focus(); return null;
    }
    el.value = '';
    return Math.round(v);
  }

  const MANUAL = {
    workout: { max: 1440, label: 'minutes', add: (d, v) => { d.workout += v; }, set: (d, v) => { d.workout = v; } },
    study: { max: 1440, label: 'minutes', add: (d, v) => { d.study.min += v; d.study.sessions.push({ min: v, at: nowHM(), src: 'manual' }); }, set: (d, v) => { d.study.min = v; } },
    steps: { max: 200000, label: 'steps', add: (d, v) => { d.steps = Math.min(1000000, d.steps + v); }, set: (d, v) => { d.steps = v; } },
    water: {
      max: 10000, label: 'millilitres', add: (d, v) => addWater(d, v),
      set: (d, v) => { const diff = v - d.water.ml; if (diff) { d.water.ml = v; d.water.log.push({ ml: diff, at: nowHM(), adj: true }); } }
    }
  };

  function onClick(e) {
    const el = e.target.closest('[data-view],[data-timer-main],[data-timer-save],[data-timer-reset],[data-manual-add],[data-manual-set],[data-add-steps],[data-add-water],[data-del-session],[data-jump],[data-open-date],[data-rep-tab],[data-month-nav],[data-cal-nav],[data-cal-day],[data-del-custom]');
    if (!el || el.disabled) return;
    const ds = el.dataset;
    if (ds.view) return setView(ds.view);
    if (ds.timerMain) return timerMain(ds.timerMain);
    if (ds.timerSave) return timerSave(ds.timerSave);
    if (ds.timerReset) return timerReset(ds.timerReset);
    if (ds.manualAdd || ds.manualSet) {
      const key = ds.manualAdd || ds.manualSet, cfg = MANUAL[key], isAdd = !!ds.manualAdd;
      const v = readNum('#in-' + key, isAdd ? 1 : 0, cfg.max, cfg.label);
      if (v === null) return;
      return edit(vk(), d => (isAdd ? cfg.add : cfg.set)(d, v));
    }
    if (ds.addSteps) return edit(vk(), d => { d.steps = Math.min(1000000, d.steps + Number(ds.addSteps)); });
    if (ds.addWater) return edit(vk(), d => addWater(d, Number(ds.addWater)));
    if (ds.delSession !== undefined) {
      const i = Number(ds.delSession);
      return edit(vk(), d => { const s = d.study.sessions[i]; if (s) { d.study.min = Math.max(0, d.study.min - s.min); d.study.sessions.splice(i, 1); } });
    }
    if (ds.jump) {
      const c = $('#card-' + ds.jump);
      if (c) { c.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); c.classList.remove('celebrate'); void c.offsetWidth; c.classList.add('celebrate'); setTimeout(() => c.classList.remove('celebrate'), 1100); }
      return;
    }
    if (ds.openDate) return openDate(ds.openDate);
    if (ds.repTab) { state.repTab = ds.repTab; return renderReports(); }
    if (ds.monthNav) {
      const p = state.repMonth.split('-').map(Number), d = new Date(p[0], p[1] - 1 + Number(ds.monthNav), 1);
      const nk = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      if (nk > monthKeyOf(state.todayKey)) return;
      state.repMonth = nk; return renderReports();
    }
    if (ds.calNav) {
      const p = state.calMonth.split('-').map(Number), d = new Date(p[0], p[1] - 1 + Number(ds.calNav), 1);
      const nk = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      if (nk > monthKeyOf(state.todayKey)) return;
      state.calMonth = nk; return renderCalendar();
    }
    if (ds.calDay) { state.calSel = ds.calDay; return renderCalendar(); }
    if (ds.delCustom !== undefined) {
      db.settings.reminder.custom.splice(Number(ds.delCustom), 1); save(); return renderReminderStatus();
    }
  }

  function wire() {
    document.addEventListener('click', onClick);
    document.addEventListener('pointerdown', function unlock() { ensureAudio(); }, { once: true, passive: true });

    // hero
    $('#themeBtn').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme;
      db.settings.theme = cur === 'dark' ? 'light' : 'dark'; save(); applyTheme();
    });
    const q = $('#quote');
    q.addEventListener('click', () => setQuote(state.quoteIdx + 1));
    q.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQuote(state.quoteIdx + 1); } });

    // manual inputs: Enter key adds
    ['workout', 'study', 'steps', 'water'].forEach(k => {
      $('#in-' + k).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-manual-add="' + k + '"]').click(); } });
    });
    $('#waterUndo').addEventListener('click', () => {
      const d = getDay(vk());
      if (!d.water.log.length) { toast('Nothing to undo'); return; }
      edit(vk(), x => { const last = x.water.log.pop(); if (last) x.water.ml = Math.max(0, x.water.ml - last.ml); });
    });

    // sleep
    const sleepChange = () => edit(vk(), d => {
      d.sleep.bed = $('#bedTime').value; d.sleep.wake = $('#wakeTime').value; d.sleep.min = sleepMinutes(d.sleep.bed, d.sleep.wake);
    });
    $('#bedTime').addEventListener('change', sleepChange); $('#wakeTime').addEventListener('change', sleepChange);

    // skincare
    $('#skAM').addEventListener('change', e => edit(vk(), d => { d.skin.am = e.target.checked; d.skin.amMin = e.target.checked ? (d.skin.amMin || db.settings.targets.skinAM) : 0; }));
    $('#skPM').addEventListener('change', e => edit(vk(), d => { d.skin.pm = e.target.checked; d.skin.pmMin = e.target.checked ? (d.skin.pmMin || db.settings.targets.skinPM) : 0; }));

    // food
    ['m1', 'm2'].forEach(m => {
      $('#' + m + 'Done').addEventListener('change', e => edit(vk(), d => { d.food[m].done = e.target.checked; }));
      $('#' + m + 'Name').addEventListener('input', e => edit(vk(), d => { d.food[m].name = e.target.value; }));
      $('#' + m + 'Note').addEventListener('input', e => edit(vk(), d => { d.food[m].note = e.target.value; }));
    });

    // content
    $('#ctShoot').addEventListener('change', e => edit(vk(), d => { d.content.shoot = e.target.checked; }));
    $('#ctEdit').addEventListener('change', e => edit(vk(), d => { d.content.edit = e.target.checked; }));
    $('#ctTitle').addEventListener('input', e => edit(vk(), d => { d.content.title = e.target.value; }));
    $('#ctPlatform').addEventListener('change', e => edit(vk(), d => { d.content.platform = e.target.value; }));
    $('#ctMin').addEventListener('input', e => edit(vk(), d => { const v = Math.round(Number(e.target.value)); d.content.min = Number.isFinite(v) ? clamp(v, 0, 1440, true) : 0; }));
    $('#ctNote').addEventListener('input', e => edit(vk(), d => { d.content.note = e.target.value; }));

    // reflection (shows a small "saved" tick)
    let refT = null;
    $('#reflection').addEventListener('input', e => {
      edit(vk(), d => { d.reflection = e.target.value; });
      const s = $('#refSaved'); s.textContent = 'Saved ✓'; s.classList.add('show');
      clearTimeout(refT); refT = setTimeout(() => s.classList.remove('show'), 1400);
    });

    $('#resetDay').addEventListener('click', () => resetDay(state.viewDate));

    // reminders
    const r = () => db.settings.reminder;
    $('#remEnabled').addEventListener('change', e => {
      r().enabled = e.target.checked;
      if (r().enabled) { r().lastAt = Date.now(); r().snoozeUntil = 0; ensureAudio(); requestNotifPermission(); }
      save(); renderReminderStatus();
      toast(r().enabled ? 'Water reminders on 💧' : 'Water reminders off');
    });
    $('#remInterval').addEventListener('change', e => { r().interval = Number(e.target.value); r().lastAt = Date.now(); save(); renderReminderStatus(); });
    $('#remStart').addEventListener('change', e => { if (hmToMin(e.target.value) !== null) { r().start = e.target.value; save(); } renderReminderStatus(); });
    $('#remEnd').addEventListener('change', e => { if (hmToMin(e.target.value) !== null) { r().end = e.target.value; save(); } renderReminderStatus(); });
    $('#remGlass').addEventListener('change', e => { r().glass = Number(e.target.value); save(); renderReminderStatus(); });
    $('#remSound').addEventListener('change', e => { r().sound = e.target.checked; save(); });
    $('#remCustomAdd').addEventListener('click', () => {
      const v = $('#remCustomInput').value;
      if (hmToMin(v) === null) { toast('Pick a time first'); return; }
      if (r().custom.indexOf(v) >= 0) { toast('That time is already in the list'); return; }
      r().custom.push(v); r().custom.sort(); save(); $('#remCustomInput').value = ''; renderReminderStatus();
    });
    $('#remTest').addEventListener('click', () => {
      ensureAudio();
      requestNotifPermission().then(() => {
        openAlarm(true);
        if (!(document.visibilityState === 'visible' && document.hasFocus())) showWaterNotification();
      });
    });
    $('#notifBtn').addEventListener('click', () => requestNotifPermission().then(res => { if (res === 'granted') toast('Notifications enabled 🔔'); }));
    $('#alarmDrank').addEventListener('click', drankFromAlarm);
    $('#alarmSnooze').addEventListener('click', snoozeAlarm);
    $('#alarmDismiss').addEventListener('click', closeAlarm);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && alarm.active) closeAlarm(); });

    // settings
    [['#set-workout', 'workout', 1, 1440, false], ['#set-study', 'study', 1, 1440, false], ['#set-steps', 'steps', 100, 200000, false],
     ['#set-water', 'water', 250, 10000, false], ['#set-sleep', 'sleep', 1, 16, true], ['#set-skinAM', 'skinAM', 1, 240, false], ['#set-skinPM', 'skinPM', 1, 240, false]
    ].forEach(a => $(a[0]).addEventListener('change', () => saveTargetFromInput(a[0], a[1], a[2], a[3], a[4])));
    $('#set-streak').addEventListener('change', e => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v) || v < 10 || v > 100) { toast('Enter a value between 10 and 100'); e.target.value = db.settings.streakThreshold; return; }
      db.settings.streakThreshold = Math.round(v); save(); afterChange(); toast('Streak rule updated ✔');
    });
    $('#set-theme').addEventListener('change', e => { db.settings.theme = e.target.value === 'system' ? '' : e.target.value; save(); applyTheme(); });
    $('#resetTargets').addEventListener('click', () => {
      if (!confirm('Restore all daily targets to their defaults?')) return;
      db.settings.targets = Object.assign({}, DEFAULT_TARGETS); db.settings.streakThreshold = 60; save(); renderSettings(); afterChange(); toast('Defaults restored');
    });
    $('#exportJson').addEventListener('click', exportJSON);
    $('#exportCsv').addEventListener('click', exportCSV);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) importJSON(f); e.target.value = ''; });
    $('#resetToday').addEventListener('click', () => resetDay(state.todayKey));
    $('#eraseAll').addEventListener('click', eraseAll);

    // PWA install
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installBtn').classList.remove('hidden'); });
    $('#installBtn').addEventListener('click', () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(() => { deferredPrompt = null; $('#installBtn').classList.add('hidden'); });
    });
    window.addEventListener('appinstalled', () => { $('#installBtn').classList.add('hidden'); toast('Installed! Open My Life OS from your home screen 🌿'); });

    // multi-tab safety + background throttling
    window.addEventListener('storage', e => {
      if (e.key === STORE_KEY) { loadDB(); applyTheme(); renderAll(); }
      if (e.key === TIMER_KEY) { loadTimers(); renderTimers(); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); reminderTick(); renderReminderStatus(); } });
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if (!db.settings.theme) applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    }

    // service worker
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('service-worker.js').then(reg => { swReg = reg; }).catch(() => { /* offline mode unavailable */ });
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'water-action') handleWaterAction(e.data.action);
      });
    }
  }

  /* ------------------------------------------------------------------
     Init
  ------------------------------------------------------------------ */
  function init() {
    loadDB(); loadTimers();
    applyTheme();
    $$('[data-ring]').forEach(el => { el.innerHTML = ringMarkup(); });
    $$('.habit-title h3').forEach(h => { const s = document.createElement('span'); s.className = 'done-tag'; s.textContent = '✓ Done'; h.appendChild(s); });
    wire();

    // pick a quote that stays the same for the day, tap to change
    const doy = Math.floor((fromKey(state.todayKey) - new Date(fromKey(state.todayKey).getFullYear(), 0, 0)) / 864e5);
    setQuote(doy);
    updateClock();
    renderToday();
    renderReminderStatus();
    checkBadges(true);                              // seed badges silently on first load
    renderTimers();

    // handle notification action buttons that opened the app
    try {
      const params = new URLSearchParams(location.search), a = params.get('water');
      if (a) {
        handleWaterAction(a);
        history.replaceState(null, '', location.pathname);
      }
    } catch (e) { /* ignore */ }

    setInterval(tick, 500);
    setInterval(renderTimers, 200);
    setInterval(reminderTick, 15000);
    setInterval(() => { if (!alarm.active) $('#remNext').textContent = nextReminderText(); }, 60000);
    reminderTick();
  }

  // small read-only hook (handy for debugging in the console)
  window.LifeOS = { calc: { sleepMinutes: sleepMinutes, pcts: pcts, overall: overall }, version: 1 };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();