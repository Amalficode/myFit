/* MyFit 1.7 — наглядные иллюстрации упражнений.
   Подключать последним после myfit-focus.js. */
(() => {
  'use strict';
  if (typeof renderTraining !== 'function' || typeof plans === 'undefined') return;
  const filenames = {
    'Тяга верхнего блока':'lat-pulldown',
    'Горизонтальная тяга блока':'seated-row',
    'Ягодичный мост':'glute-bridge',
    'Жим ногами':'leg-press',
    'Сгибание рук с гантелями':'biceps-curl',
    'Птица-собака':'bird-dog',
    'Присед с гантелью':'goblet-squat',
    'Румынская тяга с гантелями':'romanian-deadlift',
    'Жим от груди в тренажёре':'chest-press',
    'Жим гантелей сидя':'shoulder-press',
    'Разгибание рук на блоке':'triceps-pushdown',
    'Dead bug':'dead-bug',
    'Зашагивания на платформу':'step-up',
    'Сгибание ног в тренажёре':'leg-curl',
    'Разведение гантелей в стороны':'lateral-raise',
    'Обратная бабочка':'reverse-fly',
    'Боковая планка':'side-plank',
    'Разведение ног в тренажёре':'hip-abduction',
    'Планка':'plank'
  };
  const style=document.createElement('style');
  style.textContent = [
    '.mf-photo{margin:12px 0 14px;padding:0;border-radius:15px;overflow:hidden;border:1px solid #e0e9e3;background:#f7f8f7}',
    '.mf-photo-frame{position:relative;aspect-ratio:4/3;overflow:hidden;background:#f7f8f7}',
    '.mf-photo-frame img{position:absolute;left:50%;top:50%;display:block;width:100%;height:auto;transform:translate(-50%,-50%) scale(2.35)}',
    '.mf-photo[data-slug="plank"] .mf-photo-frame{aspect-ratio:2.8/1}',
    '.mf-photo[data-slug="plank"] .mf-photo-frame img{transform:translate(-50%,-50%) scale(1.55)}',
    '.mf-photo figcaption{color:#60766c;padding:7px 11px;background:white;font-size:12px;line-height:1.4}'
  ].join('\n');
  document.head.appendChild(style);
  const original=renderTraining;
  renderTraining=function() {
    original();
    const list=document.querySelectorAll('#exerciseList .exercise');
    const selected=plans[state.current];
    list.forEach((card,index)=>{
      const name=selected?.ex?.[index]?.[0]||'';
      const slug=filenames[name];
      if (!slug) return;
      card.querySelector('.exercise-preview')?.remove();
      card.querySelector('.preview-label')?.remove();
      card.querySelector('.mf-photo')?.remove();
      const figure=document.createElement('figure');
      figure.className='mf-photo';
      figure.dataset.slug=slug;
      const img=document.createElement('img');
      img.src='./images/'+slug+'.svg';
      img.alt='Иллюстрация упражнения: '+name;
      img.loading='lazy';
      img.decoding='async';
      img.onerror=()=>{figure.hidden=true};
      const frame=document.createElement('div');
      frame.className='mf-photo-frame';
      frame.appendChild(img);
      figure.appendChild(frame);
      const caption=document.createElement('figcaption');
      caption.textContent='Иллюстрация техники · ориентируйся на подсказку и видео ниже';
      figure.appendChild(caption);
      card.querySelector('.ex-detail')?.closest('.row')?.insertAdjacentElement('afterend',figure);
    });
  };
  renderTraining();
})();