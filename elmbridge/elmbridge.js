(function () {
  'use strict';
  const conversions = {
    enquiryHandoff: 'AW-18401275072/G6_DCNH-oPAcEMDZtMZE',
    directWhatsApp: 'AW-18401275072/KIa5CNT-oPAcEMDZtMZE'
  };
  function track(destination) {
    if (typeof window.gtag === 'function') window.gtag('event', 'conversion', {send_to: destination});
  }
  const button = document.getElementById('localMenuButton');
  const menu = document.getElementById('localMobileMenu');
  const closeMenu = () => {
    if (!menu || !button) return;
    menu.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  };
  button?.addEventListener('click', () => {
    button.setAttribute('aria-expanded', String(menu.classList.toggle('open')));
  });
  menu?.addEventListener('click', (event) => {if (event.target.closest('a')) closeMenu();});
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu?.classList.contains('open')) {closeMenu(); button.focus();}
  });
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href*="wa.me/"]');
    if (link && !link.hasAttribute('data-enquiry-handoff')) track(conversions.directWhatsApp);
  });
  const form = document.getElementById('localEnquiryForm');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const message = [
      'Hello, I would like to discuss an Elmbridge / Surrey project.',
      `Name: ${String(data.get('name') || '').trim()}`,
      `Area/postcode: ${String(data.get('postcode') || '').trim()}`,
      `Project: ${data.get('project') || 'Not sure yet'}`,
      `Budget: ${data.get('budget') || 'Not decided'}`,
      `Details: ${String(data.get('details') || '').trim()}`,
      `Enquiry from: ${location.origin}${location.pathname}`
    ].join('\n');
    const url = `https://wa.me/442073860000?text=${encodeURIComponent(message)}`;
    const status = document.getElementById('localFormStatus');
    status.replaceChildren(document.createTextNode('Your message is prepared. Review it and press Send in WhatsApp. '));
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('data-enquiry-handoff', 'true');
    link.textContent = 'Open your WhatsApp enquiry';
    status.appendChild(link);
    status.hidden = false;
    // Reuse the existing form-handoff conversion; this does not confirm a message was sent.
    track(conversions.enquiryHandoff);
    window.open(url, '_blank', 'noopener');
  });
})();
