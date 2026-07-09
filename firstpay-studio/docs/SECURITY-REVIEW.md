# Revue de sécurité — First Collect

Checklist OWASP Top 10 (2021) mappée au socle actuel.

| Risque | Mesure en place | Statut |
|--------|-----------------|--------|
| A01 Broken Access Control | Gateway injecte `X-Tenant-Id` ; JWT + API-key ; rate-limit par tenant | OK |
| A02 Cryptographic Failures | TLS (prod/Istio) ; API-key hashée SHA-256 ; JWT HS256 signé | OK dev / TLS prod |
| A03 Injection | R2DBC paramétré ; validation `@Valid` sur DTOs | OK |
| A04 Insecure Design | Idempotence 2 niveaux ; outbox ; CQRS read/write split | OK |
| A05 Security Misconfiguration | Secrets via `JWT_SECRET` env ; Helm `secrets.create=false` en prod | À valider cluster |
| A06 Vulnerable Components | CI `npm audit` + Trivy (workflow security.yml) | Automatisé |
| A07 Auth Failures | Login JWT ; 401 gateway ; audit `login_fail` | OK |
| A08 Software/Data Integrity | CI GitHub Actions ; images Docker rebuild | OK |
| A09 Logging Failures | Audit log append-only ; Prometheus/Jaeger | OK |
| A10 SSRF | Gateway routes statiques ; pas de proxy user-controlled | OK |

## Actions recommandées prod

1. Remplacer `JWT_SECRET` dev par secret Vault/SealedSecrets (≥ 32 car.).
2. Activer mTLS STRICT (Istio) et désactiver `POSTGRES_HOST_AUTH_METHOD=trust`.
3. Rotation périodique des API-keys partenaires (`tenants.api_key_hash`).
4. Brancher Alertmanager vers PagerDuty/Slack réel.
5. Exécuter OWASP ZAP baseline sur la gateway avant mise en prod.

## Commandes CI locales

```bash
npm audit --audit-level=high --prefix apps/frontend
mvn -q -ntp dependency-check:check   # si plugin activé
./tests/chaos/run-chaos.sh
./tests/slo-recette/validate-slo.sh
```
