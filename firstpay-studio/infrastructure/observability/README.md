# Observabilité — Cash collect First (Phase 9)

Pile : **Micrometer → Prometheus** (métriques), **OpenTelemetry → OTel Collector → Jaeger**
(tracing distribué), **Grafana** (dashboards & alertes visuelles). Alignée sur
`docs/ARCHITECTURE.md §7` et les SLO du §1.

```
observability/
├── prometheus/
│   ├── prometheus.yml      # scrape /actuator/prometheus de chaque service
│   └── alert-rules.yml     # SLO : P99>100ms, erreurs>1%, lag Kafka, CB ouvert, heap>90%
├── grafana/
│   ├── provisioning/       # datasources (Prometheus, Jaeger) + provider de dashboards
│   └── dashboards/
│       └── firstpay-overview.json  # TPS, P50/P99, erreurs, heap, CB, lag Kafka
└── otel-collector/
    └── otel-collector-config.yaml  # OTLP (4317/4318) → Jaeger
```

## Démarrer en local

```bash
docker compose up -d prometheus grafana jaeger otel-collector
# Puis (re)démarrer les services : ils exportent traces + métriques automatiquement.
docker compose up -d
```

| UI | URL | Auth |
|----|-----|------|
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | — |
| Jaeger | http://localhost:16686 | — |

Le dashboard **Cash collect First — Overview** est provisionné automatiquement
(dossier *FirstPay*). Les traces couvrent le chemin Gateway → service → Kafka → consumer.

## Câblage côté service

Chaque service embarque `micrometer-tracing-bridge-otel` + `opentelemetry-exporter-otlp`
et lit deux variables (cf. `application.yml`) :

- `OTEL_EXPORTER_OTLP_ENDPOINT` (défaut `http://localhost:4318/v1/traces`)
- `TRACING_SAMPLE_RATE` (défaut `0.1` ; `1.0` en dev compose, `0.05` en prod)

Les métriques HTTP exposent un histogramme avec SLO 20 ms / 100 ms / 500 ms et un tag
`application`, exploités par les alertes et le dashboard.

## En production (Kubernetes)

- **prometheus-operator** : le chart Helm rend un `ServiceMonitor` par service
  (label `release: prometheus`). Importer `alert-rules.yml` en `PrometheusRule`.
- **OTel Collector** : déployer dans le namespace `observability` ; les services
  pointent vers `http://otel-collector.observability.svc:4318/v1/traces` (cf. `values.yaml`).
- **HPA custom metric** : `transactions_per_second` est exposée par Micrometer puis
  servie à l'autoscaler via `prometheus-adapter` (scale TPS/pod, cf. `templates/hpa.yaml`).
