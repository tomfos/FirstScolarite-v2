/*
 * Page payeur publique FirstPay — app statique autonome (sans framework).
 * Flux : résout l'URL /{shortCode}/{slug} via l'API publique, rend le parcours conçu par le
 * partenaire, initie le paiement puis interroge le statut jusqu'à l'état final.
 * Toute la validation faisant autorité est côté serveur ; ici on ne fait qu'assister la saisie.
 *
 * Prend en charge : montant fixe / libre / prédéfini, sélection multiple (panier de frais),
 * acompte (versement partiel ≥ minimum), champs texte/liste/date/téléphone et champs
 * en lecture seule (auto-remplis, non saisis par le payeur).
 */
(function () {
  'use strict';

  var METHOD_LABELS = { orange: 'Orange Money', mtn: 'MTN MoMo', card: 'Carte bancaire', transfer: 'Virement' };
  var bodyEl = document.getElementById('body');
  var merchantEl = document.getElementById('merchant');
  var logoEl = document.getElementById('logo');

  // --- Routing : extrait shortCode + slug des deux derniers segments du chemin ---
  var segs = window.location.pathname.split('/').filter(Boolean);
  var shortCode = segs[segs.length - 2];
  var slug = segs[segs.length - 1];

  // presetSel : id -> { on: bool, custom: string }  (custom = acompte saisi, '' = montant complet)
  var state = { data: null, method: null, presetSel: {} };

  if (!shortCode || !slug) { renderError('Lien de paiement invalide.', 'Vérifiez l’adresse reçue.'); return; }

  // --- 1) Résolution de la config publique ---
  fetch('/public/p/' + encodeURIComponent(shortCode) + '/' + encodeURIComponent(slug))
    .then(function (r) {
      if (r.status === 404) throw { handled: true };
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    })
    .then(function (data) { state.data = data; renderForm(); })
    .catch(function (e) {
      if (e && e.handled) renderError('Page de paiement introuvable', 'Ce lien n’existe pas ou n’est plus actif.');
      else renderError('Service indisponible', 'Réessayez dans un instant.');
    });

  function money(n) { return Number(n).toLocaleString('fr-FR'); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  function applyBrand(d) {
    merchantEl.textContent = d.merchant.name || 'FirstPay';
    if (d.merchant.brandColor) document.documentElement.style.setProperty('--fp', d.merchant.brandColor);
    if (d.merchant.logoUrl) { logoEl.innerHTML = ''; var img = document.createElement('img'); img.src = d.merchant.logoUrl; img.alt = ''; logoEl.appendChild(img); }
    else logoEl.textContent = (d.merchant.shortCode || 'FP').slice(0, 4).toUpperCase();
    document.title = 'Payer · ' + (d.name || d.merchant.name);
  }

  function presetById(id) { return (state.data.presets || []).filter(function (p) { return p.id === id; })[0]; }

  /** Montant à débiter pour un frais sélectionné (acompte saisi valide, sinon montant complet). */
  function payableFor(p) {
    var sel = state.presetSel[p.id];
    if (p.allowPartial && sel && sel.custom !== '' && sel.custom != null) {
      var c = num(sel.custom);
      if (c > 0) return c;
    }
    return num(p.amount);
  }

  /** Total courant (somme des frais cochés) — miroir client de la vérité serveur. */
  function computeTotal() {
    var d = state.data, total = 0;
    if (d.amountType === 'fixed') return num(d.fixedAmount);
    if (d.amountType === 'free') return num((document.getElementById('freeAmount') || {}).value);
    if (d.amountType === 'preset') {
      (d.presets || []).forEach(function (p) {
        var sel = state.presetSel[p.id];
        if (sel && sel.on) total += payableFor(p);
      });
    }
    return total;
  }

  // --- 2) Rendu du parcours ---
  function renderForm() {
    var d = state.data;
    applyBrand(d);

    var h = '';
    h += '<div class="iname"></div>';
    if (d.description) h += '<div class="idesc"></div>';

    // Montant
    if (d.amountType === 'fixed') {
      h += '<div class="lbl">Montant à payer</div>';
      h += '<div class="big" id="amtFixed">' + money(d.fixedAmount || 0) + ' <small>' + d.currency + '</small></div>';
    } else if (d.amountType === 'preset') {
      h += '<div class="lbl">' + (d.multiSelect ? 'Cochez les frais à régler' : 'Choisissez un montant') + '</div>';
      h += '<div class="presets" id="presets"></div>';
      h += '<div class="total" id="totalBar" style="display:none"></div>';
    } else { // free
      h += '<div class="lbl">Montant à payer</div>';
      h += '<div class="field"><input type="number" id="freeAmount" inputmode="numeric" min="0" placeholder="Saisir le montant (' + d.currency + ')"></div>';
      var hint = [];
      if (d.minAmount) hint.push('min ' + money(d.minAmount));
      if (d.maxAmount) hint.push('max ' + money(d.maxAmount));
      if (hint.length) h += '<div class="rsub" style="margin-top:6px;font-size:12px">' + hint.join(' · ') + ' ' + d.currency + '</div>';
    }

    // Champs personnalisés
    (d.customFields || []).forEach(function (f) {
      h += renderField(f);
    });

    // Téléphone (mobile money)
    h += '<div class="field" id="phoneField"><label>Téléphone <span class="req">*</span></label>'
       + '<input type="tel" id="phone" inputmode="tel" placeholder="+237 6XX XX XX XX"></div>';

    // Moyens de paiement
    h += '<div class="lbl">Moyen de paiement</div><div class="methods" id="methods">';
    Object.keys(d.methods || {}).filter(function (k) { return d.methods[k]; }).forEach(function (k) {
      h += '<div class="m ' + k + '" data-m="' + k + '">' + (METHOD_LABELS[k] || k) + '</div>';
    });
    h += '</div>';

    h += '<button class="pay" id="payBtn">Payer maintenant</button>';
    h += '<div class="err" id="err"></div>';
    h += '<div class="secured">🔒 Paiement sécurisé · Afriland First Bank</div>';

    bodyEl.innerHTML = h;
    bodyEl.querySelector('.iname').textContent = d.name || '';
    if (d.description) bodyEl.querySelector('.idesc').textContent = d.description;

    if (d.amountType === 'preset') renderPresets();
    if (d.amountType === 'free') {
      var fa = document.getElementById('freeAmount');
      if (fa) fa.addEventListener('input', function () { /* pas de total pour le libre */ });
    }

    // Sélecteur de moyen — présélectionne le premier
    bindClicks('#methods .m', function (el) {
      bodyEl.querySelectorAll('#methods .m').forEach(function (x) { x.classList.remove('on'); });
      el.classList.add('on'); state.method = el.getAttribute('data-m'); syncPhoneVisibility();
    });
    var firstM = bodyEl.querySelector('#methods .m');
    if (firstM) firstM.click();

    document.getElementById('payBtn').addEventListener('click', submit);
  }

  /** HTML d'un champ personnalisé (texte / liste / date / téléphone), gère la lecture seule. */
  function renderField(f) {
    var lbl = esc(f.label) + (f.required && !f.readonly ? ' <span class="req">*</span>' : '');
    var h = '<div class="field"><label>' + lbl + '</label>';
    if (f.readonly) {
      h += '<input type="text" data-fid="' + f.id + '" data-ro="1" disabled placeholder="Auto-rempli">';
    } else if (f.type === 'select') {
      h += '<select data-fid="' + f.id + '"><option value="">Choisir…</option>';
      (f.options || []).forEach(function (o) { h += '<option value="' + esc(o) + '">' + esc(o) + '</option>'; });
      h += '</select>';
    } else if (f.type === 'date') {
      h += '<input type="date" data-fid="' + f.id + '">';
    } else if (f.type === 'phone') {
      h += '<input type="tel" data-fid="' + f.id + '" inputmode="tel" placeholder="+237 6XX XX XX XX">';
    } else {
      h += '<input type="text" data-fid="' + f.id + '" placeholder="Saisir…">';
    }
    return h + '</div>';
  }

  /** Rend la liste des frais (cases/radios) + les blocs d'acompte + la barre de total. */
  function renderPresets() {
    var d = state.data, wrap = document.getElementById('presets');
    if (!wrap) return;
    var html = '';
    (d.presets || []).forEach(function (p) {
      var sel = state.presetSel[p.id] || { on: false, custom: '' };
      var on = sel.on;
      html += '<div class="preset-wrap">';
      html += '<div class="preset' + (on ? ' on' : '') + '" data-id="' + p.id + '">'
        + '<span class="p-mark ' + (d.multiSelect ? 'box' : 'radio') + '">' + (on ? '✓' : '') + '</span>'
        + '<span class="p-label">' + esc(p.label || 'Montant')
        + (p.allowPartial ? '<em class="p-acompte">Acompte possible · min ' + money(p.minAmount || 0) + ' ' + d.currency + '</em>' : '')
        + '</span>'
        + '<b>' + money(p.amount) + ' ' + d.currency + '</b>'
        + '</div>';
      if (on && p.allowPartial) {
        html += '<div class="partial">'
          + '<label>Montant à verser (' + d.currency + ')</label>'
          + '<input type="number" class="p-custom" data-id="' + p.id + '" inputmode="numeric" min="' + num(p.minAmount) + '" max="' + num(p.amount) + '"'
          + ' value="' + (sel.custom != null ? esc(sel.custom) : '') + '" placeholder="' + money(p.amount) + '">'
          + '<small>Min ' + money(p.minAmount || 0) + ' · complet ' + money(p.amount) + ' ' + d.currency + '</small>'
          + '</div>';
      }
      html += '</div>';
    });
    wrap.innerHTML = html;

    bindClicks('#presets .preset', function (el) {
      var id = Number(el.getAttribute('data-id'));
      togglePreset(id);
    });
    wrap.querySelectorAll('.p-custom').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var id = Number(inp.getAttribute('data-id'));
        if (!state.presetSel[id]) state.presetSel[id] = { on: true, custom: '' };
        state.presetSel[id].custom = inp.value;
        updateTotal();
      });
    });
    updateTotal();
  }

  function togglePreset(id) {
    var d = state.data, cur = state.presetSel[id];
    if (!d.multiSelect) {
      // sélection unique : réinitialise puis coche celui-ci
      state.presetSel = {};
      state.presetSel[id] = { on: true, custom: '' };
    } else {
      if (cur && cur.on) { delete state.presetSel[id]; }
      else { state.presetSel[id] = { on: true, custom: '' }; }
    }
    renderPresets();
  }

  function updateTotal() {
    var d = state.data, bar = document.getElementById('totalBar');
    if (!bar) return;
    var count = Object.keys(state.presetSel).filter(function (k) { return state.presetSel[k].on; }).length;
    if (count === 0) { bar.style.display = 'none'; return; }
    var total = computeTotal();
    bar.style.display = 'flex';
    bar.innerHTML = '<span>Total' + (d.multiSelect ? ' · ' + count + ' frais' : '') + '</span>'
      + '<b>' + money(total) + ' ' + d.currency + '</b>';
  }

  function syncPhoneVisibility() {
    var mm = state.method === 'orange' || state.method === 'mtn';
    document.getElementById('phoneField').classList.toggle('hide', !mm);
  }

  // --- 3) Initiation du paiement ---
  function submit() {
    var d = state.data, err = document.getElementById('err');
    err.style.display = 'none';

    var payload = { method: state.method, fields: {} };

    if (d.amountType === 'preset') {
      var ids = Object.keys(state.presetSel).filter(function (k) { return state.presetSel[k].on; }).map(Number);
      if (ids.length === 0) return showErr('Veuillez choisir un montant.');
      payload.presetIds = ids;
      var partial = {};
      for (var i = 0; i < ids.length; i++) {
        var p = presetById(ids[i]);
        var sel = state.presetSel[ids[i]];
        if (p && p.allowPartial && sel && sel.custom !== '' && sel.custom != null) {
          var c = num(sel.custom);
          if (c < num(p.minAmount)) return showErr('Acompte « ' + (p.label || 'frais') + ' » : minimum ' + money(p.minAmount) + ' ' + d.currency + '.');
          if (c > num(p.amount)) return showErr('Acompte « ' + (p.label || 'frais') + ' » : ne peut dépasser ' + money(p.amount) + ' ' + d.currency + '.');
          partial[String(ids[i])] = sel.custom;
        }
      }
      if (Object.keys(partial).length) payload.presetAmounts = partial;
    } else if (d.amountType === 'free') {
      payload.amount = (document.getElementById('freeAmount').value || '').trim();
      if (!payload.amount) return showErr('Veuillez saisir un montant.');
    }

    var missing = null;
    (d.customFields || []).forEach(function (f) {
      if (f.readonly) return; // auto-rempli, non saisi
      var el = bodyEl.querySelector('[data-fid="' + f.id + '"]');
      var v = el ? el.value.trim() : '';
      if (v) payload.fields[f.id] = v;
      if (f.required && !v && !missing) missing = f.label;
    });
    if (missing) return showErr('Champ requis : ' + missing);

    var mm = state.method === 'orange' || state.method === 'mtn';
    if (mm) {
      var phone = (document.getElementById('phone').value || '').trim();
      if (phone.replace(/\D/g, '').length < 8) return showErr('Numéro de téléphone invalide.');
      payload.phone = phone;
    }

    var btn = document.getElementById('payBtn');
    btn.disabled = true; btn.textContent = 'Traitement…';

    fetch('/public/p/' + encodeURIComponent(shortCode) + '/' + encodeURIComponent(slug) + '/pay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { btn.disabled = false; btn.textContent = 'Payer maintenant';
          return showErr(res.j && res.j.message ? res.j.message : 'Le paiement a été refusé.'); }
        renderPending(res.j);
      })
      .catch(function () { btn.disabled = false; btn.textContent = 'Payer maintenant'; showErr('Erreur réseau. Réessayez.'); });
  }

  // --- 4) Attente + polling du statut ---
  function renderPending(pay) {
    bodyEl.innerHTML = '<div class="center"><div class="spin"></div>'
      + '<div class="rtitle">Paiement en cours…</div>'
      + '<div class="rsub">Validez la demande sur votre téléphone si demandé.</div>'
      + '<div class="ref">Réf. ' + esc(pay.reference) + '</div></div>';
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      fetch('/public/tx/' + encodeURIComponent(pay.transactionId))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (tx) {
          if (tx && (tx.status === 'SUCCESS' || tx.status === 'FAILED')) { clearInterval(timer); renderResult(tx); }
          else if (tries >= 30) { clearInterval(timer); renderResult({ status: 'PENDING', reference: pay.reference, amount: '', currency: '' }); }
        })
        .catch(function () {});
    }, 2000);
  }

  function renderResult(tx) {
    var d = state.data || { currency: tx.currency };
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
    h += '</div>';
    bodyEl.innerHTML = h;
  }

  function renderError(title, sub) {
    merchantEl.textContent = 'FirstPay';
    bodyEl.innerHTML = '<div class="center"><div class="ico ko">!</div><div class="rtitle">' + esc(title)
      + '</div><div class="rsub">' + esc(sub) + '</div></div>';
  }

  function showErr(msg) { var e = document.getElementById('err'); e.textContent = msg; e.style.display = 'block'; }
  function bindClicks(sel, fn) { bodyEl.querySelectorAll(sel).forEach(function (el) { el.addEventListener('click', function () { fn(el); }); }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
})();
