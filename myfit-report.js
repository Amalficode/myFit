/* MyFit 1.8 — weekly training + Fitbit Air data review.
   Does not pretend to authorize Google Health. Health data stays in the
   existing private local MyFit browser storage until the user exports it. */
(() => {
  'use strict';
  if (typeof state === 'undefined' || typeof save !== 'function' ||
      typeof localDate !== 'function') return;
  if (document.getElementById('myfit-report')) return;
  state.fitbitDaily = Array.isArray(state.fitbitDaily) ? state.fitbitDaily : [];
  const e = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = (n, decimals=0) => Number(n).toLocaleString('ru-RU',{maximumFractionDigits:decimals});
  const iso = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const date = s => new Date(Number(s.slice(0,4)),Number(s.slice(5,7))-1,Number(s.slice(8,10)),12);
  const addDays = (s,n) => {const d=date(s);d.setDate(d.getDate()+n);return iso(d)};
  const monday = s => addDays(s,-(date(s).getDay()+6)%7);
  const goodDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(date(s))===s;
  const inRange = (s,lo,hi) => goodDay(s) && s>=lo && s<=hi;
  const numeric = x => {
    if (x===null || x===undefined || String(x).trim()==='') return null;
    const n=Number(String(x).trim().replace(',','.'));
    return Number.isFinite(n)?n:null;
  };
  const metrics = [
    ['steps','Шаги','0','100000',true],
    ['sleepHours','Сон, часы','0','24',false],
    ['restingHr','Пульс покоя, уд/мин','30','180',false],
    ['activeMinutes','Активность, минуты','0','1440',true],
    ['hrv','Вариабельность пульса, мс','1','300',false]
  ];
  const css=document.createElement('style');
  css.textContent=[
    '.mf-report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
    '.mf-report-kpi{border-radius:15px;background:#f0f6f1;padding:15px}',
    '.mf-report-kpi b{font-size:24px;color:#205944;display:block;line-height:1.25}',
    '.mf-report-kpi span{font-size:12px;color:#617a6b}',
    '.mf-report-card{background:white;border:1px solid #e5ebe6;border-radius:20px;padding:18px;margin:13px 0}',
    '.mf-report-card h3{font-size:18px;margin:0 0 12px}',
    '.mf-report-field{display:grid;gap:5px;font-size:12px;color:#60766c}',
    '.mf-report-field input{font:inherit;font-size:16px;width:100%;padding:12px;border-radius:10px;border:1px solid #d7e3d9;background:#fbfdfa;color:#193b32}',
    '.mf-report-btns{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}',
    '.mf-report-btns button{flex:1;min-width:115px}',
    '.mf-report-list{padding-left:20px;color:#335c4a;line-height:1.6}',
    '.mf-report-list li{margin:6px 0}',
    '.mf-report-note{font-size:12px;color:#5d7669;line-height:1.5}',
    '.mf-report-file{display:block;padding:13px 9px;border:1px dashed #a4c6b1;border-radius:10px;width:100%;font-size:13px}',
    '@media(max-width:370px){.mf-report-grid{gap:6px}.mf-report-kpi{padding:10px}.mf-report-card{padding:12px}}'
  ].join('\n');
  document.head.appendChild(css);

  const root=document.createElement('main');
  root.id='myfit-report';
  root.className='hide';
  root.innerHTML =
    '<h2 class="section">📊 Мой недельный отчёт</h2>' +
    '<div class="mf-report-card">' +
      '<p class="mf-report-note">3 силовые тренировки, 1 бассейн и динамика веса. Отчёт рассчитывается только по реально сохранённым данным.</p>' +
      '<div class="row"><button type="button" class="smallbtn" id="mrBack" aria-label="Прошлая неделя">←</button>' +
      '<b id="mrPeriod"></b><button type="button" class="smallbtn" id="mrNext" aria-label="Следующая неделя">→</button></div>' +
      '<div id="mrCards" class="mf-report-grid" style="margin:15px 0"></div>' +
      '<div id="mrDetails"></div><h3 style="margin-top:18px">Что улучшить</h3><ol id="mrTips" class="mf-report-list"></ol>' +
      '<div class="mf-report-btns"><button type="button" class="btn" id="mrDownload">⬇ Скачать отчёт</button>' +
      '<button type="button" class="btn secondary" id="mrCopy">Скопировать</button></div>' +
      '<p class="mf-report-note">Отчёт ChatGPT по понедельникам не может самостоятельно читать данные, которые хранятся только в Safari. Для полноценного анализа отправляй выгрузку сюда, пока мы не настроили авторизованную синхронизацию.</p>' +
    '</div>' +
    '<div class="mf-report-card">' +
      '<h3>⌚ Fitbit Air — показатели по дням</h3>' +
      '<p class="mf-report-note">На твоём скриншоте Fitbit Air синхронизирован с Google Health. <b>MyFit пока не подключён к Google Health автоматически.</b> Здесь можно записать показатели или импортировать таблицу. Google OAuth потребуется настроить отдельно.</p>' +
      '<div class="mf-report-grid"><label class="mf-report-field" style="grid-column:span 2">Дата<input id="mrDate" type="date"></label>' +
        metrics.map(([k,label,min,max])=>'<label class="mf-report-field">'+label+
          '<input id="mr-'+k+'" type="number" inputmode="decimal" min="'+min+'" max="'+max+'" step="any" placeholder="—"></label>').join('')+
      '</div>' +
      '<div class="mf-report-btns"><button type="button" class="btn" id="mrSaveDay">Сохранить показатели</button></div>' +
      '<div id="mrDays"></div>' +
    '</div>' +
    '<div class="mf-report-card">' +
      '<h3>📥 Импорт Fitbit / Google Health</h3>' +
      '<p class="mf-report-note">Поддерживаются подготовленные CSV или JSON с дневными значениями: date, steps, sleep_hours, resting_hr, active_minutes, hrv. Архив Google Takeout нельзя импортировать сюда напрямую — его структуру нужно сначала преобразовать в эту таблицу.</p>' +
      '<input class="mf-report-file" id="mrImport" type="file" accept=".csv,.json,text/csv,application/json">' +
      '<div class="mf-report-btns"><button type="button" class="btn secondary" id="mrTemplate">⬇ CSV-шаблон</button>' +
      '<button type="button" class="btn ghost" id="mrExport">⬇ Мои показатели</button></div>' +
      '<p class="mf-report-note">Экспорт оригинальных данных: <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout</a> (выбери Google Health). Это не отправляет данные в MyFit автоматически.</p>' +
      '<p class="mf-report-note" id="mrStatus" role="status"></p>' +
    '</div>';
  const nav=document.querySelector('nav.tabs');
  const progress=document.getElementById('progress');
  if (!nav || !progress) return;
  progress.insertAdjacentElement('afterend',root);
  const tab=document.createElement('button');
  tab.type='button';
  tab.className='tab';
  tab.textContent='📊 Отчёт';
  tab.dataset.tab='myfit-report';
  nav.appendChild(tab);
  nav.style.setProperty('gap','1px');
  nav.querySelectorAll('.tab').forEach(el=>el.style.setProperty('font-size','11px'));
  const $=id=>document.getElementById(id);
  let periodStart=monday(localDate());
  if (date(localDate()).getDay()===1) periodStart=addDays(periodStart,-7);
  let reportText='';
  const average=(rows,key)=>{
    const values=rows.map(x=>numeric(x[key])).filter(x=>x!==null);
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  };
  function latestBefore(items,limit,key) {
    const sorted=items.filter(x=>goodDay(x.date)&&x.date<=limit&&numeric(x[key])!==null)
                      .sort((a,b)=>b.date.localeCompare(a.date));
    return sorted[0]||null;
  }
  function currentData(){
    const first=periodStart, last=addDays(first,6),priorStart=addDays(first,-7),priorLast=addDays(first,-1);
    const workouts=(state.history||[]).filter(x=>inRange(x.date,first,last));
    const priorWorkouts=(state.history||[]).filter(x=>inRange(x.date,priorStart,priorLast));
    const swims=(state.swims||[]).filter(x=>inRange(x.date,first,last));
    const records=state.fitbitDaily.filter(x=>inRange(x.date,first,last));
    const priorRecords=state.fitbitDaily.filter(x=>inRange(x.date,priorStart,priorLast));
    const nowWeight=latestBefore(state.weights||[],addDays(last,1),'weight');
    const beforeWeight=nowWeight?latestBefore((state.weights||[]).filter(x=>x.date<nowWeight.date),priorLast,'weight'):null;
    const nowMeasure=latestBefore(state.measurements||[],addDays(last,1),'waist');
    const beforeMeasure=nowMeasure?latestBefore((state.measurements||[]).filter(x=>x.date<nowMeasure.date),priorLast,'waist'):null;
    const sumSets=workouts.reduce((sum,h)=>sum+Object.entries(h.sets||{}).filter(([key,v])=>/^\d+-\d+$/.test(key)&&v?.done).length,0);
    const sleep=average(records,'sleepHours'),steps=average(records,'steps'),activity=average(records,'activeMinutes');
    const resting=average(records,'restingHr'),hrv=average(records,'hrv');
    const tips=[];
    if(workouts.length<3)tips.push('Постарайся распределить до 3 силовых тренировок по неделе, оставляя день восстановления между тренировками ягодиц.');
    else tips.push('Все 3 силовые выполнены. Если техника уверенная и остаются 2–3 повторения в запасе, постепенно повышай вес лишь в одном упражнении на ягодицы.');
    if(swims.length<1)tips.push('Впиши одно комфортное плавание на следующую неделю, если хватает сил и времени.');
    if(records.length>=3 && sleep!==null && sleep<7)tips.push('Средняя продолжительность сна невысока: сделай приоритетом более регулярный сон и восстановление, а не дополнительную нагрузку.');
    else if(records.length<3)tips.push('Добавь хотя бы 3 дня данных Fitbit о сне и активности, чтобы рекомендации учитывали восстановление.');
    if(nowWeight&&beforeWeight){
      const delta=Number(nowWeight.weight)-Number(beforeWeight.weight);
      if(delta < -0.8)tips.push('Вес снизился довольно быстро: оцени самочувствие и достаточность питания для сохранения мышц.');
    }
    if(tips.length<3 && workouts.length>=3 && swims.length>=1) tips.push('Сохраняй две тренировки с акцентом на ягодицы и одну на верх тела; измеряй объёмы каждые 2 недели.');
    return {first,last,workouts,priorWorkouts,swims,records,priorRecords,nowWeight,beforeWeight,nowMeasure,beforeMeasure,sumSets,sleep,steps,activity,resting,hrv,tips:tips.slice(0,4)};
  }
  function report(){
    const d=currentData();
    $('mrPeriod').textContent=d.first.slice(5)+' — '+d.last.slice(5);
    $('mrNext').disabled=periodStart>=monday(localDate());
    const change=(a,b,key,unit)=>{
      if(!a||!b)return 'нет сравнения';
      const n=Number(a[key])-Number(b[key]);
      return (n>0?'+':'')+format(n,1)+' '+unit;
    };
    const tile=(label,value,detail)=>'<div class="mf-report-kpi"><b>'+e(value)+'</b><span>'+e(label)+'</span>'+
      (detail?'<div class="mf-report-note">'+e(detail)+'</div>':'')+'</div>';
    $('mrCards').innerHTML=
      tile('Силовые тренировки',d.workouts.length+'/3',d.sumSets+' выполненных подходов')+
      tile('Бассейн',d.swims.length+'/1',d.swims.length?d.swims.reduce((sum,x)=>sum+Number(x.minutes||0),0)+' мин':'нет записи')+
      tile('Вес тела',d.nowWeight?format(d.nowWeight.weight,1)+' кг':'—',d.nowWeight?change(d.nowWeight,d.beforeWeight,'weight','кг'):'запиши в «Прогрессе»')+
      tile('Сон (Fitbit)',d.sleep!==null?format(d.sleep,1)+' ч':'—',d.records.filter(x=>numeric(x.sleepHours)!==null).length+' дней с данными');
    const stats=[
      'Шаги: '+(d.steps!==null?format(d.steps)+' в среднем за зарегистрированный день':'данных нет'),
      'Активность: '+(d.activity!==null?format(d.activity)+' мин в среднем':'данных нет'),
      'Пульс покоя: '+(d.resting!==null?format(d.resting,0)+' уд/мин в среднем':'данных нет'),
      'HRV: '+(d.hrv!==null?format(d.hrv,0)+' мс в среднем':'данных нет'),
      'Отчётов Fitbit: '+d.records.length+' из 7 дней',
      'Ягодицы/бёдра: '+(d.nowMeasure?format(d.nowMeasure.hips,1)+' см':'пока нет замеров')
    ];
    $('mrDetails').innerHTML='<p class="mf-report-note">'+stats.map(e).join('<br>')+'</p>'+
      '<p class="mf-report-note">Запись веса тела — каждый понедельник во вкладке «Прогресс». Прогресс оценивается по весу, замерам, силе и восстановлению, а не по одному числу.</p>';
    $('mrTips').innerHTML=d.tips.map(t=>'<li>'+e(t)+'</li>').join('');
    reportText=[
      'MyFit — еженедельный отчёт: '+d.first+' — '+d.last,
      'Силовые тренировки: '+d.workouts.length+' из 3; выполненных подходов: '+d.sumSets,
      'Бассейн: '+d.swims.length+' из 1; минут: '+d.swims.reduce((s,x)=>s+Number(x.minutes||0),0),
      'Вес: '+(d.nowWeight?d.nowWeight.weight+' кг ('+d.nowWeight.date+')':'нет данных'),
      'Предыдущий вес: '+(d.beforeWeight?d.beforeWeight.weight+' кг ('+d.beforeWeight.date+')':'нет данных'),
      'Обхват ягодиц/бёдер: '+(d.nowMeasure?d.nowMeasure.hips+' см':'нет данных'),
      'Fitbit: '+d.records.length+' дней',
      'Шаги в среднем: '+(d.steps===null?'нет данных':format(d.steps)),
      'Сон в среднем, ч: '+(d.sleep===null?'нет данных':format(d.sleep,1)),
      'Активные минуты в среднем: '+(d.activity===null?'нет данных':format(d.activity,0)),
      'Пульс покоя в среднем: '+(d.resting===null?'нет данных':format(d.resting,0)),
      'HRV в среднем: '+(d.hrv===null?'нет данных':format(d.hrv,0)),
      'Рекомендации:\n'+d.tips.map((x,i)=>(i+1)+'. '+x).join('\n'),
      'Примечание: Fitbit показатели внесены пользователем или импортированы из файла, прямой Google Health OAuth пока не подключён.'
    ].join('\n');
  }
  function rows(){
    $('mrDays').innerHTML=state.fitbitDaily.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(r=>
      '<div class="history row"><div><b>'+e(r.date)+'</b><div class="tiny muted">'+
      (r.steps==null?'':format(r.steps)+' шагов · ')+(r.sleepHours==null?'':format(r.sleepHours,1)+' ч сна')+
      '</div></div><button class="smallbtn" data-mr-delete="'+e(r.date)+'" aria-label="Удалить день">×</button></div>').join('') ||
      '<p class="mf-report-note">Записей Fitbit пока нет. Первые показатели можно добавить из приложения Google Health.</p>';
  }
  function render(){report();rows()}
  tab.onclick=()=>{
    nav.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab));
    document.querySelectorAll('main').forEach(x=>x.classList.toggle('hide',x!==root));
    render();window.scrollTo(0,0);
  };
  $('mrDate').value=localDate();
  function status(t){$('mrStatus').textContent=t}
  function parseRecord(raw){
    const rec={date:String(raw.date??raw.Date??raw.дата??'').trim()};
    if(!goodDay(rec.date))return null;
    const fields={
      steps:['steps','Шаги','шаги'],
      sleepHours:['sleep_hours','sleepHours','sleep','сон'],
      restingHr:['resting_hr','restingHr','restingHeartRate','rhr'],
      activeMinutes:['active_minutes','activeMinutes','active'],
      hrv:['hrv','HRV']
    };
    for(const [key,aliases] of Object.entries(fields)){
      let value=null;
      for (const a of aliases) if (Object.prototype.hasOwnProperty.call(raw,a)) { value=numeric(raw[a]);break }
      const rule=metrics.find(m=>m[0]===key);
      if(value!==null && (value<Number(rule[2])||value>Number(rule[3])||
          (rule[4] && !Number.isInteger(value))))return null;
      rec[key]=value;
    }
    return metrics.some(m=>rec[m[0]]!==null)?rec:null;
  }
  function upsert(rec){
    state.fitbitDaily=state.fitbitDaily.filter(x=>x.date!==rec.date);
    state.fitbitDaily.push(rec);
    state.fitbitDaily.sort((a,b)=>a.date.localeCompare(b.date));
  }
  $('mrSaveDay').onclick=()=>{
    const raw={date:$('mrDate').value};
    for(const [key] of metrics) raw[key]=$('mr-'+key).value;
    const rec=parseRecord(raw);
    if(!rec){alert('Проверь дату и показатели. Заполни хотя бы одно поле.');return}
    upsert(rec);save();render();status('✓ Показатели записаны в журнал MyFit.');
  };
  $('mrDays').addEventListener('click',event=>{
    const b=event.target.closest('[data-mr-delete]');
    if(!b||!confirm('Удалить показатели Fitbit за '+b.dataset.mrDelete+'?'))return;
    state.fitbitDaily=state.fitbitDaily.filter(x=>x.date!==b.dataset.mrDelete);
    save();render();
  });
  $('mrBack').onclick=()=>{periodStart=addDays(periodStart,-7);report()};
  $('mrNext').onclick=()=>{periodStart=addDays(periodStart,7);report()};
  function download(text,filename,mime){
    const u=URL.createObjectURL(new Blob([text],{type:mime}));
    const a=document.createElement('a');a.href=u;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(u),30000);
  }
  $('mrDownload').onclick=()=>download(reportText,'myfit-weekly-'+periodStart+'.txt','text/plain;charset=utf-8');
  $('mrCopy').onclick=()=>{
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(reportText)
      .then(()=>alert('Отчёт скопирован — можешь отправить его в ChatGPT.'))
      .catch(()=>download(reportText,'myfit-weekly-'+periodStart+'.txt','text/plain;charset=utf-8'));
    else download(reportText,'myfit-weekly-'+periodStart+'.txt','text/plain;charset=utf-8');
  };
  const headers=['date','steps','sleep_hours','resting_hr','active_minutes','hrv'];
  const csvCell=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
  $('mrTemplate').onclick=()=>download('\uFEFF'+headers.join(',')+'\n','myfit-fitbit-template.csv','text/csv;charset=utf-8');
  $('mrExport').onclick=()=>{
    const c=['\uFEFF'+headers.join(',')].concat(state.fitbitDaily.map(r=>[
      r.date,r.steps,r.sleepHours,r.restingHr,r.activeMinutes,r.hrv
    ].map(csvCell).join(','))).join('\r\n');
    download(c,'myfit-fitbit-daily-'+localDate()+'.csv','text/csv;charset=utf-8');
  };
  function parseCSV(input){
    const s=input.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const headerLine=s.split('\n')[0]||'';
    const delimiter=headerLine.includes(';')?';':',';
    const table=[];let cell='',row=[],inQuotes=false;
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(c==='"'){
        if(inQuotes && s[i+1]==='"'){cell+='"';i++}else inQuotes=!inQuotes;
      } else if((c===delimiter||c==='\n')&&!inQuotes){
        row.push(cell.trim());cell='';
        if(c==='\n'){if(row.some(Boolean))table.push(row);row=[]}
      } else cell+=c;
    }
    if(inQuotes)throw Error('Не закрыты кавычки в CSV');
    row.push(cell.trim());if(row.some(Boolean))table.push(row);
    if(table.length<2)throw Error('Файл не содержит строк с показателями');
    const heads=table.shift().map(x=>x.trim());
    if(!heads.some(x=>x.toLowerCase()==='date'))throw Error('Нужна колонка date');
    return table.map(cols=>Object.fromEntries(heads.map((h,i)=>[h,cols[i]??''])));
  }
  $('mrImport').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>1024*1024*3)throw Error('Файл больше 3 МБ. Экспортируй данные частями.');
      const text=await file.text();
      const input=/\.json$/i.test(file.name)?JSON.parse(text):parseCSV(text);
      const records=Array.isArray(input)?input:(Array.isArray(input?.fitbitDaily)?input.fitbitDaily:null);
      if(!records||records.length>2000)throw Error('Нужна таблица до 2000 строк с колонкой date.');
      const valid=records.map(parseRecord).filter(Boolean);
      if(!valid.length)throw Error('Не удалось прочитать дневные показатели. Скачай CSV-шаблон.');
      if(!confirm('Добавить '+valid.length+' записей Fitbit в MyFit? Даты из файла заменят имеющиеся.'))return;
      valid.forEach(upsert);save();render();
      status('✓ Импортировано '+valid.length+' записей. Данные сохранены только в этом браузере.');
    }catch(error){status('Ошибка: '+(error?.message||'неверный файл'))}
    finally{event.target.value=''}
  });
  const badge=document.querySelector('.top .pill');
  if(badge)badge.textContent='8 недель · версия 1.8';
  render();
})();