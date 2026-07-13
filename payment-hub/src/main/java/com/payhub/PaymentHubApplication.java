package com.payhub;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Payment Hub — service de paiement central, autonome et réutilisable.
 *
 * <p>Une seule application déployable qui expose, à plusieurs applications clientes,
 * un jeu de moyens de paiement (Orange Money / MTN MoMo via TrustPayWay, carte via MPGS,
 * SARA, virement…) activables/désactivables par application. Toute la configuration
 * (providers + credentials + moyens actifs) vit ici, jamais dans les applications clientes.
 */
@SpringBootApplication
@EnableScheduling
public class PaymentHubApplication {
    public static void main(String[] args) {
        SpringApplication.run(PaymentHubApplication.class, args);
    }
}
