
(function(){
 const addEstimatorNavigation=()=>{
  if(document.querySelector('[data-estimator-nav]'))return;
  const makeLink=(classes='')=>{const link=document.createElement('a');link.href='/estimator/';link.textContent='Estimator';link.dataset.estimatorNav='';if(classes)link.className=classes;return link};
  const classicDesktop=document.querySelector('.desktop-nav');
  if(classicDesktop){const link=makeLink();const enquire=classicDesktop.querySelector('.nav-cta');classicDesktop.insertBefore(link,enquire||null)}
  const modernDesktop=[...document.querySelectorAll('header nav')].find(nav=>nav.className.includes('lg:flex'));
  if(modernDesktop&&!modernDesktop.querySelector('[data-estimator-nav]')){const sample=modernDesktop.querySelector('a');const link=makeLink(sample?.className||'');const enquire=[...modernDesktop.querySelectorAll('a')].find(item=>item.getAttribute('href')?.includes('#contact'));modernDesktop.insertBefore(link,enquire||null)}
  const mobile=document.getElementById('mobileMenu');
  if(mobile&&!mobile.querySelector('[data-estimator-nav]')){const nav=mobile.querySelector('nav')||mobile;const sample=nav.querySelector('a');const link=makeLink(sample?.className||'');const actions=nav.querySelector('.mobile-actions, .flex.gap-3');nav.insertBefore(link,actions||null)}
 };
 addEstimatorNavigation();
 const btn=document.getElementById('menuButton'),menu=document.getElementById('mobileMenu');
 if(btn&&menu)btn.addEventListener('click',()=>{menu.classList.toggle('open');btn.setAttribute('aria-expanded',menu.classList.contains('open'))});
 const modal=document.getElementById('offerModal'), open=document.getElementById('offerOpen'), close=document.getElementById('offerClose');
 if(modal&&open){open.addEventListener('click',()=>modal.classList.add('open'));if(close)close.addEventListener('click',()=>modal.classList.remove('open'));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')})}
 const form=document.getElementById('enquiryForm');
 if(form)form.addEventListener('submit',function(e){e.preventDefault();const d=new FormData(form);const text=['Hello, I would like to discuss a project.','Name: '+(d.get('name')||''),'Area/postcode: '+(d.get('postcode')||''),'Project: '+(d.get('project')||''),'Budget: '+(d.get('budget')||''),'Details: '+(d.get('details')||'')].join('\n');window.open('https://wa.me/442073860000?text='+encodeURIComponent(text),'_blank','noopener')});
 const calc=document.getElementById('rentCalculator');
 if(calc)calc.addEventListener('submit',function(e){e.preventDefault();const current=Number(document.getElementById('currentRent').value||0),ensuite=Number(document.getElementById('ensuiteRent').value||0),cost=Number(document.getElementById('installCost').value||0),monthly=Math.max(0,ensuite-current),annual=monthly*12,five=annual*5,payback=annual>0?cost/annual:0;document.getElementById('calcMonthly').textContent='£'+monthly.toLocaleString();document.getElementById('calcAnnual').textContent='£'+annual.toLocaleString();document.getElementById('calcFive').textContent='£'+five.toLocaleString();document.getElementById('calcPayback').textContent=payback?payback.toFixed(1)+' years':'—';document.getElementById('calcResults').hidden=false});
})();
