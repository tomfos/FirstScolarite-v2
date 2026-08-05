package com.firstpay.transaction.integration;

import com.firstpay.transaction.command.TransactionCommand;
import com.firstpay.transaction.command.TransactionCommandHandler;
import com.firstpay.transaction.domain.TransactionStore;
import com.firstpay.transaction.infra.EventStore;
import com.firstpay.transaction.infra.OutboxEventPublisher;
import com.firstpay.transaction.infra.TransactionEventStream;
import io.r2dbc.spi.ConnectionFactories;
import io.r2dbc.spi.ConnectionFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.r2dbc.connection.R2dbcTransactionManager;
import org.springframework.r2dbc.core.DatabaseClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Test d'intégration de bout en bout (Postgres + Redis RÉELS via Testcontainers).
 * Valide la DoD haute performance : l'idempotence est garantie (rejeu → même id, un seul
 * INSERT) et le flux écrit bien dans la projection {@code transactions}, l'event store
 * {@code domain_events} et l'{@code outbox_events}.
 *
 * <p>Désactivé automatiquement si Docker n'est pas disponible ({@code disabledWithoutDocker}).
 */
@Testcontainers(disabledWithoutDocker = true)
class TransactionFlowIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("firstpay").withUsername("firstpay").withPassword("dev_password");

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
        .withExposedPorts(6379);

    static DatabaseClient db;
    static ReactiveStringRedisTemplate redis;
    static LettuceConnectionFactory redisFactory;
    static TransactionCommandHandler handler;

    @BeforeAll
    static void setup() {
        ConnectionFactory cf = ConnectionFactories.get(
            "r2dbc:postgresql://%s:%s@%s:%d/firstpay".formatted(
                POSTGRES.getUsername(), POSTGRES.getPassword(),
                POSTGRES.getHost(), POSTGRES.getFirstMappedPort()));
        db = DatabaseClient.create(cf);

        redisFactory = new LettuceConnectionFactory(REDIS.getHost(), REDIS.getMappedPort(6379));
        redisFactory.afterPropertiesSet();
        redis = new ReactiveStringRedisTemplate(redisFactory);

        // Schéma simplifié (non partitionné) suffisant pour valider le flux et l'idempotence.
        exec("""
            CREATE TABLE transactions (
              id UUID NOT NULL, tenant_id UUID NOT NULL, interface_id UUID,
              external_ref VARCHAR(100) NOT NULL, amount NUMERIC(19,4) NOT NULL,
              currency CHAR(3) NOT NULL DEFAULT 'XAF', status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
              type VARCHAR(30) NOT NULL, method VARCHAR(20), metadata JSONB,
              idempotency_key VARCHAR(255) NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(), processed_at TIMESTAMPTZ,
              PRIMARY KEY (id, created_at))
            """);
        exec("CREATE UNIQUE INDEX idx_tx_idem ON transactions (tenant_id, idempotency_key, created_at)");
        exec("""
            CREATE TABLE domain_events (
              id BIGSERIAL, aggregate_id UUID NOT NULL, aggregate_type VARCHAR(100) NOT NULL,
              event_type VARCHAR(100) NOT NULL, event_version INTEGER NOT NULL DEFAULT 1,
              tenant_id UUID NOT NULL, payload JSONB NOT NULL, metadata JSONB,
              occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (id, occurred_at))
            """);
        exec("""
            CREATE TABLE outbox_events (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_type VARCHAR(100) NOT NULL,
              aggregate_id UUID NOT NULL, event_type VARCHAR(100) NOT NULL, tenant_id UUID NOT NULL,
              payload JSONB NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
              retry_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              processed_at TIMESTAMPTZ)
            """);

        TransactionStore store = new TransactionStore(db);
        EventStore eventStore = new EventStore(db);
        OutboxEventPublisher outbox = new OutboxEventPublisher(db);
        TransactionEventStream events = new TransactionEventStream();
        R2dbcTransactionManager txManager = new R2dbcTransactionManager(cf);
        handler = new TransactionCommandHandler(store, redis, outbox, eventStore, events, txManager);
    }

    @AfterAll
    static void teardown() {
        if (redisFactory != null) redisFactory.destroy();
    }

    private static void exec(String sql) {
        db.sql(sql).fetch().rowsUpdated().block();
    }

    private TransactionCommand.CreateTransaction cmd(UUID tenant, String idem) {
        return new TransactionCommand.CreateTransaction(
            tenant, "REF-IT", new BigDecimal("25000"), "XAF", "PAYMENT", "orange", idem, null);
    }

    @Test
    void create_persistsTransaction_event_andOutbox() {
        UUID tenant = UUID.randomUUID();
        UUID id = handler.handle(cmd(tenant, "it-key-1")).map(t -> t.getId()).block();

        assertEquals(1L, count("SELECT count(*) FROM transactions WHERE tenant_id = '" + tenant + "'"));
        assertEquals(1L, count("SELECT count(*) FROM domain_events WHERE aggregate_id = '" + id + "' AND event_type = 'TransactionCreated'"));
        assertEquals(1L, count("SELECT count(*) FROM outbox_events WHERE aggregate_id = '" + id + "'"));
    }

    @Test
    void duplicateIdempotencyKey_returnsSameId_singleRow() {
        UUID tenant = UUID.randomUUID();
        UUID first = handler.handle(cmd(tenant, "it-key-2")).map(t -> t.getId()).block();
        UUID second = handler.handle(cmd(tenant, "it-key-2")).map(t -> t.getId()).block();

        assertEquals(first, second, "Un rejeu doit renvoyer la même transaction");
        assertEquals(1L, count("SELECT count(*) FROM transactions WHERE tenant_id = '" + tenant + "'"));
    }

    @Test
    void refund_onSuccessfulTransaction_setsRefundedAndAppendsEvent() {
        UUID tenant = UUID.randomUUID();
        UUID id = handler.handle(cmd(tenant, "it-key-3")).map(t -> t.getId()).block();
        // simule le traitement réussi
        db.sql("UPDATE transactions SET status = 'SUCCESS' WHERE id = '" + id + "'").fetch().rowsUpdated().block();

        StepVerifier.create(handler.handle(new TransactionCommand.RefundTransaction(id, tenant, null)))
            .assertNext(t -> assertEquals("REFUNDED", t.getStatus()))
            .verifyComplete();

        assertEquals(1L, count("SELECT count(*) FROM domain_events WHERE aggregate_id = '" + id + "' AND event_type = 'TransactionRefunded'"));
    }

    private long count(String sql) {
        Long n = db.sql(sql).map(row -> row.get(0, Long.class)).one().block();
        return n == null ? 0 : n;
    }
}
