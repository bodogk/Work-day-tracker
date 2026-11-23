(() => {
  'use strict';

  const STORAGE = 'wdt:v2:data';
  const PROFILE = 'wdt:v2:profile';
  const LANG_KEY = 'wdt:v2:lang';

  const $ = id => document.getElementById(id);

  const shiftIds = ['d', 'n', 'f'];

  const shiftDefaults = {
    d: { time: '09:00', hours: 8, pay: 0 },
    n: { time: '21:00', hours: 8, pay: 0 },
    f: { time: '08:00', hours: 24, pay: 0 }
  };

  const langs = ['hg', 'en', 'hi', 'as', 'brx'];

  let language = localStorage.getItem(LANG_KEY) || 'hg';
  if (!langs.includes(language)) language = 'hg';

  let dictionary = null;
  let data = loadJSON(STORAGE, {});
  let profile = loadJSON(PROFILE, {});

  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  let selectedDate = '';
  let selectedStatus = '';
  let selectedShifts = [];

  let settingShifts = [];
  let settingDays = [];
  let settingPayMode = 'hour';
  let tempShiftConfig = {};

  let alarmFired = {};

  const weekdayIndex = {
    hg: 0,
    en: 1,
    hi: 2,
    as: 3,
    brx: 4
  };

  function loadJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || '') || fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      toast('Storage unavailable / jagah nahi hai');
    }
  }

  function langIndex() {
    return weekdayIndex[language] ?? 0;
  }

  function tr(key) {
    const arr = dictionary?.strings?.[key];
    return arr ? arr[langIndex()] : key;
  }

  function monthName(m) {
    return dictionary.months[language][m];
  }

  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function activeShifts() {
    return profile.shifts || [];
  }

  function payMode() {
    return profile.payMode === 'shift' ? 'shift' : 'hour';
  }

  function shiftConfig(id) {
    return profile.shiftConfig?.[id] || shiftDefaults[id];
  }

  function shiftHours(ids) {
    return (ids || []).reduce((sum, id) => {
      return sum + (id === 'f' ? 24 : Number(shiftConfig(id).hours) || 0);
    }, 0);
  }

  function calculatePay(status, shifts, hours) {
    if (status === 'o') return 0;

    const factor = status === 'h' ? 0.5 : 1;

    if (payMode() === 'shift') {
      return (shifts || []).reduce((sum, id) => {
        return sum + (Number(shiftConfig(id).pay) || 0);
      }, 0) * factor;
    }

    return Math.max(0, Number(hours) || 0) *
      (Number(profile.hourlyRate) || 0);
  }

  function formatMoney(n) {
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      el.hidden = true;
    }, 2600);
  }

  function applyTranslations() {
    document.documentElement.lang = ({
      hg: 'en',
      en: 'en',
      hi: 'hi',
      as: 'as',
      brx: 'br'
    })[language] || 'en';

    document.querySelectorAll('[data-t]').forEach(el => {
      el.textContent = tr(el.dataset.t);
    });

    $('noteInput').placeholder = tr('notePlaceholder');
    $('nameInput').placeholder = tr('namePlaceholder');
    $('workInput').placeholder = tr('workPlaceholder');

    const select = $('language');
    select.innerHTML = '';

    dictionary.languages.forEach((name, i) => {
      const option = document.createElement('option');
      option.value = langs[i];
      option.textContent = name;
      select.appendChild(option);
    });

    select.value = language;

    updateSubtitle();
    renderCalendar();
  }

  function updateSubtitle() {
    const shiftText = activeShifts()
      .map(id => tr({ d: 'day', n: 'night', f: 'full' }[id]))
      .join(' + ');

    $('title').textContent = profile.name
      ? tr('helloPrefix') + profile.name
      : tr('title');

    $('subtitle').textContent = profile.work
      ? profile.work +
        (payMode() === 'hour' && profile.hourlyRate
          ? `, ${formatMoney(profile.hourlyRate)} ${tr('perHourText')}`
          : '') +
        (shiftText ? ` · ${shiftText}` : '')
      : tr('sub');
  }

  function renderCalendar() {
    const calendar = $('calendar');
    calendar.innerHTML = '';

    dictionary.weekdays[language].forEach(day => {
      const el = document.createElement('div');
      el.className = 'weekday';
      el.textContent = day;
      calendar.appendChild(el);
    });

    $('monthLabel').textContent = `${monthName(viewMonth)} ${viewYear}`;

    const offset = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < offset; i++) {
      const blank = document.createElement('div');
      blank.className = 'day-cell empty';
      calendar.appendChild(blank);
    }

    let worked = 0;
    let half = 0;
    let off = 0;
    let totalHours = 0;
    let totalPay = 0;

    const workingDays = profile.workingDays || [1, 2, 3, 4, 5, 6];

    for (let d = 1; d <= totalDays; d++) {
      const key = dateKey(viewYear, viewMonth, d);
      const record = data[key];
      const weekday = new Date(viewYear, viewMonth, d).getDay();

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'day-cell';

      if (record) {
        button.classList.add(
          record.status === 'w'
            ? 'worked'
            : record.status === 'h'
              ? 'half'
              : 'off'
        );
      }

      const today = new Date();

      if (
        key === dateKey(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        )
      ) {
        button.classList.add('today');
      }

      if (!record && !workingDays.includes(weekday)) {
        button.classList.add('weekly-off');
      }

      const dayNum = document.createElement('span');
      dayNum.textContent = d;
      button.appendChild(dayNum);

      const detail = document.createElement('small');

      if (record && record.hours) {
        detail.textContent = `${record.hours}h`;
      }

      button.appendChild(detail);
      button.setAttribute('aria-label', `${d} ${monthName(viewMonth)}`);

      button.addEventListener('click', () => openDay(key, d));

      calendar.appendChild(button);

      if (record) {
        if (record.status === 'w') worked++;
        if (record.status === 'h') half++;
        if (record.status === 'o') off++;

        totalHours += Number(record.hours) || 0;

        totalPay += calculatePay(
          record.status,
          record.shifts,
          record.hours
        );
      }
    }

    $('workedCount').textContent = worked;
    $('halfCount').textContent = half;
    $('offCount').textContent = off;
    $('hoursCount').textContent = Math.round(totalHours * 10) / 10;
    $('earnings').textContent = formatMoney(totalPay);
  }

  function setSelectedStatus(status) {
    selectedStatus = status;

    document.querySelectorAll('.status-options button').forEach(b => {
      b.classList.toggle('selected', b.dataset.status === status);
    });

    if (status === 'o') {
      $('hoursInput').value = '';
      selectedShifts = [];
    } else {
      updateHoursForShifts();
    }

    paintShiftButtons();
    updateEstimate();
  }

  function paintShiftButtons() {
    const box = $('shiftPicker');
    box.innerHTML = '';

    const allowed = activeShifts();

    box.style.gridTemplateColumns =
      `repeat(${Math.max(allowed.length, 1)},1fr)`;

    allowed.forEach(id => {
      const b = document.createElement('button');
      b.type = 'button';

      b.textContent =
        `${tr({ d: 'day', n: 'night', f: 'full' }[id])} ` +
        `(${id === 'f' ? 24 : shiftConfig(id).hours}h)`;

      b.classList.toggle('selected', selectedShifts.includes(id));
      b.dataset.shift = id;

      box.appendChild(b);
    });

    $('shiftPickerWrap').hidden = !allowed.length;
  }

  function updateHoursForShifts() {
    const h = shiftHours(selectedShifts);

    $('hoursInput').value = selectedStatus === 'h'
      ? Math.round(h * 5) / 10
      : h;
  }

  function updateEstimate() {
    const amount = calculatePay(
      selectedStatus,
      selectedShifts,
      Number($('hoursInput').value)
    );

    $('dayEstimate').textContent = amount > 0
      ? tr('dayIncome') + formatMoney(amount)
      : '';
  }

  function openDay(key, day) {
    selectedDate = key;

    const saved = data[key] || {};

    selectedStatus = saved.status || '';

    selectedShifts = (
      saved.shifts ||
      (activeShifts().length === 1 ? activeShifts() : [])
    ).slice();

    $('dayTitle').textContent =
      `${day} ${monthName(viewMonth)} ${viewYear}`;

    $('hoursInput').value =
      saved.hours ?? (selectedShifts.length ? shiftHours(selectedShifts) : '');

    $('noteInput').value = saved.note || '';

    document.querySelectorAll('.status-options button').forEach(b => {
      b.classList.toggle('selected', b.dataset.status === selectedStatus);
    });

    paintShiftButtons();
    updateEstimate();

    $('dayDialog').hidden = false;
  }

  function closeDay() {
    $('dayDialog').hidden = true;
  }

  function saveDay() {
    if (!selectedStatus) {
      delete data[selectedDate];
    } else {
      data[selectedDate] = {
        status: selectedStatus,
        hours: selectedStatus === 'o'
          ? 0
          : Math.max(0, Number($('hoursInput').value) || 0),
        note: $('noteInput').value.trim(),
        shifts: selectedStatus === 'o'
          ? []
          : selectedShifts.slice()
      };
    }

    saveJSON(STORAGE, data);
    closeDay();
    renderCalendar();
  }

  function openSettings() {
    $('nameInput').value = profile.name || '';
    $('workInput').value = profile.work || '';
    $('rateInput').value = profile.hourlyRate || '';

    settingShifts = activeShifts().length
      ? activeShifts().slice()
      : ['d'];

    settingDays = (
      profile.workingDays || [1, 2, 3, 4, 5, 6]
    ).slice();

    settingPayMode = payMode();

    tempShiftConfig = {};

    shiftIds.forEach(id => {
      tempShiftConfig[id] = {
        ...(profile.shiftConfig?.[id] || shiftDefaults[id])
      };
    });

    $('alarmEnabled').checked = !!profile.alarmEnabled;

    drawSettings();
    $('settingsDialog').hidden = false;
  }

  function drawSettings() {
    document.querySelectorAll('.pay-options button').forEach(b => {
      b.classList.toggle('selected', b.dataset.pay === settingPayMode);
    });

    $('hourlyRateWrap').hidden = settingPayMode !== 'hour';

    const shifts = $('shiftToggle');
    shifts.innerHTML = '';

    shifts.style.gridTemplateColumns =
      `repeat(${Math.max(settingShifts.length, 1)},1fr)`;

    shiftIds.forEach(id => {
      const b = document.createElement('button');
      b.type = 'button';

      b.textContent = tr({ d: 'day', n: 'night', f: 'full' }[id]);

      b.classList.toggle('selected', settingShifts.includes(id));
      b.dataset.shift = id;

      shifts.appendChild(b);
    });

    const rows = $('shiftRows');
    rows.innerHTML = '';

    shiftIds
      .filter(id => settingShifts.includes(id))
      .forEach(id => {
        const config = tempShiftConfig[id] || shiftDefaults[id];

        const row = document.createElement('div');
        row.className = 'shift-row';

        row.innerHTML = `
          <h4>${tr({ d: 'day', n: 'night', f: 'full' }[id])}</h4>

          <div>
            <label>${tr('shiftStart')}</label>
            <input type="time" data-time="${id}" value="${config.time}">
          </div>

          <div>
            <label>${tr('shiftHours')}</label>
            <input
              type="number"
              min="1"
              max="24"
              step="0.5"
              data-hours="${id}"
              value="${id === 'f' ? 24 : config.hours}"
              ${id === 'f' ? 'readonly' : ''}
            >
          </div>

          ${settingPayMode === 'shift'
            ? `<div style="grid-column:1/-1">
                <label>${tr('shiftPay')}</label>
                <input
                  type="number"
                  min="0"
                  inputmode="decimal"
                  data-pay="${id}"
                  value="${config.pay || ''}"
                >
              </div>`
            : ''}
        `;

        rows.appendChild(row);
      });

    const days = $('weekdayOptions');
    days.innerHTML = '';

    dictionary.weekdays[language].forEach((label, index) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.classList.toggle('selected', settingDays.includes(index));
      b.dataset.day = index;
      days.appendChild(b);
    });
  }

  function readShiftRows() {
    shiftIds.forEach(id => {
      const time = document.querySelector(`[data-time="${id}"]`);
      const hrs = document.querySelector(`[data-hours="${id}"]`);
      const pay = document.querySelector(`[data-pay="${id}"]`);

      if (time) {
        tempShiftConfig[id] = {
          time: time.value || shiftDefaults[id].time,
          hours: id === 'f'
            ? 24
            : Math.max(1, Number(hrs?.value) || shiftDefaults[id].hours),
          pay: Math.max(0, Number(pay?.value) || 0)
        };
      }
    });
  }

  function saveSettings() {
    const name = $('nameInput').value.trim();
    const work = $('workInput').value.trim();

    if (!name || !work) {
      toast('Naam aur kaam dono likho');
      return;
    }

    if (!settingShifts.length) {
      toast('Kam se kam ek shift chuno');
      return;
    }

    readShiftRows();

    profile = {
      name,
      work,
      payMode: settingPayMode,
      hourlyRate: Math.max(0, Number($('rateInput').value) || 0),
      shifts: settingShifts.slice(),
      workingDays: settingDays.slice(),
      shiftConfig: Object.fromEntries(
        settingShifts.map(id => [
          id,
          tempShiftConfig[id] || shiftDefaults[id]
        ])
      ),
      alarmEnabled: $('alarmEnabled').checked
    };

    saveJSON(PROFILE, profile);

    $('settingsDialog').hidden = true;

    updateSubtitle();
    renderCalendar();

    if (
      profile.alarmEnabled &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {});
    }

    toast('Settings saved');
  }

  function toggleShiftSelection(container, list, id, onUpdate) {
    const idx = list.indexOf(id);

    if (idx >= 0) {
      list.splice(idx, 1);
    } else if (id === 'f') {
      list.splice(0, list.length, 'f');
    } else {
      const full = list.indexOf('f');
      if (full >= 0) list.splice(full, 1);
      list.push(id);
    }

    onUpdate();
  }

  function handleAlarmTick() {
    if (!profile.alarmEnabled) return;

    const now = new Date();

    const hm =
      `${String(now.getHours()).padStart(2, '0')}:` +
      `${String(now.getMinutes()).padStart(2, '0')}`;

    const dayKey = now.toDateString();

    if (
      !(profile.workingDays || [0, 1, 2, 3, 4, 5, 6])
        .includes(now.getDay())
    ) {
      return;
    }

    activeShifts().forEach(id => {
      if (
        shiftConfig(id).time === hm &&
        alarmFired[id] !== dayKey
      ) {
        alarmFired[id] = dayKey;

        const label = tr({ d: 'day', n: 'night', f: 'full' }[id]);

        toast(`${tr('alarmTitle')} (${label})`);

        try {
          if (Notification.permission === 'granted') {
            new Notification(tr('alarmTitle'), { body: label });
          }
        } catch {}

        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctx();
          const osc = ctx.createOscillator();

          osc.connect(ctx.destination);
          osc.frequency.value = 880;
          osc.start();

          setTimeout(() => {
            osc.stop();
            ctx.close();
          }, 1200);
        } catch {}
      }
    });
  }

  $('language').addEventListener('change', e => {
    language = e.target.value;
    localStorage.setItem(LANG_KEY, language);
    applyTranslations();
  });

  $('prevMonth').addEventListener('click', () => {
    if (--viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    }
    renderCalendar();
  });

  $('nextMonth').addEventListener('click', () => {
    if (++viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    renderCalendar();
  });

  $('todayBtn').addEventListener('click', () => {
    const now = new Date();

    viewYear = now.getFullYear();
    viewMonth = now.getMonth();

    renderCalendar();

    const key = dateKey(viewYear, viewMonth, now.getDate());

    openDay(key, now.getDate());

    if (!selectedStatus) setSelectedStatus('w');
  });

  document.querySelector('.status-options').addEventListener('click', e => {
    const btn = e.target.closest('[data-status]');
    if (btn) setSelectedStatus(btn.dataset.status);
  });

  $('shiftPicker').addEventListener('click', e => {
    const btn = e.target.closest('[data-shift]');
    if (!btn) return;

    const id = btn.dataset.shift;
    const i = selectedShifts.indexOf(id);

    if (i >= 0) {
      selectedShifts.splice(i, 1);
    } else if (id === 'f') {
      selectedShifts = ['f'];
    } else {
      selectedShifts = selectedShifts.filter(x => x !== 'f');
      selectedShifts.push(id);
    }

    if (!selectedStatus || selectedStatus === 'o') {
      selectedStatus = 'w';
    }

    updateHoursForShifts();

    document.querySelectorAll('.status-options button').forEach(b => {
      b.classList.toggle('selected', b.dataset.status === selectedStatus);
    });

    paintShiftButtons();
    updateEstimate();
  });

  $('hoursInput').addEventListener('input', updateEstimate);

  $('saveDay').addEventListener('click', saveDay);

  $('clearDay').addEventListener('click', () => {
    delete data[selectedDate];
    saveJSON(STORAGE, data);
    closeDay();
    renderCalendar();
  });

  $('cancelDay').addEventListener('click', closeDay);

  $('dayDialog').addEventListener('click', e => {
    if (e.target === $('dayDialog')) closeDay();
  });

  $('settingsBtn').addEventListener('click', openSettings);

  $('cancelSettings').addEventListener('click', () => {
    $('settingsDialog').hidden = true;
  });

  $('saveSettings').addEventListener('click', saveSettings);

  $('settingsDialog').addEventListener('click', e => {
    if (e.target === $('settingsDialog')) {
      $('settingsDialog').hidden = true;
    }
  });

  $('shiftToggle').addEventListener('click', e => {
    const btn = e.target.closest('[data-shift]');
    if (!btn) return;

    readShiftRows();

    toggleShiftSelection(
      $('shiftToggle'),
      settingShifts,
      btn.dataset.shift,
      drawSettings
    );
  });

  $('weekdayOptions').addEventListener('click', e => {
    const btn = e.target.closest('[data-day]');
    if (!btn) return;

    const day = Number(btn.dataset.day);
    const idx = settingDays.indexOf(day);

    if (idx >= 0) settingDays.splice(idx, 1);
    else settingDays.push(day);

    drawSettings();
  });

  document.querySelector('.pay-options').addEventListener('click', e => {
    const btn = e.target.closest('[data-pay]');
    if (!btn) return;

    readShiftRows();
    settingPayMode = btn.dataset.pay;
    drawSettings();
  });

  fetch('languages.json')
    .then(res => {
      if (!res.ok) throw Error('missing language file');
      return res.json();
    })
    .then(json => {
      dictionary = json;
      applyTranslations();

      if (!profile.name) openSettings();
    })
    .catch(() => {
      $('subtitle').textContent =
        'languages.json missing — keep all 4 files in the same folder';
    });

  setInterval(handleAlarmTick, 15000);
})();
