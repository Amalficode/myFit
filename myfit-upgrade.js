/* MyFit 1.4 — дополнение к существующей версии 1.3.
   Подключить ПОСЛЕ исходного <script> приложения, перед </body>.
   Существующий ключ localStorage и старые записи не изменяются. */
(() => {
  'use strict';
  if (typeof state === 'undefined' || typeof plans === 'undefined' ||
      typeof renderTraining !== 'function' || typeof renderHistory !== 'function' ||
      typeof save !== 'function' || typeof week !== 'function') {
    console.warn('MyFit 1.4: не найден основной скрипт MyFit.');
    return;
  }

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  const css = document.createElement('style');
  css.textContent = `
    .myfit-details{margin-top:12px;border-radius:12px;background:#f6f9f6;padding:12px}
    .myfit-details summary{font-weight:700;color:#23664f;cursor:pointer}
    .myfit-ex-title{font-size:13px;font-weight:750;margin:15px 0 7px;color:#203f34}
    .myfit-ex-title:first-child{margin-top:10px}
    .myfit-setrow{display:grid;grid-template-columns:38px minmax(0,1fr) minmax(0,1fr);gap:7px;align-items:center;margin:6px 0}
    .myfit-setrow input{width:100%;min-width:0;padding:10px 6px;background:white;border:1px solid #d8e4db;border-radius:9px;text-align:center;font:inherit;font-size:14px}
    .myfit-setrow.head{color:#688177;font-size:11px}
    .myfit-hint{color:#60776d;font-size:12px;margin-top:8px}
    .myfit-danger{background:transparent;border:0;color:#995057;font-size:12px;padding:8px 0;cursor:pointer;text-decoration:underline}
    .myfit-undo{border:1px solid #c9dcd0;background:#eaf4ec;color:#1a7253;border-radius:9px;padding:9px 12px;cursor:pointer}
    .myfit-saved{color:#317959;font-size:12px;margin-top:8px;min-height:15px}
  `;
  document.head.appendChild(css);

  // Три подхода в упражнениях на неделях 1–7. Неделя 8 остаётся облегчённой.
  setsFor = function (exerciseIndex, currentWeek) {
    return currentWeek === 8 ? 2 : 3;
  };

  const oldRenderTraining = renderTraining;
  renderTraining = function () {
    oldRenderTraining();
    const hint = document.querySelector('#weekHint');
    if (hint && week() <= 2) {
      hint.textContent = '3 рабочих подхода в упражнении. Пока оставляй 2–3 повторения в запасе, не увеличивай одновременно вес и число подходов.';
    }

    // Подсказка о последнем рабочем весе без автоматического копирования в новую тренировку.
    const cards = document.querySelectorAll('#exerciseList .exercise');
    const currentPlan = plans[state.current];
    cards.forEach((card, exerciseIndex) => {
      const previous = [...(state.history || [])].reverse().find(h =>
        h.name === currentPlan.name && Object.entries(h.sets || {}).some(([key, val]) =>
          key.startsWith(exerciseIndex + '-') && val?.done && val.kg !== '' && val.kg != null
        )
      );
      if (!previous) return;
      const previousSets = Object.entries(previous.sets || {})
        .filter(([key, val]) => key.startsWith(exerciseIndex + '-') && val?.done && val.kg !== '' && val.kg != null)
        .sort((a, b) => Number(a[0].split('-')[1]) - Number(b[0].split('-')[1]));
      const last = previousSets[previousSets.length - 1]?.[1];
      if (!last) return;
      const note = document.createElement('p');
      note.className = 'myfit-hint';
      note.textContent = `В предыдущей тренировке: ${last.kg} кг${last.reps ? ' · ' + last.reps + ' повторений' : ''}`;
      card.querySelector('.ex-detail')?.insertAdjacentElement('afterend', note);
    });
  };

  const planNotice = [...document.querySelectorAll('#progress .box')]
    .find(card => card.textContent.includes('План на 8 недель'))?.querySelector('p.notice');
  if (planNotice) {
    planNotice.innerHTML = '<b>1–2:</b> 3 подхода при комфортной нагрузке, изучение техники.<br>' +
      '<b>3–4:</b> сохраняем 3 подхода, учимся уверенно выполнять движения.<br>' +
      '<b>5–6:</b> при хорошей технике постепенно повышаем вес.<br>' +
      '<b>7:</b> закрепляем прогресс, не тренируемся до отказа.<br>' +
      '<b>8:</b> облегчённая неделя: 2 подхода и меньшие веса.';
  }
  const version = document.querySelector('.top .pill');
  if (version) version.textContent = '8 недель · версия 1.4';

  let lastDeleted = null;
  renderHistory = function () {
    const all = Array.isArray(state.history) ? state.history : [];
    const topCounter = document.querySelector('#doneTop');
    if (topCounter) topCounter.textContent = all.length;
    const weightTop = document.querySelector('#weightTop');
    if (weightTop) weightTop.textContent = state.weight;
    const list = document.querySelector('#historyList');
    if (!list) return;
    if (all.length === 0) {
      list.innerHTML = '<p class="muted">Пока нет сохранённых тренировок. После занятия они появятся здесь.</p>';
    } else {
      list.innerHTML = all.map((h, index) => ({h, index})).reverse().map(({h, index}, position) => {
        const p = plans.find(candidate => candidate.name === h.name);
        const fullSets = Object.entries(h.sets || {});
        const selected = fullSets.filter(([key, v]) => /^(\d+)-(\d+)$/.test(key) && v && (
          v.done || (v.kg !== '' && v.kg != null) || (v.reps !== '' && v.reps != null)
        ));
        const grouped = new Map();
        for (const [key, val] of selected) {
          const [exerciseIndex, setIndex] = key.split('-').map(Number);
          if (!grouped.has(exerciseIndex)) grouped.set(exerciseIndex, []);
          grouped.get(exerciseIndex).push({key, val, setIndex});
        }
        const exercises = [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([exerciseIndex, sets]) => {
          const name = p?.ex?.[exerciseIndex]?.[0] || `Упражнение ${exerciseIndex + 1}`;
          const rows = sets.sort((a, b) => a.setIndex - b.setIndex).map(({key, val, setIndex}) => `
            <div class="myfit-setrow">
              <span class="tiny muted">${setIndex + 1}${val.done ? ' ✓' : ''}</span>
              <input type="number" min="0" step="0.5" inputmode="decimal" aria-label="Вес, подход ${setIndex + 1}"
                data-history-index="${index}" data-history-key="${key}" data-history-field="kg"
                value="${escapeHtml(val.kg)}" placeholder="—">
              <input type="text" aria-label="Повторения, подход ${setIndex + 1}"
                data-history-index="${index}" data-history-key="${key}" data-history-field="reps"
                value="${escapeHtml(val.reps)}" placeholder="—">
            </div>`).join('');
          return `<div class="myfit-ex-title">${escapeHtml(name)}</div>
              <div class="myfit-setrow head"><span>№</span><span>Вес, кг</span><span>Повторы</span></div>${rows}`;
        }).join('');
        const counted = fullSets.filter(([key, val]) => /^(\d+)-(\d+)$/.test(key) && val?.done);
        const done = Number.isInteger(h.done) ? h.done : counted.length;
        const countExercises = Number.isInteger(h.exercises) ? h.exercises : new Set(counted.map(([key]) => key.split('-')[0])).size;
        const noSets = '<p class="myfit-hint">В этой записи нет данных по подходам.</p>';
        return `<div class="history" data-record="${index}">
          <div class="row"><b>${escapeHtml(h.name || 'Тренировка')}</b><span class="badge">${escapeHtml(h.date)}</span></div>
          <div class="muted tiny" style="margin-top:6px">Неделя ${escapeHtml(h.week)} · ${done} подходов · ${countExercises} упражнений</div>
          <details class="myfit-details" ${position === 0 ? 'open' : ''}>
            <summary>Вес и повторения по упражнениям</summary>
            ${exercises || noSets}
            <div class="myfit-saved" id="myfit-saved-${index}">Можно исправлять значения — они сохраняются автоматически.</div>
          </details>
          <button type="button" class="myfit-danger" data-delete-history="${index}">Удалить ошибочную запись</button>
        </div>`;
      }).join('');
    }
    let note = document.querySelector('#myfit-journal-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'notice';
      note.id = 'myfit-journal-note';
      note.textContent = 'Данные хранятся в этом браузере. Периодически делай резервную копию кнопкой «Экспортировать данные (JSON)».';
      document.querySelector('#exportBtn')?.insertAdjacentElement('afterend', note);
    }
    let undo = document.querySelector('#myfit-undo-wrap');
    if (!undo) {
      undo = document.createElement('div');
      undo.id = 'myfit-undo-wrap';
      list.insertAdjacentElement('afterend', undo);
    }
    undo.innerHTML = lastDeleted ? '<button type="button" class="myfit-undo" id="myfit-undo-delete">↶ Отменить удаление</button>' : '';
  };

  // Сохраняем рабочий вес и повторения прямо во время ввода, а не только при уходе из поля.
  document.addEventListener('input', (event) => {
    const input = event.target;
    if (!input.matches?.('#exerciseList [data-ex][data-set][data-field]')) return;
    const key = `${input.dataset.ex}-${input.dataset.set}`;
    const item = draft()[key] || (draft()[key] = {});
    item[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value;
    save();
    if (input.type === 'checkbox') renderCounters();
  });

  // Позволяем вписать или скорректировать рабочие веса даже после завершения тренировки.
  document.addEventListener('input', (event) => {
    const input = event.target;
    if (!input.matches?.('[data-history-index][data-history-key][data-history-field]')) return;
    const h = state.history?.[Number(input.dataset.historyIndex)];
    if (!h) return;
    h.sets ||= {};
    const set = h.sets[input.dataset.historyKey] ||= {};
    set[input.dataset.historyField] = input.value;
    save();
    const status = document.getElementById(`myfit-saved-${input.dataset.historyIndex}`);
    if (status) status.textContent = '✓ Изменения сохранены';
  });

  document.addEventListener('click', (event) => {
    const delButton = event.target.closest?.('[data-delete-history]');
    if (delButton) {
      const index = Number(delButton.dataset.deleteHistory);
      const entry = state.history?.[index];
      if (!entry || !confirm(`Удалить запись «${entry.name}» от ${entry.date}?`)) return;
      lastDeleted = {entry: state.history.splice(index, 1)[0], index};
      save();
      renderHistory();
      renderTraining();
      return;
    }
    if (event.target.closest?.('#myfit-undo-delete') && lastDeleted) {
      state.history.splice(lastDeleted.index, 0, lastDeleted.entry);
      lastDeleted = null;
      save();
      renderHistory();
      renderTraining();
    }
  });

  renderTraining();
  renderHistory();
})();
