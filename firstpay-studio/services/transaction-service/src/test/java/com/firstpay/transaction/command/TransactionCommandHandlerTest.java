package com.firstpay.transaction.command;

import com.firstpay.transaction.domain.Transaction;
import com.firstpay.transaction.domain.TransactionStore;
import com.firstpay.transaction.infra.EventStore;
import com.firstpay.transaction.infra.OutboxEventPublisher;
import com.firstpay.transaction.infra.TransactionEventStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.ReactiveValueOperations;
import org.springframework.transaction.ReactiveTransaction;
import org.springframework.transaction.ReactiveTransactionManager;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Vérifie la DoD de la Phase 2 : la création est idempotente — un rejeu renvoie la
 * MÊME transaction et n'insère pas de doublon.
 */
class TransactionCommandHandlerTest {

    private TransactionStore store;
    private ReactiveStringRedisTemplate redis;
    private ReactiveValueOperations<String, String> valueOps;
    private OutboxEventPublisher outbox;
    private EventStore eventStore;
    private TransactionEventStream events;
    private ReactiveTransactionManager txManager;
    private TransactionCommandHandler handler;

    private final UUID tenant = UUID.randomUUID();

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setup() {
        store = mock(TransactionStore.class);
        redis = mock(ReactiveStringRedisTemplate.class);
        valueOps = mock(ReactiveValueOperations.class);
        outbox = mock(OutboxEventPublisher.class);
        eventStore = mock(EventStore.class);
        events = mock(TransactionEventStream.class);
        when(redis.opsForValue()).thenReturn(valueOps);
        when(outbox.publish(any(), any(), anyString(), anyString())).thenReturn(Mono.empty());
        when(eventStore.append(any(), any(), anyString(), anyString())).thenReturn(Mono.empty());
        when(store.insert(any())).thenAnswer(inv -> Mono.just(inv.getArgument(0)));
        when(store.updateStatus(any(), anyString())).thenReturn(Mono.just(1L));
        txManager = mock(ReactiveTransactionManager.class);
        when(txManager.getReactiveTransaction(any())).thenReturn(Mono.just(mock(ReactiveTransaction.class)));
        when(txManager.commit(any())).thenReturn(Mono.empty());
        when(txManager.rollback(any())).thenReturn(Mono.empty());
        handler = new TransactionCommandHandler(store, redis, outbox, eventStore, events, txManager);
    }

    private TransactionCommand.CreateTransaction cmd() {
        return new TransactionCommand.CreateTransaction(
            tenant, "REF-1", new BigDecimal("25000"), "XAF", "PAYMENT", "orange", "idem-123", null);
    }

    @Test
    void firstCall_insertsAndEmits() {
        when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(Mono.just(true));

        StepVerifier.create(handler.handle(cmd()))
            .assertNext(tx -> {
                assert tx.getStatus().equals("PENDING");
                assert tx.getTenantId().equals(tenant);
            })
            .verifyComplete();

        verify(store).insert(any());
        verify(eventStore).append(any(), eq(tenant), eq("TransactionCreated"), anyString());
        verify(outbox).publish(any(), eq(tenant), eq("TransactionCreated"), anyString());
        verify(events).emit(any());
    }

    @Test
    void refund_onSuccessTx_marksRefundedAndAppendsEvent() {
        Transaction tx = Transaction.create(tenant, "REF-1", new BigDecimal("25000"), "XAF", "PAYMENT", "orange", "idem-9");
        tx.markProcessed(); // SUCCESS
        when(store.findById(tx.getId())).thenReturn(Mono.just(tx));

        StepVerifier.create(handler.handle(new TransactionCommand.RefundTransaction(tx.getId(), tenant, null)))
            .assertNext(t -> { assert t.getStatus().equals("REFUNDED"); })
            .verifyComplete();

        verify(store).updateStatus(tx.getId(), "REFUNDED");
        verify(eventStore).append(any(), eq(tenant), eq("TransactionRefunded"), anyString());
    }

    @Test
    void refund_onPendingTx_isRejected() {
        Transaction tx = Transaction.create(tenant, "REF-1", new BigDecimal("25000"), "XAF", "PAYMENT", "orange", "idem-8");
        when(store.findById(tx.getId())).thenReturn(Mono.just(tx)); // PENDING

        StepVerifier.create(handler.handle(new TransactionCommand.RefundTransaction(tx.getId(), tenant, null)))
            .expectError(IllegalStateException.class)
            .verify();

        verify(store, never()).updateStatus(any(), eq("REFUNDED"));
    }

    @Test
    void duplicateCall_returnsExisting_noInsert() {
        Transaction existing = Transaction.create(tenant, "REF-1", new BigDecimal("25000"), "XAF", "PAYMENT", "orange", "idem-123");
        when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(Mono.just(false));
        when(store.findByIdempotencyKey(tenant, "idem-123")).thenReturn(Mono.just(existing));

        StepVerifier.create(handler.handle(cmd()))
            .assertNext(tx -> { assert tx.getId().equals(existing.getId()); })
            .verifyComplete();

        verify(store, never()).insert(any());
        verify(store).findByIdempotencyKey(tenant, "idem-123");
    }
}
