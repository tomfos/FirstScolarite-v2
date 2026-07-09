# Kubernetes — Cash collect First

> **Phase 9 livrée.** La source de vérité déployable est désormais le **chart Helm
> paramétré** dans [`../helm/firstpay`](../helm/firstpay). Ce dossier ne garde que le
> `base/` (namespaces) et un exemple « tout-en-un » à titre pédagogique.

```
k8s/
├── base/
│   └── namespace.yaml   # namespaces firstpay (istio-injection) + observability
└── services/
    └── transaction-service.yaml   # exemple lisible — voir le chart Helm pour le déploiement réel
```

## Déploiement (Helm)

```bash
kubectl apply -f base/namespace.yaml
helm upgrade --install firstpay ../helm/firstpay -n firstpay -f ../helm/firstpay/values-prod.yaml
kubectl -n firstpay rollout status deploy/transaction-service
kubectl -n firstpay get hpa
```

Le chart rend, **par service** : Deployment + Service + HPA + PodDisruptionBudget +
ServiceMonitor, plus la ConfigMap/Secret partagée et les ressources Istio (Gateway,
VirtualService, DestinationRule, PeerAuthentication mTLS).

## Principes
- **Stateless** : tout l'état vit dans Postgres / Kafka / Redis → scaling linéaire.
- **HPA** : scale sur CPU 60 % **et** métrique custom `transactions_per_second/pod`
  (paramétrable par service via `tpsTarget` dans les `values`).
- **PodDisruptionBudget** + startup/readiness/liveness + preStop → déploiements zéro-downtime.
- **Istio** : mTLS STRICT intra-mesh, retry/timeout au gateway, outlier detection par service.

## À brancher au cluster cible
- `prometheus-operator` (consomme les `ServiceMonitor`) + `prometheus-adapter` (expose
  `transactions_per_second` à l'HPA) + `Alertmanager` (règles de `../observability`).
- Secrets via **Vault / SealedSecrets** en prod (`secrets.create=false` côté chart).
