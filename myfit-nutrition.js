/* MyFit 1.5 — Питание. Подключается после основного скрипта MyFit и после myfit-upgrade.js (если используется).
   Записи: localStorage['myfit-nutrition-v1']; фотографии: IndexedDB['myfit-nutrition-photos-v1'].
   Тренировочные данные не изменяются. */
(() => {
  'use strict';
  if (document.getElementById('myfit-nutrition')) return;
  const trainingTab = document.querySelector('.tabs');
  const progress = document.getElementById('progress');
  if (!trainingTab || !progress) { console.warn('MyFit: не найдена основная разметка.'); return; }

  const STORAGE_KEY = 'myfit-nutrition-v1';
  const DB_NAME = 'myfit-nutrition-photos-v1';
  const MEALS = [
    ['breakfast', '🍳', 'Завтрак'],
    ['lunch', '🥗', 'Обед'],
    ['snack', '🍎', 'Перекус'],
    ['dinner', '🍲', 'Ужин']
  ];
  // Ориентировочные значения на 100 г готового или сухого продукта (см. название).
  // Для точного учета пользователь может вводить показатели с упаковки.
  const CATALOG = [
    ['Овсяные хлопья (сухие)', 370, 13, 7, 62],
    ['Яйцо куриное', 143, 12.6, 9.5, 0.7],
    ['Творог 5%', 121, 17, 5, 1.8],
    ['Йогурт греческий 2%', 73, 10, 2, 3.5],
    ['Молоко 2,5%', 52, 2.8, 2.5, 4.7],
    ['Куриная грудка (готовая)', 165, 31, 3.6, 0],
    ['Лосось (готовый)', 208, 20, 13, 0],
    ['Тофу', 120, 12, 7, 2],
    ['Чечевица (варёная)', 116, 9, 0.4, 20],
    ['Рис (варёный)', 130, 2.7, 0.3, 28],
    ['Гречка (варёная)', 110, 4.2, 1.1, 21],
    ['Киноа (варёная)', 120, 4.4, 1.9, 21],
    ['Картофель (варёный)', 87, 1.9, 0.1, 20],
    ['Хлеб пшеничный', 250, 8, 3, 49],
    ['Банан', 89, 1.1, 0.3, 23],
    ['Яблоко', 52, 0.3, 0.2, 14],
    ['Помидор', 18, 0.9, 0.2, 3.9],
    ['Авокадо', 160, 2, 14.7, 8.5],
    ['Миндаль', 579, 21.2, 49.9, 21.6],
    ['Оливковое масло', 884, 0, 100, 0]
  ];
  const emptyState = () => ({ version: 1, entries: [], goals: {kcal:'',p:'',f:'',c:''} });
  let foodData;
  try {
    const read = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    foodData = read && Array.isArray(read.entries) ? read : emptyState();
    if (!foodData.goals) foodData.goals = {kcal:'',p:'',f:'',c:''};
  } catch { foodData = emptyState(); }
  const isoDate = (date = new Date()) => {
    const y = date.getFullYear(), m = String(date.getMonth()+1).padStart(2,'0'), d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  };
  const dateFromISO = s => new Date(Number(s.slice(0,4)), Number(s.slice(5,7))-1, Number(s.slice(8,10)), 12);
  const plusDays = (str, delta) => { const d = dateFromISO(str); d.setDate(d.getDate()+delta); return isoDate(d); };
  const isDate = str => typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str) && isoDate(dateFromISO(str)) === str;
  const html = s => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const asNum = s => { const v = Number(String(s ?? '').trim().replace(',', '.')); return String(s ?? '').trim() === '' || !Number.isFinite(v) ? NaN : v; };
  const n = x => Number.isFinite(Number(x)) ? Number(x) : 0;
  const fmt = (x, digits = 1) => n(x).toLocaleString('ru-RU', {maximumFractionDigits:digits});
  const per100 = e => e?.per100 || {kcal:0,p:0,f:0,c:0};
  const macro = e => { const m = per100(e), k = n(e.grams)/100; return {kcal:n(m.kcal)*k,p:n(m.p)*k,f:n(m.f)*k,c:n(m.c)*k}; };
  const sum = entries => entries.reduce((tot,e) => { const m=macro(e); for(const k of ['kcal','p','f','c']) tot[k]+=m[k]; return tot; }, {kcal:0,p:0,f:0,c:0});
  let selectedDate = isoDate();
  let editId = null;
  let pendingFile = null;
  let removeOldPhoto = false;
  let previewUrl = null;
  let thumbUrls = [];
  let renderSerial = 0;
  let dbPromise = null;
  let busy = false;

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(foodData)); return true; }
    catch { alert('Не получилось сохранить запись. Проверь свободное место в браузере и сделай резервную копию.'); return false; }
  }
  function openDB() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('photos');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return dbPromise;
  }
  async function getPhoto(id) {
    const db = await openDB(); if(!db || !id) return null;
    return new Promise(resolve => {
      try { const r=db.transaction('photos','readonly').objectStore('photos').get(id); r.onsuccess=()=>resolve(r.result || null); r.onerror=()=>resolve(null); }
      catch { resolve(null); }
    });
  }
  async function putPhoto(id, blob) {
    const db = await openDB(); if(!db) throw Error('Недоступно хранилище фотографий');
    return new Promise((resolve,reject) => {
      try { const tx=db.transaction('photos','readwrite'); tx.objectStore('photos').put(blob,id); tx.oncomplete=resolve; tx.onerror=()=>reject(Error('Не удалось сохранить фотографию')); tx.onabort=()=>reject(Error('Сохранение фотографии прервано')); }
      catch(err) { reject(err); }
    });
  }
  async function deletePhoto(id) {
    const db=await openDB(); if(!db || !id) return;
    return new Promise(resolve => {
      try {const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=resolve;tx.onerror=resolve;}catch{resolve();}
    });
  }
  async function clearPhotosAndImport(map) {
    const db=await openDB();
    if(!db && Object.keys(map).length) throw Error('Браузер не разрешает восстановить фотографии');
    if(!db) return;
    return new Promise((resolve,reject) => {
      try {
        const tx=db.transaction('photos','readwrite');const st=tx.objectStore('photos');st.clear();
        Object.entries(map).forEach(([id,blob])=>st.put(blob,id));
        tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Не удалось восстановить фотографии'));tx.onabort=()=>reject(Error('Восстановление прервано'));
      } catch(e) { reject(e); }
    });
  }
  function photoToBlob(file) {
    return new Promise((resolve,reject) => {
      const url=URL.createObjectURL(file), img=new Image();
      img.onload=() => {
        URL.revokeObjectURL(url);
        const scale=Math.min(1, 1100/Math.max(img.naturalWidth,img.naturalHeight));
        const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.naturalWidth*scale));cv.height=Math.max(1,Math.round(img.naturalHeight*scale));
        try {cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);cv.toBlob(blob => blob?resolve(blob):reject(Error('Не удалось обработать снимок')),'image/jpeg',0.72);}catch(e){reject(e);}
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Невозможно открыть фотографию. Попробуй JPG или PNG.'));};
      img.src=url;
    });
  }
  const uid = () => 'mf-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,11);

  const styles = document.createElement('style');
  styles.textContent = `
  .tabs.myfit-food-tabs .tab{font-size:clamp(10px,2.7vw,13px);min-width:0;padding:8px 1px}
  #myfit-nutrition .nf-hero{background:#e7f2e9;border:1px solid #d7e9dd;border-radius:18px;padding:15px;margin:12px 0}
  #myfit-nutrition .nf-date{display:flex;gap:7px;align-items:center;margin:12px 0;flex-wrap:wrap}
  #myfit-nutrition .nf-date input{flex:1;min-width:135px;width:100%;padding:10px;border:1px solid #d7e3d9;background:white;border-radius:11px;font:inherit;font-size:15px;color:#1b4138}
  #myfit-nutrition .nf-small{padding:9px 11px;border:1px solid #d7e3d9;background:white;border-radius:10px;color:#286b50;font:inherit;font-weight:650;cursor:pointer}
  #myfit-nutrition .nf-macros{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:12px 0}
  #myfit-nutrition .nf-macro{background:#f1f7f3;padding:10px 4px;border-radius:12px;text-align:center;min-width:0}
  #myfit-nutrition .nf-macro b{display:block;font-size:clamp(14px,4vw,22px);font-variant-numeric:tabular-nums;color:#163d32}
  #myfit-nutrition .nf-macro span{display:block;color:#6d8178;font-size:10px;line-height:1.45}
  #myfit-nutrition .nf-form-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
  #myfit-nutrition .nf-input{display:block;width:100%;min-width:0;font:inherit;color:#173e33;padding:11px 9px;background:white;border:1px solid #d6e3da;border-radius:10px}
  #myfit-nutrition .nf-field{display:block;color:#566f63;font-size:12px;font-weight:600}
  #myfit-nutrition .nf-field .nf-input{margin-top:5px}
  #myfit-nutrition .nf-quick{display:flex;gap:6px;overflow:auto;padding:3px 0 10px}
  #myfit-nutrition .nf-quick button{flex-shrink:0;border:1px solid #cfdfd3;color:#216a4d;border-radius:100px;background:#f3f9f4;padding:7px 9px;font-size:12px;cursor:pointer}
  #myfit-nutrition .nf-food-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:11px 0;border-top:1px solid #edf1ec}
  #myfit-nutrition .nf-food-text{flex:1;min-width:0;font-size:14px;overflow-wrap:anywhere}
  #myfit-nutrition .nf-food-text small{display:block;color:#71847c;font-size:12px;margin-top:4px}
  #myfit-nutrition .nf-photo{width:52px;height:52px;flex-shrink:0;object-fit:cover;border-radius:10px;background:#eaf3ec}
  #myfit-nutrition .nf-photo-box{width:52px;height:52px;flex-shrink:0;border-radius:10px;background:#eaf3ec;display:grid;place-items:center;color:#6c8e79}
  #myfit-nutrition .nf-actions{display:flex;gap:4px;align-items:center;flex-shrink:0}
  #myfit-nutrition .nf-actions button{font-size:12px;padding:7px;border:1px solid #d8e6db;border-radius:9px;color:#23664f;background:white;cursor:pointer}
  #myfit-nutrition .nf-meal-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
  #myfit-nutrition .nf-empty{color:#86968c;font-size:13px;padding:8px 0 2px}
  #myfit-nutrition .nf-kpi-hint{font-size:12px;color:#607e6b;line-height:1.5}
  #myfit-nutrition .nf-bar{height:5px;background:#dfebe1;border-radius:8px;overflow:hidden;margin-top:5px}
  #myfit-nutrition .nf-bar i{height:100%;background:#278560;display:block;max-width:100%}
  #myfit-nutrition .nf-history{width:100%;border:0;border-top:1px solid #eef2ee;text-align:left;background:transparent;padding:11px 0;color:#204e3e;display:flex;justify-content:space-between;font:inherit;cursor:pointer}
  #myfit-nutrition .nf-msg{color:#2d7d56;font-size:12px;min-height:16px}
  #myfit-nutrition .nf-photo-preview{margin-top:8px;max-height:150px;max-width:100%;border-radius:12px;object-fit:contain}
  #myfit-nutrition .nf-soft{background:#f5f8f5;border-radius:11px;padding:12px;margin-top:10px}
  #myfit-nutrition .nf-danger{color:#984c47!important}
  #myfit-nutrition .nf-hidden{display:none!important}
  #myfit-nutrition .nf-buttons{display:flex;flex-wrap:wrap;gap:8px}
  `;
  document.head.appendChild(styles);

  const root = document.createElement('main');
  root.id = 'myfit-nutrition'; root.className = 'hide';
  root.innerHTML = `
  <h2 class="section">🥗 Питание</h2>
  <div class="box">
    <div class="row"><div><div class="muted tiny">ДНЕВНИК ПИТАНИЯ</div><h3 style="margin:4px 0">Мой рацион</h3></div><span class="badge">MyFit 1.5</span></div>
    <div class="nf-date"><button class="nf-small" id="nfPrev" aria-label="Предыдущий день">←</button><input id="nfDate" aria-label="Дата питания" type="date"><button class="nf-small" id="nfNext" aria-label="Следующий день">→</button><button class="nf-small" id="nfToday">Сегодня</button></div>
    <div class="nf-macros" id="nfTotals"></div><div class="nf-kpi-hint" id="nfDayGoal"></div>
    <details style="margin-top:12px"><summary>🎯 Мои цели на день (необязательно)</summary>
      <p class="notice">Целевые значения ты задаёшь сама. Без них приложение просто считает фактическое питание.</p>
      <div class="nf-form-row" id="nfGoals"></div><button type="button" class="nf-small" id="nfSaveGoals">Сохранить цели</button></details>
  </div>
  <div id="nfMeals"></div>
  <div class="box" id="nfFormCard"><h3 style="margin-top:0" id="nfFormTitle">Добавить продукт или блюдо</h3>
    <p class="notice">Можно выбрать продукт из подсказок или внести значения с упаковки. Для сложного блюда укажи КБЖУ на 100 г готового блюда.</p>
    <div class="nf-quick" id="nfQuick"></div>
    <form id="nfForm">
      <div class="nf-form-row"><label class="nf-field">Приём пищи<select class="nf-input" id="nfMeal" required></select></label><label class="nf-field">Количество, г<input id="nfGrams" class="nf-input" type="text" inputmode="decimal" placeholder="Например, 150" required></label></div>
      <label class="nf-field">Продукт / блюдо<input id="nfName" class="nf-input" list="nfFoodNames" autocomplete="off" placeholder="Например, гречка (варёная)" maxlength="100" required></label>
      <datalist id="nfFoodNames"></datalist>
      <p class="notice" style="margin:9px 0 4px">Пищевая ценность <b>на 100 г</b>:</p>
      <div class="nf-form-row"><label class="nf-field">Калории, ккал<input id="nfKcal" class="nf-input" type="text" inputmode="decimal" placeholder="ккал"></label><label class="nf-field">Белки, г<input id="nfP" class="nf-input" type="text" inputmode="decimal" placeholder="г" required></label></div>
      <div class="nf-form-row"><label class="nf-field">Жиры, г<input id="nfF" class="nf-input" type="text" inputmode="decimal" placeholder="г" required></label><label class="nf-field">Углеводы, г<input id="nfC" class="nf-input" type="text" inputmode="decimal" placeholder="г" required></label></div>
      <p class="notice" id="nfCalculated">Укажи порцию, и приложение рассчитает калории и БЖУ.</p>
      <label class="nf-field">📷 Фотография блюда (необязательно)<input class="nf-input" type="file" id="nfFile" accept="image/*" style="margin-top:6px"></label>
      <div id="nfPhotoPreview"></div>
      <label id="nfRemoveOldWrap" class="nf-field nf-hidden" style="margin-top:9px"><input type="checkbox" id="nfRemoveOld"> Удалить прежнее фото</label>
      <div class="nf-buttons" style="margin-top:16px"><button type="submit" class="btn" id="nfSave">Сохранить в дневник</button><button type="button" class="btn secondary nf-hidden" id="nfCancelEdit">Отменить изменения</button></div>
      <p class="nf-msg" id="nfFormMessage" aria-live="polite"></p>
    </form>
  </div>
  <div class="box"><h3 style="margin-top:0">История питания</h3><div id="nfHistory"></div><p class="notice">Нажми на дату, чтобы увидеть продукты и фотографии за этот день.</p></div>
  <div class="box"><h3 style="margin-top:0">Резервная копия питания</h3><p class="notice">Питание и фото сохраняются на этом устройстве, в этом браузере. Экспорт включает фотографии. При очистке данных браузера записи могут исчезнуть.</p>
    <div class="nf-buttons"><button class="btn secondary" id="nfExport" type="button">⬇ Экспорт питания</button><button class="btn ghost" id="nfImportButton" type="button">⬆ Восстановить</button><input class="nf-hidden" type="file" accept="application/json,.json" id="nfImportFile"></div>
    <p class="nf-kpi-hint" style="margin-top:10px">Фото — для личного дневника: калорийность не определяется автоматически по фотографии. Показатели продуктов приблизительные, ориентируйся на этикетку.</p>
  </div>`;
  progress.insertAdjacentElement('afterend', root);
  const tab = document.createElement('button');
  tab.className='tab'; tab.type='button'; tab.dataset.tab='myfit-nutrition'; tab.textContent='🥗 Питание';
  trainingTab.appendChild(tab); trainingTab.classList.add('myfit-food-tabs');
  const el = id => document.getElementById(id);
  el('nfMeal').innerHTML=MEALS.map(([v,,s])=>`<option value="${v}">${s}</option>`).join('');
  el('nfFoodNames').innerHTML=CATALOG.map(x=>`<option value="${html(x[0])}"></option>`).join('');
  el('nfQuick').innerHTML=CATALOG.slice(0,12).map((x,i)=>`<button type="button" data-nf-catalog="${i}">${html(x[0])}</button>`).join('');

  tab.onclick=() => {
    document.querySelectorAll('nav.tabs .tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.querySelectorAll('main').forEach(m=>m.classList.toggle('hide',m!==root));
    renderAll(); window.scrollTo(0,0);
  };
  el('nfDate').onchange=() => {if(isDate(el('nfDate').value)){ selectedDate=el('nfDate').value;renderAll(); }};
  el('nfPrev').onclick=() => {selectedDate=plusDays(selectedDate,-1);renderAll();};
  el('nfNext').onclick=() => {selectedDate=plusDays(selectedDate,1);renderAll();};
  el('nfToday').onclick=() => {selectedDate=isoDate();renderAll();};
  function activateDay(day) {
    selectedDate=day;renderAll();
    document.getElementById('nfDate')?.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function fillFromCatalog(index) {
    const r=CATALOG[index]; if(!r) return;
    el('nfName').value=r[0];['Kcal','P','F','C'].forEach((key,i)=>el('nf'+key).value=r[i+1]);calculatePreview();
  }
  el('nfQuick').onclick=e=>{
    const t=e.target.closest('[data-nf-catalog]');if(t)fillFromCatalog(Number(t.dataset.nfCatalog));
  };
  el('nfName').addEventListener('change',()=>{
    const i=CATALOG.findIndex(x=>x[0].toLocaleLowerCase('ru')===el('nfName').value.trim().toLocaleLowerCase('ru'));
    if(i>=0)fillFromCatalog(i);
  });
  function calculatePreview() {
    const grams=asNum(el('nfGrams').value), p=asNum(el('nfP').value), f=asNum(el('nfF').value), c=asNum(el('nfC').value);
    let kcal=asNum(el('nfKcal').value);
    if(!Number.isFinite(kcal) && [p,f,c].every(Number.isFinite)) kcal=p*4+f*9+c*4;
    el('nfCalculated').textContent=[grams,kcal,p,f,c].every(Number.isFinite) && grams>0 ?
      `В порции: ${fmt(grams*kcal/100,0)} ккал · Б ${fmt(grams*p/100)} г · Ж ${fmt(grams*f/100)} г · У ${fmt(grams*c/100)} г`:
      'Укажи порцию, и приложение рассчитает калории и БЖУ.';
  }
  ['nfGrams','nfKcal','nfP','nfF','nfC'].forEach(k=>el(k).addEventListener('input',calculatePreview));
  el('nfFile').addEventListener('change',()=>{
    pendingFile=el('nfFile').files?.[0] || null;
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    const preview=el('nfPhotoPreview');preview.innerHTML='';
    if(pendingFile){
      if(!pendingFile.type.startsWith('image/')) {alert('Выбери файл изображения.');pendingFile=null;el('nfFile').value='';return;}
      if(pendingFile.size>25*1024*1024) {alert('Фото слишком большое. Выбери файл до 25 МБ.');pendingFile=null;el('nfFile').value='';return;}
      previewUrl=URL.createObjectURL(pendingFile);
      const image=document.createElement('img');image.className='nf-photo-preview';image.alt='Фото для записи';image.src=previewUrl;preview.appendChild(image);
    }
  });
  el('nfRemoveOld').addEventListener('change',()=>removeOldPhoto=el('nfRemoveOld').checked);
  el('nfCancelEdit').onclick=()=>resetForm();

  function resetForm() {
    editId=null;pendingFile=null;removeOldPhoto=false;el('nfForm').reset();el('nfMeal').value='breakfast';
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    el('nfPhotoPreview').innerHTML='';el('nfRemoveOldWrap').classList.add('nf-hidden');
    el('nfFormTitle').textContent='Добавить продукт или блюдо';el('nfSave').textContent='Сохранить в дневник';
    el('nfCancelEdit').classList.add('nf-hidden');el('nfFormMessage').textContent='';calculatePreview();
  }
  function startNew(meal) {
    resetForm();el('nfMeal').value=meal;el('nfFormCard').scrollIntoView({block:'start',behavior:'smooth'});
    el('nfName').focus({preventScroll:true});
  }
  function startEdit(id) {
    const e=foodData.entries.find(x=>x.id===id);if(!e)return;
    editId=id;pendingFile=null;removeOldPhoto=false;
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    el('nfForm').reset();el('nfFile').value='';el('nfPhotoPreview').innerHTML='';
    el('nfMeal').value=e.meal;el('nfName').value=e.name;el('nfGrams').value=e.grams;
    ['Kcal','P','F','C'].forEach((field,i)=>{el('nf'+field).value=per100(e)[['kcal','p','f','c'][i]] ?? '';});
    el('nfRemoveOldWrap').classList.toggle('nf-hidden',!e.photoId);el('nfRemoveOld').checked=false;
    el('nfFormTitle').textContent='Изменить запись';el('nfSave').textContent='Сохранить изменения';
    el('nfCancelEdit').classList.remove('nf-hidden');el('nfFormMessage').textContent=e.photoId?'Прежнее фото сохранится, если не заменить или не удалить его.':'';
    calculatePreview();
    if(e.photoId){getPhoto(e.photoId).then(blob=>{
      if(editId!==id||pendingFile||!blob)return;
      if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
      previewUrl=URL.createObjectURL(blob);
      const image=document.createElement('img');image.className='nf-photo-preview';image.alt='Сохранённое фото блюда';image.src=previewUrl;
      el('nfPhotoPreview').replaceChildren(image);
    });}
    el('nfFormCard').scrollIntoView({block:'start',behavior:'smooth'});
  }
  el('nfForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const name=el('nfName').value.trim(),grams=asNum(el('nfGrams').value);
    const p=asNum(el('nfP').value),f=asNum(el('nfF').value),c=asNum(el('nfC').value);
    let kcal=asNum(el('nfKcal').value);
    if(!Number.isFinite(kcal) && [p,f,c].every(Number.isFinite)) kcal=p*4+f*9+c*4;
    if(!name||!MEALS.some(x=>x[0]===el('nfMeal').value)||!Number.isFinite(grams)||grams<=0||grams>10000||[kcal,p,f,c].some(x=>!Number.isFinite(x)||x<0||x>1000)){
      alert('Проверь название, вес порции и КБЖУ на 100 г. Все значения должны быть неотрицательными, вес порции — больше нуля.');return;
    }
    busy=true;el('nfSave').disabled=true;
    const old=foodData.entries.find(x=>x.id===editId);
    let photoId=old?.photoId || null, newPhotoId=null;
    try {
      if(pendingFile){
        const blob=await photoToBlob(pendingFile);newPhotoId=uid();await putPhoto(newPhotoId,blob);photoId=newPhotoId;
      }else if(removeOldPhoto)photoId=null;
      const record={id:old?.id||uid(),date:old?.date||selectedDate,meal:el('nfMeal').value,name,
        grams,per100:{kcal,p,f,c},photoId,createdAt:old?.createdAt||new Date().toISOString()};
      if(old){const index=foodData.entries.findIndex(x=>x.id===old.id);foodData.entries[index]=record;}
      else foodData.entries.push(record);
      if(!persist()) {if(old)foodData.entries[foodData.entries.findIndex(x=>x.id===old.id)]=old;else foodData.entries=foodData.entries.filter(x=>x.id!==record.id); if(newPhotoId)await deletePhoto(newPhotoId);return;}
      if(old?.photoId && old.photoId!==photoId)await deletePhoto(old.photoId);
      resetForm();renderAll();el('nfFormMessage').textContent='✓ Запись сохранена';
    } catch(err) {if(newPhotoId)await deletePhoto(newPhotoId);alert('Не удалось сохранить: '+(err?.message||'ошибка фотографии'));}
    finally {busy=false;el('nfSave').disabled=false;}
  });
  el('nfMeals').addEventListener('click',async e=>{
    const add=e.target.closest('[data-nf-add]');if(add){startNew(add.dataset.nfAdd);return;}
    const edit=e.target.closest('[data-nf-edit]');if(edit){startEdit(edit.dataset.nfEdit);return;}
    const del=e.target.closest('[data-nf-delete]');if(!del)return;
    const entry=foodData.entries.find(x=>x.id===del.dataset.nfDelete);if(!entry)return;
    if(!confirm(`Удалить «${entry.name}» из дневника питания?`))return;
    const oldEntries=foodData.entries;
    foodData.entries=oldEntries.filter(x=>x.id!==entry.id);
    if(!persist()){foodData.entries=oldEntries;return;}
    if(entry.photoId)await deletePhoto(entry.photoId);
    if(editId===entry.id)resetForm();renderAll();
  });
  el('nfHistory').addEventListener('click',e=>{const b=e.target.closest('[data-nf-day]');if(b)activateDay(b.dataset.nfDay);});
  el('nfGoals').innerHTML=[['kcal','Калории, ккал'],['p','Белки, г'],['f','Жиры, г'],['c','Углеводы, г']].map(([key,name])=>
    `<label class="nf-field">${name}<input class="nf-input" data-nf-goal="${key}" type="text" inputmode="decimal" placeholder="Не задано"></label>`).join('');
  el('nfSaveGoals').onclick=()=>{
    const newGoals={};
    for(const input of el('nfGoals').querySelectorAll('[data-nf-goal]')){
      const raw=input.value.trim(),value=asNum(raw);
      if(raw && (!Number.isFinite(value)||value<=0||value>10000)){alert('Цели должны быть положительными числами либо оставаться пустыми.');return;}
      newGoals[input.dataset.nfGoal]=raw ? value : '';
    }
    const before=foodData.goals;foodData.goals=newGoals;
    if(!persist()){foodData.goals=before;return;}
    renderAll();alert('Цели сохранены.');
  };
  function renderGoals() {
    for(const input of el('nfGoals').querySelectorAll('[data-nf-goal]'))input.value=foodData.goals[input.dataset.nfGoal]??'';
  }
  function clearThumbUrls(){thumbUrls.forEach(u=>URL.revokeObjectURL(u));thumbUrls=[];}
  function renderAll() {
    const renderId=++renderSerial;
    el('nfDate').value=selectedDate;
    const todayEntries=foodData.entries.filter(x=>x.date===selectedDate);
    const totals=sum(todayEntries);
    const values=[['kcal','Калории','ккал',0],['p','Белки','г',1],['f','Жиры','г',1],['c','Углеводы','г',1]];
    el('nfTotals').innerHTML=values.map(([key,label,unit,round])=>{
      const target=Number(foodData.goals?.[key])||0;
      const percent=target?Math.max(0,Math.min(100,100*totals[key]/target)):0;
      return `<div class="nf-macro"><span>${label}</span><b>${fmt(totals[key],round)}</b><span>${unit}${target?' / '+fmt(target,round):''}</span>${target?`<div class="nf-bar"><i style="width:${percent}%"></i></div>`:''}</div>`;
    }).join('');
    el('nfDayGoal').textContent=todayEntries.length?`${todayEntries.length} записей в этот день. Суммы пересчитываются автоматически.`:'Пока нет записей на выбранную дату.';
    clearThumbUrls();
    el('nfMeals').innerHTML=MEALS.map(([meal,emoji,title])=>{
      const items=todayEntries.filter(x=>x.meal===meal);
      const subtotal=sum(items);
      const rows=items.map(e=>{
        const t=macro(e);
        return `<div class="nf-food-row">
          ${e.photoId?`<img class="nf-photo" data-nf-photo="${html(e.photoId)}" alt="Фото: ${html(e.name)}">`:'<div class="nf-photo-box" aria-hidden="true">🍽️</div>'}
          <div class="nf-food-text"><b>${html(e.name)}</b><small>${fmt(e.grams)} г · ${fmt(t.kcal,0)} ккал<br>Б ${fmt(t.p)} · Ж ${fmt(t.f)} · У ${fmt(t.c)} г</small></div>
          <div class="nf-actions"><button type="button" data-nf-edit="${html(e.id)}" aria-label="Изменить запись">✎</button><button type="button" class="nf-danger" data-nf-delete="${html(e.id)}" aria-label="Удалить запись">✕</button></div></div>`;
      }).join('');
      return `<div class="box"><div class="nf-meal-head"><h3 style="margin:0">${emoji} ${title}</h3><button class="nf-small" type="button" data-nf-add="${meal}">+ Добавить</button></div>
      ${rows||'<p class="nf-empty">Пока ничего не добавлено</p>'}
      ${items.length?`<p class="nf-kpi-hint" style="margin-bottom:0">Итого: ${fmt(subtotal.kcal,0)} ккал · Б ${fmt(subtotal.p)} · Ж ${fmt(subtotal.f)} · У ${fmt(subtotal.c)} г</p>`:''}
      </div>`;
    }).join('');
    const days = [...new Set(foodData.entries.map(x=>x.date).filter(isDate))].sort().reverse().slice(0,40);
    el('nfHistory').innerHTML=days.length?days.map(day=>{
      const entries=foodData.entries.filter(x=>x.date===day),calories=sum(entries).kcal;
      return `<button type="button" class="nf-history" data-nf-day="${day}"><b>${html(day)}${day===selectedDate?' · выбран':''}</b><span>${entries.length} записей · ${fmt(calories,0)} ккал</span></button>`;
    }).join(''):'<p class="nf-empty">История появится после первой записи.</p>';
    for(const image of root.querySelectorAll('img[data-nf-photo]')){
      getPhoto(image.dataset.nfPhoto).then(blob=>{
        if(renderId!==renderSerial||!image.isConnected||!blob)return;
        const url=URL.createObjectURL(blob);thumbUrls.push(url);image.src=url;
      });
    }
  }

  async function blobToDataUrl(blob) {return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Ошибка чтения фото'));reader.readAsDataURL(blob);});}
  function dataUrlToBlob(dataUrl) {
    if(typeof dataUrl!=='string'||!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl))throw Error('В архиве недопустимый формат фото');
    const [head,b64]=dataUrl.split(',');
    const raw=atob(b64),parts=[];for(let i=0;i<raw.length;i+=8192){const chunk=raw.slice(i,i+8192),array=new Uint8Array(chunk.length);for(let j=0;j<chunk.length;j++)array[j]=chunk.charCodeAt(j);parts.push(array);}
    return new Blob(parts,{type:head.match(/^data:([^;]+)/)[1]});
  }
  el('nfExport').onclick=async()=>{
    const btn=el('nfExport');btn.disabled=true;btn.textContent='Подготавливаю архив…';
    try {
      const photos={},ids=[...new Set(foodData.entries.map(e=>e.photoId).filter(Boolean))];
      for(const id of ids){const blob=await getPhoto(id);if(blob)photos[id]=await blobToDataUrl(blob);}
      if(ids.some(id=>!photos[id])) alert('Некоторые фотографии недоступны. Данные питания сохранятся, но эти фото в копию не войдут.');
      const payload={app:'MyFit',type:'nutrition-backup',exportedAt:new Date().toISOString(),data:foodData,photos};
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`myfit-pitanie-${isoDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(error){alert('Не удалось экспортировать питание: '+(error?.message||'ошибка'));}
    finally{btn.disabled=false;btn.textContent='⬇ Экспорт питания';}
  };
  el('nfImportButton').onclick=()=>el('nfImportFile').click();
  el('nfImportFile').onchange=async()=>{
    const file=el('nfImportFile').files?.[0];if(!file)return;
    try {
      if(file.size>60*1024*1024)throw Error('Файл слишком большой (максимум 60 МБ)');
      const input=JSON.parse(await file.text());
      if(input?.app!=='MyFit'||input?.type!=='nutrition-backup'||!Array.isArray(input?.data?.entries))throw Error('Это не резервная копия питания MyFit');
      const incoming=input.data.entries;
      if(incoming.length>20000||incoming.some(x=>typeof x.id!=='string'||!isDate(x.date)||!MEALS.some(m=>m[0]===x.meal)||typeof x.name!=='string'||!Number.isFinite(Number(x.grams))||Number(x.grams)<=0||!x.per100||['kcal','p','f','c'].some(k=>!Number.isFinite(Number(x.per100[k]))||Number(x.per100[k])<0)))throw Error('Данные питания в файле повреждены');
      if(!confirm('Заменить текущий дневник питания данными из файла? Сначала экспортируй текущий дневник. Тренировки не затронутся.'))return;
      const photoMap={};for(const [id,data] of Object.entries(input.photos||{}))photoMap[id]=dataUrlToBlob(data);
      const newData={version:1,entries:incoming,goals:input.data.goals||{kcal:'',p:'',f:'',c:''}};
      // Сначала убеждаемся, что можно сохранить метаданные, затем заменяем фотографии.
      const backup=foodData;foodData=newData;
      if(!persist()){foodData=backup;throw Error('Не хватает места для сохранения данных');}
      try{await clearPhotosAndImport(photoMap);}catch(error){foodData=backup;persist();throw error;}
      resetForm();renderGoals();renderAll();alert('Дневник питания восстановлен.');
    }catch(error){alert('Не удалось восстановить: '+(error?.message||'некорректный файл'));}
    finally{el('nfImportFile').value='';}
  };

  renderGoals();renderAll();
  openDB().then(db=>{if(!db)console.warn('MyFit Питание: браузер не предоставил IndexedDB для фото.');});
})();
