(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const state = { role: null, today: null, timer: null };
  const ROLE_LABEL = { elder: 'Elder view', caretaker: 'Caretaker view', family: 'Family view' };
  const SUBLINE = {
    elder:
      'Tap "I took it" after each medicine. Your family stays informed, and nothing changes without your say.',
    caretaker: 'Manage medicines and appointments, and see how the day is going.',
    family: 'Follow medicines, add doctor appointments and leave notes for the circle.',
  };
  const ICON = {
    med_added: '💊',
    med_updated: '✏️',
    med_deleted: '🗑️',
    appt_added: '📅',
    dose: '✅',
    checkin: '🙂',
    sos: '🚨',
    note: '📝',
    concern: '⚠️',
  };
  const RING = 2 * Math.PI * 52;

  /* Build DOM with textContent only (never innerHTML) so user data can't inject HTML */
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
    toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
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

  /* ---------- formatting ---------- */
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
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
  function ago(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  const canLog = () => state.role === 'elder' || state.role === 'caretaker';
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
  function applyRoles() {
    document.querySelectorAll('[data-roles]').forEach((el) => {
      el.hidden = !el.dataset.roles.split(' ').includes(state.role);
    });
  }

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
    applyRoles();
    $('#role-badge').textContent = ROLE_LABEL[me.role];
    $('#greeting').textContent = `${greeting()}, ${me.circleName || 'friend'}`;
    $('#subline').textContent = SUBLINE[me.role];
    await refresh();
    loadInsights();
    clearInterval(state.timer);
    state.timer = setInterval(refresh, 60000); // keep every role's view current
    $('#main').focus();
  }

  async function boot() {
    try {
      await showApp(await api('/auth/me'));
    } catch {
      showLogin();
    }
  }

  async function refresh() {
    try {
      const [today, adh, appts, meds, feed] = await Promise.all([
        api('/doses/today'),
        api('/doses/adherence?days=7'),
        api('/appointments'),
        api('/medications'),
        api('/activity'),
      ]);
      state.today = today;
      renderBanner(today);
      renderNext(today);
      renderToday(today);
      renderStats(today, adh, appts);
      renderWeek(adh);
      renderAppts(appts, today.date);
      renderMeds(meds);
      renderFeed(feed);
      if (!$('#m-start').value) $('#m-start').value = today.date;
    } catch (err) {
      if (err.status === 401) return showLogin();
      toast(errMsg(err), true);
    }
  }

  /* ---------- renderers ---------- */
  function renderBanner({ slots }) {
    const done = slots.filter((s) => s.taken).length;
    const pct = slots.length ? Math.round((done / slots.length) * 100) : 0;
    const ring = $('#ring-fg');
    ring.style.strokeDasharray = String(RING);
    ring.style.strokeDashoffset = String(RING * (1 - pct / 100));
    $('#ring-pct').textContent = pct + '%';
    $('.ring-wrap').setAttribute(
      'aria-label',
      `Today's progress: ${done} of ${slots.length} doses taken`,
    );
  }

  function renderNext({ slots, now }) {
    const box = $('#next-body');
    box.replaceChildren();
    const pending = slots.filter((s) => !s.taken);
    if (!slots.length)
      return box.append(
        h('p', { class: 'muted' }, 'No medicines are scheduled today. Enjoy the day!'),
      );
    if (!pending.length)
      return box.append(
        h('p', { class: 'big-num' }, 'All done for today 🎉'),
        h('p', { class: 'muted' }, 'Every scheduled dose has been taken. Well done!'),
      );

    const nowMin = toMin(now);
    const s = pending.find((x) => toMin(x.time) >= nowMin - 30) || pending[0];
    const diff = toMin(s.time) - nowMin;
    const when =
      diff <= 0
        ? 'Due now'
        : diff < 60
          ? `in ${diff} min`
          : `in ${Math.floor(diff / 60)} h ${diff % 60} min`;
    box.append(
      h(
        'div',
        { class: 'next-grid' },
        h('div', { class: 'next-time' }, fmtTime(s.time)),
        h(
          'div',
          { class: 'next-info' },
          h('strong', {}, `${s.name} ${s.dosage}`),
          h('span', { class: 'muted' }, `${when}${s.instructions ? ' · ' + s.instructions : ''}`),
        ),
        canLog()
          ? h(
              'button',
              {
                class: 'btn primary big',
                type: 'button',
                'aria-label': `Mark ${s.name} as taken`,
                onclick: () => logDose(s),
              },
              '✔ I took it',
            )
          : null,
      ),
    );
  }

  function renderToday({ slots, now }) {
    const list = $('#today-list');
    list.replaceChildren();
    const done = slots.filter((s) => s.taken).length;
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
      list.append(
        h(
          'li',
          { class: 'slot' + (s.taken ? ' done' : '') + (overdue ? ' overdue' : '') },
          h('div', { class: 'slot-time' }, fmtTime(s.time)),
          h(
            'div',
            { class: 'slot-body' },
            h('strong', { class: 'slot-name' }, s.name),
            h(
              'span',
              { class: 'muted' },
              s.dosage + (s.instructions ? ' · ' + s.instructions : ''),
            ),
          ),
          h(
            'div',
            {},
            badge,
            ' ',
            h(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                'aria-label': `What is ${s.name}?`,
                onclick: () => explain(s.name),
              },
              'ⓘ',
            ),
          ),
          canLog() && !s.taken
            ? h(
                'button',
                {
                  class: 'btn primary',
                  type: 'button',
                  'aria-label': `Mark ${s.name} at ${fmtTime(s.time)} as taken`,
                  onclick: () => logDose(s),
                },
                '✔ I took it',
              )
            : null,
        ),
      );
    }
  }

  function renderStats({ slots }, adh, appts) {
    const done = slots.filter((s) => s.taken).length;
    $('#st-today').textContent = slots.length ? `${done} / ${slots.length}` : '–';
    const per = adh.medications.filter((m) => m.expected > 0);
    const expected = per.reduce((n, m) => n + m.expected, 0);
    const taken = per.reduce((n, m) => n + m.taken, 0);
    $('#st-week').textContent = expected ? Math.round((taken / expected) * 100) + '%' : '–';
    const next = appts.find((a) => a.date >= state.today.date);
    $('#st-appt').textContent = next
      ? `${fmtDate(next.date)}, ${fmtTime(next.time)}`
      : 'None booked';
  }

  function renderWeek(adh) {
    const week = $('#week-list');
    week.replaceChildren();
    for (const d of adh.daily) {
      const pct = d.expected ? Math.round((d.taken / d.expected) * 100) : 0;
      const label = new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
      });
      const fill = h('span');
      fill.style.height = pct + '%';
      week.append(
        h(
          'li',
          {
            class: 'day',
            title: `${label}: ${d.taken} of ${d.expected} doses`,
            'aria-label': `${label}: ${d.taken} of ${d.expected} doses taken`,
          },
          h('div', { class: 'col' }, fill),
          h('span', { class: 'dlabel' }, label),
        ),
      );
    }
    const list = $('#adh-list');
    list.replaceChildren();
    if (!adh.medications.length) list.append(h('li', { class: 'muted' }, 'No medicines yet.'));
    for (const m of adh.medications) {
      const fill = h('span');
      fill.style.width = (m.percent === null ? 0 : m.percent) + '%';
      list.append(
        h(
          'li',
          { class: 'adh-row' },
          h(
            'div',
            { class: 'adh-head' },
            h('span', {}, m.name),
            h('span', {}, m.percent === null ? 'No data' : `${m.percent}%`),
          ),
          h(
            'div',
            {
              class: 'bar',
              role: 'progressbar',
              'aria-label': `${m.name} adherence`,
              'aria-valuemin': '0',
              'aria-valuemax': '100',
              'aria-valuenow': String(m.percent === null ? 0 : m.percent),
            },
            fill,
          ),
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
              { class: 'muted small' },
              `${fmtTime(a.time)}${a.doctor ? ' · ' + a.doctor : ''}${a.location ? ' · ' + a.location : ''}`,
            ),
          ),
          isCaretaker()
            ? h(
                'button',
                {
                  class: 'btn danger small',
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
              { class: 'muted small' },
              m.times.map(fmtTime).join(', ') + (m.instructions ? ' · ' + m.instructions : ''),
            ),
          ),
          h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              'aria-label': `What is ${m.name}?`,
              onclick: () => explain(m.name),
            },
            'ⓘ',
          ),
          h(
            'button',
            {
              class: 'btn danger small',
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

  function renderFeed(items) {
    const list = $('#feed-list');
    list.replaceChildren();
    if (!items.length)
      list.append(
        h('li', { class: 'muted' }, 'Nothing yet. Updates from the whole circle appear here.'),
      );
    for (const it of items) {
      let extra = null;
      if (it.needsAck) {
        if (it.ack === 'ok') extra = h('span', { class: 'badge ok' }, '✔ Confirmed by elder');
        else if (it.ack === 'concern')
          extra = h('span', { class: 'badge late' }, '⚠ Elder has a concern');
        else if (state.role === 'elder') {
          extra = h(
            'div',
            { class: 'ack' },
            h(
              'button',
              { class: 'btn primary small', type: 'button', onclick: () => respond(it.id, 'ok') },
              '👍 Looks right',
            ),
            h(
              'button',
              {
                class: 'btn danger small',
                type: 'button',
                onclick: () => respond(it.id, 'concern'),
              },
              '⚠ Not right',
            ),
          );
        } else extra = h('span', { class: 'badge' }, 'Waiting for the elder to confirm');
      }
      list.append(
        h(
          'li',
          { class: 'feed-item' + (it.type === 'sos' ? ' urgent' : '') },
          h('span', { class: 'feed-ic', 'aria-hidden': 'true' }, ICON[it.type] || '•'),
          h(
            'div',
            { class: 'grow' },
            h('p', { class: 'feed-text' }, it.text),
            h('small', { class: 'muted' }, `${cap(it.actor)} · ${ago(it.at)}`),
            extra,
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

  async function respond(id, response) {
    try {
      await api(`/activity/${id}/respond`, { method: 'POST', body: { response } });
      toast(response === 'ok' ? 'Thanks for confirming.' : 'Your family has been told.');
      await refresh();
    } catch (err) {
      toast(errMsg(err), true);
    }
  }

  async function explain(name) {
    $('#info-h').textContent = name;
    $('#info-text').textContent = 'Loading…';
    $('#info-dialog').showModal();
    try {
      $('#info-text').textContent = (
        await api('/ai/explain', { method: 'POST', body: { name } })
      ).text;
    } catch (err) {
      $('#info-text').textContent = errMsg(err);
    }
  }

  async function loadInsights() {
    $('#insight-text').textContent = 'Analysing the last 7 days…';
    try {
      const r = await api('/ai/insights');
      $('#insight-text').textContent = r.text;
      $('#insight-src').textContent = r.source === 'gemini' ? 'Written by Gemini' : 'Smart summary';
    } catch {
      $('#insight-text').textContent = 'Insights are unavailable right now.';
      $('#insight-src').textContent = '';
    }
  }
  $('#btn-insight').addEventListener('click', loadInsights);

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

  /* ---------- SOS and mood ---------- */
  $('#btn-sos').addEventListener('click', () => $('#sos-dialog').showModal());
  $('#sos-cancel').addEventListener('click', () => $('#sos-dialog').close());
  $('#sos-confirm').addEventListener('click', async () => {
    $('#sos-dialog').close();
    try {
      const r = await api('/activity/sos', { method: 'POST' });
      toast(
        r.notified
          ? 'Help is on the way. Your circle was emailed.'
          : 'SOS recorded. Your circle can see it in the feed.',
      );
      await refresh();
    } catch (err) {
      toast(errMsg(err), true);
    }
  });
  $('#info-close').addEventListener('click', () => $('#info-dialog').close());

  document.querySelectorAll('[data-mood]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        const r = await api('/activity/checkin', {
          method: 'POST',
          body: { mood: btn.dataset.mood },
        });
        toast(
          r.notified ? 'Thanks. Your family has been emailed.' : 'Thanks for sharing how you feel.',
        );
        await refresh();
      } catch (err) {
        toast(errMsg(err), true);
      }
    }),
  );

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

  document.querySelectorAll('[data-demo]').forEach((btn) =>
    btn.addEventListener('click', () => {
      $('#circleId').value = 'demo';
      $('#passcode').value = btn.dataset.demo;
      $('#login-form').requestSubmit();
    }),
  );

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
          h('p', {}, `${cap(role)}: `, h('code', {}, code)),
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
      toast('Appointment added. The elder will be asked to confirm.');
      await refresh();
    } catch (err) {
      $('#appt-error').textContent = errMsg(err);
    }
  });

  $('#med-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#med-error').textContent = '';
    const times = ['#m-t1', '#m-t2', '#m-t3', '#m-t4'].map((s) => $(s).value).filter(Boolean);
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
      $('#ai-text').value = '';
      toast('Medication added. The elder will be asked to confirm.');
      await refresh();
    } catch (err) {
      $('#med-error').textContent = errMsg(err);
    }
  });

  $('#ai-btn').addEventListener('click', async () => {
    const text = $('#ai-text').value.trim();
    if (text.length < 3) return toast('Describe the medicine first.', true);
    const btn = $('#ai-btn');
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    try {
      const { medication: m, source } = await api('/ai/parse', { method: 'POST', body: { text } });
      $('#m-name').value = m.name;
      $('#m-dosage').value = m.dosage || '';
      $('#m-instr').value = m.instructions || '';
      ['#m-t1', '#m-t2', '#m-t3', '#m-t4'].forEach((sel, i) => {
        $(sel).value = m.times[i] || '';
      });
      toast(
        source === 'gemini'
          ? 'Filled by Gemini. Please review before adding.'
          : 'Filled in. Please review before adding.',
      );
    } catch (err) {
      toast(errMsg(err), true);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Fill with AI';
    }
  });

  $('#note-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/activity/note', { method: 'POST', body: { text: $('#note-text').value } });
      $('#note-text').value = '';
      await refresh();
    } catch (err) {
      toast(errMsg(err), true);
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
