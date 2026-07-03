package com.firstpay.partner.infra;

import com.firstpay.partner.api.dto.Dtos.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Orchestration de l'initiation de paiement PUBLIQUE. Le point critique est la VALIDATION
 * CÔTÉ SERVEUR : le montant, le moyen et les champs requis sont (re)vérifiés à partir de la
 * config réelle de l'interface — jamais sur la seule confiance de ce que le client envoie.
 * Le montant payé ne peut donc pas être falsifié depuis le navigateur.
 */
@Service
public class PublicCheckoutService {

    private final PublicCheckoutStore store;
    private final TransactionClient transactions;

    public PublicCheckoutService(PublicCheckoutStore store, TransactionClient transactions) {
        this.store = store;
        this.transactions = transactions;
    }

    public Mono<PublicPayResponse> initiate(String shortCode, String slug, PublicPayRequest req) {
        return store.resolveInternal(shortCode, slug)
            .switchIfEmpty(Mono.error(notFound()))
            .flatMap(it -> {
                String method = req != null ? req.method() : null;
                validateMethod(it, method);
                BigDecimal amount = resolveAmount(it, req);
                validateRequiredFields(it, req);
                validatePhone(method, req);

                String reference = buildReference(it);
                Map<String, Object> metadata = buildMetadata(it, req, reference);
                String idempotencyKey = UUID.randomUUID().toString();

                return transactions.createTransaction(
                        it.tenantId(), idempotencyKey, reference, amount, it.currency(), method, metadata)
                    .map(txId -> new PublicPayResponse(txId, reference, "PENDING"));
            });
    }

    public Mono<PublicTxStatusDto> status(String transactionId) {
        return transactions.status(transactionId)
            .switchIfEmpty(Mono.error(new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Transaction introuvable")));
    }

    /* ----------------------------- validations ----------------------------- */

    private void validateMethod(PublicCheckoutStore.Resolved it, String method) {
        if (method == null || method.isBlank() || !Boolean.TRUE.equals(it.methods().get(method))) {
            throw badRequest("Moyen de paiement non disponible pour cette interface");
        }
    }

    /** Détermine le montant à débiter à partir du type d'interface — source de vérité serveur. */
    private BigDecimal resolveAmount(PublicCheckoutStore.Resolved it, PublicPayRequest req) {
        switch (it.amountType()) {
            case "fixed" -> {
                BigDecimal fixed = parse(it.fixedAmount());
                if (fixed == null || fixed.signum() <= 0) throw badRequest("Montant de l'interface non configuré");
                return fixed;
            }
            case "preset" -> {
                List<Long> selected = selectedPresetIds(it, req);
                if (selected.isEmpty()) throw badRequest("Veuillez choisir un montant proposé");
                Map<String, String> partials = req != null && req.presetAmounts() != null
                    ? req.presetAmounts() : Map.of();
                BigDecimal total = BigDecimal.ZERO;
                for (Long pid : selected) {
                    PresetDto preset = it.presets().stream()
                        .filter(p -> p.id() == pid)
                        .findFirst()
                        .orElseThrow(() -> badRequest("Montant proposé invalide"));
                    BigDecimal full = parse(preset.amount());
                    if (full == null || full.signum() <= 0) throw badRequest("Montant proposé invalide");
                    total = total.add(payableForPreset(preset, full, partials.get(String.valueOf(pid))));
                }
                if (total.signum() <= 0) throw badRequest("Montant invalide");
                return total;
            }
            case "free" -> {
                BigDecimal amount = parse(req != null ? req.amount() : null);
                if (amount == null || amount.signum() <= 0) throw badRequest("Montant invalide");
                BigDecimal min = parse(it.minAmount());
                BigDecimal max = parse(it.maxAmount());
                if (min != null && amount.compareTo(min) < 0) throw badRequest("Montant inférieur au minimum autorisé");
                if (max != null && amount.compareTo(max) > 0) throw badRequest("Montant supérieur au maximum autorisé");
                return amount;
            }
            default -> throw badRequest("Type de montant inconnu");
        }
    }

    /**
     * Détermine les frais sélectionnés. En sélection multiple (panier), on lit {@code presetIds}
     * (avec repli sur {@code presetId} pour un vieux client) ; sinon un seul frais.
     */
    private List<Long> selectedPresetIds(PublicCheckoutStore.Resolved it, PublicPayRequest req) {
        if (req == null) return List.of();
        if (it.multiSelect()) {
            List<Long> ids = req.presetIds();
            if (ids != null && !ids.isEmpty()) {
                return ids.stream().filter(Objects::nonNull).distinct().toList();
            }
            return req.presetId() != null ? List.of(req.presetId()) : List.of();
        }
        if (req.presetId() != null) return List.of(req.presetId());
        if (req.presetIds() != null && !req.presetIds().isEmpty()) return List.of(req.presetIds().get(0));
        return List.of();
    }

    /**
     * Montant à débiter pour un frais donné. Par défaut le montant complet ; si le frais autorise
     * l'acompte et qu'un montant partiel valide est fourni, on l'accepte entre le minimum configuré
     * et le montant complet (bornes vérifiées côté serveur — jamais sur la seule saisie navigateur).
     */
    private BigDecimal payableForPreset(PresetDto preset, BigDecimal full, String customAmount) {
        if (!preset.allowPartial() || customAmount == null || customAmount.isBlank()) {
            return full;
        }
        BigDecimal part = parse(customAmount);
        if (part == null || part.signum() <= 0) throw badRequest("Montant d'acompte invalide");
        BigDecimal min = parse(preset.minAmount());
        if (min != null && part.compareTo(min) < 0) {
            throw badRequest("Acompte inférieur au minimum autorisé pour « " + preset.label() + " »");
        }
        if (part.compareTo(full) > 0) {
            throw badRequest("Acompte supérieur au montant du frais « " + preset.label() + " »");
        }
        return part;
    }

    private void validateRequiredFields(PublicCheckoutStore.Resolved it, PublicPayRequest req) {
        Map<String, String> provided = req != null && req.fields() != null ? req.fields() : Map.of();
        for (InterfaceFieldDto f : it.customFields()) {
            // Un champ en lecture seule est auto-rempli (données importées), pas saisi par le payeur :
            // l'exigence « requis » ne s'applique donc pas au formulaire public.
            if (f.required() && !f.readonly()) {
                String v = provided.get(f.id());
                if (v == null || v.isBlank()) {
                    throw badRequest("Champ requis manquant : " + f.label());
                }
            }
        }
    }

    private void validatePhone(String method, PublicPayRequest req) {
        boolean mobileMoney = "orange".equals(method) || "mtn".equals(method);
        if (mobileMoney) {
            String phone = req != null ? req.phone() : null;
            if (phone == null || phone.replaceAll("\\D", "").length() < 8) {
                throw badRequest("Numéro de téléphone invalide");
            }
        }
    }

    /* ----------------------------- helpers ----------------------------- */

    private Map<String, Object> buildMetadata(PublicCheckoutStore.Resolved it, PublicPayRequest req, String reference) {
        Map<String, Object> md = new HashMap<>();
        md.put("interfaceId", it.interfaceId());
        md.put("interfaceName", it.name());
        md.put("reference", reference);
        md.put("channel", "public-link");
        if (req != null) {
            if (req.payer() != null && !req.payer().isBlank()) md.put("payer", req.payer());
            if (req.phone() != null && !req.phone().isBlank()) md.put("phone", req.phone());
            if (req.fields() != null && !req.fields().isEmpty()) md.put("fields", req.fields());
        }
        // Détail des frais réglés (utile aux reçus / rapprochements), en particulier pour un panier multi-frais.
        if ("preset".equals(it.amountType())) {
            Map<String, String> partials = req != null && req.presetAmounts() != null ? req.presetAmounts() : Map.of();
            var fees = new java.util.ArrayList<Map<String, Object>>();
            for (Long pid : selectedPresetIds(it, req)) {
                it.presets().stream().filter(p -> p.id() == pid).findFirst().ifPresent(preset -> {
                    BigDecimal full = parse(preset.amount());
                    if (full != null && full.signum() > 0) {
                        BigDecimal payable = payableForPreset(preset, full, partials.get(String.valueOf(pid)));
                        Map<String, Object> line = new HashMap<>();
                        line.put("id", pid);
                        line.put("label", preset.label());
                        line.put("amount", payable.stripTrailingZeros().toPlainString());
                        line.put("partial", payable.compareTo(full) < 0);
                        fees.add(line);
                    }
                });
            }
            if (!fees.isEmpty()) md.put("fees", fees);
        }
        return md;
    }

    /** Référence auto (FP-XXXXXXXXX) ; pour refType=custom on garde le même format faute de saisie payeur. */
    private String buildReference(PublicCheckoutStore.Resolved it) {
        long n = 100_000_000L + ThreadLocalRandom.current().nextLong(900_000_000L);
        return "FP-" + n;
    }

    private static BigDecimal parse(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return new BigDecimal(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static ResponseStatusException badRequest(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Page de paiement introuvable ou indisponible");
    }
}
