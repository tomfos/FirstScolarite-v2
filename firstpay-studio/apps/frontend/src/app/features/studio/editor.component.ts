import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { StudioStore } from './studio.store';
import { PaymentPreviewComponent } from './payment-preview.component';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { payHost } from '../../shared/pay-url';
import {
  AmountType, CustomField, Method, METHOD_LABELS, PaymentInterface, Preset,
} from '../../core/models/interface.model';

const STEPS = [
  {
    title: 'Interface & montant', short: 'Interface', desc: 'Nom, lien & montant',
    help: "Donnez un nom clair à votre collecte, choisissez son lien public, puis définissez le montant que le payeur réglera.",
  },
  {
    title: 'Référence & formulaire', short: 'Formulaire', desc: 'Données collectées',
    help: "Choisissez la référence attachée à chaque paiement et les informations à demander au payeur.",
  },
  {
    title: 'Moyens & publication', short: 'Publication', desc: 'Canaux & URL',
    help: "Activez les moyens de paiement proposés et vérifiez l'URL publique avant de publier.",
  },
];

const METHODS: Method[] = ['orange', 'mtn', 'card', 'transfer'];

@Component({
  selector: 'fp-editor',
  standalone: true,
  imports: [FormsModule, PaymentPreviewComponent],
  styleUrl: './editor.component.scss',
  template: `
    @if (data(); as d) {
      <div class="editor">
        <!-- Stepper -->
        <div class="stepper">
          @for (s of steps; track $index; let i = $index) {
            <button class="step" [class.active]="current() === i" [class.done]="i < current()"
                    [disabled]="i > current() && !validUpTo(i - 1)" (click)="jump(i)">
              <span class="circle">{{ i < current() ? '✓' : i + 1 }}</span>
              <span class="step-text"><span class="step-title">{{ s.short }}</span><span class="step-desc">{{ s.desc }}</span></span>
            </button>
            @if (i < steps.length - 1) { <span class="step-line"></span> }
          }
        </div>

        <div class="split">
          <!-- Form -->
          <div class="form-pane">
            <div class="form-title">{{ steps[current()].title }}</div>
            <div class="form-help">{{ steps[current()].help }}</div>

            @switch (current()) {
              @case (0) {
                <div class="section-lbl">Informations</div>
                <label class="fld"><span>Nom de l'interface <i>*</i></span>
                  <input [ngModel]="d.name" (ngModelChange)="patch({ name: $event })" placeholder="Ex : Frais de scolarité 2025-2026"></label>
                <label class="fld"><span>Description</span>
                  <textarea [ngModel]="d.description" (ngModelChange)="patch({ description: $event })" rows="2" placeholder="Expliquez à vos payeurs l'objet de cette collecte."></textarea></label>
                <label class="fld"><span>Lien public personnalisé</span>
                  <div class="slug"><span class="slug-pre mono">{{ payHost }}/{{ partner().shortCode }}/</span>
                    <input class="mono" [ngModel]="d.customSlug" (ngModelChange)="patch({ customSlug: $event })" placeholder="mon-lien"></div></label>

                <div class="section-lbl">Montant à payer <i>*</i></div>
                <div class="cards3">
                  @for (a of amountTypes; track a.value) {
                    <button class="seg" [class.on]="d.amountType === a.value" (click)="patch({ amountType: a.value })">
                      <div class="seg-top">{{ a.label }} @if (d.amountType === a.value) { <span class="check">✓</span> }</div>
                      <div class="seg-desc">{{ a.desc }}</div>
                    </button>
                  }
                </div>

                @switch (d.amountType) {
                  @case ('fixed') {
                    <label class="fld"><span>Montant fixe ({{ d.currency }})</span>
                      <input type="number" [ngModel]="d.fixedAmount" (ngModelChange)="patch({ fixedAmount: $event })" placeholder="25000"></label>
                  }
                  @case ('preset') {
                    <div class="presets-head"><span>Montants prédéfinis</span>
                      <button class="add" (click)="addPreset()">+ Ajouter</button></div>
                    @for (p of d.presets; track p.id; let i = $index) {
                      <div class="preset-card" [class.partial-on]="p.allowPartial">
                        <div class="preset-row">
                          <input placeholder="Libellé" [ngModel]="p.label" (ngModelChange)="patchPreset(i, { label: $event })">
                          <input type="number" placeholder="Montant" [ngModel]="p.amount" (ngModelChange)="patchPreset(i, { amount: $event })">
                          <button class="rm" (click)="removePreset(i)" [disabled]="d.presets.length === 1">✕</button>
                        </div>
                        <div class="preset-partial">
                          <label class="toggle small">
                            <input type="checkbox" [ngModel]="!!p.allowPartial" (ngModelChange)="patchPreset(i, { allowPartial: $event })">
                            <span>Acompte autorisé (versement partiel)</span>
                          </label>
                          @if (p.allowPartial) {
                            <label class="min-field"><span>Minimum à verser ({{ d.currency }})</span>
                              <input type="number" placeholder="0" [ngModel]="p.minAmount" (ngModelChange)="patchPreset(i, { minAmount: $event })"></label>
                          }
                        </div>
                      </div>
                    }
                    <label class="toggle">
                      <input type="checkbox" [ngModel]="d.multiSelect" (ngModelChange)="patch({ multiSelect: $event })">
                      <span>Autoriser la sélection de plusieurs montants (panier)</span>
                    </label>
                  }
                  @case ('free') {
                    <div class="two">
                      <label class="fld"><span>Minimum ({{ d.currency }})</span>
                        <input type="number" [ngModel]="d.minAmount" (ngModelChange)="patch({ minAmount: $event })" placeholder="1000"></label>
                      <label class="fld"><span>Maximum ({{ d.currency }})</span>
                        <input type="number" [ngModel]="d.maxAmount" (ngModelChange)="patch({ maxAmount: $event })" placeholder="500000"></label>
                    </div>
                  }
                }
              }

              @case (1) {
                <div class="section-lbl">Référence de paiement</div>
                <div class="cards2">
                  <button class="seg" [class.on]="d.refType === 'auto'" (click)="patch({ refType: 'auto' })">
                    <div class="seg-top">Référence automatique @if (d.refType === 'auto') { <span class="check">✓</span> }</div>
                    <div class="seg-desc">FirstPay génère une référence unique par paiement.</div>
                  </button>
                  <button class="seg" [class.on]="d.refType === 'custom'" (click)="patch({ refType: 'custom' })">
                    <div class="seg-top">Référence personnalisée @if (d.refType === 'custom') { <span class="check">✓</span> }</div>
                    <div class="seg-desc">Le payeur saisit une référence (matricule, numéro…).</div>
                  </button>
                </div>
                @if (d.refType === 'custom') {
                  <label class="fld"><span>Libellé de la référence <i>*</i></span>
                    <input [ngModel]="d.refLabel" (ngModelChange)="patch({ refLabel: $event })" placeholder="Ex : Matricule élève"></label>
                }

                <div class="presets-head"><span>Champs du formulaire</span>
                  <button class="add" (click)="addField()">+ Ajouter un champ</button></div>
                @for (f of d.customFields; track f.id; let i = $index) {
                  <div class="field-card">
                    <div class="field-row">
                      <input class="grow" placeholder="Libellé du champ" [ngModel]="f.label" (ngModelChange)="patchField(i, { label: $event })">
                      <select [ngModel]="f.type" (ngModelChange)="patchField(i, { type: $event })">
                        <option value="text">Texte</option><option value="select">Liste</option>
                        <option value="date">Date</option><option value="phone">Téléphone</option>
                      </select>
                      <button class="rm" (click)="removeField(i)">✕</button>
                    </div>
                    @if (f.type === 'select') {
                      <input class="opts" placeholder="Options séparées par des virgules" [ngModel]="(f.options || []).join(', ')"
                             (ngModelChange)="patchField(i, { options: split($event) })">
                    }
                    <div class="field-toggles">
                      <label class="toggle small">
                        <input type="checkbox" [ngModel]="f.required" (ngModelChange)="patchField(i, { required: $event })">
                        <span>Champ obligatoire</span>
                      </label>
                      <label class="toggle small">
                        <input type="checkbox" [ngModel]="!!f.readonly" (ngModelChange)="patchField(i, { readonly: $event })">
                        <span>Lecture seule (auto-rempli)</span>
                      </label>
                    </div>
                  </div>
                } @empty { <div class="muted">Aucun champ — la collecte demandera seulement le montant.</div> }
              }

              @case (2) {
                <div class="section-lbl">Moyens de paiement <i>*</i></div>
                @for (m of methods; track m) {
                  <label class="method-row">
                    <span class="m-name">{{ methodLabel(m) }}</span>
                    <span class="m-toggles">
                      <label class="toggle small"><input type="checkbox" [ngModel]="d.methods[m]" (ngModelChange)="patchMethod(m, $event)"><span>Actif</span></label>
                      <label class="toggle small"><input type="checkbox" [ngModel]="!!d.qrCodes[m]" (ngModelChange)="patchQr(m, $event)" [disabled]="!d.methods[m]"><span>QR</span></label>
                    </span>
                  </label>
                }
                <div class="publish-url">
                  <div class="pu-lbl">URL publique</div>
                  <div class="pu-val mono">{{ payHost }}/{{ partner().shortCode }}/{{ d.customSlug || slugPreview() }}</div>
                </div>
              }
            }
          </div>

          <!-- Live preview -->
          <div class="preview-pane">
            <div class="preview-label">Aperçu en direct</div>
            <fp-payment-preview [data]="d" [partner]="partner()" />
          </div>
        </div>

        <!-- Footer nav -->
        <div class="footer">
          <button class="ghost" (click)="cancel.emit()">Annuler</button>
          <div class="spacer"></div>
          @if (current() > 0) { <button class="ghost" (click)="jump(current() - 1)">‹ Précédent</button> }
          @if (canWrite()) {
            @if (current() < steps.length - 1) {
              <button class="primary" (click)="jump(current() + 1)" [disabled]="!validUpTo(current())">Suivant ›</button>
            } @else {
              <button class="ghost" (click)="onSave()">Enregistrer le brouillon</button>
              <button class="primary" (click)="onPublish()">Aperçu et publier</button>
            }
          }
        </div>
      </div>
    }
  `,
})
export class EditorComponent {
  readonly store = inject(StudioStore);
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantContextService);
  readonly cancel = output<void>();
  readonly saved = output<void>();
  readonly publish = output<void>();

  canWrite = computed(() => this.auth.hasPerm('studio.write'));

  readonly data = this.store.editing;
  readonly partner = computed(() => this.tenant.partner()!);
  readonly payHost = payHost();
  readonly current = signal(0);
  readonly steps = STEPS;
  readonly methods = METHODS;
  readonly amountTypes: { value: AmountType; label: string; desc: string }[] = [
    { value: 'fixed', label: 'Montant fixe', desc: 'Un seul montant imposé.' },
    { value: 'preset', label: 'Montants prédéfinis', desc: 'Le payeur choisit parmi une liste.' },
    { value: 'free', label: 'Montant libre', desc: 'Le payeur saisit un montant (min-max).' },
  ];

  patch(p: Partial<PaymentInterface>) { this.store.patchEditing(p); }

  // ---- Presets ----
  addPreset() {
    const d = this.data()!;
    const id = Math.max(0, ...d.presets.map((p) => p.id)) + 1;
    this.patch({ presets: [...d.presets, { id, label: '', amount: '' }] });
  }
  patchPreset(i: number, p: Partial<Preset>) {
    const presets = this.data()!.presets.map((x, idx) => (idx === i ? { ...x, ...p } : x));
    this.patch({ presets });
  }
  removePreset(i: number) { this.patch({ presets: this.data()!.presets.filter((_, idx) => idx !== i) }); }

  // ---- Fields ----
  addField() {
    const d = this.data()!;
    this.patch({ customFields: [...d.customFields, { id: 'cf-' + Date.now(), type: 'text', label: '', required: false }] });
  }
  patchField(i: number, p: Partial<CustomField>) {
    const customFields = this.data()!.customFields.map((x, idx) => (idx === i ? { ...x, ...p } : x));
    this.patch({ customFields });
  }
  removeField(i: number) { this.patch({ customFields: this.data()!.customFields.filter((_, idx) => idx !== i) }); }
  split(v: string) { return v.split(',').map((s) => s.trim()).filter(Boolean); }

  // ---- Methods ----
  patchMethod(m: Method, on: boolean) { this.patch({ methods: { ...this.data()!.methods, [m]: on } }); }
  patchQr(m: Method, on: boolean) { this.patch({ qrCodes: { ...this.data()!.qrCodes, [m]: on } }); }
  methodLabel(m: Method) { return METHOD_LABELS[m]; }

  slugPreview() {
    return (this.data()!.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'interface';
  }

  // ---- Stepper validation/nav ----
  validUpTo(step: number): boolean {
    if (step < 0) return true;
    const d = this.data()!;
    if (step === 0) {
      if (!d.name.trim()) return false;
      if (d.amountType === 'fixed') return +d.fixedAmount > 0;
      if (d.amountType === 'preset') return d.presets.some((p) => +p.amount > 0);
      return +d.minAmount > 0 && +d.maxAmount >= +d.minAmount;
    }
    if (step === 1) {
      if (d.refType === 'custom' && !d.refLabel?.trim()) return false;
      return d.customFields.every((f) => !f.required || f.label.trim().length > 0);
    }
    if (step === 2) return Object.values(d.methods).some(Boolean);
    return true;
  }
  jump(i: number) { if (i <= this.current() || this.validUpTo(i - 1)) this.current.set(Math.max(0, Math.min(i, this.steps.length - 1))); }

  onSave() { this.store.save(); this.saved.emit(); }
  onPublish() {
    if (!this.validUpTo(2)) return;
    this.publish.emit();
  }
}
