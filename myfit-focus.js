/* MyFit 1.7: weeks 3-8, recorded gym weights, swimming, measurements.
   Additive only: existing workout history and nutrition data stay in their original stores. */
(() => {
  'use strict';
  if (typeof state === 'undefined' || typeof plans === 'undefined' ||
      typeof renderTraining !== 'function' || typeof renderHistory !== 'function' ||
      typeof renderProgress !== 'function' || typeof draft !== 'function') {
    console.warn('MyFit focus: core not found'); return;
  }

  const baseExercises = plans.map(p => p.ex.map(ex => [...ex]));
  const focusedExercises = [
    [
      ['Жим ногами','10–12','Поясница прижата, не блокируй колени.'],
      ['Ягодичный мост','10–12','Поднимай таз ягодицами, не прогибай поясницу.'],
      ['Присед с гантелью','10','Колени движутся по линии стоп, глубина комфортная.'],
      ['Разведение ног в тренажёре','12–15','Разводи ноги плавно, без рывков.'],
      ['Птица-собака','8–10/стор.','Вытяни противоположные руку и ногу, не поворачивай таз.']
    ],
    [
      ['Тяга верхнего блока','10–12','Веди локти вниз, тяни к верхней части груди.'],
      ['Горизонтальная тяга блока','10–12','Тяни рукоять к нижним рёбрам без раскачивания.'],
      ['Жим от груди в тренажёре','10–12','Спина прижата к опоре.'],
      ['Сгибание рук с гантелями','10–12','Локти у корпуса, руки работают без рывков.'],
      ['Планка','20–30 сек','Удерживай прямую линию тела, дыши спокойно.']
    ],
    [
      ['Румынская тяга с гантелями','10','Таз назад, спина нейтральная.'],
      ['Ягодичный мост','10–12','Контролируй подъём и опускание таза.'],
      ['Сгибание ног в тренажёре','12','Не бросай груз при возврате.'],
      ['Зашагивания на платформу','10/ногу','Начни с невысокой устойчивой платформы.'],
      ['Dead bug','8–10/стор.','Не допускай отрыва поясницы.']
    ]
  ];
  const focusedTitles = [
    'A · Ягодицы и бёдра', 'B · Спина, руки и корпус',
    'C · Ягодицы и задняя поверхность бёдер'
  ];
  const descriptions = [
    'Ягодицы и передняя поверхность бёдер',
    'Спина, грудь, руки и мышцы корпуса',
    'Ягодицы и задняя поверхность бёдер'
  ];
  CUES['Разведение ног в тренажёре'] = [
    'Сядь устойчиво, колени между наружными подушками.',
    'Плавно разведи ноги в стороны и верни их.',
    'Не раскачивай корпус и не делай рывков.'
  ];
  CUES['Планка'] = [
    'Локти под плечами, можно начать с опорой на колени.',
    'Держи ровную линию тела, продолжай дышать.',
    'Не прогибай поясницу и не задерживай дыхание.'
  ];
  VIDEO_GUIDES['Разведение ног в тренажёре'] = {
    url:'https://www.youtube.com/results?search_query=seated+hip+abduction+machine+proper+form',
    label:'Уроки: разведение ног в тренажёре'
  };
  VIDEO_GUIDES['Планка'] = {
    url:'https://www.youtube.com/results?search_query=plank+exercise+proper+form',
    label:'Уроки: планка'
  };
  const weightHints = {
    'Тяга верхнего блока':'Пробный вес: около 10–15 кг на блоке.',
    'Горизонтальная тяга блока':'Пробный вес: около 10–15 кг на блоке.',
    'Жим ногами':'20 кг — ориентир только для горизонтального тренажёра. На наклонном начни с пустой платформы.',
    'Ягодичный мост':'Без отягощения 0 кг; с гантелью записывай вес гантели на тазу.',
    'Сгибание рук с гантелями':'Ориентир: 2–3 кг. Записывай вес одной гантели.',
    'Присед с гантелью':'Без отягощения 0 кг; с гантелью записывай её вес.',
    'Румынская тяга с гантелями':'Начни с лёгких гантелей. Записывай вес одной гантели.',
    'Птица-собака':'0 кг — упражнение с собственным весом.',
    'Планка':'0 кг — упражнение с собственным весом. Повторы = секунды.',
    'Dead bug':'0 кг — упражнение с собственным весом.',
    'Зашагивания на платформу':'Без отягощения 0 кг, с гантелями — вес одной.',
    'Разведение ног в тренажёре':'Начни с самого лёгкого комфортного веса.',
    'Сгибание ног в тренажёре':'Начни с минимального комфортного веса.'
  };
  const bodyweight = new Set(['Птица-собака','Планка','Dead bug','Боковая планка']);

  function syncPlans() {
    for (let i=0;i<3;i++)
      plans[i].ex = week() >= 3 ? focusedExercises[i] : baseExercises[i];
  }
  function namesForHistory(h) {
    if (Array.isArray(h.exerciseNames)) return h.exerciseNames;
    const index = plans.findIndex(p=>p.name===h.name);
    if (index<0) return [];
    return (Number(h.week)>=3?focusedExercises[index]:baseExercises[index]).map(ex=>ex[0]);
  }
  function priorSet(name) {
    for (const h of [...(state.history||[])].reverse()) {
      const i=namesForHistory(h).indexOf(name);
      if (i===-1) continue;
      const rows=Object.entries(h.sets||{})
        .filter(([k,v])=>k.startsWith(i+'-')&&v?.done&&v.kg!==''&&v.kg!=null)
        .sort((a,b)=>Number(a[0].split('-')[1])-Number(b[0].split('-')[1]));
      for (const [,val] of rows.reverse()) {
        const kg=Number(String(val.kg).replace(',','.'));
        if (Number.isFinite(kg)&&kg>=0) return {kg,reps:val.reps||''};
      }
    }
    return null;
  }
  const oldTraining=renderTraining;
  renderTraining=function() {
    syncPlans();
    oldTraining();
    const w=week();
    if(w>=3) {
      document.querySelector('#workTitle').textContent=focusedTitles[state.current];
      document.querySelector('#workDesc').textContent=descriptions[state.current];
      document.querySelector('#weekHint').textContent=w===8?
        'Облегчённая неделя: снизь нагрузку, выполняй два подхода.':
        'Акцент на ягодицы: 2 тренировки нижней части тела, 1 верхней; оставляй 2–3 повтора в запасе.';
    }
    let modified=false;
    document.querySelectorAll('#exerciseList .exercise').forEach((card,i)=>{
      const name=plans[state.current].ex[i][0];
      card.querySelectorAll('.myfit-hint').forEach(el=>{
        if(el.textContent.startsWith('В предыдущей тренировке:')) el.remove();
      });
      const hint=document.createElement('p');
      hint.className='myfit-hint';
      hint.textContent=(weightHints[name]||'Выбирай комфортный вес, оставляй 2–3 повтора в запасе.')+
        ' Вес в кг — вес нагрузки, не вес тела.';
      card.querySelector('.ex-detail')?.insertAdjacentElement('afterend',hint);
      const last=priorSet(name);
      if(last) {
        const prev=document.createElement('p');
        prev.className='myfit-hint';
        prev.textContent='Последний рабочий вес: '+last.kg+' кг'+
          (last.reps?' · '+last.reps+' повторений':'')+' (можно изменить).';
        hint.insertAdjacentElement('afterend',prev);
      }
      card.querySelectorAll('input[data-field="kg"]').forEach(input=>{
        const key=i+'-'+input.dataset.set;
        const record=draft()[key]||(draft()[key]={});
        if(record.kg===undefined||record.kg===null||record.kg==='') {
          const newWeight=last?last.kg:(bodyweight.has(name)?0:null);
          if(newWeight!==null) {
            input.value=String(newWeight);
            record.kg=newWeight;
            modified=true;
          }
        }
      });
    });
    if(modified) save();
  };
  const oldHistory=renderHistory;
  renderHistory=function() {
    oldHistory();
    document.querySelectorAll('#historyList [data-record]').forEach(card=>{
      const h=state.history?.[Number(card.dataset.record)];
      if(!h) return;
      const indices=[...new Set(Object.keys(h.sets||{})
        .filter(k=>/^\d+-\d+$/.test(k)).map(k=>Number(k.split('-')[0])))].sort((a,b)=>a-b);
      const names=namesForHistory(h);
      card.querySelectorAll('.myfit-ex-title').forEach((el,i)=>{
        if(names[indices[i]]) el.textContent=names[indices[i]];
      });
    });
  };
  const saveButton=document.getElementById('saveWorkout');
  const oldSave=saveButton.onclick;
  saveButton.onclick=function(event) {
    syncPlans();
    const count=state.history.length;
    const names=plans[state.current].ex.map(x=>x[0]);
    oldSave.call(this,event);
    if(state.history.length>count) {
      state.history[state.history.length-1].exerciseNames=names;
      save();
      renderHistory();
    }
  };

  state.swims ||= [];
  state.measurements ||= [];
  const extras=document.createElement('section');
  extras.id='myfitExtra';
  extras.innerHTML=`
    <div class="box"><h3>📏 Замеры фигуры</h3>
      <p class="notice">Измеряй каждые 2 недели утром в одинаковых условиях.</p>
      <div class="two">
        <label>Дата<input class="field" id="mfDate" type="date"></label>
        <label>Талия, см<input class="field" id="mfWaist" type="number" min="20" max="200" step="0.5"></label>
        <label>Ягодицы, см<input class="field" id="mfHips" type="number" min="30" max="250" step="0.5"></label>
        <label>Обхват одного бедра, см<input class="field" id="mfThigh" type="number" min="20" max="150" step="0.5"></label>
      </div>
      <button class="btn" id="mfMeasureSave" type="button" style="margin-top:12px">Записать замеры</button>
      <div id="mfMeasures"></div>
    </div>
    <div class="box"><h3>🏊 Бассейн — раз в неделю</h3>
      <p class="notice">Плавай в комфортном темпе между силовыми тренировками.</p>
      <div class="two">
        <label>Дата<input class="field" id="mfSwimDate" type="date"></label>
        <label>Длительность, мин<input class="field" id="mfSwimMin" type="number" min="1" max="240" value="30"></label>
      </div>
      <button class="btn" id="mfSwimSave" type="button" style="margin-top:12px">Записать бассейн</button>
      <div id="mfSwims"></div>
    </div>
    <div class="box"><h3>📊 Анализ результатов</h3>
      <div id="mfSummary"></div>
      <button class="btn secondary" type="button" id="mfCSV">Скачать результаты в Excel (CSV)</button>
      <p class="notice">Тренировки можно сохранить в JSON во вкладке «Журнал», питание — во вкладке «Питание».</p>
    </div>`;
  document.getElementById('progress').appendChild(extras);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function wFor(date) {
    const delta=(new Date(date+'T12:00')-new Date(state.start+'T12:00'))/86400000;
    return Math.floor(delta/7)+1;
  }
  function redrawExtras() {
    $('mfMeasures').innerHTML=state.measurements.slice().reverse().map(m=>
      '<div class="history">'+esc(m.date)+': талия '+m.waist+
      ' · ягодицы '+m.hips+' · бедро '+m.thigh+' см</div>').join('')||
      '<p class="muted tiny">Замеров пока нет.</p>';
    const thisWeek=state.swims.filter(x=>wFor(x.date)===week());
    $('mfSwims').innerHTML='<p class="notice">На неделе '+week()+': '+thisWeek.length+
      ' посещений бассейна.</p>'+state.swims.slice().reverse().map(s=>
      '<div class="history">'+esc(s.date)+' · '+s.minutes+' минут</div>').join('');
    $('mfSummary').innerHTML='<p class="notice">Силовых тренировок: '+state.history.length+
      ' · посещений бассейна: '+state.swims.length+' · замеров: '+state.measurements.length+'.</p>';
  }
  $('mfDate').value=localDate();
  $('mfSwimDate').value=localDate();
  function validDate(s) {return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T12:00'));}
  function measurement(id,lo,hi) {
    const input=$(id),n=Number(input.value);
    return input.value.trim()!==''&&Number.isFinite(n)&&n>=lo&&n<=hi?n:null;
  }
  $('mfMeasureSave').onclick=()=>{
    const date=$('mfDate').value;
    const waist=measurement('mfWaist',20,200),hips=measurement('mfHips',30,250),
      thigh=measurement('mfThigh',20,150);
    if(!validDate(date)||[waist,hips,thigh].some(x=>x===null)) {
      alert('Укажи дату и три замера в сантиметрах.');return;
    }
    state.measurements=state.measurements.filter(x=>x.date!==date);
    state.measurements.push({date,waist,hips,thigh});
    save();redrawExtras();alert('Замеры сохранены.');
  };
  $('mfSwimSave').onclick=()=>{
    const date=$('mfSwimDate').value,minutes=Number($('mfSwimMin').value);
    if(!validDate(date)||!Number.isInteger(minutes)||minutes<1||minutes>240) {
      alert('Проверь дату и длительность бассейна.');return;
    }
    state.swims=state.swims.filter(x=>x.date!==date);
    state.swims.push({date,minutes});
    save();redrawExtras();alert('Бассейн записан.');
  };
  const oldProgress=renderProgress;
  renderProgress=function(){oldProgress();redrawExtras();};
  $('mfCSV').onclick=()=>{
    const rows=[['Тип','Дата','Неделя','Упражнение','Подход','Вес, кг','Повторы','Вес тела, кг','Талия, см','Ягодицы, см','Бедро, см','Бассейн, мин']];
    for(const h of state.history) {
      const names=namesForHistory(h);
      for(const [key,val] of Object.entries(h.sets||{})) {
        if(!/^\d+-\d+$/.test(key)||!val?.done) continue;
        const [i,j]=key.split('-').map(Number);
        rows.push(['Силовая',h.date,h.week,names[i]||'',j+1,val.kg??'',val.reps??'','','','','','']);
      }
    }
    for(const x of state.weights||[]) rows.push(['Вес тела',x.date,'','','','','',x.weight,'','','','']);
    for(const x of state.measurements) rows.push(['Замеры',x.date,'','','','','','',x.waist,x.hips,x.thigh,'']);
    for(const x of state.swims) rows.push(['Бассейн',x.date,wFor(x.date),'','','','','','','','',x.minutes]);
    const csv='\uFEFF'+rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='myfit-results-'+localDate()+'.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  const label=document.querySelector('.top .pill');
  if(label)label.textContent='8 недель · версия 1.7';
  const planParagraph=[...document.querySelectorAll('#progress .box')]
    .find(el=>el.textContent.includes('План на 8 недель'))?.querySelector('p.notice');
  if(planParagraph)planParagraph.innerHTML=
    '<b>1–2:</b> освоение техники и комфортные веса.<br>'+
    '<b>3–7:</b> два дня ягодицы/бёдра, один верх тела; бассейн раз в неделю.<br>'+
    '<b>8:</b> облегчённая неделя, замеры и сравнение прогресса.';
  renderTraining();renderHistory();renderProgress();
})();