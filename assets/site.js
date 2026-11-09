/* Source-informed reconstruction of the three-image comparison behaviour,
   based on the user's Kensington Bathrooms public code. No dependencies. */
(() => {
  'use strict';
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('primary-menu');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', e => {
      if(e.key==='Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); toggle.focus();
      }
    });
  }
  document.querySelectorAll('[data-compare]').forEach(compare => {
    const frame = compare.querySelector('[data-frame]');
    const ra = compare.querySelector('[data-range-a]');
    const rb = compare.querySelector('[data-range-b]');
    let a = Number(ra.value), b = Number(rb.value), dragging = null;
    const gap = 4;
    function draw() {
      compare.style.setProperty('--a', `${a}%`);
      compare.style.setProperty('--b', `${b}%`);
      ra.value = Math.round(a);
      rb.value = Math.round(b);
    }
    function setA(x) {a=Math.max(0, Math.min(b-gap,x));draw();}
    function setB(x) {b=Math.max(a+gap,Math.min(100,x));draw();}
    ra.addEventListener('input',()=>setA(Number(ra.value)));
    rb.addEventListener('input',()=>setB(Number(rb.value)));
    function pct(e) {const r=frame.getBoundingClientRect();return (e.clientX-r.left)/r.width*100;}
    frame.addEventListener('pointerdown', e => {
      if(e.target.closest('button,video'))return;
      const x=pct(e);
      dragging=Math.abs(x-a)<=Math.abs(x-b)?'a':'b';
      (dragging==='a'?setA:setB)(x);
      try{frame.setPointerCapture(e.pointerId);}catch(_){}
    });
    frame.addEventListener('pointermove',e=>{
      if(!dragging)return;
      (dragging==='a'?setA:setB)(pct(e));
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])frame.addEventListener(name,()=>dragging=null);
    const play=compare.querySelector('[data-video]');
    if(play)play.addEventListener('click',()=>{
      if(frame.querySelector('video'))return;
      const vid=document.createElement('video');
      vid.src=play.dataset.video;if(play.dataset.poster)vid.poster=play.dataset.poster;vid.controls=true;vid.playsInline=true;vid.preload='metadata';
      vid.setAttribute('playsinline','');
      const close=document.createElement('button');
      close.type='button'; close.className='video-close'; close.textContent='×'; close.setAttribute('aria-label','Close finished-room video');
      const done=()=>{vid.pause();vid.removeAttribute('src');vid.load();vid.remove();close.remove();play.hidden=false;play.focus();};
      close.addEventListener('click',done);
      play.hidden=true;frame.append(vid,close);
      const result=vid.play();if(result?.catch)result.catch(()=>{});
    });
  });
})();

/* gentle scroll-in: content stays visible if this never runs */
(function(){
  if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var els=document.querySelectorAll('main .section > .shell > *');
  if(!els.length)return;
  document.documentElement.classList.add('rv-on');
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -6% 0px'});
  els.forEach(function(el){el.classList.add('rv');io.observe(el);});
})();
/* gallery filter + tap to enlarge */
(function(){
  var btns=document.querySelectorAll('.g-filter');if(!btns.length)return;
  btns.forEach(function(b){b.addEventListener('click',function(){
    btns.forEach(function(x){x.classList.toggle('on',x===b);});
    var f=b.dataset.filter;
    document.querySelectorAll('.g-item').forEach(function(it){it.hidden=!(f==='All'?!it.classList.contains('g-empty'):it.dataset.cat===f);});
  });});
  document.querySelectorAll('.g-item.g-empty').forEach(function(it){it.hidden=true;});
  document.addEventListener('click',function(e){
    var img=e.target.closest('.g-item:not(.g-empty) img');if(!img)return;
    var box=document.createElement('div');box.className='g-box';var big=document.createElement('img');big.src=img.currentSrc||img.src;big.alt=img.alt;box.appendChild(big);
    function close(){box.remove();document.removeEventListener('keydown',key);}
    function key(ev){if(ev.key==='Escape')close();}
    box.addEventListener('click',close);document.addEventListener('keydown',key);document.body.appendChild(box);
  });
})();

/* mobile menu: open/close each group */
document.querySelectorAll('.sub-toggle').forEach(function(b){b.addEventListener('click',function(){var it=b.parentElement;var o=it.classList.toggle('open');b.setAttribute('aria-expanded',o);});});

/* staggered reveals for grids */
(function(){
  if(!document.documentElement.classList.contains('rv-on'))return;
  var groups=document.querySelectorAll('.service-grid,.projects-grid,.steps,.svc-columns,.g-grid,.team-mini,.area-chip-list,.svc-page,.cards,.timeline,.layers,.calc-out');
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -5% 0px'});
  groups.forEach(function(g){var p=g.closest('.rv');if(p){p.classList.remove('rv');p.classList.add('in');}
    Array.prototype.forEach.call(g.children,function(c,i){c.classList.add('rv-kid');c.style.setProperty('--i',Math.min(i,8));io.observe(c);});});
})();
/* header tucks away on scroll down, WhatsApp bar slides in, reading progress line, slider hint */
(function(){
  var h=document.querySelector('.site-header'),wa=document.querySelector('.sticky-whatsapp'),pr=document.querySelector('.progress');
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,last=scrollY,ticking=false;
  if(wa)document.documentElement.classList.add('js-wa');
  function upd(){
    var y=scrollY,max=document.documentElement.scrollHeight-innerHeight;
    if(h&&!reduce){var open=document.querySelector('#primary-menu.open');h.classList.toggle('tuck',!open&&y>last&&y>160);}
    if(wa)wa.classList.toggle('show',y>innerHeight*.6);
    if(pr)pr.style.transform='scaleX('+(max>0?Math.min(1,y/max):0)+')';
    last=y;ticking=false;
  }
  addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(upd);}},{passive:true});upd();
  if('IntersectionObserver' in window&&!reduce){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('hint');io.unobserve(e.target);}});},{threshold:.6});
    document.querySelectorAll('.compare').forEach(function(c){io.observe(c);});
  }
})();
/* services list closed by default on phones */
(function(){if(matchMedia('(max-width:700px)').matches)document.querySelectorAll('.svc-acc').forEach(function(d){d.removeAttribute('open');});})();
/* tile calculator */
(function(){document.querySelectorAll('[data-calc]').forEach(function(c){
  function v(k){var e=c.querySelector('[data-c="'+k+'"]');return parseFloat(e&&e.value)||0;}
  function run(){var a=v('l')*v('w'),o=a*(1+v('x')/100),t=(v('tl')*v('tw'))/10000,n=t>0?Math.ceil(o/t):0;
    c.querySelector('[data-o="a"]').textContent=a.toFixed(2)+' m²';c.querySelector('[data-o="o"]').textContent=o.toFixed(2)+' m²';c.querySelector('[data-o="n"]').textContent=n;}
  c.addEventListener('input',run);run();});})();
/* new pages always open at the top (unless going Back, or a link points to a section) */
(function(){try{var n=performance.getEntriesByType('navigation')[0];if(location.hash||(n&&n.type==='back_forward'))return;
if('scrollRestoration' in history)history.scrollRestoration='manual';window.scrollTo(0,0);addEventListener('load',function(){if(scrollY>0&&!location.hash)window.scrollTo(0,0);});}catch(e){}})();

/* Google Ads: count WhatsApp taps as conversions (same as the previous site's assets/js/site.js; only runs after cookie consent) */
(function () {
  "use strict";
  var DIRECT_WHATSAPP = "AW-18401275072/KIa5CNT-oPAcEMDZtMZE";
  if (document.documentElement.dataset.adsWhatsAppBound) return;
  document.documentElement.dataset.adsWhatsAppBound = "true";
  document.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    var link = target && target.closest('a[href*="wa.me/"]');
    if (!link) return;
    if (!(window.EnsuitePrivacy && window.EnsuitePrivacy.hasOptionalConsent && window.EnsuitePrivacy.hasOptionalConsent())) return;
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", { send_to: DIRECT_WHATSAPP });
  }, { capture: true });
})();
