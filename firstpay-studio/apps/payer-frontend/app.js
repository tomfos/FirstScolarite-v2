/*
 * Page payeur publique FirstStudioPay — app statique autonome (sans framework).
 * Parcours en 5 écrans, identique à l'aperçu du Studio :
 *   0 Identification · 1 Choix du montant · 2 Moyen de paiement · 3 Paiement · 4 Confirmation
 * Flux : résout /{shortCode}/{slug} via l'API publique, guide le payeur étape par étape,
 * initie le paiement (POST /pay) puis interroge le statut jusqu'à l'état final.
 * Toute la validation faisant autorité reste côté serveur ; ici on assiste la saisie.
 */
(function () {
  'use strict';

  var METHOD_LABELS = { orange: 'Orange Money', mtn: 'MTN MoMo', card: 'Carte bancaire', transfer: 'Virement bancaire' };
  var METHOD_BRAND = { orange: '#FF7900', mtn: '#FFCC00', card: '#2563EB', transfer: '#1F9D55' };
  var STEP_LABELS = ['Identification', 'Montant', 'Moyen', 'Paiement', 'Terminé'];

  var bodyEl = document.getElementById('body');
  var merchantEl = document.getElementById('merchant');
  var logoEl = document.getElementById('logo');

  var segs = window.location.pathname.split('/').filter(Boolean);
  var shortCode = segs[segs.length - 2];
  var slug = segs[segs.length - 1];

  var state = {
    data: null, step: 0,
    fields: {},            // fid -> valeur
    presetSel: {},         // id -> { on, custom }
    freeAmount: '',
    method: null,
    phone: '',
    error: '',
    paying: false,         // POST /pay en cours / polling
    payment: null,         // { transactionId, reference }
    result: null           // tx final
  };

  if (!shortCode || !slug) { renderError('Lien de paiement invalide.', 'Vérifiez l’adresse reçue.'); return; }

  fetch('/public/p/' + encodeURIComponent(shortCode) + '/' + encodeURIComponent(slug))
    .then(function (r) { if (r.status === 404) throw { handled: true }; if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then(function (data) { state.data = data; initDefaults(); applyBrand(data); render(); })
    .catch(function (e) {
      if (e && e.handled) renderError('Page de paiement introuvable', 'Ce lien n’existe pas ou n’est plus actif.');
      else renderError('Service indisponible', 'Réessayez dans un instant.');
    });

  function initDefaults() {
    var d = state.data;
    if (d.amountType === 'preset' && !d.multiSelect && d.presets && d.presets[0]) {
      state.presetSel[d.presets[0].id] = { on: true, custom: '' };
    }
    var em = enabledMethods();
    if (em.length) state.method = em[0];
  }

  /* --------------------------- helpers --------------------------- */
  function money(n) { return Number(n).toLocaleString('fr-FR'); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function enabledMethods() { var m = state.data.methods || {}; return Object.keys(m).filter(function (k) { return m[k]; }); }
  function isMM() { return state.method === 'orange' || state.method === 'mtn'; }
  function presetById(id) { return (state.data.presets || []).filter(function (p) { return p.id === id; })[0]; }
  function hasQr(m) { return !!((state.data.qrCodes || {})[m]); }

  function payableFor(p) {
    var sel = state.presetSel[p.id];
    if (p.allowPartial && sel && sel.custom !== '' && sel.custom != null) { var c = num(sel.custom); if (c > 0) return c; }
    return num(p.amount);
  }
  function selectedIds() { return Object.keys(state.presetSel).filter(function (k) { return state.presetSel[k].on; }).map(Number); }
  function computeTotal() {
    var d = state.data;
    if (d.amountType === 'fixed') return num(d.fixedAmount);
    if (d.amountType === 'free') return num(state.freeAmount);
    var t = 0; (d.presets || []).forEach(function (p) { var s = state.presetSel[p.id]; if (s && s.on) t += payableFor(p); });
    return t;
  }

  function applyBrand(d) {
    merchantEl.textContent = d.merchant.name || 'FirstStudioPay';
    if (d.merchant.brandColor) document.documentElement.style.setProperty('--fp', d.merchant.brandColor);
    if (d.merchant.logoUrl) { logoEl.innerHTML = ''; var img = document.createElement('img'); img.src = d.merchant.logoUrl; img.alt = ''; logoEl.appendChild(img); }
    else logoEl.textContent = (d.merchant.shortCode || 'FSP').slice(0, 4).toUpperCase();
    document.title = 'Payer · ' + (d.name || d.merchant.name);
  }

  function fieldPlaceholder(f) {
    if (f.readonly) return 'Auto-rempli';
    if (f.type === 'select') return 'Choisir…';
    if (f.type === 'date') return 'JJ/MM/AAAA';
    if (f.type === 'phone') return '+237 6XX XX XX XX';
    return 'Saisir…';
  }

  /* --------------------------- rendu global --------------------------- */
  function render() {
    var d = state.data;
    var h = '';

    // Titre + description (visibles sur les écrans de saisie)
    h += '<div class="iname">' + esc(d.name || '') + '</div>';
    if (d.description && state.step < 4) h += '<div class="idesc">' + esc(d.description) + '</div>';

    // Barre de progression 5 étapes
    h += renderSteps();

    // Corps de l'étape
    if (state.result || (state.step === 4)) h += renderConfirmation();
    else if (state.paying) h += renderPending();
    else {
      h += '<div class="stepbody">' + renderStep(state.step) + '</div>';
      if (state.error) h += '<div class="err" style="display:block">' + esc(state.error) + '</div>';
      h += renderFooter();
    }

    bodyEl.innerHTML = h;
    bindStep();
    animateView();
  }

  /* --------------------------- animations GSAP --------------------------- */
  // Toutes les animations sont optionnelles : si GSAP n'est pas chargé, la page
  // fonctionne normalement (dégradation gracieuse).
  function animateView() {
    var g = window.gsap;
    if (!g) return;

    // Confirmation finale — flourish de succès / échec
    if (state.result) {
      var ok = state.result.status === 'SUCCESS';
      var tl = g.timeline();
      tl.from('.ico', { scale: 0, opacity: 0, duration: 0.55, ease: 'back.out(1.8)' })
        .from('.rtitle', { y: 14, opacity: 0, duration: 0.32, ease: 'power2.out' }, '-=0.18')
        .from('.rsub', { y: 12, opacity: 0, duration: 0.32, ease: 'power2.out' }, '-=0.2')
        .from('.ref', { y: 10, opacity: 0, duration: 0.3, ease: 'power2.out' }, '-=0.16');
      if (bodyEl.querySelector('.ghost')) tl.from('.ghost', { opacity: 0, duration: 0.3 }, '-=0.1');
      if (ok) {
        // Onde de succès (ripple) via box-shadow — aucun DOM ajouté
        g.fromTo('.ico.ok',
          { boxShadow: '0 0 0 0 rgba(30,158,84,0.55)' },
          { boxShadow: '0 0 0 26px rgba(30,158,84,0)', duration: 1.2, ease: 'power2.out', delay: 0.25 });
        g.to('.ico.ok', { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1, delay: 0.55, ease: 'power1.inOut' });
      } else if (state.result.status === 'FAILED') {
        g.fromTo('.ico.ko', { x: -7 }, { x: 0, duration: 0.6, ease: 'elastic.out(1,0.35)', delay: 0.2 });
      }
      return;
    }

    // Écran d'attente
    if (state.paying) {
      g.from('.center', { opacity: 0, y: 12, duration: 0.4, ease: 'power2.out' });
      return;
    }

    // Étapes de saisie : entrée du contenu + pop de l'étape active
    g.from('.stepbody > *', { y: 16, opacity: 0, duration: 0.38, stagger: 0.06, ease: 'power2.out' });
    g.from('.stepfoot', { y: 10, opacity: 0, duration: 0.3, ease: 'power2.out', delay: 0.12 });
    g.from('.steps .stp.on .stp-dot', { scale: 0.4, duration: 0.4, ease: 'back.out(2.4)' });
  }

  function pulse(el) { if (window.gsap && el) window.gsap.fromTo(el, { scale: 0.96 }, { scale: 1, duration: 0.28, ease: 'back.out(2.2)' }); }

  function renderSteps() {
    var cur = state.result ? 4 : state.step;
    var h = '<div class="steps">';
    for (var i = 0; i < 5; i++) {
      var cls = i < cur ? 'done' : (i === cur ? 'on' : '');
      h += '<div class="stp ' + cls + '" data-step="' + i + '">'
        + '<span class="stp-dot">' + (i < cur ? '✓' : (i + 1)) + '</span>'
        + '<span class="stp-lbl">' + STEP_LABELS[i] + '</span></div>';
      if (i < 4) h += '<span class="stp-line ' + (i < cur ? 'done' : '') + '"></span>';
    }
    return h + '</div>';
  }

  function renderStep(step) {
    var d = state.data;
    if (step === 0) return renderIdentification();
    if (step === 1) return renderAmount();
    if (step === 2) return renderMethods();
    if (step === 3) return renderPay();
    return '';
  }

  /* --------- Étape 0 : Identification --------- */
  function renderIdentification() {
    var d = state.data, h = '';
    h += '<div class="lbl">Vos informations</div>';
    if (!d.customFields || d.customFields.length === 0) {
      h += '<div class="note">Aucune information n’est demandée. Vous pouvez passer à l’étape suivante.</div>';
      return h;
    }
    d.customFields.forEach(function (f) {
      var val = state.fields[f.id] != null ? state.fields[f.id] : '';
      h += '<div class="field"><label>' + esc(f.label) + (f.required && !f.readonly ? ' <span class="req">*</span>' : '') + '</label>';
      if (f.readonly) {
        h += '<input type="text" data-fid="' + f.id + '" disabled placeholder="Auto-rempli">';
      } else if (f.type === 'select') {
        h += '<select data-fid="' + f.id + '"><option value="">Choisir…</option>';
        (f.options || []).forEach(function (o) { h += '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; });
        h += '</select>';
      } else {
        var type = f.type === 'date' ? 'date' : (f.type === 'phone' ? 'tel' : 'text');
        h += '<input type="' + type + '" data-fid="' + f.id + '" value="' + esc(val) + '" placeholder="' + fieldPlaceholder(f) + '">';
      }
      h += '</div>';
    });
    return h;
  }

  /* --------- Étape 1 : Choix du montant --------- */
  function renderAmount() {
    var d = state.data, h = '';
    if (d.amountType === 'fixed') {
      h += '<div class="lbl">Montant à payer</div>';
      h += '<div class="amtbox"><div class="big">' + money(d.fixedAmount || 0) + ' <small>' + d.currency + '</small></div></div>';
    } else if (d.amountType === 'free') {
      h += '<div class="lbl">Saisissez le montant</div>';
      h += '<div class="freerow"><input type="number" id="freeAmount" inputmode="numeric" min="0" value="' + esc(state.freeAmount) + '" placeholder="0"><span>' + d.currency + '</span></div>';
      var hint = [];
      if (d.minAmount) hint.push('min ' + money(d.minAmount));
      if (d.maxAmount) hint.push('max ' + money(d.maxAmount));
      if (hint.length) h += '<div class="hint">' + hint.join(' · ') + ' ' + d.currency + '</div>';
    } else {
      h += '<div class="lbl">' + (d.multiSelect ? 'Cochez les frais à régler' : 'Choisissez une option') + '</div>';
      h += '<div class="presets" id="presets">' + presetsHtml() + '</div>';
      h += '<div class="total" id="totalBar" style="' + (computeTotal() > 0 ? 'display:flex' : 'display:none') + '">' + totalHtml() + '</div>';
    }
    return h;
  }

  function presetsHtml() {
    var d = state.data, html = '';
    (d.presets || []).forEach(function (p) {
      var sel = state.presetSel[p.id] || { on: false, custom: '' }, on = sel.on;
      html += '<div class="preset-wrap"><div class="preset' + (on ? ' on' : '') + '" data-id="' + p.id + '">'
        + '<span class="p-mark ' + (d.multiSelect ? 'box' : 'radio') + '">' + (on ? '✓' : '') + '</span>'
        + '<span class="p-label">' + esc(p.label || 'Montant')
        + (p.allowPartial ? '<em class="p-acompte">Acompte possible · min ' + money(p.minAmount || 0) + ' ' + d.currency + '</em>' : '')
        + '</span><b>' + money(p.amount) + ' ' + d.currency + '</b></div>';
      if (on && p.allowPartial) {
        html += '<div class="partial"><label>Montant à verser (' + d.currency + ')</label>'
          + '<input type="number" class="p-custom" data-id="' + p.id + '" inputmode="numeric" min="' + num(p.minAmount) + '" max="' + num(p.amount) + '" value="' + esc(sel.custom != null ? sel.custom : '') + '" placeholder="' + money(p.amount) + '">'
          + '<small>Min ' + money(p.minAmount || 0) + ' · complet ' + money(p.amount) + ' ' + d.currency + '</small></div>';
      }
      html += '</div>';
    });
    return html;
  }
  function totalHtml() {
    var d = state.data, count = selectedIds().length;
    return '<span>Total' + (d.multiSelect ? ' · ' + count + ' frais' : '') + '</span><b>' + money(computeTotal()) + ' ' + d.currency + '</b>';
  }

  /* --------- Étape 2 : Moyen de paiement --------- */
  function renderMethods() {
    var h = '<div class="lbl">Choisissez votre moyen</div><div class="methods col" id="methods">';
    enabledMethods().forEach(function (k) {
      var on = state.method === k, brand = METHOD_BRAND[k] || '#888';
      h += '<button class="mrow ' + (on ? 'on' : '') + '" data-m="' + k + '">'
        + '<span class="m-ic" style="background:' + brand + '18;color:' + brand + '">' + (METHOD_LABELS[k] || k).charAt(0) + '</span>'
        + '<span class="m-name">' + (METHOD_LABELS[k] || k) + '</span>'
        + (hasQr(k) ? '<span class="m-qr">QR</span>' : '') + '</button>';
    });
    return h + '</div>';
  }

  /* --------- Étape 3 : Paiement --------- */
  function renderPay() {
    var d = state.data, h = '';
    h += '<div class="paysum"><span>Montant à payer</span><b>' + money(computeTotal()) + ' ' + d.currency + '</b></div>';
    h += '<div class="lbl">' + (METHOD_LABELS[state.method] || 'Paiement') + '</div>';

    if (isMM()) {
      h += '<div class="field"><label>Numéro ' + (METHOD_LABELS[state.method] || '') + ' <span class="req">*</span></label>'
        + '<input type="tel" id="phone" inputmode="tel" value="' + esc(state.phone) + '" placeholder="+237 6XX XX XX XX"></div>';
      if (hasQr(state.method)) {
        h += '<div class="qrbox"><div class="qr-ph"></div><div class="hint" style="text-align:center">Scannez avec votre application ' + (METHOD_LABELS[state.method] || '') + ' ou validez la demande reçue par téléphone.</div></div>';
      } else {
        h += '<div class="note">Une demande de validation sera envoyée à ce numéro. Composez <b>#150*50#</b> et saisissez votre code secret pour confirmer.</div>';
      }
    } else if (state.method === 'transfer') {
      h += '<div class="panel">'
        + '<div class="prow"><span>Banque</span><b>Afriland First Bank</b></div>'
        + '<div class="prow"><span>Titulaire</span><b>' + esc(state.data.merchant.name) + '</b></div>'
        + '<div class="prow"><span>RIB</span><b class="mono">10005 00027 11122334455 17</b></div>'
        + '<div class="prow"><span>Montant</span><b>' + money(computeTotal()) + ' ' + d.currency + '</b></div></div>'
        + '<div class="note">Après validation, indiquez la référence fournie en motif du virement.</div>';
    } else if (state.method === 'card') {
      if (hasQr('card')) h += '<div class="qrbox"><div class="qr-ph"></div><div class="hint" style="text-align:center">Scannez le QR pour ouvrir le paiement sécurisé.</div></div>';
      else h += '<div class="note">Vous serez redirigé vers une page bancaire sécurisée 3D-Secure pour saisir votre carte.</div>';
    }
    return h;
  }

  /* --------- Écran d'attente (pendant le paiement) --------- */
  function renderPending() {
    return '<div class="center"><div class="spin"></div>'
      + '<div class="rtitle">Paiement en cours…</div>'
      + '<div class="rsub">Validez la demande sur votre téléphone si demandé.</div>'
      + (state.payment ? '<div class="ref">Réf. ' + esc(state.payment.reference) + '</div>' : '') + '</div>';
  }

  /* --------- Étape 4 : Confirmation --------- */
  function renderConfirmation() {
    var tx = state.result, d = state.data;
    if (!tx) return renderPending();
    var amt = tx.amount ? money(tx.amount) + ' ' + (tx.currency || d.currency || '') : '';
    var h = '<div class="center">';
    if (tx.status === 'SUCCESS') {
      h += '<div class="ico ok">✓</div><div class="rtitle">Paiement réussi</div>'
        + '<div class="rsub">Votre paiement' + (amt ? ' de <b>' + amt + '</b>' : '') + ' a été confirmé.</div>';
    } else if (tx.status === 'FAILED') {
      h += '<div class="ico ko">✕</div><div class="rtitle">Paiement échoué</div>'
        + '<div class="rsub">La transaction n’a pas abouti. Aucun montant n’a été débité.</div>';
    } else {
      h += '<div class="ico" style="background:#FFF7E6;color:#B7791F">⏳</div><div class="rtitle">Paiement en attente</div>'
        + '<div class="rsub">Le traitement prend plus de temps que prévu. Vous recevrez une confirmation.</div>';
    }
    if (tx.reference) h += '<div class="ref">Réf. ' + esc(tx.reference) + '</div>';
    if (tx.status === 'FAILED') h += '<br><button class="ghost" onclick="location.reload()">Réessayer</button>';
    return h + '</div>';
  }

  /* --------------------------- footer nav --------------------------- */
  function renderFooter() {
    var last = state.step === 3;
    var h = '<div class="stepfoot">';
    if (state.step > 0) h += '<button class="back" id="backBtn">‹ Précédent</button>';
    else h += '<span></span>';
    if (last) h += '<button class="pay" id="nextBtn">Payer ' + money(computeTotal()) + ' ' + state.data.currency + '</button>';
    else h += '<button class="pay" id="nextBtn">Continuer</button>';
    return h + '</div>';
  }

  /* --------------------------- bindings --------------------------- */
  function bindStep() {
    // Navigation par la barre d'étapes (retour arrière uniquement)
    qsa('.steps .stp').forEach(function (el) {
      el.addEventListener('click', function () {
        if (state.paying || state.result) return;
        var i = Number(el.getAttribute('data-step'));
        if (i < state.step) { state.error = ''; state.step = i; render(); }
      });
    });

    if (state.result || state.paying) return;

    var back = document.getElementById('backBtn');
    if (back) back.addEventListener('click', function () { state.error = ''; state.step--; render(); });
    var next = document.getElementById('nextBtn');
    if (next) next.addEventListener('click', onNext);

    // Champs d'identification
    qsa('[data-fid]').forEach(function (el) {
      el.addEventListener('input', function () { state.fields[el.getAttribute('data-fid')] = el.value; });
      el.addEventListener('change', function () { state.fields[el.getAttribute('data-fid')] = el.value; });
    });
    // Montant libre
    var fa = document.getElementById('freeAmount');
    if (fa) fa.addEventListener('input', function () { state.freeAmount = fa.value; });
    // Presets
    qsa('#presets .preset').forEach(function (el) {
      el.addEventListener('click', function () { togglePreset(Number(el.getAttribute('data-id'))); });
    });
    qsa('#presets .p-custom').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var id = Number(inp.getAttribute('data-id'));
        if (!state.presetSel[id]) state.presetSel[id] = { on: true, custom: '' };
        state.presetSel[id].custom = inp.value; updateTotal();
      });
    });
    // Moyens : surbrillance en place + petit pop (pas de re-render complet)
    qsa('#methods .mrow').forEach(function (el) {
      el.addEventListener('click', function () {
        state.method = el.getAttribute('data-m');
        qsa('#methods .mrow').forEach(function (x) { x.classList.remove('on'); });
        el.classList.add('on');
        pulse(el);
      });
    });
    // Téléphone (étape paiement)
    var ph = document.getElementById('phone');
    if (ph) ph.addEventListener('input', function () { state.phone = ph.value; });
  }

  function togglePreset(id) {
    var d = state.data, cur = state.presetSel[id];
    if (!d.multiSelect) { state.presetSel = {}; state.presetSel[id] = { on: true, custom: '' }; }
    else { if (cur && cur.on) delete state.presetSel[id]; else state.presetSel[id] = { on: true, custom: '' }; }
    // re-render partiel de la liste + total (préserve le contexte de l'étape)
    var wrap = document.getElementById('presets'); if (wrap) { wrap.innerHTML = presetsHtml(); bindPresets(); }
    var sel = wrap && wrap.querySelector('.preset[data-id="' + id + '"]');
    if (sel && state.presetSel[id]) pulse(sel);
    updateTotal();
  }
  function bindPresets() {
    qsa('#presets .preset').forEach(function (el) { el.addEventListener('click', function () { togglePreset(Number(el.getAttribute('data-id'))); }); });
    qsa('#presets .p-custom').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var id = Number(inp.getAttribute('data-id'));
        if (!state.presetSel[id]) state.presetSel[id] = { on: true, custom: '' };
        state.presetSel[id].custom = inp.value; updateTotal();
      });
    });
  }
  function updateTotal() {
    var bar = document.getElementById('totalBar'); if (!bar) return;
    var t = computeTotal();
    var wasHidden = bar.style.display === 'none';
    bar.style.display = t > 0 ? 'flex' : 'none';
    bar.innerHTML = totalHtml();
    if (t > 0 && window.gsap) window.gsap.fromTo(bar, { scale: wasHidden ? 0.9 : 0.98, opacity: wasHidden ? 0 : 1 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.8)' });
    var nb = document.getElementById('nextBtn');
    if (nb && state.step === 3) nb.textContent = 'Payer ' + money(t) + ' ' + state.data.currency;
  }

  /* --------------------------- navigation logique --------------------------- */
  function onNext() {
    state.error = '';
    if (!validateStep(state.step)) { render(); return; }
    if (state.step === 3) { pay(); return; }
    state.step++; render();
  }

  function validateStep(step) {
    var d = state.data;
    if (step === 0) {
      var miss = null;
      (d.customFields || []).forEach(function (f) {
        if (f.readonly) return;
        var v = (state.fields[f.id] || '').trim();
        if (f.required && !v && !miss) miss = f.label;
      });
      if (miss) { state.error = 'Champ requis : ' + miss; return false; }
      return true;
    }
    if (step === 1) {
      if (d.amountType === 'preset') {
        var ids = selectedIds();
        if (!ids.length) { state.error = 'Veuillez choisir un montant.'; return false; }
        for (var i = 0; i < ids.length; i++) {
          var p = presetById(ids[i]), sel = state.presetSel[ids[i]];
          if (p && p.allowPartial && sel && sel.custom !== '' && sel.custom != null) {
            var c = num(sel.custom);
            if (c < num(p.minAmount)) { state.error = 'Acompte « ' + (p.label || 'frais') + ' » : minimum ' + money(p.minAmount) + ' ' + d.currency + '.'; return false; }
            if (c > num(p.amount)) { state.error = 'Acompte « ' + (p.label || 'frais') + ' » : ne peut dépasser ' + money(p.amount) + ' ' + d.currency + '.'; return false; }
          }
        }
      } else if (d.amountType === 'free') {
        if (num(state.freeAmount) <= 0) { state.error = 'Veuillez saisir un montant.'; return false; }
      }
      return true;
    }
    if (step === 2) { if (!state.method) { state.error = 'Veuillez choisir un moyen de paiement.'; return false; } return true; }
    if (step === 3) {
      if (isMM() && state.phone.replace(/\D/g, '').length < 8) { state.error = 'Numéro de téléphone invalide.'; return false; }
      return true;
    }
    return true;
  }

  /* --------------------------- paiement réel --------------------------- */
  function pay() {
    var d = state.data;
    var payload = { method: state.method, fields: {} };
    if (d.amountType === 'preset') {
      payload.presetIds = selectedIds();
      var partial = {};
      payload.presetIds.forEach(function (id) {
        var p = presetById(id), sel = state.presetSel[id];
        if (p && p.allowPartial && sel && sel.custom !== '' && sel.custom != null) partial[String(id)] = sel.custom;
      });
      if (Object.keys(partial).length) payload.presetAmounts = partial;
    } else if (d.amountType === 'free') {
      payload.amount = String(state.freeAmount).trim();
    }
    (d.customFields || []).forEach(function (f) { if (f.readonly) return; var v = (state.fields[f.id] || '').trim(); if (v) payload.fields[f.id] = v; });
    if (isMM()) payload.phone = state.phone.trim();

    state.paying = true; state.step = 4; render();

    fetch('/public/p/' + encodeURIComponent(shortCode) + '/' + encodeURIComponent(slug) + '/pay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { state.paying = false; state.step = 3; state.error = (res.j && res.j.message) ? res.j.message : 'Le paiement a été refusé.'; render(); return; }
        state.payment = res.j; render(); poll();
      })
      .catch(function () { state.paying = false; state.step = 3; state.error = 'Erreur réseau. Réessayez.'; render(); });
  }

  function poll() {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      fetch('/public/tx/' + encodeURIComponent(state.payment.transactionId))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (tx) {
          if (tx && (tx.status === 'SUCCESS' || tx.status === 'FAILED')) { clearInterval(timer); state.paying = false; state.result = tx; render(); }
          else if (tries >= 30) { clearInterval(timer); state.paying = false; state.result = { status: 'PENDING', reference: state.payment.reference, amount: '', currency: '' }; render(); }
        })
        .catch(function () {});
    }, 2000);
  }

  /* --------------------------- erreurs / utils --------------------------- */
  function renderError(title, sub) {
    merchantEl.textContent = 'FirstStudioPay';
    bodyEl.innerHTML = '<div class="center"><div class="ico ko">!</div><div class="rtitle">' + esc(title) + '</div><div class="rsub">' + esc(sub) + '</div></div>';
  }
  function qsa(sel) { return Array.prototype.slice.call(bodyEl.querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
})();
