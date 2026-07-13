package com.payhub.admin;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sert la console d'administration (statique) sur {@code /console}. Elle appelle
 * {@code /admin/api/**} en passant le jeton {@code X-Admin-Token} saisi par l'opérateur.
 */
@RestController
public class ConsolePageController {

    private final Resource page = new ClassPathResource("static/admin-app/index.html");

    @GetMapping(value = "/console", produces = MediaType.TEXT_HTML_VALUE)
    public Resource console() {
        return page;
    }
}
