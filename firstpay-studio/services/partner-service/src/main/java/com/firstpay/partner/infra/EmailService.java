package com.firstpay.partner.infra;

import com.firstpay.partner.api.dto.Dtos.PlatformSettingsDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.Properties;

/**
 * Envoi d'emails via le SMTP configuré dans les paramètres plateforme (construit à la
 * volée à partir de la base — config dynamique modifiable par l'admin sans redéploiement).
 * Best-effort : un échec d'envoi n'interrompt jamais le flux appelant (ex. création de partenaire).
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final PlatformStore platform;
    /** Défaut applicatif (option 3, env APP_PUBLIC_BASE_URL) — filet de sécurité, jamais localhost en prod. */
    private final String defaultBaseUrl;

    public EmailService(PlatformStore platform,
                        @Value("${app.public-base-url:http://localhost:14200}") String defaultBaseUrl) {
        this.platform = platform;
        this.defaultBaseUrl = defaultBaseUrl;
    }

    /**
     * Email de connexion à un nouveau partenaire : lien de l'appli + identifiants temporaires.
     *
     * @param requestBaseUrl URL publique dérivée de la requête courante (option 2), ou {@code null}.
     */
    public Mono<Boolean> sendConnectionEmail(String toEmail, String toName, String partnerName,
                                             String tempPassword, String requestBaseUrl) {
        if (toEmail == null || toEmail.isBlank()) return Mono.just(false);
        return platform.getRaw().flatMap(cfg -> {
            if (!cfg.smtpEnabled() || cfg.smtpHost() == null || cfg.smtpHost().isBlank()) {
                log.info("SMTP désactivé/non configuré — email de connexion à {} non envoyé (partenaire {}).", toEmail, partnerName);
                return Mono.just(false);
            }
            String subject = "Votre accès au portail FirstPay — " + partnerName;
            String portalUrl = resolvePortalUrl(requestBaseUrl, cfg.appBaseUrl());
            String body = """
                Bonjour %s,

                Votre espace partenaire « %s » vient d'être créé sur FirstPay (Afriland First Bank).

                Accédez au portail : %s

                Identifiants de première connexion :
                  • Email : %s
                  • Mot de passe temporaire : %s

                Merci de modifier votre mot de passe après la première connexion.

                — L'équipe FirstPay, Afriland First Bank
                """.formatted(toName == null ? "" : toName, partnerName,
                              portalUrl, toEmail, tempPassword);
            return Mono.fromCallable(() -> { send(cfg, toEmail, subject, body); return true; })
                .subscribeOn(Schedulers.boundedElastic())
                .onErrorResume(e -> { log.warn("Échec d'envoi email à {} : {}", toEmail, e.getMessage()); return Mono.just(false); });
        });
    }

    /**
     * URL du portail insérée dans l'email de connexion. Priorité :
     * <ol>
     *   <li>host de la requête courante (option 2, SaaS multi-domaines) ;</li>
     *   <li>valeur configurée par l'admin dans « Paramètres plateforme » (si explicite) ;</li>
     *   <li>défaut applicatif {@code app.public-base-url} (option 3, env) — filet de sécurité.</li>
     * </ol>
     */
    private String resolvePortalUrl(String requestBaseUrl, String configuredUrl) {
        if (!isBlank(requestBaseUrl)) return stripTrailingSlash(requestBaseUrl);
        if (isConfigured(configuredUrl)) return stripTrailingSlash(configuredUrl);
        return stripTrailingSlash(defaultBaseUrl);
    }

    /** Vrai si l'admin a saisi une URL réelle (non vide et pas le placeholder localhost de dev). */
    private static boolean isConfigured(String url) {
        return !isBlank(url) && !url.startsWith("http://localhost");
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }

    private static String stripTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    /** Résultat d'un test SMTP : succès + message d'erreur réel en cas d'échec (affiché à l'admin). */
    public record TestResult(boolean sent, String error) {}

    /**
     * Envoi d'un email de test à partir de la config du <b>formulaire</b> (permet de tester avant
     * d'enregistrer). Les secrets vides du formulaire sont complétés par ceux stockés (l'UI ne
     * renvoie pas le mot de passe en clair). Renvoie la cause réelle en cas d'échec.
     */
    public Mono<TestResult> sendTest(PlatformSettingsDto form, String toEmail) {
        if (toEmail == null || toEmail.isBlank()) {
            return Mono.just(new TestResult(false, "Adresse de destination manquante."));
        }
        return platform.getRaw().flatMap(stored -> {
            PlatformSettingsDto cfg = mergeSecrets(form, stored);
            if (!cfg.smtpEnabled()) return Mono.just(new TestResult(false, "L'envoi d'emails est désactivé."));
            if (cfg.smtpHost() == null || cfg.smtpHost().isBlank()) {
                return Mono.just(new TestResult(false, "Hôte SMTP non renseigné."));
            }
            return Mono.fromCallable(() -> {
                    send(cfg, toEmail, "Test SMTP FirstPay",
                        "Ceci est un email de test envoyé depuis le portail FirstPay. Votre configuration SMTP fonctionne.");
                    return new TestResult(true, null);
                }).subscribeOn(Schedulers.boundedElastic())
                .onErrorResume(e -> {
                    String reason = rootMessage(e);
                    log.warn("Test SMTP échoué : {}", reason);
                    return Mono.just(new TestResult(false, reason));
                });
        });
    }

    /** Complète les secrets vides du formulaire par ceux déjà stockés (mot de passe non renvoyé par l'UI). */
    private static PlatformSettingsDto mergeSecrets(PlatformSettingsDto form, PlatformSettingsDto stored) {
        if (form == null) return stored;
        String pwd = (form.smtpPassword() == null || form.smtpPassword().isBlank())
            ? stored.smtpPassword() : form.smtpPassword();
        return new PlatformSettingsDto(
            form.smtpHost(), form.smtpPort(), form.smtpUsername(), pwd,
            form.smtpFromEmail(), form.smtpFromName(), form.smtpUseTls(), form.smtpEnabled(),
            form.appBaseUrl(), false,
            form.aggEnabled(), form.aggBaseUrl(), form.aggAppId(), form.aggSecret(), false,
            form.aggMode(), form.aggSandboxBaseUrl(), form.aggSandboxAppId(), form.aggSandboxSecret(), false,
            form.mpgsEnabled(), form.mpgsMode(), form.mpgsApiVersion(),
            form.mpgsHost(), form.mpgsMerchantId(), form.mpgsPassword(), false,
            form.mpgsSandboxHost(), form.mpgsSandboxMerchantId(), form.mpgsSandboxPassword(), false);
    }

    /** Message le plus informatif de la chaîne d'exceptions (ex. réponse 535 d'Office 365). */
    private static String rootMessage(Throwable e) {
        Throwable cur = e;
        String msg = e.getMessage();
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
            if (cur.getMessage() != null && !cur.getMessage().isBlank()) msg = cur.getMessage();
        }
        return msg == null || msg.isBlank() ? e.getClass().getSimpleName() : msg.trim();
    }

    private void send(PlatformSettingsDto cfg, String to, String subject, String body) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(cfg.smtpHost());
        sender.setPort(cfg.smtpPort());
        if (cfg.smtpUsername() != null && !cfg.smtpUsername().isBlank()) sender.setUsername(cfg.smtpUsername());
        if (cfg.smtpPassword() != null && !cfg.smtpPassword().isBlank()) sender.setPassword(cfg.smtpPassword());
        Properties props = sender.getJavaMailProperties();
        props.put("mail.transport.protocol", "smtp");
        props.put("mail.smtp.auth", String.valueOf(cfg.smtpUsername() != null && !cfg.smtpUsername().isBlank()));
        props.put("mail.smtp.starttls.enable", String.valueOf(cfg.smtpUseTls()));
        props.put("mail.smtp.connectiontimeout", "8000");
        props.put("mail.smtp.timeout", "8000");

        SimpleMailMessage msg = new SimpleMailMessage();
        String from = (cfg.smtpFromEmail() != null && !cfg.smtpFromEmail().isBlank())
            ? cfg.smtpFromEmail() : cfg.smtpUsername();
        msg.setFrom(from);
        msg.setTo(to);
        msg.setSubject(subject);
        msg.setText(body);
        sender.send(msg);
        log.info("Email « {} » envoyé à {}", subject, to);
    }
}
