import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ROLES_CATALOG } from './roles';

/** Bloque l'accès aux routes protégées si non authentifié. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.parseUrl('/login');
};

/**
 * Vérifie que le module de la route fait partie des modules du rôle effectif, et,
 * pour les modules réservés à un type de partenaire (`data.partnerTypes`), que le
 * partenaire connecté a bien ce type. Empêche l'accès direct par URL à un module
 * simplement caché de la nav (ex: /cards pour un partenaire non-EMF).
 */
export const moduleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const role = auth.effectiveRole();
  const required = route.data?.['module'] as string | undefined;
  const requiredPartnerTypes = route.data?.['partnerTypes'] as string[] | undefined;
  if (!role) return router.parseUrl('/login');
  if (required && !ROLES_CATALOG[role].modules.includes(required)) {
    return router.parseUrl('/' + ROLES_CATALOG[role].home);
  }
  if (requiredPartnerTypes && !requiredPartnerTypes.includes(auth.effectivePartnerType() ?? '')) {
    return router.parseUrl('/' + ROLES_CATALOG[role].home);
  }
  return true;
};
