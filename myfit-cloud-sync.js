/* MyFit 1.9 — protected Google Health connection and automatic sync on opening MyFit.
 * No Google OAuth tokens enter the browser. Data already saved in MyFit is preserved. */
(() => {
  'use strict';
  if (typeof state === 'undefined' || typeof save !== 'function') return;
  const report = document.getElementById('myfit-report');
  if (!report) return;
  const keyName = 'myfit_health_bridge_settings_v1';
  const esc = s => String(s || '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const outer=document.createElement('section');
  outer.className='mf-report-card';outer.id='myfit-cloud-bridge';
  outer.innerHTML=`
    <h3>🔄 Fitbit Air — автосинхронизация</h3>
    <p class="mf-report-note">Защищённое подключение Google Health. При открытии MyFit обновляются шаги, сон и доступные показатели пульса. Данные старых тренировок не затрагиваются.</p>
    <p id="mcsStatus" role="status" class="mf-report-note">⚪ Не настроено</p>
    <label class="mf-report-field">Адрес сервера MyFit (Cloud Run)
      <input id="mcsServer" type="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="https://...run.app">
    </label>
    <label class="mf-report-field" style="margin-top:12px">Личный ключ доступа (не Google Client Secret)
      <input id="mcsKey" type="password" autocomplete="off" spellcheck="false" placeholder="Случайный ключ из Secret Manager">
    </label>
    <div class="mf-report-btns">
      <button type="button" class="btn secondary" id="mcsSave">Сохранить настройки</button>
      <button type="button" class="btn" id="mcsConnect">Подключить Google</button>
      <button type="button" class="btn secondary" id="mcsSync">Синхронизировать</button>
    </div>
    <div class="mf-report-btns">
      <button type="button" class="btn ghost" id="mcsDisconnect">Отключить Google</button>
      <button type="button" class="btn ghost" id="mcsForget">Забыть ключ на iPhone</button>
    </div>
    <p class="mf-report-note">Google Cloud Run нужно развернуть отдельно. Пока он не запущен, работай через уже доступный импорт JSON/CSV выше. Google Client Secret и токены сюда не вводи.</p>
  `;
  report.appendChild(outer);
  const $ = id=>document.getElementById(id);
  const status = msg=>{$('mcsStatus').textContent=msg};
  let config={server:'',key:''};
  try{const saved=JSON.parse(localStorage.getItem(keyName)||'{}');if(saved&&typeof saved==='object')config={server:saved.server||'',key:saved.key||''}}catch{}
  $('mcsServer').value=config.server;$('mcsKey').value=config.key;
  const parseServer = input=>{
    const url=new URL(String(input||'').trim());
    if(url.protocol!=='https:'||!url.hostname.endsWith('.run.app')||url.username||url.password||url.pathname!=='/'||url.search||url.hash){
      throw new Error('Вставь HTTPS-адрес своего Cloud Run сервиса (*.run.app), без пути.');
    }
    return url.origin;
  };
  function capture(){
    const server=parseServer($('mcsServer').value),key=$('mcsKey').value.trim();
    if(key.length<32)throw new Error('Нужен личный ключ длиной не менее 32 символов.');
    config={server,key};
    localStorage.setItem(keyName,JSON.stringify(config));
    return config;
  }
  async function api(path,{method='GET'}={}){
    const c=capture();
    const response=await fetch(c.server+path,{
      method,headers:{Authorization:'Bearer '+c.key},mode:'cors',cache:'no-store'
    });
    let result={};try{result=await response.json()}catch{}
    if(!response.ok){const problem=result.error||'HTTP '+response.status;
      if(problem==='NOT_CONNECTED')throw Error('Google Health ещё не подключён. Нажми «Подключить Google».');
      if(problem==='BAD_KEY')throw Error('Неверный личный ключ доступа к серверу.');
      if(problem==='RECONNECT_REQUIRED')throw Error('Google требует повторное разрешение. Подключи Google ещё раз.');
      throw Error('Сервер: '+problem);
    }
    return result;
  }
  function mergeDaily(records){
    state.fitbitDaily ||= [];
    let changed=0;
    for(const remote of records||[]){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(remote?.date))continue;
      const index=state.fitbitDaily.findIndex(x=>x.date===remote.date);
      const previous=index<0?{date:remote.date}:{...state.fitbitDaily[index]};
      let hasValue=false;
      for(const field of ['steps','sleepHours','restingHr','hrv','activeMinutes']){
        if(remote[field]!==null && remote[field]!==undefined && Number.isFinite(Number(remote[field]))){
          previous[field]=Number(remote[field]);hasValue=true;
        }
      }
      if(!hasValue)continue;
      if(index<0)state.fitbitDaily.push(previous);else state.fitbitDaily[index]=previous;
      changed++;
    }
    if(changed){state.fitbitDaily.sort((a,b)=>a.date.localeCompare(b.date));save()}
    return changed;
  }
  async function checkAndSync(force=false){
    if(!config.server||!config.key){status('⚪ Сервер пока не настроен. Ручной импорт работает.');return}
    try{
      status('🔄 Проверяем соединение с Google Health…');
      const s=await api('/api/status');
      if(!s.connected){status('🟡 Сервер доступен. Нажми «Подключить Google».');return}
      status('🔄 Получаем дневные данные Fitbit…');
      const data=await api('/api/daily'+(force?'?refresh=1':''));
      const amount=mergeDaily(data.data||[]);
      const lastSync=data.lastSync?new Date(data.lastSync).toLocaleString('ru-RU'):'нет';
      status((data.warning?'⚠️ '+data.warning+'. ':'✅ Данные обновлены. ')+
        'Записей: '+amount+'. Последняя синхронизация: '+lastSync+'.');
      if(force){
        const tab=document.querySelector('.tab[data-tab="myfit-report"]');
        if(tab?.classList.contains('active'))tab.click();
      }
    }catch(e){status('⚠️ '+(e?.message||'Ошибка подключения')+' — прежние записи сохранены.');}
  }
  $('mcsSave').onclick=()=>{
    try{capture();status('✅ Настройки сохранены только в этом браузере.');checkAndSync()}
    catch(e){status('⚠️ '+e.message)}
  };
  $('mcsConnect').onclick=async()=>{
    try{
      status('🔄 Запрашиваем безопасную страницу согласия Google…');
      const r=await api('/auth/start',{method:'POST'});
      if(!r?.url?.startsWith('https://accounts.google.com/'))throw Error('Некорректный адрес авторизации Google.');
      location.assign(r.url);
    }catch(e){status('⚠️ '+e.message)}
  };
  $('mcsSync').onclick=()=>checkAndSync(true);
  $('mcsDisconnect').onclick=async()=>{
    if(!confirm('Отключить Google Health на сервере? Уже сохранённые показатели MyFit останутся.'))return;
    try{await api('/api/disconnect',{method:'POST'});status('⚪ Google Health отключён. История MyFit сохранена.');}
    catch(e){status('⚠️ '+e.message)}
  };
  $('mcsForget').onclick=()=>{
    if(!confirm('Забыть адрес и личный ключ в этом браузере?'))return;
    localStorage.removeItem(keyName);config={server:'',key:''};$('mcsServer').value='';$('mcsKey').value='';
    status('⚪ Ключ удалён с этого устройства. Данные тренировок сохранены.');
  };
  if(location.hash==='#google-health-connected'){
    history.replaceState(null,'',location.pathname+location.search);
    status('✅ Google предоставил разрешение. Проверяем синхронизацию…');
  }
  const version=document.querySelector('.top .pill');
  if(version)version.textContent='8 недель · версия 1.9';
  if(config.server && config.key)checkAndSync();
})();