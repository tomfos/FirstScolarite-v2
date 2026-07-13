/* Page de paiement hébergée — vanilla JS. Lit id + cs depuis l'URL, appelle /checkout/api,
   affiche les moyens proposés (filtrés par l'application) et suit le statut jusqu'au final.
   Communique le résultat à la fenêtre parente (widget iframe) via postMessage. */
(function () {
  const parts = location.pathname.split('/');
  const paymentId = parts[parts.length - 1];
  const cs = new URLSearchParams(location.search).get('cs');
  const api = '/checkout/api/' + paymentId;
  const MOBILE = new Set(['orange', 'mtn']);

  let selected = null, view = null;

  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id).classList.remove('hidden');
  const hide = (id) => $(id).classList.add('hidden');

  function post(msg) { try { if (window.parent !== window) window.parent.postMessage({ source: 'payhub', ...msg }, '*'); } catch (e) {} }

  function fmt(amount, currency) {
    try { return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + (currency || 'XAF'); }
    catch (e) { return amount + ' ' + (currency || ''); }
  }

  async function load() {
    const res = await fetch(api + '?cs=' + encodeURIComponent(cs));
    if (!res.ok) { fail('Lien de paiement invalide ou expiré.'); return; }
    view = await res.json();
    applyBrand(view.application);
    if (view.status && view.status !== 'PENDING') { finalState(view.status, null); return; }
    render();
  }

  function applyBrand(app) {
    if (!app) return;
    document.title = 'Paiement — ' + (app.name || '');
    $('appName').textContent = app.name || 'Paiement';
    if (app.brandColor) document.documentElement.style.setProperty('--brand', app.brandColor);
    if (app.logoUrl) $('logo').innerHTML = '<img src="' + app.logoUrl + '" alt="">';
  }

  function render() {
    hide('loading'); show('form');
    $('amount').textContent = fmt(view.amount, view.currency);
    $('ref').textContent = view.reference ? ('Réf. ' + view.reference) : '';
    const box = $('methods'); box.innerHTML = '';
    if (!view.methods || !view.methods.length) { box.innerHTML = '<p style="color:var(--muted)">Aucun moyen de paiement disponible.</p>'; return; }
    view.methods.forEach((m) => {
      const el = document.createElement('div');
      el.className = 'method';
      el.innerHTML = '<span class="dot">' + (m.code || '').slice(0, 2) + '</span><span>' + m.label + '</span>';
      el.onclick = () => selectMethod(m, el);
      box.appendChild(el);
    });
  }

  function selectMethod(m, el) {
    selected = m;
    document.querySelectorAll('.method').forEach((x) => x.classList.remove('sel'));
    el.classList.add('sel');
    if (MOBILE.has(m.code)) show('phoneBox'); else hide('phoneBox');
    $('payBtn').disabled = false;
  }

  $('payBtn').onclick = async function () {
    if (!selected) return;
    const msisdn = $('msisdn').value.trim();
    if (MOBILE.has(selected.code) && msisdn.length < 9) { $('msisdn').focus(); return; }
    hide('form'); show('processing');
    $('procHint').textContent = MOBILE.has(selected.code)
      ? 'Validez la demande sur votre téléphone.' : 'Traitement en cours…';
    try {
      const res = await fetch(api + '/pay?cs=' + encodeURIComponent(cs), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: selected.code, payerMsisdn: msisdn })
      });
      const data = await res.json();
      if (data.status === 'HOSTED') return startHosted(data.hosted);
      if (data.status === 'PENDING') poll(); else finalState(data.status, data.failureReason);
    } catch (e) { finalState('FAILED', 'Erreur réseau'); }
  };

  /* Moyen hébergé (ex. carte MPGS) : charge le script du PSP et affiche son formulaire.
     À la fin, le PSP redirige cette page vers /checkout/{id}/return qui finalise et notifie. */
  function startHosted(h) {
    if (!h || h.provider !== 'mpgs') { finalState('FAILED', 'Moyen hébergé non supporté'); return; }
    hide('processing'); show('hosted');
    window.payhubHostedError = function () { finalState('FAILED', 'Paiement carte refusé'); };
    window.payhubHostedCancel = function () { hide('hosted'); show('form'); };
    var s = document.createElement('script');
    s.src = h.scriptUrl;
    s.setAttribute('data-error', 'payhubHostedError');
    s.setAttribute('data-cancel', 'payhubHostedCancel');
    s.onload = function () {
      try {
        Checkout.configure({ session: { id: h.sessionId } });
        Checkout.showEmbeddedPage('#mpgs-embed');
      } catch (e) { finalState('FAILED', 'Initialisation carte impossible'); }
    };
    s.onerror = function () { finalState('FAILED', 'Chargement du module carte impossible'); };
    document.head.appendChild(s);
  }

  let tries = 0;
  async function poll() {
    if (tries++ > 40) { finalState('PENDING', 'Délai dépassé — vérifiez plus tard.'); return; }
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await fetch(api + '/status?cs=' + encodeURIComponent(cs));
      const data = await res.json();
      if (data.status === 'PENDING') poll(); else finalState(data.status, data.failureReason);
    } catch (e) { poll(); }
  }

  function finalState(status, reason) {
    hide('form'); hide('processing'); show('done');
    const ok = status === 'SUCCESS';
    $('doneIcon').textContent = ok ? '✅' : (status === 'PENDING' ? '⏳' : '❌');
    $('doneTitle').textContent = ok ? 'Paiement réussi' : (status === 'PENDING' ? 'En attente' : 'Paiement échoué');
    $('doneMsg').textContent = ok ? 'Merci, votre paiement a été confirmé.' : (reason || 'Le paiement n’a pas abouti.');
    post({ type: 'payment', status: status, paymentId: paymentId });
    if (view && view.returnUrl) {
      const btn = $('returnBtn'); btn.classList.remove('hidden');
      btn.onclick = () => { post({ type: 'close', status: status }); location.href = view.returnUrl; };
    }
  }

  function fail(msg) { hide('loading'); show('done'); $('doneIcon').textContent = '⚠️'; $('doneTitle').textContent = 'Indisponible'; $('doneMsg').textContent = msg; }

  load();
})();
