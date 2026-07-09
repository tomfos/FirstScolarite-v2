import { Component, OnInit, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomField, Method, PaymentInterface, Preset } from '../../core/models/interface.model';
import { Partner } from '../../core/tenant/tenant-context.service';
import { MethodIconComponent } from '../../shared/components/method-icon.component';
import { payHost } from '../../shared/pay-url';

interface PvMethod { id: Method; name: string; brand: string; }

/**
 * Aperçu avant publication — réplique fidèle du template design (publish-preview) :
 * simulation du parcours payeur en 5 étapes (Identification → Montant → Moyen → Paiement →
 * Confirmation), avec bascule d'aperçu Mobile / Web. Piloté par la config réelle de l'interface
 * (montant, acompte, sélection multiple, champs date/téléphone/lecture-seule, moyens + QR), afin
 * que l'aperçu soit identique au parcours réellement publié.
 */
@Component({
  selector: 'fp-publish-preview',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, MethodIconComponent],
  styleUrl: './publish-preview.component.scss',
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="modal" (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="head">
          <div>
            <div class="eyebrow">Aperçu avant publication</div>
            <div class="h-title">Parcours payeur — {{ data().name || 'Interface sans nom' }}</div>
          </div>
          <div class="h-right">
            <div class="viewtoggle">
              <button [class.on]="view() === 'mobile'" (click)="view.set('mobile')">Mobile</button>
              <button [class.on]="view() === 'web'" (click)="view.set('web')">Web</button>
            </div>
            <button class="x" (click)="close.emit()">✕</button>
          </div>
        </div>

        <div class="split">
          <!-- Left rail: journey stepper -->
          <div class="rail">
            <div class="rail-lbl">Étapes du payeur</div>
            <div class="rail-steps">
              @for (s of payerSteps; track $index; let i = $index) {
                <button class="rstep" [class.active]="step() === i" [class.done]="i < step()"
                        [disabled]="i > step()" (click)="jump(i)">
                  <span class="rs-dot">{{ i < step() ? '✓' : (i + 1) }}</span>
                  <span>{{ s }}</span>
                </button>
              }
            </div>
            <div class="rail-url">
              <div class="ru-lbl">URL publique</div>
              <div class="ru-val mono">{{ url() }}</div>
            </div>
          </div>

          <!-- Center: device preview -->
          <div class="stage" [class.web]="view() === 'web'">
            @if (view() === 'web') {
              <div class="desktop">
                <div class="dchrome">
                  <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
                  <div class="daddr mono"><span class="lock"></span>{{ payHostVal }}</div>
                </div>
                <div class="dbody">
                  <ng-container [ngTemplateOutlet]="phoneContent" />
                </div>
              </div>
            } @else {
              <div class="phone">
                <div class="notch"><span>09:41</span><span class="pill"></span><span>●●● ▮</span></div>
                <div class="pscreen">
                  <ng-container [ngTemplateOutlet]="phoneContent" />
                </div>
              </div>
            }
          </div>

          <!-- Right: this step + summary -->
          <div class="aside">
            <div class="a-lbl">Cette étape</div>
            <div class="a-title">{{ stepInfo().title }}</div>
            <div class="a-text">{{ stepInfo().text }}</div>
            <div class="a-div"></div>
            <div class="a-lbl">Récapitulatif</div>
            <div class="kv"><span>Montant</span><b>{{ recapAmount() }}</b></div>
            <div class="kv"><span>Champs</span><b>2 + {{ data().customFields.length }}</b></div>
            <div class="kv"><span>Moyens</span><b>{{ enabledMethods().length }}/4</b></div>
            <div class="kv"><span>QR codes</span><b>{{ qrCount() || 'Aucun' }}</b></div>
          </div>
        </div>

        <!-- Footer -->
        <div class="foot">
          <div class="f-left">
            <button class="ghost" (click)="close.emit()">‹ Retour à l'édition</button>
            @if (step() > 0) { <button class="ghost" (click)="prev()">Étape précédente</button> }
          </div>
          <div class="f-count">Étape {{ step() + 1 }}/5</div>
          <div class="f-right">
            @if (step() < 4) {
              <button class="dark" [disabled]="!canAdvance()" (click)="next()">Étape suivante ›</button>
            } @else {
              <button class="publish" [disabled]="isPublishing()" (click)="confirm.emit()">
                {{ isPublishing() ? 'Publication…' : "Publier l'interface" }}
              </button>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- ============ Contenu de l'écran payeur (partagé mobile/web) ============ -->
    <ng-template #phoneContent>
      <div class="ph-head">
        <div class="ph-logo">FC</div>
        <div class="ph-id">
          <div class="ph-partner">{{ partner().name }}</div>
          <div class="ph-name">{{ data().name || 'Interface' }}</div>
        </div>
        <div class="ph-secure">Sécurisé</div>
      </div>

      <div class="ph-body">
        @switch (step()) {

          @case (0) {
            <div class="amt-lbl">Vos informations</div>
            @if (data().customFields.length === 0) {
              <div class="empty-fields">Aucun champ d'identification configuré.<br>Le payeur passe directement à l'étape suivante.</div>
            } @else {
              @for (f of data().customFields; track f.id) {
                <div class="pfield">
                  <div class="pf-lbl">{{ f.label || 'Champ' }}{{ f.required ? ' *' : '' }}</div>
                  <div class="pf-box" [class.ro]="f.readonly">{{ fieldPlaceholder(f) }}</div>
                </div>
              }
            }
          }

          @case (1) {
            @if (data().description) { <div class="ph-desc">{{ data().description }}</div> }

            @switch (data().amountType) {
              @case ('fixed') {
                <div class="amt-box">
                  <div class="amt-lbl">Montant à payer</div>
                  <div class="amt-big">{{ fmt(+data().fixedAmount || 0) }} <small>{{ data().currency }}</small></div>
                </div>
              }
              @case ('free') {
                <div class="amt-lbl">Saisissez le montant</div>
                <div class="free-row">
                  <input type="number" [ngModel]="freeAmount()" (ngModelChange)="freeAmount.set($event)" placeholder="0">
                  <span>{{ data().currency }}</span>
                </div>
                @if (data().minAmount || data().maxAmount) {
                  <div class="hint">Entre {{ data().minAmount ? fmt(+data().minAmount) : '—' }} et {{ data().maxAmount ? fmt(+data().maxAmount) : '—' }} {{ data().currency }}</div>
                }
              }
              @case ('preset') {
                <div class="amt-lbl">{{ data().multiSelect ? 'Cochez les frais à régler' : 'Choisissez une option' }}</div>
                <div class="pv-presets">
                  @for (p of data().presets; track p.id) {
                    <div class="pv-preset" [class.on]="isPicked(p.id)">
                      <button class="pp-main" (click)="togglePicked(p.id)">
                        <span class="pp-mark" [class.box]="data().multiSelect">{{ isPicked(p.id) ? '✓' : '' }}</span>
                        <span class="pp-label">
                          {{ p.label || 'Option' }}
                          @if (p.allowPartial) { <em>✓ Acompte autorisé · min {{ fmt(+(p.minAmount || 0)) }} {{ data().currency }}</em> }
                        </span>
                        <b>{{ fmt(+p.amount || 0) }} <small>{{ data().currency }}</small></b>
                      </button>
                      @if (isPicked(p.id) && p.allowPartial) {
                        <div class="pp-partial">
                          <div class="ppp-lbl">Montant à payer</div>
                          <label class="ppp-opt" [class.on]="!hasCustom(p.id)" (click)="setFull(p.id)">
                            <span class="rd" [class.on]="!hasCustom(p.id)"></span>
                            <span class="grow">Montant complet</span>
                            <b>{{ fmt(+p.amount || 0) }} {{ data().currency }}</b>
                          </label>
                          <label class="ppp-opt" [class.on]="hasCustom(p.id)" (click)="setCustomMode(p.id)">
                            <span class="rd" [class.on]="hasCustom(p.id)"></span>
                            <span class="grow">Autre montant</span>
                            <span class="cust-inp" (click)="$event.stopPropagation()">
                              <input type="number" [ngModel]="customAmount(p.id)"
                                     (ngModelChange)="setCustom(p.id, $event)"
                                     [placeholder]="p.minAmount || '0'">
                              <span>{{ data().currency }}</span>
                            </span>
                          </label>
                          @if (hasCustom(p.id) && belowMin(p)) {
                            <div class="ppp-warn">⚠ Inférieur au minimum autorisé ({{ fmt(+(p.minAmount || 0)) }} {{ data().currency }})</div>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
                @if (data().multiSelect) {
                  <div class="pv-total"><span>Total {{ pickedCount() }} frais</span><b>{{ fmt(totalAmount()) }} <small>{{ data().currency }}</small></b></div>
                }
              }
            }
          }

          @case (2) {
            <div class="amt-lbl">Choisissez votre moyen</div>
            <div class="pv-methods">
              @for (m of enabledMethods(); track m.id) {
                <button class="pv-method" [class.on]="method() === m.id" (click)="method.set(m.id)">
                  <fp-method-icon class="pm-ico" [method]="m.id" [size]="32" />
                  <span class="grow">{{ m.name }}</span>
                  @if (hasQr(m.id)) { <span class="pm-qr">QR</span> }
                </button>
              }
            </div>
          }

          @case (3) {
            @switch (payKind()) {
              @case ('transfer') {
                <div class="amt-lbl">Virement bancaire</div>
                <div class="pay-panel">
                  <div class="pp-row"><span>Banque</span><b>Afriland First Bank</b></div>
                  <div class="pp-row"><span>Titulaire</span><b>{{ partner().name }}</b></div>
                  <div class="pp-row"><span>RIB</span><b class="mono">10005 00027 11122334455 17</b></div>
                  <div class="pp-row"><span>Référence</span><b class="mono red">{{ sampleRef }}</b></div>
                  <div class="pp-row"><span>Montant</span><b>{{ fmt(totalAmount()) }} {{ data().currency }}</b></div>
                </div>
                <div class="warn-box">Indiquez impérativement la référence en motif du virement.</div>
              }
              @case ('qr') {
                <div class="amt-lbl center">Scannez le QR code</div>
                <div class="qr-ph"></div>
                <div class="qr-hint">Ouvrez votre application <b>{{ methodName() }}</b> et scannez ce code pour valider le paiement.</div>
                <div class="qr-ussd">ou composez <b class="mono">#150*50#</b></div>
              }
              @case ('card') {
                <div class="amt-lbl">Informations carte</div>
                <div class="pfield"><div class="pf-lbl">Numéro de carte</div><div class="pf-box">1234 5678 9012 3456</div></div>
                <div class="two"><div class="pfield"><div class="pf-lbl">Expiration</div><div class="pf-box">MM/AA</div></div>
                  <div class="pfield"><div class="pf-lbl">CVC</div><div class="pf-box">•••</div></div></div>
                <div class="secure-line">🔒 Connexion sécurisée 3D-Secure</div>
              }
              @case ('ussd') {
                <div class="amt-lbl">Validation par téléphone</div>
                <div class="pay-panel">Une demande de validation a été envoyée au numéro saisi. Composez <b class="mono red">#150*50#</b> et entrez votre code secret.</div>
                <div class="await">● En attente de validation…</div>
              }
            }
          }

          @case (4) {
            <div class="done">
              <div class="done-ic">✓</div>
              <div class="done-t">Paiement validé</div>
              <div class="done-s">Un reçu vient d'être envoyé par SMS et email.</div>
              <div class="done-card">
                <div class="dc-row"><span>Référence</span><b class="mono">{{ sampleRef }}</b></div>
                <div class="dc-row big"><span>Montant</span><b>{{ fmt(confirmAmount()) }} {{ data().currency }}</b></div>
              </div>
            </div>
          }
        }
      </div>

      @if (step() < 4) {
        <div class="ph-foot">
          @if (totalAmount() > 0) {
            <div class="foot-total"><span>Total</span><b>{{ fmt(totalAmount()) }} {{ data().currency }}</b></div>
          }
          <button class="ph-cta">{{ step() === 3 ? 'Payer maintenant' : 'Continuer' }}</button>
        </div>
      }
    </ng-template>
  `,
})
export class PublishPreviewComponent implements OnInit {
  readonly data = input.required<PaymentInterface>();
  readonly partner = input.required<Partner>();
  readonly isPublishing = input(false);
  readonly close = output<void>();
  readonly confirm = output<void>();

  readonly payHostVal = payHost();
  readonly payerSteps = ['Identification', 'Choix du montant', 'Moyen de paiement', 'Paiement', 'Confirmation'];
  readonly allMethods: PvMethod[] = [
    { id: 'orange', name: 'Orange Money', brand: '#FF7900' },
    { id: 'mtn', name: 'MTN MoMo', brand: '#FFCC00' },
    { id: 'card', name: 'Carte bancaire', brand: '#2563EB' },
    { id: 'transfer', name: 'Virement bancaire', brand: '#1F9D55' },
  ];
  readonly sampleRef = 'FP-2026-' + Math.floor(Math.random() * 900000 + 100000);

  readonly step = signal(0);
  readonly view = signal<'mobile' | 'web'>('mobile');
  readonly picked = signal<number[]>([]);
  readonly freeAmount = signal('');
  readonly customAmounts = signal<Record<number, string>>({});
  readonly method = signal<Method | null>(null);

  ngOnInit() {
    // Présélection : 1re option en sélection simple ; 1er moyen actif.
    const d = this.data();
    if (d.amountType === 'preset' && !d.multiSelect && d.presets[0]) this.picked.set([d.presets[0].id]);
    const first = this.enabledMethods()[0];
    if (first) this.method.set(first.id);
  }

  readonly enabledMethods = computed(() => this.allMethods.filter((m) => this.data().methods[m.id]));
  readonly url = computed(() => {
    const d = this.data();
    const slug = d.customSlug || this.slugify(d.name) || 'interface';
    return `${this.payHostVal}/${this.partner().shortCode}/${slug}`;
  });

  readonly totalAmount = computed(() => {
    const d = this.data();
    if (d.amountType === 'fixed') return +d.fixedAmount || 0;
    if (d.amountType === 'free') return +this.freeAmount() || 0;
    return d.presets
      .filter((p) => this.picked().includes(p.id))
      .reduce((s, p) => s + this.payable(p), 0);
  });
  readonly confirmAmount = computed(() => this.totalAmount() || +this.data().fixedAmount || +this.freeAmount() || 0);

  readonly pickedCount = computed(() => this.picked().length);
  readonly qrCount = computed(() => {
    const d = this.data();
    return Object.entries(d.qrCodes || {}).filter(([k, v]) => v && d.methods[k as Method]).length;
  });
  readonly canAdvance = computed(() => {
    const d = this.data(), s = this.step();
    if (s === 1) {
      if (d.amountType === 'preset') return this.picked().length > 0;
      if (d.amountType === 'free') return +this.freeAmount() > 0;
      return true;
    }
    if (s === 2) return !!this.method();
    return true;
  });

  readonly recapAmount = computed(() => {
    const d = this.data();
    if (d.amountType === 'free') return 'Libre';
    if (d.amountType === 'fixed') return `${this.fmt(+d.fixedAmount || 0)} ${d.currency}`;
    return d.multiSelect ? `Multi-frais (${d.presets.length})` : `${d.presets.length} option${d.presets.length > 1 ? 's' : ''}`;
  });

  readonly payKind = computed<'transfer' | 'qr' | 'card' | 'ussd'>(() => {
    const m = this.method();
    if (m === 'transfer') return 'transfer';
    if (m && this.data().qrCodes?.[m]) return 'qr';
    if (m === 'card') return 'card';
    return 'ussd';
  });
  methodName() { return this.allMethods.find((m) => m.id === this.method())?.name ?? ''; }

  readonly stepInfo = computed(() => {
    const d = this.data();
    const fieldsN = d.customFields.length;
    const methodsN = Object.values(d.methods).filter(Boolean).length;
    const items = [
      { title: "Identification du payeur", text: fieldsN > 0
        ? `Le client renseigne d'abord les ${fieldsN} information(s) configurée(s), qui l'identifient avant de lui proposer les montants.`
        : "Aucun champ d'identification configuré. Ajoutez à l'étape 3 les informations à collecter avant le paiement." },
      { title: "Choix du montant", text: d.amountType === 'fixed' ? 'Le montant est fixe et affiché directement au client.'
        : d.amountType === 'free' ? 'Le client saisit librement le montant qu\'il souhaite payer.'
        : d.multiSelect ? 'Le client coche un ou plusieurs frais ; le total est calculé automatiquement. Les frais « acompte autorisé » permettent un versement partiel.'
        : 'Le client choisit une option dans la liste des frais proposés.' },
      { title: "Choix du moyen de paiement", text: `Le client choisit parmi les ${methodsN} canal/canaux que vous avez activé(s).` },
      { title: "Exécution du paiement", text: this.payKind() === 'transfer' ? 'Le client reçoit le RIB Afriland First Bank et la référence à indiquer.'
        : this.payKind() === 'qr' ? 'Un QR code est affiché ; le client le scanne avec son application pour valider.'
        : this.payKind() === 'card' ? 'Le client saisit ses informations carte sur une page sécurisée 3DS.'
        : 'Le client suit les instructions USSD ou valide sur son téléphone.' },
      { title: "Confirmation", text: 'Le client reçoit une confirmation immédiate. Vous êtes notifié dans le tableau de bord First Collect.' },
    ];
    return items[this.step()];
  });

  // ---- interactions ----
  jump(i: number) { if (i <= this.step()) this.step.set(i); }
  prev() { this.step.update((s) => Math.max(0, s - 1)); }
  next() { if (this.canAdvance()) this.step.update((s) => Math.min(4, s + 1)); }

  isPicked(id: number) { return this.picked().includes(id); }
  togglePicked(id: number) {
    if (this.data().multiSelect) {
      this.picked.update((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
    } else {
      this.picked.set([id]);
    }
  }
  hasCustom(id: number) { const c = this.customAmounts()[id]; return c != null && c !== ''; }
  customAmount(id: number) { return this.customAmounts()[id] ?? ''; }
  setCustom(id: number, v: string) { this.customAmounts.update((m) => ({ ...m, [id]: v })); }
  setCustomMode(id: number) { if (this.customAmounts()[id] == null) this.setCustom(id, ''); }
  setFull(id: number) { this.customAmounts.update((m) => { const n = { ...m }; delete n[id]; return n; }); }
  belowMin(p: Preset) { const c = +this.customAmount(p.id); return !!this.customAmount(p.id) && c < +(p.minAmount || 0); }

  hasQr(m: Method) { return !!this.data().qrCodes?.[m]; }

  fmt(n: number) { return n.toLocaleString('fr-FR'); }
  fieldPlaceholder(f: CustomField): string {
    if (f.readonly) return 'Auto-rempli après identification';
    switch (f.type) {
      case 'select': return '— Sélectionner —';
      case 'date': return 'JJ/MM/AAAA';
      case 'phone': return '+237 6 XX XX XX XX';
      default: return '…';
    }
  }

  private payable(p: Preset): number {
    if (p.allowPartial && this.hasCustom(p.id)) return +this.customAmount(p.id) || 0;
    return +p.amount || 0;
  }
  private slugify(s: string) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }
}
