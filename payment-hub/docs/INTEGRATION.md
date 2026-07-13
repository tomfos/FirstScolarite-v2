# Intégrer le Payment Hub dans une application

Le Hub centralise tout : providers, credentials et moyens actifs. Une application cliente ne
configure **rien** en interne — elle reçoit une clé API et consomme le Hub.

## 1. Enregistrer l'application (opérateur Hub)

Via la console `/console` ou l'API admin (`X-Admin-Token`) :

```bash
curl -X POST http://localhost:8090/admin/api/applications \
  -H "X-Admin-Token: $ADMIN" -H "Content-Type: application/json" \
  -d '{"name":"Ma Boutique","webhookUrl":"https://ma-boutique/hooks/payhub","returnUrl":"https://ma-boutique/merci"}'
# => { application:{id}, apiKey, apiSecret, webhookSecret }   (affichés UNE fois)
```

Puis activer les moyens voulus pour cette application :

```bash
curl -X PUT http://localhost:8090/admin/api/applications/{appId}/methods/orange \
  -H "X-Admin-Token: $ADMIN" -H "Content-Type: application/json" -d '{"enabled":true}'
```

## 2. Créer un paiement (backend client → Hub, serveur à serveur)

```bash
curl -X POST http://localhost:8090/api/v1/payments \
  -H "X-Api-Key: $API_KEY" -H "X-Idempotency-Key: commande-42" -H "Content-Type: application/json" \
  -d '{"reference":"CMD-42","amount":2500,"currency":"XAF"}'
# => { id, status:"PENDING", clientSecret, checkoutUrl }
```

- `X-Idempotency-Key` (recommandé) : un rejeu renvoie le même paiement — jamais de double débit.
- Sans `method`/`payerMsisdn` : le payeur choisit au checkout. En les fournissant : débit immédiat.

## 3. Afficher le paiement (front client → widget iframe)

```html
<script src="http://localhost:8090/widget/pay.js"></script>
<script>
  PayHub.open({
    checkoutUrl: "http://localhost:8090/checkout/<id>?cs=<clientSecret>",
    onSuccess: (p) => location = "/merci",
    onError:   (p) => alert("Paiement échoué"),
    onClose:   ()  => {}
  });
</script>
```

La page de paiement s'affiche dans une iframe modale, **brandée** (couleur/logo de l'application)
et ne montrant **que les moyens activés** pour elle.

## 4. Confirmer (webhook signé + vérification serveur)

À la finalisation, le Hub `POST` le résultat sur `webhook_url` :

```
X-PayHub-Signature: sha256=<hmac>
X-PayHub-Delivery: <id>

{"event":"payment.success","id":"...","reference":"CMD-42","amount":2500,"currency":"XAF","status":"SUCCESS",...}
```

Vérifier la signature avec `webhookSecret` (HMAC-SHA256 du corps brut) :

```python
import hmac, hashlib
expected = "sha256=" + hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
assert hmac.compare_digest(expected, request.headers["X-PayHub-Signature"])
```

Toujours reconfirmer via la **source de vérité** :

```bash
curl http://localhost:8090/api/v1/payments/{id} -H "X-Api-Key: $API_KEY"
```

## 5. Configurer un provider réel (opérateur Hub)

```bash
# TrustPayWay (Orange Money / MTN MoMo) — credentials: { baseUrl, appId, secret }
curl -X PUT http://localhost:8090/admin/api/providers/trustpayway \
  -H "X-Admin-Token: $ADMIN" -H "Content-Type: application/json" \
  -d '{"enabled":true,"mode":"production","credentials":{"baseUrl":"https://mobilewallet.trustpayway.com","appId":"<applicationId>","secret":"<secret_key>"}}'

# MPGS (carte, Hosted Checkout) — credentials: { host, merchantId, password, apiVersion? }
curl -X PUT http://localhost:8090/admin/api/providers/mpgs \
  -H "X-Admin-Token: $ADMIN" -H "Content-Type: application/json" \
  -d '{"enabled":true,"mode":"sandbox","credentials":{"host":"test-gateway.mastercard.com","merchantId":"TESTAFB-MARCHANT","password":"<api-password>","apiVersion":"100"}}'

# SARA (débit wallet) — credentials: { baseUrl, username, password }
curl -X PUT http://localhost:8090/admin/api/providers/sara \
  -H "X-Admin-Token: $ADMIN" -H "Content-Type: application/json" \
  -d '{"enabled":true,"mode":"production","credentials":{"baseUrl":"http://<host>:7003","username":"<user>","password":"<pwd>"}}'
```

Provider activé + credentials complets ⇒ le connecteur **réel** est utilisé ; sinon le Hub
**simule** (si `payhub.payment.simulation-enabled=true`). Les credentials sont chiffrés au repos.

### Comment chaque PSP est intégré

| PSP | Moyen | Modèle | Détail |
|-----|-------|--------|--------|
| **TrustPayWay** | orange, mtn | serveur→serveur | login (Bearer secret) → `process-payment` (PENDING) → `get-status` ; confirmation par webhook `/webhooks/trustpayway/{network}` + réconciliation |
| **SARA** | sara | serveur→serveur | login (form→token) → `init_wallet_withdrawal` (PENDING) → `getStatus/{ref}` (COMPLETED) ; réconciliation |
| **MPGS** | card | **Hosted Checkout** | le Hub crée une session (`INITIATE_CHECKOUT`, auth Basic) ; la page charge `checkout.min.js` et affiche le formulaire carte ; au retour, le Hub vérifie via `RETRIEVE_ORDER` (source de vérité) puis finalise |

## Ajouter un nouveau moyen/PSP (« et autres »)

1. Implémenter `com.payhub.connector.PaymentConnector` (déclarer `methods()` + `charge()`), annoté `@Component`.
2. Ajouter une ligne `providers` + `payment_methods` (migration Flyway).
3. Rien d'autre : `PaymentConnectorRouter` découvre le bean automatiquement.
