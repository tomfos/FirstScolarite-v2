import { Injectable, signal } from '@angular/core';

export interface Partner {
  name: string; code: string; shortCode: string; sector: string;
}

const TENANT_KEY = 'fp_tenant';

/** Contexte tenant courant (partenaire actif). Source du header X-Tenant-Id. */
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly _partner = signal<Partner | null>(null);
  private readonly _tenantId = signal<string | null>(null);
  private readonly _apiKey = signal<string | null>(null);

  readonly partner = this._partner.asReadonly();
  readonly tenantId = this._tenantId.asReadonly();
  readonly apiKey = this._apiKey.asReadonly();

  constructor() { this.restore(); }

  setPartner(p: Partner | null) { this._partner.set(p); this.persist(); }
  setTenantId(id: string | null) { this._tenantId.set(id); this.persist(); }
  setApiKey(key: string | null) { this._apiKey.set(key); this.persist(); }

  /** Réinitialise le contexte (à la déconnexion). */
  clear() {
    this._partner.set(null);
    this._tenantId.set(null);
    this._apiKey.set(null);
    try { localStorage.removeItem(TENANT_KEY); } catch { /* ignore */ }
  }

  private persist() {
    try {
      localStorage.setItem(TENANT_KEY, JSON.stringify({
        partner: this._partner(), tenantId: this._tenantId(), apiKey: this._apiKey(),
      }));
    } catch { /* stockage indisponible */ }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(TENANT_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { partner: Partner | null; tenantId: string | null; apiKey: string | null };
      this._partner.set(s.partner ?? null);
      this._tenantId.set(s.tenantId ?? null);
      this._apiKey.set(s.apiKey ?? null);
    } catch { /* données corrompues */ }
  }
}
