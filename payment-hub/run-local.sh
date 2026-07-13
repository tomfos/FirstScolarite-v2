#!/usr/bin/env bash
# Démarrage local du Payment Hub : infra (Postgres+Redis) via Docker + application via Maven (JDK 21).
set -e
cd "$(dirname "$0")"

# 1. JDK 21 obligatoire (le projet cible Java 21)
JDK21="${JAVA_HOME:-}"
if [ -z "$JDK21" ] || ! "$JDK21/bin/java" -version 2>&1 | grep -q '"21'; then
  for c in /usr/lib/jvm/java-21-openjdk-amd64 /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/temurin-21-jdk-amd64; do
    [ -x "$c/bin/java" ] && JDK21="$c" && break
  done
fi
if [ -z "$JDK21" ] || ! "$JDK21/bin/java" -version 2>&1 | grep -q '"21'; then
  echo "❌ JDK 21 introuvable. Installez-le ou exportez JAVA_HOME vers un JDK 21." ; exit 1
fi
echo "✅ JDK 21 : $JDK21"

# 2. Infra Docker (Postgres du Hub sur 5544 pour éviter un conflit avec un Postgres local sur 5432)
echo "▶ Démarrage Postgres + Redis…"
docker compose up -d postgres redis
echo "⏳ Attente de Postgres…"
for i in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U payhub >/dev/null 2>&1 && break; sleep 1
done

# 3. Application
echo "▶ Démarrage du Payment Hub sur http://localhost:8090 …"
export JAVA_HOME="$JDK21"
export PATH="$JDK21/bin:$PATH"
export R2DBC_URL="r2dbc:postgresql://localhost:5544/payhub"
export JDBC_URL="jdbc:postgresql://localhost:5544/payhub"
export REDIS_URL="redis://localhost:6379"
exec mvn spring-boot:run
