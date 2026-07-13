
(function(){
 const btn=document.getElementById('menuButton'),menu=document.getElementById('mobileMenu');
 if(btn&&menu)btn.addEventListener('click',()=>{menu.classList.toggle('open');btn.setAttribute('aria-expanded',menu.classList.contains('open'))});
 const modal=document.getElementById('offerModal'), open=document.getElementById('offerOpen'), close=document.getElementById('offerClose');
 if(modal&&open){open.addEventListener('click',()=>modal.classList.add('open'));if(close)close.addEventListener('click',()=>modal.classList.remove('open'));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')})}
 const form=document.getElementById('enquiryForm');
 if(form)form.addEventListener('submit',function(e){e.preventDefault();const d=new FormData(form);const text=['Hello, I would like to discuss a project.','Name: '+(d.get('name')||''),'Area/postcode: '+(d.get('postcode')||''),'Project: '+(d.get('project')||''),'Budget: '+(d.get('budget')||''),'Details: '+(d.get('details')||'')].join('\n');window.open('https://wa.me/442073860000?text='+encodeURIComponent(text),'_blank','noopener')});
 const calc=document.getElementById('rentCalculator');
 if(calc)calc.addEventListener('submit',function(e){e.preventDefault();const current=Number(document.getElementById('currentRent').value||0),ensuite=Number(document.getElementById('ensuiteRent').value||0),cost=Number(document.getElementById('installCost').value||0),monthly=Math.max(0,ensuite-current),annual=monthly*12,five=annual*5,payback=annual>0?cost/annual:0;document.getElementById('calcMonthly').textContent='£'+monthly.toLocaleString();document.getElementById('calcAnnual').textContent='£'+annual.toLocaleString();document.getElementById('calcFive').textContent='£'+five.toLocaleString();document.getElementById('calcPayback').textContent=payback?payback.toFixed(1)+' years':'—';document.getElementById('calcResults').hidden=false});
})();
