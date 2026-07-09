package com.firstpay.partner.api;

import com.firstpay.partner.infra.PlatformStore;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Disponibilité des moyens de paiement à l'échelle de la plateforme, dérivée des réglages
 * administrateur (agrégateur TrustPayWay, passerelle carte MPGS). Contrairement à
 * {@link PlatformController} (réservé au bank_admin et exposant les identifiants), cet endpoint
 * ne renvoie que des booléens sans secret : il peut donc être lu par les utilisateurs studio
 * pour n'afficher, à la création d'une interface, que les moyens réellement configurés.
 *
 * <p>Monté sous /api/v1/settings/payment-methods (routé vers partner-service via
 * /api/v1/settings/**, déjà autorisé par la gateway). Correspondance :
 * <ul>
 *   <li>{@code aggEnabled}  ⇒ orange + mtn (Mobile Money via l'agrégateur)</li>
 *   <li>{@code mpgsEnabled} ⇒ card (carte bancaire via MPGS)</li>
 *   <li>transfer : pas de réglage admin dédié pour l'instant ⇒ masqué (false)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/settings/payment-methods")
public class PaymentMethodsController {

    private final PlatformStore platform;

    public PaymentMethodsController(PlatformStore platform) {
        this.platform = platform;
    }

    @GetMapping
    public Mono<Map<String, Boolean>> available() {
        return platform.getRaw().map(s -> {
            boolean agg = s.aggEnabled();
            boolean card = s.mpgsEnabled();
            Map<String, Boolean> out = new LinkedHashMap<>();
            out.put("orange", agg);
            out.put("mtn", agg);
            out.put("card", card);
            out.put("transfer", false);
            return out;
        });
    }
}
