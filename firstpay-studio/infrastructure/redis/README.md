# Redis — Cash collect First

Trois usages, un cluster :

| Usage | Clé | TTL |
|-------|-----|-----|
| Idempotency keys | `idempotency:{tenantId}:{key}` | 10 min |
| Rate limiting (par tenant) | `rl:{tenantId}` (token bucket Lua) | sliding |
| Cache L2 (interfaces, config tenant) | `iface:{tenantId}:{slug}`, `tenant:{id}` | 5 min |

## Dev local
`docker compose up -d redis` (single node, `allkeys-lru`, 2 Go).

## Production : Redis Cluster
- ≥ 6 nœuds (3 masters + 3 replicas), sharding par hash slot.
- `maxmemory-policy allkeys-lru`, persistance AOF `everysec`.
- Connexion réactive via `spring-boot-starter-data-redis-reactive`,
  `spring.data.redis.cluster.nodes=${REDIS_NODES}`.

## Rate limiter (token bucket, atomique côté Redis)
Implémenté en Lua pour garantir l'atomicité refill+consume. Voir
`apps/api-gateway` (`RedisRateLimiter`) et la config par tenant
(`tenants.rate_limit_tpm`).
