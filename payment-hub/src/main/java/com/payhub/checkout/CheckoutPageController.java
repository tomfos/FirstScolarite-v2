package com.payhub.checkout;

import com.payhub.payment.Payment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * Sert la page de paiement hébergée ({@code /checkout/{id}}) et gère le retour des moyens
 * hébergés ({@code /checkout/{id}/return}). La page (statique) lit l'id et le jeton {@code cs}
 * depuis l'URL puis appelle {@code /checkout/api/**}. Les assets sont sous {@code /checkout-app/**}.
 */
@RestController
public class CheckoutPageController {

    private final Resource page = new ClassPathResource("static/checkout-app/index.html");
    private final CheckoutService service;

    public CheckoutPageController(CheckoutService service) {
        this.service = service;
    }

    @GetMapping(value = "/checkout/{id}", produces = MediaType.TEXT_HTML_VALUE)
    public Resource page(@PathVariable UUID id) {
        return page;
    }

    /**
     * Retour du payeur depuis la page d'un PSP hébergé (ex. MPGS). Vérifie l'ordre côté serveur,
     * finalise le paiement, puis renvoie une page qui notifie la fenêtre parente (widget).
     */
    @GetMapping(value = "/checkout/{id}/return", produces = MediaType.TEXT_HTML_VALUE)
    public Mono<String> hostedReturn(@PathVariable UUID id, @RequestParam("cs") String cs) {
        return service.completeHosted(id, cs)
            .map(p -> resultPage(p))
            .onErrorReturn(resultPage(null));
    }

    private static String resultPage(Payment p) {
        String status = p != null ? p.status() : "PENDING";
        String returnUrl = p != null && p.returnUrl() != null ? p.returnUrl() : "";
        boolean ok = "SUCCESS".equals(status);
        String icon = ok ? "✅" : ("PENDING".equals(status) ? "⏳" : "❌");
        String title = ok ? "Paiement réussi" : ("PENDING".equals(status) ? "En attente" : "Paiement échoué");
        return """
            <!doctype html><html lang="fr"><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1"><title>Paiement</title>
            <style>body{font-family:Inter,-apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;
            align-items:center;justify-content:center;height:100vh;margin:0;background:#f4f5f7;color:#1f2430}
            .i{font-size:52px}h2{margin:14px 0 6px}p{color:#7c8493}a{margin-top:16px;padding:12px 20px;background:#E53935;
            color:#fff;border-radius:10px;text-decoration:none}</style></head><body>
            <div class="i">%s</div><h2>%s</h2><p>Statut : %s</p>%s
            <script>try{if(window.parent!==window)window.parent.postMessage({source:'payhub',type:'payment',status:'%s'},'*');}catch(e){}</script>
            </body></html>
            """.formatted(icon, title, status,
                returnUrl.isBlank() ? "" : "<a href=\"" + returnUrl + "\">Continuer</a>", status);
    }
}
