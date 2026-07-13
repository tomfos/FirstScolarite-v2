/* Console d'administration Payment Hub — vanilla JS. Appelle /admin/api/** avec X-Admin-Token. */
const App = (function () {
  let token = localStorage.getItem('payhub_admin_token') || '';
  const view = () => document.getElementById('view');
  const esc = (s) => (s == null ? '' : String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])));

  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Admin-Token': token, 'Content-Type': 'application/json' }, opts.headers || {});
    const res = await fetch('/admin/api' + path, opts);
    if (res.status === 401) { connectPrompt('Jeton admin invalide — vérifiez la valeur puis « Connecter ».'); throw new Error('401'); }
    if (res.status === 204) return null;
    return res.status < 300 ? res.json() : Promise.reject(await res.text());
  }

  function connectPrompt(msg) {
    view().innerHTML = '<div class="card">🔒 ' + (msg || 'Entrez le jeton admin (champ en haut à droite) puis cliquez « Connecter ».')
      + '<br><span class="muted">En développement, le jeton par défaut est <code>dev-admin-token</code>.</span></div>';
  }

  function saveToken() {
    token = document.getElementById('token').value.trim();
    localStorage.setItem('payhub_admin_token', token);
    tab(current);
  }

  let current = 'apps';
  function tab(t) {
    current = t;
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x.dataset.t === t));
    if (!token) { connectPrompt(); return; }   // pas d'appel API tant qu'aucun jeton n'est saisi
    ({ apps: apps, providers: providers, methods: methods, payments: payments }[t] || apps)();
  }

  /* ---- Applications ---- */
  async function apps() {
    view().innerHTML = '<div class="card"><b>Nouvelle application</b><div class="row" style="margin-top:8px">'
      + '<div><label>Nom</label><input id="na"></div>'
      + '<div><label>Webhook URL (optionnel)</label><input id="nw" size="30"></div>'
      + '<div><label>Return URL (optionnel)</label><input id="nr" size="30"></div>'
      + '<button onclick="App.createApp()">Créer</button></div><div id="cred"></div></div>'
      + '<div class="card"><b>Applications</b><div id="applist" class="muted">…</div></div>';
    const list = await api('/applications');
    document.getElementById('applist').innerHTML = table(
      ['Nom', 'Slug', 'Statut', 'ID'],
      list.map((a) => [esc(a.name), esc(a.slug), pill(a.status === 'active', a.status), '<code>' + a.id + '</code>'])
    );
  }
  async function createApp() {
    const body = { name: v('na'), webhookUrl: v('nw') || null, returnUrl: v('nr') || null };
    if (!body.name) return;
    const c = await api('/applications', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('cred').innerHTML =
      '<div class="card" style="background:#fff8e1;margin-top:12px"><b>⚠️ Identifiants (affichés une seule fois)</b>'
      + '<p class="muted">Clé API : <code>' + c.apiKey + '</code></p>'
      + '<p class="muted">Secret : <code>' + c.apiSecret + '</code></p>'
      + '<p class="muted">Secret webhook : <code>' + c.webhookSecret + '</code></p></div>';
    apps();
  }

  /* ---- Providers ---- */
  async function providers() {
    const list = await api('/providers');
    view().innerHTML = '<div class="card"><b>Providers (PSP)</b>' + list.map(providerCard).join('') + '</div>';
  }
  function providerCard(p) {
    const id = 'p_' + p.code;
    return '<div class="card"><div class="row" style="justify-content:space-between">'
      + '<div><b>' + esc(p.label) + '</b> <code>' + p.code + '</code> '
      + pill(p.enabled, p.enabled ? 'activé' : 'désactivé') + ' ' + pill(p.ready, p.ready ? 'prêt' : 'incomplet')
      + '<div class="muted">Credentials: ' + (p.credentialKeys.join(', ') || '—') + ' · mode ' + p.mode + '</div></div></div>'
      + '<label>mode</label><select id="' + id + '_mode"><option ' + (p.mode === 'sandbox' ? 'selected' : '') + '>sandbox</option><option ' + (p.mode === 'production' ? 'selected' : '') + '>production</option></select> '
      + '<label>activé</label><select id="' + id + '_en"><option value="true" ' + (p.enabled ? 'selected' : '') + '>oui</option><option value="false" ' + (!p.enabled ? 'selected' : '') + '>non</option></select>'
      + '<label>credentials (JSON, laisser vide pour ne pas changer)</label>'
      + '<textarea id="' + id + '_cred" rows="3" style="width:100%" placeholder=\'{"baseUrl":"...","appId":"...","secret":"..."}\'></textarea>'
      + '<button style="margin-top:8px" onclick="App.saveProvider(\'' + p.code + '\')">Enregistrer</button></div>';
  }
  async function saveProvider(code) {
    const id = 'p_' + code;
    const body = { mode: v(id + '_mode'), enabled: v(id + '_en') === 'true' };
    const raw = v(id + '_cred');
    if (raw) { try { body.credentials = JSON.parse(raw); } catch (e) { return alert('JSON credentials invalide'); } }
    await api('/providers/' + code, { method: 'PUT', body: JSON.stringify(body) });
    providers();
  }

  /* ---- Moyens par application ---- */
  async function methods() {
    const list = await api('/applications');
    view().innerHTML = '<div class="card"><b>Moyens par application</b>'
      + '<div class="row" style="margin-top:8px"><select id="app" onchange="App.loadMethods()">'
      + '<option value="">— choisir —</option>' + list.map((a) => '<option value="' + a.id + '">' + esc(a.name) + '</option>').join('')
      + '</select></div><div id="mlist" style="margin-top:12px"></div></div>';
  }
  async function loadMethods() {
    const appId = v('app'); if (!appId) return;
    const list = await api('/applications/' + appId + '/methods');
    document.getElementById('mlist').innerHTML = list.map((m) =>
      '<div class="toggle"><input type="checkbox" ' + (m.enabled ? 'checked' : '')
      + ' onchange="App.toggle(\'' + appId + '\',\'' + m.code + '\',this.checked)"> '
      + '<b>' + esc(m.label) + '</b> <span class="muted">(' + m.code + ' · ' + m.providerCode + ')</span></div>'
    ).join('');
  }
  async function toggle(appId, code, enabled) {
    await api('/applications/' + appId + '/methods/' + code, { method: 'PUT', body: JSON.stringify({ enabled: enabled }) });
  }

  /* ---- Paiements ---- */
  async function payments() {
    const list = await api('/applications');
    view().innerHTML = '<div class="card"><b>Paiements</b>'
      + '<div class="row" style="margin-top:8px"><select id="app" onchange="App.loadPayments()">'
      + '<option value="">— choisir une application —</option>' + list.map((a) => '<option value="' + a.id + '">' + esc(a.name) + '</option>').join('')
      + '</select></div><div id="plist" style="margin-top:12px" class="muted"></div></div>';
  }
  async function loadPayments() {
    const appId = v('app'); if (!appId) return;
    const list = await api('/applications/' + appId + '/payments?limit=100');
    document.getElementById('plist').innerHTML = table(
      ['Réf', 'Moyen', 'Montant', 'Statut', 'Créé'],
      list.map((p) => [esc(p.reference), esc(p.method), p.amount + ' ' + p.currency,
        pill(p.status === 'SUCCESS', p.status), new Date(p.createdAt).toLocaleString('fr-FR')])
    );
  }

  /* ---- utils ---- */
  const v = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
  const pill = (ok, txt) => '<span class="pill ' + (ok ? 'ok' : 'off') + '">' + esc(txt) + '</span>';
  const table = (cols, rows) => '<table><thead><tr>' + cols.map((c) => '<th>' + c + '</th>').join('')
    + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';

  document.addEventListener('DOMContentLoaded', function () {
    const t = document.getElementById('token');
    t.value = token;
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveToken(); });  // Entrée = Connecter
    tab('apps');
  });

  return { tab, saveToken, createApp, saveProvider, loadMethods, toggle, payments, loadPayments };
})();
