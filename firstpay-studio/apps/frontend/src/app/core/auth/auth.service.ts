import { Injectable, computed, signal } from '@angular/core';
import { Account, ROLES_CATALOG, RoleId } from './roles';

/**
 * État d'authentification basé sur les Signals. Gère aussi l'impersonation
 * (un bank_admin qui délègue sur un partenaire devient partner_admin).
 */
const AUTH_KEY = 'fp_auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<Account | null>(null);
  private readonly _impersonatedPartner = signal<string | null>(null);
  private readonly _token = signal<string | null>(null);
  private readonly _bankToken = signal<string | null>(null);

  constructor() { this.restore(); }

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  /** Rôle effectif (tient compte de l'impersonation). */
  readonly effectiveRole = computed<RoleId | null>(() => {
    const u = this._user();
    if (!u) return null;
    return this._impersonatedPartner() ? 'partner_admin' : u.role;
  });

  readonly roleDef = computed(() => {
    const r = this.effectiveRole();
    return r ? ROLES_CATALOG[r] : null;
  });

  readonly isBank = computed(() => this.roleDef()?.side === 'bank');
  readonly isImpersonating = computed(() => this._impersonatedPartner() !== null);

  token() { return this._token(); }

  login(account: Account, token: string | null = null) {
    this._user.set(account);
    this._token.set(token);
    this.persist();
  }

  setToken(token: string | null) { this._token.set(token); this.persist(); }

  logout() {
    this._user.set(null);
    this._impersonatedPartner.set(null);
    this._token.set(null);
    this._bankToken.set(null);
    try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
  }

  impersonate(partnerName: string, delegatedToken?: string) {
    if (!this._impersonatedPartner()) {
      this._bankToken.set(this._token());
    }
    if (delegatedToken) this._token.set(delegatedToken);
    this._impersonatedPartner.set(partnerName);
    this.persist();
  }

  exitImpersonate() {
    const bank = this._bankToken();
    if (bank) this._token.set(bank);
    this._bankToken.set(null);
    this._impersonatedPartner.set(null);
    this.persist();
  }

  /** Sauvegarde la session pour survivre à un rafraîchissement de page. */
  private persist() {
    try {
      const u = this._user();
      if (!u) { localStorage.removeItem(AUTH_KEY); return; }
      localStorage.setItem(AUTH_KEY, JSON.stringify({
        user: u,
        token: this._token(),
        imp: this._impersonatedPartner(),
        bankToken: this._bankToken(),
      }));
    } catch { /* stockage indisponible → session mémoire seulement */ }
  }

  /** Restaure la session au démarrage ; ignore un JWT expiré (re-login forcé). */
  private restore() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        user: Account | null; token: string | null; imp: string | null; bankToken: string | null;
      };
      if (!s?.user) return;
      if (isJwtExpired(s.token) || isJwtExpired(s.bankToken)) {
        localStorage.removeItem(AUTH_KEY);
        return;
      }
      this._user.set(s.user);
      this._token.set(s.token ?? null);
      this._impersonatedPartner.set(s.imp ?? null);
      this._bankToken.set(s.bankToken ?? null);
    } catch { /* données corrompues → session vierge */ }
  }

  hasPerm(perm: string): boolean {
    const perms = this.roleDef()?.perms ?? [];
    return perms.includes('*') || perms.includes(perm)
      || perms.some((p) => p.endsWith('.*') && perm.startsWith(p.slice(0, -1)));
  }
}

/** true seulement si `token` est un JWT valide dont l'exp est passé. Null / non-JWT → false. */
function isJwtExpired(token: string | null): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}
