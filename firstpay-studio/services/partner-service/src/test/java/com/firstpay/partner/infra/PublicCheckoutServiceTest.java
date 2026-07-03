package com.firstpay.partner.infra;

import com.firstpay.partner.api.dto.Dtos.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Verrouille le calcul du montant à débiter — la vérité serveur — pour les frais prédéfinis :
 * sélection simple, panier multi-frais et acompte (versement partiel borné par le minimum).
 */
class PublicCheckoutServiceTest {

    private final PublicCheckoutStore store = mock(PublicCheckoutStore.class);
    private final TransactionClient transactions = mock(TransactionClient.class);
    private final PublicCheckoutService service = new PublicCheckoutService(store, transactions);

    private static final UUID TENANT = UUID.randomUUID();

    private PublicCheckoutStore.Resolved presetInterface(boolean multiSelect, List<PresetDto> presets) {
        return new PublicCheckoutStore.Resolved(
            TENANT, "iface-1", "Frais", "", "Éducation", "frais",
            "preset", "", "", "", "XAF",
            presets, multiSelect, "auto", "", "any",
            List.of(), Map.of("orange", true, "mtn", true, "card", false, "transfer", false),
            new PublicMerchantDto("SOFT", "SOFT", null, "#E53935"));
    }

    /** Capture le montant transmis à la transaction-service lors d'un initiate réussi. */
    private BigDecimal initiatedAmount(PublicCheckoutStore.Resolved resolved, PublicPayRequest req) {
        when(store.resolveInternal(anyString(), anyString())).thenReturn(Mono.just(resolved));
        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        when(transactions.createTransaction(any(), anyString(), anyString(), amount.capture(),
            anyString(), anyString(), anyMap())).thenReturn(Mono.just("tx-1"));

        StepVerifier.create(service.initiate("SOFT", "frais", req))
            .expectNextMatches(r -> "PENDING".equals(r.status()))
            .verifyComplete();
        return amount.getValue();
    }

    private PublicPayRequest req(Long presetId, List<Long> presetIds, Map<String, String> presetAmounts) {
        return new PublicPayRequest("orange", null, "+237699112233", "Marie", presetId, presetIds, presetAmounts, Map.of());
    }

    @Test
    void singlePreset_usesConfiguredAmount() {
        var it = presetInterface(false, List.of(new PresetDto(1, "Inscription", "25000", false, "")));
        assertThat(initiatedAmount(it, req(1L, null, null))).isEqualByComparingTo("25000");
    }

    @Test
    void multiSelect_sumsSelectedFees() {
        var it = presetInterface(true, List.of(
            new PresetDto(1, "Inscription", "25000", false, ""),
            new PresetDto(2, "Tranche 1", "150000", false, ""),
            new PresetDto(3, "Tranche 2", "150000", false, "")));
        assertThat(initiatedAmount(it, req(null, List.of(1L, 2L), null))).isEqualByComparingTo("175000");
    }

    @Test
    void partialPayment_acceptsCustomAmountAboveMinimum() {
        var it = presetInterface(false, List.of(new PresetDto(1, "Scolarité", "150000", true, "50000")));
        assertThat(initiatedAmount(it, req(null, List.of(1L), Map.of("1", "60000"))))
            .isEqualByComparingTo("60000");
    }

    @Test
    void partialPayment_belowMinimum_isRejected() {
        var it = presetInterface(false, List.of(new PresetDto(1, "Scolarité", "150000", true, "50000")));
        when(store.resolveInternal(anyString(), anyString())).thenReturn(Mono.just(it));

        StepVerifier.create(service.initiate("SOFT", "frais", req(null, List.of(1L), Map.of("1", "40000"))))
            .expectErrorMatches(e -> e instanceof ResponseStatusException
                && ((ResponseStatusException) e).getReason().contains("minimum"))
            .verify();
        verify(transactions, never()).createTransaction(any(), anyString(), anyString(), any(), anyString(), anyString(), anyMap());
    }

    @Test
    void partialPayment_ignoredWhenNotAllowed_chargesFull() {
        // allowPartial=false → un montant custom envoyé par un client malveillant est ignoré.
        var it = presetInterface(false, List.of(new PresetDto(1, "Scolarité", "150000", false, "")));
        assertThat(initiatedAmount(it, req(null, List.of(1L), Map.of("1", "10"))))
            .isEqualByComparingTo("150000");
    }

    @Test
    void noSelection_isRejected() {
        var it = presetInterface(true, List.of(new PresetDto(1, "Inscription", "25000", false, "")));
        when(store.resolveInternal(anyString(), anyString())).thenReturn(Mono.just(it));

        StepVerifier.create(service.initiate("SOFT", "frais", req(null, List.of(), null)))
            .expectError(ResponseStatusException.class)
            .verify();
    }
}
