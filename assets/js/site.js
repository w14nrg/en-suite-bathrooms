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

 const addGoogleMapAndReviews=()=>{
  if(document.querySelector('[data-google-proof]'))return;
  const heading=[...document.querySelectorAll('h2')].find(item=>item.textContent.trim()==='287 Munster Road, Fulham');
  const section=heading?.closest('section');
  const split=section?.querySelector('.wrap.split');
  if(!section||!split)return;

  const profileUrl='https://share.google/QFVpxoFee1432NcWg';
  const mapUrl='https://www.google.com/maps?q=En-Suites+%26+Bathrooms+Ltd%2C+287+Munster+Road%2C+London+SW6+6BW&output=embed';

  if(!document.getElementById('googleProofStyles')){
   const style=document.createElement('style');
   style.id='googleProofStyles';
   style.textContent=`
    .google-proof{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(360px,.88fr);gap:clamp(24px,4vw,52px);align-items:stretch}
    .google-map-card,.google-reviews-panel{background:#fff;border:1px solid rgba(212,175,55,.28);border-radius:28px;overflow:hidden;box-shadow:0 20px 55px rgba(20,20,20,.08)}
    .google-map-card{position:relative;min-height:500px}
    .google-map-card iframe{display:block;width:100%;height:100%;min-height:500px;border:0}
    .google-map-link{position:absolute;left:18px;bottom:18px;display:inline-flex;align-items:center;gap:9px;padding:12px 17px;border-radius:999px;background:#fff;color:#202124;font-weight:700;box-shadow:0 8px 28px rgba(0,0,0,.2);text-decoration:none}
    .google-map-link:hover{color:#9a7517;transform:translateY(-1px)}
    .google-reviews-panel{padding:clamp(28px,4vw,48px);display:flex;flex-direction:column;justify-content:center;min-width:0}
    .google-reviews-panel h2{margin-bottom:10px}
    .google-reviews-intro{color:#686868;line-height:1.7;margin:0 0 24px}
    .google-review-window{overflow:hidden;position:relative}
    .google-review-track{display:flex;transition:transform .55s ease;will-change:transform}
    .google-review{min-width:100%;padding:4px 2px}
    .google-review-card{border:1px solid rgba(212,175,55,.25);border-radius:22px;background:#fbf7f0;padding:28px;min-height:230px;display:flex;flex-direction:column;justify-content:center}
    .google-review-stars{color:#d4af37;letter-spacing:.13em;font-size:1.3rem;margin-bottom:18px;white-space:nowrap}
    .google-review-card h3{font-family:'Playfair Display',serif;font-size:clamp(1.55rem,2.6vw,2rem);font-weight:400;margin:0 0 12px}
    .google-review-card p{color:#606060;line-height:1.75;margin:0}
    .google-review-source{display:flex;align-items:center;gap:9px;margin-top:22px;color:#444;font-size:.92rem;font-weight:700}
    .google-review-source i{color:#4285f4}
    .google-review-controls{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:18px}
    .google-review-arrows{display:flex;gap:9px}
    .google-review-arrow{width:42px;height:42px;border-radius:50%;border:1px solid rgba(212,175,55,.4);background:#fff;color:#222;cursor:pointer;display:grid;place-items:center}
    .google-review-arrow:hover{background:#fbf7f0;color:#9a7517}
    .google-review-dots{display:flex;gap:8px;align-items:center}
    .google-review-dot{width:10px;height:10px;border-radius:50%;border:0;background:#d7d2c8;padding:0;cursor:pointer}
    .google-review-dot.is-active{background:#d4af37}
    .google-review-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:25px}
    .google-review-actions .btn{justify-content:center}
    @media (prefers-reduced-motion:reduce){.google-review-track{transition:none}}
    @media (max-width:900px){.google-proof{grid-template-columns:1fr}.google-map-card,.google-map-card iframe{min-height:390px}.google-reviews-panel{min-width:0}}
    @media (max-width:520px){.google-map-card,.google-reviews-panel{border-radius:22px}.google-map-card,.google-map-card iframe{min-height:340px}.google-reviews-panel{padding:26px 20px}.google-review-card{padding:24px 20px;min-height:250px}.google-map-link{left:12px;bottom:12px}.google-review-controls{align-items:flex-end}}
   `;
   document.head.appendChild(style);
  }

  split.className='wrap google-proof';
  split.dataset.googleProof='';
  split.innerHTML=`
   <div class="google-map-card">
    <iframe src="${mapUrl}" title="Google map showing En-Suites & Bathrooms Ltd at 287 Munster Road, Fulham" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
    <a class="google-map-link" href="${profileUrl}" target="_blank" rel="noopener"><i class="fa-solid fa-location-arrow" aria-hidden="true"></i> View on Google Maps</a>
   </div>
   <div class="google-reviews-panel">
    <p class="kicker">Customer feedback</p>
    <h2>5★ Google Reviews</h2>
    <p class="google-reviews-intro">Read customer feedback on our Google Business Profile.</p>
    <div class="google-review-window" aria-roledescription="carousel" aria-label="Featured Google reviews">
     <div class="google-review-track" data-review-track>
      <article class="google-review" aria-label="Google review 1 of 3">
       <div class="google-review-card">
        <div class="google-review-stars" aria-label="Five stars">★★★★★</div>
        <h3>Five-star customer feedback</h3>
        <p>Open our Google Business Profile to read this customer’s review in full.</p>
        <div class="google-review-source"><i class="fa-brands fa-google" aria-hidden="true"></i> Posted on Google</div>
       </div>
      </article>
      <article class="google-review" aria-label="Google review 2 of 3">
       <div class="google-review-card">
        <div class="google-review-stars" aria-label="Five stars">★★★★★</div>
        <h3>Five-star customer feedback</h3>
        <p>Open our Google Business Profile to read this customer’s review in full.</p>
        <div class="google-review-source"><i class="fa-brands fa-google" aria-hidden="true"></i> Posted on Google</div>
       </div>
      </article>
      <article class="google-review" aria-label="Google review 3 of 3">
       <div class="google-review-card">
        <div class="google-review-stars" aria-label="Five stars">★★★★★</div>
        <h3>Five-star customer feedback</h3>
        <p>Open our Google Business Profile to read this customer’s review in full.</p>
        <div class="google-review-source"><i class="fa-brands fa-google" aria-hidden="true"></i> Posted on Google</div>
       </div>
      </article>
     </div>
    </div>
    <div class="google-review-controls">
     <div class="google-review-arrows">
      <button class="google-review-arrow" type="button" data-review-prev aria-label="Previous review"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
      <button class="google-review-arrow" type="button" data-review-next aria-label="Next review"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
     </div>
     <div class="google-review-dots" aria-label="Choose review">
      <button class="google-review-dot is-active" type="button" data-review-dot="0" aria-label="Show review 1" aria-current="true"></button>
      <button class="google-review-dot" type="button" data-review-dot="1" aria-label="Show review 2"></button>
      <button class="google-review-dot" type="button" data-review-dot="2" aria-label="Show review 3"></button>
     </div>
    </div>
    <div class="google-review-actions">
     <a class="btn btn-gold" href="${profileUrl}" target="_blank" rel="noopener"><i class="fa-brands fa-google" aria-hidden="true"></i> Read our Google reviews</a>
     <a class="btn btn-light" href="tel:+442073860000"><i class="fa-solid fa-phone" aria-hidden="true"></i> Call 0207 386 0000</a>
    </div>
   </div>`;

  const track=split.querySelector('[data-review-track]');
  const dots=[...split.querySelectorAll('[data-review-dot]')];
  const previous=split.querySelector('[data-review-prev]');
  const next=split.querySelector('[data-review-next]');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current=0;
  let timer;
  const show=index=>{
   current=(index+3)%3;
   track.style.transform=`translateX(-${current*100}%)`;
   dots.forEach((dot,i)=>{dot.classList.toggle('is-active',i===current);if(i===current)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current')});
  };
  const start=()=>{if(!reduced){clearInterval(timer);timer=setInterval(()=>show(current+1),6000)}};
  previous.addEventListener('click',()=>{show(current-1);start()});
  next.addEventListener('click',()=>{show(current+1);start()});
  dots.forEach(dot=>dot.addEventListener('click',()=>{show(Number(dot.dataset.reviewDot));start()}));
  split.addEventListener('mouseenter',()=>clearInterval(timer));
  split.addEventListener('mouseleave',start);
  split.addEventListener('focusin',()=>clearInterval(timer));
  split.addEventListener('focusout',start);
  start();
 };

 addEstimatorNavigation();
 addGoogleMapAndReviews();
 const btn=document.getElementById('menuButton'),menu=document.getElementById('mobileMenu');
 if(btn&&menu)btn.addEventListener('click',()=>{menu.classList.toggle('open');btn.setAttribute('aria-expanded',menu.classList.contains('open'))});
 const modal=document.getElementById('offerModal'), open=document.getElementById('offerOpen'), close=document.getElementById('offerClose');
 if(modal&&open){open.addEventListener('click',()=>modal.classList.add('open'));if(close)close.addEventListener('click',()=>modal.classList.remove('open'));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')})}
 const form=document.getElementById('enquiryForm');
 if(form)form.addEventListener('submit',function(e){e.preventDefault();const d=new FormData(form);const text=['Hello, I would like to discuss a project.','Name: '+(d.get('name')||''),'Area/postcode: '+(d.get('postcode')||''),'Project: '+(d.get('project')||''),'Budget: '+(d.get('budget')||''),'Details: '+(d.get('details')||'')].join('\n');window.open('https://wa.me/442073860000?text='+encodeURIComponent(text),'_blank','noopener')});
 const calc=document.getElementById('rentCalculator');
 if(calc)calc.addEventListener('submit',function(e){e.preventDefault();const current=Number(document.getElementById('currentRent').value||0),ensuite=Number(document.getElementById('ensuiteRent').value||0),cost=Number(document.getElementById('installCost').value||0),monthly=Math.max(0,ensuite-current),annual=monthly*12,five=annual*5,payback=annual>0?cost/annual:0;document.getElementById('calcMonthly').textContent='£'+monthly.toLocaleString();document.getElementById('calcAnnual').textContent='£'+annual.toLocaleString();document.getElementById('calcFive').textContent='£'+five.toLocaleString();document.getElementById('calcPayback').textContent=payback?payback.toFixed(1)+' years':'—';document.getElementById('calcResults').hidden=false});
})();