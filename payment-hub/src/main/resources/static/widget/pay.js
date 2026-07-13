/*
 * Payment Hub — widget embarquable.
 * Intégration côté application cliente :
 *
 *   <script src="https://hub.example.com/widget/pay.js"></script>
 *   <script>
 *     // paymentId + clientSecret proviennent de votre backend (POST /api/v1/payments)
 *     PayHub.open({
 *       checkoutUrl: "https://hub.example.com/checkout/<id>?cs=<clientSecret>",
 *       onSuccess: (p) => console.log("payé", p),
 *       onError:   (p) => console.log("échec", p),
 *       onClose:   ()  => console.log("fermé")
 *     });
 *   </script>
 *
 * Alternative : PayHub.open({ baseUrl, paymentId, clientSecret, ... }).
 * La page de paiement s'affiche directement dans une iframe modale, brandée par application.
 */
(function () {
  function buildUrl(o) {
    if (o.checkoutUrl) return o.checkoutUrl;
    var base = (o.baseUrl || '').replace(/\/$/, '');
    return base + '/checkout/' + o.paymentId + '?cs=' + encodeURIComponent(o.clientSecret);
  }

  function open(opts) {
    opts = opts || {};
    var url = buildUrl(opts);
    var done = false;

    var overlay = document.createElement('div');
    overlay.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:rgba(15,17,21,.55)', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:16px'
    ].join(';'));

    var frame = document.createElement('iframe');
    frame.src = url;
    frame.setAttribute('allow', 'payment');
    frame.setAttribute('style', [
      'width:100%', 'max-width:480px', 'height:min(680px,90vh)',
      'border:0', 'border-radius:16px', 'background:#fff',
      'box-shadow:0 20px 60px rgba(0,0,0,.35)'
    ].join(';'));

    var close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('style', [
      'position:absolute', 'top:18px', 'right:22px', 'width:36px', 'height:36px',
      'border:0', 'border-radius:50%', 'background:#fff', 'color:#333',
      'font-size:22px', 'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,.2)'
    ].join(';'));

    function teardown() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      window.removeEventListener('message', onMsg);
    }
    function finish(kind, data) {
      if (done && kind !== 'close') return;
      if (kind === 'success' && opts.onSuccess) opts.onSuccess(data);
      if (kind === 'error' && opts.onError) opts.onError(data);
      if (kind === 'close' && opts.onClose) opts.onClose(data);
    }

    function onMsg(ev) {
      var d = ev.data;
      if (!d || d.source !== 'payhub') return;
      if (d.type === 'payment') {
        done = true;
        if (d.status === 'SUCCESS') finish('success', d);
        else if (d.status === 'FAILED') finish('error', d);
      } else if (d.type === 'close') {
        finish('close', d); teardown();
      }
    }

    close.onclick = function () { finish('close', { status: done ? 'DONE' : 'ABORTED' }); teardown(); };
    overlay.appendChild(frame);
    overlay.appendChild(close);
    document.body.appendChild(overlay);
    window.addEventListener('message', onMsg);

    return { close: function () { teardown(); } };
  }

  window.PayHub = { open: open };
})();
