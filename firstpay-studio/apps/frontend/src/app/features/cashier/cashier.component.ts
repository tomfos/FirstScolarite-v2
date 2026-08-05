import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { PartnerRecord } from '../../core/models/partner.model';
import { PaymentInterface, Method, METHOD_LABELS } from '../../core/models/interface.model';
import { PartnerApiService } from '../../core/api/partner-api.service';
import { TransactionApiService } from '../../core/api/transaction-api.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { Transaction } from '../../core/models/transaction.model';

interface Receipt {
  ref: string; payer: string; phone: string; amount: number; method: Method;
  iface: PaymentInterface; partner: PartnerRecord; at: string; fields: Record<string, string>;
}

const STEP_LABELS = ['Identification', 'Montant', 'Mode', 'Validation'];

@Component({
  selector: 'fp-cashier',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './cashier.component.scss',
  template: `
    <div class="page">
      <div class="bg-lines"></div>
      <div class="inner">
        @if (!processing()) {
          <!-- Hero -->
          <div class="hero">
            <div class="hero-blob"></div>
            <div class="eyebrow">{{ agency() }} · {{ today }}</div>
            <div class="hello">Bonjour {{ firstName() }} 👋</div>
            <div class="sub">Vous avez encaissé <b>{{ count() }}</b> paiement(s) aujourd'hui.</div>
          </div>

          <div class="stats">
            <div class="cstat" style="border-top-color:#7C3AED"><div class="cs-lbl">Encaissé aujourd'hui</div><div class="cs-val">{{ fr(collected()) }} XAF</div><div class="cs-sub">{{ count() }} transaction(s)</div></div>
            <div class="cstat" style="border-top-color:#1F8A5B"><div class="cs-lbl">Succès du jour</div><div class="cs-val">{{ fr(successRate()) }} %</div><div class="cs-sub">sur vos encaissements</div></div>
            <div class="cstat" style="border-top-color:#B7791F"><div class="cs-lbl">En attente</div><div class="cs-val">{{ pendingCount() }}</div><div class="cs-sub">réconciliation</div></div>
          </div>

          @if (loadError()) { <div class="load-err">{{ loadError() }}</div> }

          @if (!partner()) {
            <!-- Step 1: partner -->
            <div class="flow-step"><div class="flow-dot">1</div><div><div class="fs-title">Choisir le partenaire</div><div class="fs-sub">Sélectionnez le partenaire pour lequel vous encaissez le client.</div></div></div>
            <div class="search big"><span>⌕</span>
              <input [ngModel]="pSearch()" (ngModelChange)="pSearch.set($event)" placeholder="Rechercher un partenaire par nom, code FSPAY, ou secteur…"></div>
            <div class="grid2">
              @for (p of partners(); track p.code) {
                <div class="pick" (click)="choosePartner(p)">
                  <div class="pick-logo">{{ p.shortCode }}</div>
                  <div><div class="pick-name">{{ p.name }}</div><div class="pick-sub">{{ p.sector }} · {{ p.interfaces }} interface(s)</div></div>
                </div>
              } @empty {
                <div class="empty">Aucun partenaire actif disponible.</div>
              }
            </div>
          } @else {
            <!-- Step 2: interface -->
            <div class="flow-step"><div class="flow-dot purple">2</div>
              <div><div class="fs-title">Choisir l'interface — {{ partner()!.name }}</div><div class="fs-sub">Quel paiement le client souhaite-t-il régler ?</div></div>
              <button class="back" (click)="partner.set(null)">‹ Changer de partenaire</button></div>
            <div class="grid2">
              @for (it of ifaces(); track it.id) {
                <div class="pick" (click)="startProcess(it)">
                  <div class="pick-logo amount">{{ amountGlyph(it) }}</div>
                  <div><div class="pick-name">{{ it.name }}</div><div class="pick-sub mono">/{{ it.slug }}</div></div>
                  <span class="go">Encaisser ›</span>
                </div>
              } @empty {
                <div class="empty">Aucune interface active pour ce partenaire.</div>
              }
            </div>
          }
        } @else {
          <!-- Process flow -->
          <div class="process">
            <div class="proc-head">
              <div><div class="eyebrow">Encaissement · {{ partner()!.name }}</div><div class="proc-title">{{ processing()!.name }}</div></div>
              <button class="back" (click)="cancel()">✕ Annuler</button>
            </div>

            <div class="stepper">
              @for (l of stepLabels; track l; let i = $index) {
                <div class="st" [class.on]="step() === i" [class.done]="i < step()">
                  <span class="st-num">{{ i < step() ? '✓' : i + 1 }}</span><span class="st-lbl">{{ l }}</span>
                </div>
              }
            </div>

            <div class="proc-body">
              @if (payError()) { <div class="pay-err">{{ payError() }}</div> }
              @switch (step()) {
                @case (0) {
                  <label class="fld"><span>Nom du payeur <i>*</i></span><input [ngModel]="payer()" (ngModelChange)="payer.set($event)" placeholder="Nom et prénom"></label>
                  <label class="fld"><span>Téléphone <i>*</i></span><input [ngModel]="phone()" (ngModelChange)="phone.set($event)" placeholder="+237 6XX XX XX XX"></label>
                  @for (f of processing()!.customFields; track f.id) {
                    <label class="fld"><span>{{ f.label }} @if (f.required) { <i>*</i> }</span>
                      @if (f.type === 'select') {
                        <select [ngModel]="fieldVal(f.label)" (ngModelChange)="setField(f.label, $event)">
                          <option value="">Sélectionner…</option>
                          @for (o of f.options || []; track o) { <option [value]="o">{{ o }}</option> }
                        </select>
                      } @else {
                        <input [ngModel]="fieldVal(f.label)" (ngModelChange)="setField(f.label, $event)" [placeholder]="f.label">
                      }
                    </label>
                  }
                }
                @case (1) {
                  @switch (processing()!.amountType) {
                    @case ('fixed') { <div class="amount-fixed">{{ fr(+processing()!.fixedAmount) }} <span>XAF</span><div class="af-sub">Montant fixe</div></div> }
                    @case ('preset') {
                      <div class="presets">
                        @for (p of validPresets(); track p.id) {
                          <button class="preset" [class.on]="amount() === +p.amount" (click)="amount.set(+p.amount)">
                            <span>{{ p.label || 'Montant' }}</span><b>{{ fr(+p.amount) }} XAF</b>
                          </button>
                        }
                      </div>
                    }
                    @case ('free') {
                      <label class="fld"><span>Montant ({{ processing()!.currency }})</span>
                        <input type="number" [ngModel]="amount()" (ngModelChange)="amount.set(+$event)" [placeholder]="'Entre ' + processing()!.minAmount + ' et ' + processing()!.maxAmount"></label>
                    }
                  }
                }
                @case (2) {
                  <div class="methods">
                    @for (m of methodsOf(); track m) {
                      <button class="method" [class.on]="method() === m" (click)="method.set(m)">
                        <span class="m-dot" [style.background]="mcolor(m)"></span>{{ mlabel(m) }}
                      </button>
                    }
                  </div>
                }
                @case (3) {
                  <div class="confirm">
                    <div class="cf-row"><span>Payeur</span><b>{{ payer() }}</b></div>
                    <div class="cf-row"><span>Téléphone</span><b>{{ phone() }}</b></div>
                    <div class="cf-row"><span>Interface</span><b>{{ processing()!.name }}</b></div>
                    <div class="cf-row"><span>Moyen</span><b>{{ mlabel(method()!) }}</b></div>
                    <div class="cf-row total"><span>Montant</span><b>{{ fr(amount()) }} XAF</b></div>
                  </div>
                }
              }
            </div>

            <div class="proc-foot">
              @if (step() > 0) { <button class="ghost" (click)="step.set(step() - 1)">‹ Précédent</button> }
              <div class="spacer"></div>
              @if (step() < 3) {
                <button class="primary" [disabled]="!canNext()" (click)="step.set(step() + 1)">Suivant ›</button>
              } @else {
                <button class="primary" [disabled]="submitting()" (click)="complete()">{{ submitting() ? 'Traitement…' : "✓ Valider l'encaissement" }}</button>
              }
            </div>
          </div>
        }
      </div>

      <!-- Receipt -->
      @if (receipt(); as r) {
        <div class="overlay" (click)="receipt.set(null)">
          <div class="ticket" (click)="$event.stopPropagation()">
            <div class="t-brand"><div class="t-logo">FC</div><div><b>First Collect</b><div class="t-bank">Afriland First Bank</div></div></div>
            <div class="t-ok">✓ Paiement encaissé</div>
            <div class="t-amount">{{ fr(r.amount) }} XAF</div>
            <div class="t-rows">
              <div class="t-row"><span>Référence</span><b class="mono">{{ r.ref }}</b></div>
              <div class="t-row"><span>Payeur</span><b>{{ r.payer }}</b></div>
              <div class="t-row"><span>Interface</span><b>{{ r.iface.name }}</b></div>
              <div class="t-row"><span>Partenaire</span><b>{{ r.partner.name }}</b></div>
              <div class="t-row"><span>Moyen</span><b>{{ mlabel(r.method) }}</b></div>
              <div class="t-row"><span>Caissier</span><b>{{ auth.user()?.name }}</b></div>
              <div class="t-row"><span>Date</span><b>{{ r.at }}</b></div>
            </div>
            <div class="t-actions">
              <button class="ghost" (click)="print()">⎙ Imprimer</button>
              <button class="primary" (click)="receipt.set(null)">Terminer</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class CashierComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly partnerApi = inject(PartnerApiService);
  private readonly txApi = inject(TransactionApiService);
  private readonly tenant = inject(TenantContextService);

  readonly partner = signal<PartnerRecord | null>(null);
  readonly pSearch = signal('');
  readonly processing = signal<PaymentInterface | null>(null);
  readonly step = signal(0);
  readonly stepLabels = STEP_LABELS;
  private readonly partnerRows = signal<PartnerRecord[]>([]);
  private readonly apiIfaces = signal<PaymentInterface[]>([]);
  private readonly todayTxs = signal<Transaction[]>([]);

  readonly payer = signal('');
  readonly phone = signal('');
  readonly amount = signal(0);
  readonly method = signal<Method | null>(null);
  readonly fields = signal<Record<string, string>>({});
  readonly receipt = signal<Receipt | null>(null);
  readonly loadError = signal('');
  readonly payError = signal('');
  readonly submitting = signal(false);
  readonly collected = signal(0);

  readonly today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  readonly partners = computed(() => {
    const q = this.pSearch().toLowerCase();
    return this.partnerRows().filter((p) => p.active).filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q));
  });
  readonly ifaces = computed(() => this.apiIfaces().filter((i) => i.status === 'actif'));
  readonly validPresets = computed(() => this.processing()?.presets.filter((p) => p.amount) ?? []);
  readonly count = computed(() => this.todaySuccess().length);
  readonly pendingCount = computed(() => this.todayTxs().filter((t) => t.status === 'pending').length);
  readonly successRate = computed(() => {
    const txs = this.todayTxs();
    if (!txs.length) return 0;
    return Math.round((this.todaySuccess().length / txs.length) * 100);
  });

  private todaySuccess() {
    const todayStr = new Date().toDateString();
    return this.todayTxs().filter((t) => t.status === 'success' && new Date(t.date).toDateString() === todayStr);
  }

  firstName() { return (this.auth.user()?.name ?? '').split(' ')[0]; }
  agency() { return this.auth.user()?.agency ?? 'Agence Bonanjo · Douala'; }
  fr(n: number) { return (n || 0).toLocaleString('fr-FR'); }
  mlabel(m: Method) { return METHOD_LABELS[m]; }
  mcolor(m: Method) { return ({ orange: '#FF7900', mtn: '#B89F00', card: '#2563EB', transfer: '#1F9D55' } as Record<Method, string>)[m]; }
  methodsOf() { return (Object.entries(this.processing()!.methods).filter(([, v]) => v).map(([k]) => k)) as Method[]; }
  amountGlyph(it: PaymentInterface) { return it.amountType === 'fixed' ? '₣' : it.amountType === 'preset' ? '☰' : '∞'; }
  fieldVal(label: string) { return this.fields()[label] ?? ''; }
  setField(label: string, v: string) { this.fields.set({ ...this.fields(), [label]: v }); }

  ngOnInit() {
    this.partnerApi.listPartners().subscribe({
      next: (list) => {
        // La caisse ne doit proposer que des partenaires actifs (pas suspendus/supprimés) —
        // listPartners() renvoie désormais tous les statuts pour les besoins de l'admin.
        this.partnerRows.set(list.filter((d) => d.status === 'ACTIVE').map((d) => ({
          name: d.name, code: d.code, shortCode: d.shortCode, sector: d.sector, partnerType: d.partnerType,
          interfaces: d.interfaceCount, active: true, status: d.status, tenantId: d.id,
        })));
      },
      error: () => this.loadError.set('Impossible de charger les partenaires.'),
    });
    this.loadTodayTxs();
  }

  private loadTodayTxs() {
    this.txApi.getAll().subscribe({
      next: (rows) => {
        const uid = this.auth.user()?.id;
        const mapped = this.mapApiRows(rows).filter((t) => t.fields?.['cashierId'] === uid || t.reference.startsWith('CASH-'));
        this.todayTxs.set(mapped);
        this.collected.set(this.todaySuccess().reduce((s, t) => s + t.amount, 0));
      },
      error: () => {},
    });
  }

  choosePartner(p: PartnerRecord) {
    this.partner.set(p);
    this.apiIfaces.set([]);
    this.loadError.set('');
    if (!p.tenantId) return;
    this.partnerApi.impersonate(p.tenantId).subscribe({
      next: (res) => {
        this.tenant.setPartner({
          name: res.partner, code: res.code, shortCode: res.shortCode, sector: res.sector,
        });
        this.tenant.setTenantId(res.tenantId);
        this.tenant.setApiKey(null);
        this.auth.setToken(res.token);
        this.partnerApi.fetchInterfaces().subscribe({
          next: (rows) => this.apiIfaces.set(rows),
          error: () => this.loadError.set('Impossible de charger les interfaces du partenaire.'),
        });
      },
      error: () => this.loadError.set('Impossible d\'accéder au partenaire sélectionné.'),
    });
  }

  startProcess(it: PaymentInterface) {
    this.processing.set(it);
    this.step.set(0); this.payer.set(''); this.phone.set(''); this.fields.set({}); this.method.set(null);
    this.payError.set('');
    this.amount.set(it.amountType === 'fixed' ? +it.fixedAmount : 0);
  }
  cancel() { this.processing.set(null); this.payError.set(''); }

  canNext(): boolean {
    if (this.step() === 0) return this.payer().trim().length > 0 && this.phone().trim().length > 0;
    if (this.step() === 1) return this.amount() > 0;
    if (this.step() === 2) return this.method() !== null;
    return true;
  }

  complete() {
    const it = this.processing()!;
    const body = {
      externalRef: 'CASH-' + Date.now(),
      amount: this.amount(),
      currency: it.currency || 'XAF',
      type: 'PAYMENT',
      method: this.method(),
      metadata: {
        payer: this.payer(), phone: this.phone(), interfaceId: it.id, interfaceName: it.name,
        cashierId: this.auth.user()?.id, ...this.fields(),
      },
    };
    this.submitting.set(true);
    this.payError.set('');
    this.txApi.create(body).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.showReceipt(it, res?.externalRef ?? body.externalRef);
        this.loadTodayTxs();
      },
      error: () => {
        this.submitting.set(false);
        this.payError.set('Échec de l\'encaissement. Vérifiez la connexion ou réessayez.');
      },
    });
  }

  private mapApiRows(rows: unknown[]): Transaction[] {
    return rows.map((raw, i) => {
      const r = raw as Record<string, unknown>;
      const meta = (r['metadata'] ?? {}) as Record<string, string>;
      return {
        id: String(r['id'] ?? 'api-' + i),
        reference: String(r['externalRef'] ?? r['reference'] ?? 'FP-' + i),
        payer: meta['payer'] ?? '—',
        phone: meta['phone'] ?? '',
        interfaceId: meta['interfaceId'] ?? '',
        interfaceName: meta['interfaceName'] ?? '—',
        method: (meta['method'] ?? r['method'] ?? 'transfer') as Method,
        status: String(r['status'] ?? 'success').toLowerCase() as Transaction['status'],
        amount: +(r['amount'] ?? 0),
        date: String(r['createdAt'] ?? new Date().toISOString()),
        fields: meta,
      };
    });
  }

  private showReceipt(it: PaymentInterface, ref: string) {
    const r: Receipt = {
      ref,
      payer: this.payer(), phone: this.phone(), amount: this.amount(), method: this.method()!,
      iface: it, partner: this.partner()!, fields: this.fields(),
      at: new Date().toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
    this.receipt.set(r);
    this.processing.set(null);
  }

  print() {
    document.body.classList.add('print-receipt');
    window.print();
    setTimeout(() => document.body.classList.remove('print-receipt'), 500);
  }
}
