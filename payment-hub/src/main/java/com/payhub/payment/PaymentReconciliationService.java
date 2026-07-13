package com.payhub.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import reactor.core.scheduler.Schedulers;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Filet de sécurité : interroge périodiquement les paiements restés PENDING (webhook perdu,
 * payeur lent) et les finalise. Garantit qu'aucun paiement ne reste bloqué en attente.
 */
@Service
public class PaymentReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(PaymentReconciliationService.class);

    private final PaymentStore payments;
    private final PaymentFinalizer finalizer;
    private final AtomicBoolean running = new AtomicBoolean(false);   // anti-chevauchement

    public PaymentReconciliationService(PaymentStore payments, PaymentFinalizer finalizer) {
        this.payments = payments;
        this.finalizer = finalizer;
    }

    @Scheduled(fixedDelayString = "${payhub.payment.reconcile-interval-ms:30000}")
    public void reconcile() {
        if (!running.compareAndSet(false, true)) return;
        payments.findPendingWithProviderRef()
            .flatMap(finalizer::finalize, 8)
            .doOnError(e -> log.warn("Réconciliation : {}", e.getMessage()))
            .doFinally(s -> running.set(false))
            .subscribeOn(Schedulers.boundedElastic())
            .subscribe();
    }
}
