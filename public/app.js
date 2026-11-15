(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const state = { role: null, today: null, timer: null };
  const ROLE_LABEL = { elder: 'Elder view', caretaker: 'Caretaker view', family: 'Family view' };

  // Build DOM with textContent only (never innerHTML), so user data can't inject HTML
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(props)) {
      if (key === 'class') el.className = val;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), val);
      else if (val !== false && val !== null && val !== undefined)
        el.setAttribute(key, val === true ? '' : val);
    }
    for (const kid of kids.flat())
      if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    return el;
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong');
      err.status = res.status;
      err.details = data.details;
      throw err;
    }
    return data;
  }

  const errMsg = (err) =>
    err.details && err.details.length
      ? err.details.map((d) => `${d.path}: ${d.message}`).join('. ')
      : err.message;

  let toastTimer;
  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  const pref = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* storage unavailable */
      }
    },
  };

  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  function fmtTime(t) {
    const [hh, mm] = t.split(':').map(Number);
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  }
  function fmtDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }
  function greeting() {
    const hr = new Date().getHours();
    return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  }

  const canLog = () => state.role === 'elder' || state.role === 'caretaker';
  const canAddAppt = () => state.role === 'caretaker' || state.role === 'family';
  const isCaretaker = () => state.role === 'caretaker';

  /* ---------- accessibility toggles ---------- */
  function applyPrefs() {
    const lg = pref.get('lg') === '1';
    const hc = pref.get('hc') === '1';
    document.body.classList.toggle('lg', lg);
    document.body.classList.toggle('hc', hc);
    $('#btn-text').setAttribute('aria-pressed', String(lg));
    $('#btn-contrast').setAttribute('aria-pressed', String(hc));
  }
  $('#btn-text').addEventListener('click', () => {
    pref.set('lg', pref.get('lg') === '1' ? '0' : '1');
    applyPrefs();
  });
  $('#btn-contrast').addEventListener('click', () => {
    pref.set('hc', pref.get('hc') === '1' ? '0' : '1');
    applyPrefs();
  });

  /* ---------- views ---------- */
  function showLogin() {
    clearInterval(state.timer);
    state.role = null;
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    $('#btn-logout').hidden = true;
  }

  async function showApp(me) {
    state.role = me.role;
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    $('#btn-logout').hidden = false;
    $('#role-badge').textContent = ROLE_LABEL[me.role];
    $('#greeting').textContent = `${greeting()}, ${me.circleName || 'friend'}`;
    $('#subline').textContent = {
      elder: 'Tap "I took it" after each medicine. Your family is kept informed.',
      caretaker: 'You can manage medicines and appointments and see how the day is going.',
      family: 'You can follow medicines and add doctor appointments.',
    }[me.role];
    $('#appt-form').hidden = !canAddAppt();
    $('#meds-section').hidden = !isCaretaker();
    await refresh();
    clearInterval(state.timer);
    state.timer = setInterval(refresh, 60000); // keep everyone's view current
    $('#main').focus();
  }

  async function boot() {
    try {
      showApp(await api('/auth/me'));
    } catch {
      showLogin();
    }
  }

  async function refresh() {
    try {
      const [today, adh, appts, meds] = await Promise.all([
        api('/doses/today'),
        api('/doses/adherence?days=7'),
        api('/appointments'),
        api('/medications'),
      ]);
      state.today = today;
      renderToday(today);
      renderAdherence(adh.medications);
      renderAppts(appts, today.date);
      renderMeds(meds);
      if (!$('#m-start').value) $('#m-start').value = today.date;
    } catch (err) {
      if (err.status === 401) return showLogin();
      toast(errMsg(err), true);
    }
  }

  /* ---------- renderers ---------- */
  function renderToday({ slots, now }) {
    const list = $('#today-list');
    list.replaceChildren();
    const done = slots.filter((s) => s.taken).length;
    const pct = slots.length ? Math.round((done / slots.length) * 100) : 0;
    $('#today-fill').style.width = pct + '%';
    $('#today-bar').setAttribute('aria-valuenow', String(pct));
    $('#today-summary').textContent = slots.length
      ? `${done} of ${slots.length} doses taken today`
      : 'No medicines are scheduled today.';

    const nowMin = toMin(now);
    for (const s of slots) {
      const overdue = !s.taken && nowMin - toMin(s.time) > 30;
      const badge = s.taken
        ? h('span', { class: 'badge ok' }, '✔ Taken')
        : overdue
          ? h('span', { class: 'badge late' }, '⚠ Overdue')
          : h('span', { class: 'badge' }, 'Upcoming');
      const takeBtn =
        canLog() && !s.taken
          ? h(
              'button',
              {
                class: 'btn primary big',
                type: 'button',
                'aria-label': `Mark ${s.name} at ${fmtTime(s.time)} as taken`,
                onclick: () => logDose(s),
              },
              '✔ I took it',
            )
          : null;
      list.append(
        h(
          'li',
          { class: 'slot' + (s.taken ? ' done' : '') + (overdue ? ' overdue' : '') },
          h('div', { class: 'slot-time' }, fmtTime(s.time)),
          h(
            'div',
            { class: 'slot-body' },
            h('strong', { class: 'slot-name' }, s.name),
            h('span', {}, s.dosage + (s.instructions ? ' · ' + s.instructions : '')),
          ),
          badge,
          takeBtn,
        ),
      );
    }
  }

  function renderAdherence(items) {
    const list = $('#adh-list');
    list.replaceChildren();
    if (!items.length) list.append(h('li', { class: 'muted' }, 'No medicines yet.'));
    for (const m of items) {
      const pct = m.percent;
      const fill = h('span');
      fill.style.width = (pct ?? 0) + '%';
      list.append(
        h(
          'li',
          { class: 'adh-row' },
          h('span', {}, pct === null ? 'No data yet' : `${pct}%`),
          h(
            'div',
            {
              class: 'bar',
              role: 'progressbar',
              'aria-label': `${m.name} adherence`,
              'aria-valuemin': '0',
              'aria-valuemax': '100',
              'aria-valuenow': String(pct ?? 0),
            },
            fill,
          ),
          h('small', { class: 'muted' }, `${m.taken} of ${m.expected} doses taken`),
        ),
      );
    }
  }

  function renderAppts(all, today) {
    const list = $('#appt-list');
    list.replaceChildren();
    const upcoming = all.filter((a) => a.date >= today);
    if (!upcoming.length) list.append(h('li', { class: 'muted' }, 'No upcoming appointments.'));
    for (const a of upcoming) {
      list.append(
        h(
          'li',
          { class: 'appt' },
          h('div', { class: 'chip' }, fmtDate(a.date)),
          h(
            'div',
            { class: 'grow' },
            h('strong', {}, a.title),
            h(
              'span',
              {},
              `${fmtTime(a.time)}${a.doctor ? ' · ' + a.doctor : ''}${a.location ? ' · ' + a.location : ''}`,
            ),
          ),
          isCaretaker()
            ? h(
                'button',
                {
                  class: 'btn danger',
                  type: 'button',
                  'aria-label': `Delete appointment ${a.title}`,
                  onclick: () => remove('/appointments/' + a.id, 'Appointment deleted'),
                },
                'Delete',
              )
            : null,
        ),
      );
    }
  }

  function renderMeds(meds) {
    const list = $('#med-list');
    list.replaceChildren();
    if (!meds.length)
      list.append(h('li', { class: 'muted' }, 'No medications yet. Add the first one below.'));
    for (const m of meds) {
      list.append(
        h(
          'li',
          { class: 'medrow' },
          h(
            'div',
            { class: 'grow' },
            h('strong', {}, `${m.name} ${m.dosage}`),
            h(
              'span',
              {},
              m.times.map(fmtTime).join(', ') + (m.instructions ? ' · ' + m.instructions : ''),
            ),
          ),
          h(
            'button',
            {
              class: 'btn danger',
              type: 'button',
              'aria-label': `Delete ${m.name}`,
              onclick: () => remove('/medications/' + m.id, 'Medication deleted'),
            },
            'Delete',
          ),
        ),
      );
    }
  }

  /* ---------- actions ---------- */
  async function logDose(slot) {
    try {
      await api('/doses', {
        method: 'POST',
        body: { medicationId: slot.medicationId, time: slot.time },
      });
      toast(`Great! ${slot.name} marked as taken.`);
      await refresh();
    } catch (err) {
      toast(errMsg(err), true);
    }
  }

  async function remove(path, message) {
    if (!confirm('Are you sure you want to delete this?')) return;
    try {
      await api(path, { method: 'DELETE' });
      toast(message);
      await refresh();
    } catch (err) {
      toast(errMsg(err), true);
    }
  }

  function speak() {
    if (!('speechSynthesis' in window))
      return toast('Read-aloud is not supported in this browser.', true);
    const pending = ((state.today && state.today.slots) || []).filter((s) => !s.taken);
    const text = pending.length
      ? `${greeting()}. You have ${pending.length} ${pending.length > 1 ? 'medicines' : 'medicine'} left today. ` +
        pending
          .map((s) => `At ${fmtTime(s.time)}, take ${s.name}, ${s.dosage}. ${s.instructions}`)
          .join(' ')
      : `${greeting()}. You have taken all your medicines for today. Well done!`;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }
  $('#btn-speak').addEventListener('click', speak);

  /* ---------- forms ---------- */
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').textContent = '';
    try {
      await api('/auth/login', {
        method: 'POST',
        body: { circleId: $('#circleId').value.trim(), passcode: $('#passcode').value },
      });
      $('#passcode').value = '';
      await boot();
    } catch (err) {
      $('#login-error').textContent =
        err.status === 401
          ? 'Wrong Care Circle ID or passcode.'
          : err.status === 429
            ? 'Too many attempts. Please wait a few minutes.'
            : errMsg(err);
    }
  });

  $('#create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#create-error').textContent = '';
    try {
      const res = await api('/circles', {
        method: 'POST',
        body: { name: $('#c-name').value, emails: [$('#c-email').value] },
      });
      const box = $('#created');
      box.replaceChildren(
        h('p', {}, h('strong', {}, 'Save these now. They are shown only once.')),
        h('p', {}, 'Circle ID: ', h('code', {}, res.circleId)),
        ...Object.entries(res.passcodes).map(([role, code]) =>
          h('p', {}, `${role[0].toUpperCase() + role.slice(1)}: `, h('code', {}, code)),
        ),
      );
      box.hidden = false;
      $('#circleId').value = res.circleId;
      e.target.reset();
    } catch (err) {
      $('#create-error').textContent = errMsg(err);
    }
  });

  $('#appt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#appt-error').textContent = '';
    const body = { title: $('#a-title').value, date: $('#a-date').value, time: $('#a-time').value };
    if ($('#a-doctor').value.trim()) body.doctor = $('#a-doctor').value;
    if ($('#a-location').value.trim()) body.location = $('#a-location').value;
    try {
      await api('/appointments', { method: 'POST', body });
      e.target.reset();
      toast('Appointment added.');
      await refresh();
    } catch (err) {
      $('#appt-error').textContent = errMsg(err);
    }
  });

  $('#med-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#med-error').textContent = '';
    const times = ['#m-t1', '#m-t2', '#m-t3'].map((s) => $(s).value).filter(Boolean);
    const body = {
      name: $('#m-name').value,
      dosage: $('#m-dosage').value,
      times,
      startDate: $('#m-start').value,
    };
    if ($('#m-instr').value.trim()) body.instructions = $('#m-instr').value;
    try {
      await api('/medications', { method: 'POST', body });
      e.target.reset();
      toast('Medication added.');
      await refresh();
    } catch (err) {
      $('#med-error').textContent = errMsg(err);
    }
  });

  $('#btn-logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    showLogin();
    toast('Signed out.');
  });

  applyPrefs();
  boot();
})();
