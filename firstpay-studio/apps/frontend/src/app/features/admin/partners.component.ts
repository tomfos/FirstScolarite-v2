import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PartnerRecord } from '../../core/models/partner.model';
import { AuthService } from '../../core/auth/auth.service';
import { PartnerType } from '../../core/auth/roles';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PartnerApiService } from '../../core/api/partner-api.service';
import { AuditApiService } from '../../core/api/audit-api.service';
import { exportToExcel } from '../../shared/utils/excel-export.util';

interface Draft {
  name: string; sector: string; partnerType: string; adminName: string; adminEmail: string;
  settlementAccount: string; accountHolder: string; settlementBank: string;
}

const SECTORS = ['Fintech', 'Éducation', 'ONG / Associatif', 'Commerce', 'Santé', 'Transport', 'Autre'];

/**
 * Type fonctionnel du partenaire (voir roles.ts PartnerType) : conditionne les
 * modules qu'il verra à la connexion (ex. EMF -> commande de cartes). Séparé du
 * secteur, qui reste une info descriptive libre.
 */
const PARTNER_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'emf', label: 'EMF' },
];

@Component({
  selector: 'fp-partners',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './partners.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div>
          <div class="eyebrow">Plateforme First Collect · Supervision</div>
          <div class="title">Partenaires</div>
          <div class="subtitle">Tous les partenaires enrôlés. Cliquez sur « Ouvrir » pour vous connecter en leur nom et déboguer.</div>
        </div>
        <div class="head-right">
          <span class="count">{{ filtered().length }} partenaire(s)</span>
          <button class="ghost" [disabled]="exporting()" (click)="exportExcel()">
            {{ exporting() ? 'Export…' : '⭳ Exporter (Excel)' }}
          </button>
          <button class="new-btn" (click)="openCreate()">+ Nouveau partenaire</button>
        </div>
      </div>

      <div class="body">
        @if (error() && !draft()) { <div class="err">{{ error() }}</div> }
        <div class="search"><span>⌕</span>
          <input [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Rechercher par nom, code partenaire ou secteur…"></div>

        <div class="filters">
          @for (f of statusChips; track f.id) {
            <button class="chip" [class.on]="statusFilter() === f.id" (click)="statusFilter.set(f.id)">{{ f.label }}</button>
          }
        </div>

        <div class="table-scroll"><div class="table">
          <div class="thead"><div>Partenaire</div><div>Secteur</div><div>Type</div><div>Interfaces</div><div>Statut</div><div>Actions</div></div>
          @for (p of filtered(); track p.code; let i = $index) {
            <div class="trow" [class.alt]="i % 2 === 0">
              <div><div class="p-name">{{ p.name }}</div><div class="p-code mono">{{ p.code }}</div></div>
              <div class="muted">{{ p.sector }}</div>
              <div>
                <select class="type-select" [ngModel]="p.partnerType" [disabled]="typeSavingId() === p.tenantId"
                  (ngModelChange)="changeType(p, $event)">
                  @for (t of partnerTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                </select>
              </div>
              <div>{{ p.interfaces }}</div>
              <div>
                <span class="status" [class]="statusClass(p.status)">
                  <span class="dot"></span>{{ statusLabel(p.status) }}
                </span>
              </div>
              <div class="actions">
                @if (p.status === 'ACTIVE') {
                  <button class="mini" (click)="impersonate(p)" title="Se connecter en son nom">◉ Ouvrir</button>
                  <button class="mini ghost" [disabled]="busyId() === p.tenantId" (click)="suspendPartner(p)">Désactiver</button>
                  <button class="mini danger" [disabled]="busyId() === p.tenantId" (click)="deletePartner(p)">Supprimer</button>
                }
                @if (p.status === 'SUSPENDU') {
                  <button class="mini ghost" [disabled]="busyId() === p.tenantId" (click)="reactivatePartner(p)">Réactiver</button>
                  <button class="mini danger" [disabled]="busyId() === p.tenantId" (click)="deletePartner(p)">Supprimer</button>
                }
                @if (p.status === 'SUPPRIME') {
                  <span class="muted">—</span>
                }
              </div>
            </div>
          }
        </div></div>
      </div>

      <!-- Modale : création d'un partenaire -->
      @if (draft(); as d) {
        <div class="overlay" (click)="closeCreate()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="m-head">
              <div class="m-title">Nouveau partenaire</div>
              <button class="x" (click)="closeCreate()">✕</button>
            </div>

            @if (createdKey()) {
              <!-- Écran de succès : on montre l'API-key une seule fois -->
              <div class="m-body">
                <div class="ok-banner">✓ Partenaire « {{ d.name }} » créé.</div>

                @if (d.adminEmail) {
                  <div class="key-lbl">Identifiants de connexion de l'administrateur</div>
                  <div class="creds">
                    <div class="cred-row"><span>Email</span><b class="mono">{{ d.adminEmail }}</b></div>
                    <div class="cred-row"><span>Mot de passe temporaire</span><b class="mono">{{ createdPassword() }}</b></div>
                  </div>
                  <div class="hint">Un email contenant le lien de l'application et ces identifiants a été envoyé à l'administrateur (si le SMTP est activé). La connexion se fait par email + mot de passe.</div>
                }

                <div class="key-lbl">Clé API (accès machine-à-machine — affichée une seule fois)</div>
                <div class="key-box">
                  <span class="key mono">{{ createdKey() }}</span>
                  <button class="copy" (click)="copyKey()">{{ copied() ? '✓ Copié' : 'Copier' }}</button>
                </div>
              </div>
              <div class="m-foot"><button class="primary" (click)="closeCreate()">Terminer</button></div>
            } @else {
              <div class="m-body">
                @if (error()) { <div class="err">{{ error() }}</div> }
                <label class="fld"><span>Nom du partenaire <i>*</i></span>
                  <input [ngModel]="d.name" (ngModelChange)="patch({ name: $event })" placeholder="Ex : Boulangerie Du Coin"></label>
                <div class="two">
                  <label class="fld"><span>Secteur</span>
                    <select [ngModel]="d.sector" (ngModelChange)="patch({ sector: $event })">
                      @for (s of sectors; track s) { <option [value]="s">{{ s }}</option> }
                    </select></label>
                  <label class="fld"><span>Type de partenaire</span>
                    <select [ngModel]="d.partnerType" (ngModelChange)="patch({ partnerType: $event })">
                      @for (t of partnerTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                    </select></label>
                </div>
                <div class="two">
                  <label class="fld"><span>Nom de l'administrateur</span>
                    <input [ngModel]="d.adminName" (ngModelChange)="patch({ adminName: $event })" placeholder="Ex : Awa Touré"></label>
                  <label class="fld"><span>Email de l'administrateur</span>
                    <input type="email" [ngModel]="d.adminEmail" (ngModelChange)="patch({ adminEmail: $event })" placeholder="admin@partenaire.cm"></label>
                </div>

                <div class="section-sep">Compte de règlement (réception des fonds)</div>
                <label class="fld"><span>Numéro de compte <i>*</i></span>
                  <input [ngModel]="d.settlementAccount" (ngModelChange)="patch({ settlementAccount: formatCompte($event) })"
                    placeholder="Ex : 10005 00012 12345678901 23" maxlength="26" inputmode="numeric"></label>
                <div class="two">
                  <label class="fld"><span>Titulaire du compte</span>
                    <input [ngModel]="d.accountHolder" (ngModelChange)="patch({ accountHolder: $event })" placeholder="Ex : Clinique Saint-Luc SARL"></label>
                  <label class="fld"><span>Banque</span>
                    <input [ngModel]="d.settlementBank" (ngModelChange)="patch({ settlementBank: $event })" placeholder="Ex : Afriland First Bank"></label>
                </div>
              </div>
              <div class="m-foot">
                <button class="ghost" (click)="closeCreate()">Annuler</button>
                <button class="primary" [disabled]="!d.name || !d.settlementAccount || creating()" (click)="submitCreate()">
                  {{ creating() ? 'Création…' : 'Créer le partenaire' }}
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class PartnersComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantContextService);
  private readonly partnerApi = inject(PartnerApiService);
  private readonly audit = inject(AuditApiService);
  private readonly router = inject(Router);

  readonly search = signal('');
  readonly sectors = SECTORS;
  readonly partnerTypes = PARTNER_TYPES;
  private readonly rows = signal<PartnerRecord[]>([]);

  readonly statusFilter = signal<'all' | 'ACTIVE' | 'SUSPENDU' | 'SUPPRIME'>('all');
  readonly statusChips: { id: 'all' | 'ACTIVE' | 'SUSPENDU' | 'SUPPRIME'; label: string }[] = [
    { id: 'all', label: 'Tous' }, { id: 'ACTIVE', label: 'Actifs' },
    { id: 'SUSPENDU', label: 'Suspendus' }, { id: 'SUPPRIME', label: 'Supprimés' },
  ];

  readonly draft = signal<Draft | null>(null);
  readonly creating = signal(false);
  readonly createdKey = signal<string | null>(null);
  readonly createdPassword = signal<string | null>(null);
  readonly copied = signal(false);
  readonly error = signal('');
  readonly listError = signal('');
  readonly exporting = signal(false);

  ngOnInit() { this.reload(); }

  private reload() {
    this.listError.set('');
    this.partnerApi.listPartners().subscribe({
      next: (list) => {
        this.rows.set(list.map((d) => ({
          name: d.name, code: d.code, shortCode: d.shortCode, sector: d.sector, partnerType: d.partnerType,
          interfaces: d.interfaceCount, active: d.status === 'ACTIVE', status: d.status, tenantId: d.id,
        })));
      },
      error: () => this.listError.set('Impossible de charger la liste des partenaires.'),
    });
  }

  statusLabel(status: string): string {
    return ({ ACTIVE: 'Actif', SUSPENDU: 'Suspendu', SUPPRIME: 'Supprimé' } as Record<string, string>)[status] ?? status;
  }
  statusClass(status: string): string {
    return ({ ACTIVE: 'active', SUSPENDU: 'suspendu', SUPPRIME: 'supprime' } as Record<string, string>)[status] ?? '';
  }

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase();
    const status = this.statusFilter();
    return this.rows().filter((p) =>
      (status === 'all' || p.status === status) &&
      (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q)));
  });

  async exportExcel() {
    this.exporting.set(true);
    try {
      await exportToExcel(
        `partenaires-${new Date().toISOString().slice(0, 10)}`,
        'Partenaires',
        [
          { header: 'Nom', key: 'name', width: 30 },
          { header: 'Code partenaire', key: 'code', width: 26 },
          { header: 'Secteur', key: 'sector', width: 18 },
          { header: 'Type', key: 'type', width: 14 },
          { header: 'Interfaces', key: 'interfaces', width: 12 },
          { header: 'Statut', key: 'status', width: 12 },
        ],
        this.filtered().map((p) => ({
          name: p.name,
          code: p.code,
          sector: p.sector,
          type: this.partnerTypeLabel(p.partnerType),
          interfaces: p.interfaces,
          status: p.active ? 'Actif' : 'Suspendu',
        })),
      );
    } finally {
      this.exporting.set(false);
    }
  }

  private partnerTypeLabel(value: string): string {
    return this.partnerTypes.find((t) => t.value === value)?.label ?? value;
  }

  readonly typeSavingId = signal<string | null>(null);

  changeType(p: PartnerRecord, newType: string) {
    if (!p.tenantId || newType === p.partnerType) return;
    const previous = p.partnerType;
    this.typeSavingId.set(p.tenantId);
    this.rows.set(this.rows().map((r) => (r.tenantId === p.tenantId ? { ...r, partnerType: newType } : r)));
    this.partnerApi.updatePartnerType(p.tenantId, newType).subscribe({
      next: () => {
        this.typeSavingId.set(null);
        this.audit.log('partner_type_change', 'partner', p.name, p.name,
          `Type changé : ${previous} → ${newType}`).subscribe();
      },
      error: () => {
        this.typeSavingId.set(null);
        this.rows.set(this.rows().map((r) => (r.tenantId === p.tenantId ? { ...r, partnerType: previous } : r)));
        this.error.set(`Échec du changement de type pour ${p.name}.`);
      },
    });
  }

  readonly busyId = signal<string | null>(null);

  private setStatus(tenantId: string, status: string) {
    this.rows.set(this.rows().map((r) => (r.tenantId === tenantId ? { ...r, status, active: status === 'ACTIVE' } : r)));
  }

  suspendPartner(p: PartnerRecord) {
    if (!p.tenantId) return;
    if (!confirm(`Désactiver « ${p.name} » ? Réversible à tout moment via « Réactiver ».`)) return;
    this.busyId.set(p.tenantId);
    this.partnerApi.suspendPartner(p.tenantId).subscribe({
      next: () => {
        this.busyId.set(null);
        this.setStatus(p.tenantId!, 'SUSPENDU');
        this.audit.log('partner_suspend', 'partner', p.name, p.name, `Désactivation du partenaire ${p.name}`).subscribe();
      },
      error: () => { this.busyId.set(null); this.error.set(`Échec de la désactivation de ${p.name}.`); },
    });
  }

  reactivatePartner(p: PartnerRecord) {
    if (!p.tenantId) return;
    this.busyId.set(p.tenantId);
    this.partnerApi.reactivatePartner(p.tenantId).subscribe({
      next: () => {
        this.busyId.set(null);
        this.setStatus(p.tenantId!, 'ACTIVE');
        this.audit.log('partner_reactivate', 'partner', p.name, p.name, `Réactivation du partenaire ${p.name}`).subscribe();
      },
      error: () => { this.busyId.set(null); this.error.set(`Échec de la réactivation de ${p.name}.`); },
    });
  }

  deletePartner(p: PartnerRecord) {
    if (!p.tenantId) return;
    if (!confirm(`Supprimer définitivement « ${p.name} » ? Aucune donnée liée (commandes, transactions, messages) n'est effacée, mais ce partenaire ne pourra plus être réactivé depuis cet écran.`)) return;
    this.busyId.set(p.tenantId);
    this.partnerApi.deletePartner(p.tenantId).subscribe({
      next: () => {
        this.busyId.set(null);
        this.setStatus(p.tenantId!, 'SUPPRIME');
        this.audit.log('partner_delete', 'partner', p.name, p.name, `Suppression du partenaire ${p.name}`).subscribe();
      },
      error: () => { this.busyId.set(null); this.error.set(`Échec de la suppression de ${p.name}.`); },
    });
  }

  // ---- Création ----
  openCreate() {
    this.error.set(''); this.createdKey.set(null); this.createdPassword.set(null); this.copied.set(false);
    this.draft.set({ name: '', sector: 'Fintech', partnerType: 'standard', adminName: '', adminEmail: '', settlementAccount: '', accountHolder: '', settlementBank: '' });
  }
  patch(p: Partial<Draft>) { const d = this.draft(); if (d) this.draft.set({ ...d, ...p }); }

  /** Formate en groupes 5-5-11-2 (banque/guichet/compte/clé) au fil de la saisie, sans espace à taper. */
  formatCompte(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 23);
    const groups = [digits.slice(0, 5), digits.slice(5, 10), digits.slice(10, 21), digits.slice(21, 23)];
    return groups.filter((g) => g.length > 0).join(' ');
  }
  closeCreate() { this.draft.set(null); }

  submitCreate() {
    const d = this.draft();
    if (!d || !d.name.trim()) return;
    this.creating.set(true); this.error.set('');
    this.partnerApi.createPartner(d).subscribe({
      next: (res) => {
        this.creating.set(false);
        const p = res.partner;
        this.rows.set([{
          name: p.name, code: p.code, shortCode: p.shortCode, sector: p.sector, partnerType: p.partnerType,
          interfaces: p.interfaceCount, active: true, status: 'ACTIVE', tenantId: p.id,
        }, ...this.rows()]);
        this.createdKey.set(res.apiKey);
        this.createdPassword.set(res.tempPassword ?? '—');
        this.audit.log('partner_create', 'partner', p.name, p.name, `Création du partenaire ${p.name}`).subscribe();
      },
      error: () => {
        this.creating.set(false);
        this.error.set("Échec de la création (droits insuffisants ou backend indisponible).");
      },
    });
  }

  copyKey() {
    const k = this.createdKey();
    if (k) { navigator.clipboard?.writeText(k); this.copied.set(true); setTimeout(() => this.copied.set(false), 1800); }
  }

  impersonate(p: PartnerRecord) {
    if (!p.tenantId) return;
    this.partnerApi.impersonate(p.tenantId).subscribe({
      next: (res) => {
        this.tenant.setPartner({
          name: res.partner, code: res.code, shortCode: res.shortCode, sector: res.sector,
        });
        this.tenant.setTenantId(res.tenantId);
        this.tenant.setApiKey(null);
        this.auth.impersonate(p.name, res.token, res.partnerType as PartnerType);
        this.audit.log('impersonate_start', 'partner', p.name, p.name, `Délégation banque → ${p.name}`).subscribe();
        this.router.navigate(['/home']);
      },
      error: () => this.error.set(`Impossible d'ouvrir la session pour ${p.name}.`),
    });
  }
}
