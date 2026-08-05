import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { PartnerApiService, RosterSummaryDto } from '../../core/api/partner-api.service';
import { PlatformApiService, MethodAvailability } from '../../core/api/platform-api.service';
import { StudioStore } from './studio.store';
import { PaymentPreviewComponent } from './payment-preview.component';
import { MethodIconComponent } from '../../shared/components/method-icon.component';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { payHost } from '../../shared/pay-url';
import {
  AmountType, COUNTRIES, Country, countryOf, CustomField, Method, METHOD_LABELS,
  PaymentInterface, Preset,
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
  imports: [FormsModule, PaymentPreviewComponent, MethodIconComponent],
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
                  <input [ngModel]="d.name" (ngModelChange)="setName($event)" placeholder="Ex : Frais de scolarité 2025-2026"></label>
                <label class="fld"><span>Description</span>
                  <textarea [ngModel]="d.description" (ngModelChange)="patch({ description: $event })" rows="2" placeholder="Expliquez à vos payeurs l'objet de cette collecte."></textarea></label>
                <label class="fld"><span>Lien public personnalisé</span>
                  <div class="slug"><span class="slug-pre mono">{{ payHost }}/{{ partner().shortCode }}/</span>
                    <input class="mono" [ngModel]="d.customSlug" (ngModelChange)="editSlug($event)" placeholder="mon-lien"></div></label>
                <div class="url-preview">Votre page : <span class="mono">{{ payHost }}/{{ partner().shortCode }}/{{ effectiveSlug() }}</span>@if (!slugEdited()) { <span class="auto-tag">auto</span> }</div>

                <div class="section-lbl">Pays de la collecte <i>*</i></div>
                <div class="country-field">
                  <label class="fld grow"><span>Pays</span>
                    <select [ngModel]="d.country" (ngModelChange)="setCountry($event)">
                      @for (c of countries; track c.code) {
                        <option [value]="c.code">{{ c.flag }} {{ c.name }} (+{{ c.dial }})</option>
                      }
                    </select></label>
                  <div class="country-derived">
                    <div class="cd-item"><span class="cd-lbl">Indicatif</span><span class="cd-val mono">+{{ country().dial }}</span></div>
                    <div class="cd-item"><span class="cd-lbl">Devise</span><span class="cd-val">{{ d.currency }}</span></div>
                  </div>
                </div>
                <div class="form-hint">L'indicatif et la devise s'appliquent automatiquement à la page de paiement.</div>

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
                    <div class="seg-desc">First Collect génère une référence unique par paiement.</div>
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
                        <option value="matricule">Matricule (auto-remplissage)</option>
                      </select>
                      <button class="rm" (click)="removeField(i)">✕</button>
                    </div>
                    @if (f.type === 'select') {
                      <input class="opts" placeholder="Options séparées par des virgules" [ngModel]="(f.options || []).join(', ')"
                             (ngModelChange)="patchField(i, { options: split($event) })">
                    }
                    @if (f.type === 'matricule') {
                      <div class="field-hint">Le payeur saisit son matricule ; les informations importées (nom, prénom, classe…) sont récupérées automatiquement. Nommez les autres champs comme les colonnes du fichier (ex : « Nom », « Classe ») et cochez « Lecture seule » pour qu'ils soient auto-remplis.</div>
                    } @else {
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
                    }
                  </div>
                } @empty { <div class="muted">Aucun champ — la collecte demandera seulement le montant.</div> }

                @if (hasMatriculeField()) {
                  <div class="section-lbl">Données étudiants (auto-remplissage)</div>
                  <div class="roster-panel">
                    <label class="fld"><span>Établissement rattaché (optionnel)</span>
                      <input [ngModel]="d.establishment" (ngModelChange)="patch({ establishment: $event })"
                             placeholder="Ex : Lycée de Biyem-Assi"></label>
                    <div class="form-hint">Renseigné, la recherche du matricule est limitée aux étudiants de cet établissement.</div>

                    <div class="roster-status">
                      @if (roster(); as r) {
                        <span class="roster-count">{{ r.total }} étudiant(s) importé(s)</span>
                        @if (r.establishments.length) { <span class="muted">· {{ r.establishments.join(', ') }}</span> }
                      } @else { <span class="muted">Répertoire non chargé.</span> }
                    </div>

                    @if (canWrite()) {
                      <div class="roster-actions">
                        <label class="file-btn">
                          <input type="file" accept=".csv,text/csv" (change)="onCsvSelected($event)" hidden>
                          Choisir un fichier CSV
                        </label>
                        @if (parsedCount() > 0) {
                          <button class="primary" (click)="doImport()" [disabled]="importBusy()">
                            {{ importBusy() ? 'Import…' : 'Importer ' + parsedCount() + ' ligne(s)' }}
                          </button>
                        }
                        @if ((roster()?.total || 0) > 0) {
                          <button class="ghost" (click)="clearRoster()" [disabled]="importBusy()">Vider le répertoire</button>
                        }
                      </div>
                      @if (importMsg()) { <div class="roster-msg" [class.err]="importErr()">{{ importMsg() }}</div> }
                      <div class="form-hint">Le fichier doit comporter une colonne « matricule ». Les autres colonnes (nom, prénom, classe…) sont récupérées automatiquement. Exportez votre Excel en CSV au besoin.</div>
                    }
                  </div>
                }
              }

              @case (2) {
                <div class="section-lbl">Moyens de paiement <i>*</i></div>
                @if (availability() === null) {
                  <div class="muted">Chargement des moyens disponibles…</div>
                } @else if (availableMethods().length === 0) {
                  <div class="method-empty">
                    Aucun moyen de paiement n'est activé sur la plateforme. Demandez à l'administrateur
                    d'activer l'agrégateur (MTN / Orange Money) ou le paiement par carte dans les
                    paramètres plateforme.
                  </div>
                } @else {
                  @for (m of availableMethods(); track m) {
                    <label class="method-row">
                      <fp-method-icon [method]="m" [size]="30" />
                      <span class="m-name">{{ methodLabel(m) }}</span>
                      <span class="m-toggles">
                        <label class="toggle small"><input type="checkbox" [ngModel]="d.methods[m]" (ngModelChange)="patchMethod(m, $event)"><span>Actif</span></label>
                        <label class="toggle small"><input type="checkbox" [ngModel]="!!d.qrCodes[m]" (ngModelChange)="patchQr(m, $event)" [disabled]="!d.methods[m]"><span>QR</span></label>
                      </span>
                    </label>
                  }
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
        @if (canWrite() && stepHint()) { <div class="step-hint">ⓘ {{ stepHint() }}</div> }
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
  private readonly api = inject(PartnerApiService);
  private readonly platformApi = inject(PlatformApiService);
  readonly cancel = output<void>();
  readonly saved = output<void>();
  readonly publish = output<void>();

  canWrite = computed(() => this.auth.hasPerm('studio.write'));

  readonly data = this.store.editing;
  readonly partner = computed(() => this.tenant.partner()!);
  readonly payHost = payHost();
  readonly current = signal(0);
  readonly steps = STEPS;
  readonly countries = COUNTRIES;

  /**
   * Disponibilité des moyens de paiement configurés par l'admin (null = pas encore chargé).
   * Filtre l'étape « Moyens & publication » : on ne propose que ce qui est réellement activé.
   */
  readonly availability = signal<MethodAvailability | null>(null);
  readonly availableMethods = computed<Method[]>(() => {
    const a = this.availability();
    return a ? METHODS.filter((m) => a[m]) : [];
  });
  readonly country = computed<Country>(() => countryOf(this.data()?.country));
  readonly amountTypes: { value: AmountType; label: string; desc: string }[] = [
    { value: 'fixed', label: 'Montant fixe', desc: 'Un seul montant imposé.' },
    { value: 'preset', label: 'Montants prédéfinis', desc: 'Le payeur choisit parmi une liste.' },
    { value: 'free', label: 'Montant libre', desc: 'Le payeur saisit un montant (min-max).' },
  ];

  /**
   * Vrai dès que le lien est « figé » : édité à la main, ou déjà défini sur une interface existante.
   * Tant qu'il est faux, le lien se dérive automatiquement du nom.
   */
  readonly slugEdited = signal(!!this.data()?.customSlug);
  /** Lien effectivement publié : celui saisi, sinon dérivé du nom. */
  readonly effectiveSlug = computed(() => this.data()?.customSlug || this.slugPreview());
  /** Message expliquant ce qui bloque le passage à l'étape suivante (vide si tout est valide). */
  readonly stepHint = computed(() => this.blockingReason(this.current()));

  patch(p: Partial<PaymentInterface>) { this.store.patchEditing(p); }

  // ---- Répertoire étudiants (auto-remplissage par matricule) ----
  readonly roster = signal<RosterSummaryDto | null>(null);
  readonly parsedRows = signal<Record<string, string>[]>([]);
  readonly parsedCount = computed(() => this.parsedRows().length);
  readonly importBusy = signal(false);
  readonly importMsg = signal('');
  readonly importErr = signal(false);
  /** Une interface a-t-elle un champ de type « matricule » ? Active le panneau d'import. */
  readonly hasMatriculeField = computed(() => (this.data()?.customFields || []).some((f) => f.type === 'matricule'));

  constructor() {
    // Charge l'aperçu du répertoire du partenaire (best-effort, tenant courant).
    this.api.fetchRoster().subscribe({
      next: (r) => this.roster.set(r),
      error: () => this.roster.set({ total: 0, establishments: [] }),
    });

    // Charge la disponibilité des moyens de paiement (activés par l'admin) puis
    // réconcilie le brouillon : on ne garde actifs que les moyens réellement disponibles.
    this.platformApi.availableMethods().subscribe((a) => {
      // Repli permissif si l'endpoint est indisponible : on montre les moyens standards
      // (hors virement) plutôt que d'afficher une liste vide.
      const av = a ?? { orange: true, mtn: true, card: true, transfer: false };
      this.availability.set(av);
      this.reconcileMethods(av);
    });
  }

  /**
   * Désactive dans le brouillon tout moyen non disponible côté plateforme, puis, s'il ne
   * reste plus aucun moyen actif, active le premier moyen disponible (défaut valide).
   */
  private reconcileMethods(av: MethodAvailability) {
    const d = this.data();
    if (!d) return;
    const methods = { ...d.methods };
    const qrCodes = { ...d.qrCodes };
    let changed = false;
    for (const m of METHODS) {
      if (!av[m] && methods[m]) { methods[m] = false; qrCodes[m] = false; changed = true; }
    }
    const avail = METHODS.filter((m) => av[m]);
    if (avail.length && !avail.some((m) => methods[m])) { methods[avail[0]] = true; changed = true; }
    if (changed) this.patch({ methods, qrCodes });
  }

  onCsvSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importMsg.set(''); this.importErr.set(false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result ?? ''));
        this.parsedRows.set(rows);
        const hasMat = rows.length > 0 && Object.keys(rows[0]).some((k) => normKey(k) === 'matricule');
        if (!rows.length) { this.setImportMsg('Fichier vide ou illisible.', true); }
        else if (!hasMat) { this.setImportMsg('Aucune colonne « matricule » détectée dans le fichier.', true); this.parsedRows.set([]); }
        else { this.setImportMsg(`${rows.length} ligne(s) prête(s) à importer.`, false); }
      } catch {
        this.parsedRows.set([]);
        this.setImportMsg('Impossible de lire ce fichier CSV.', true);
      }
    };
    reader.onerror = () => this.setImportMsg('Impossible de lire ce fichier.', true);
    reader.readAsText(file);
    input.value = '';
  }

  doImport() {
    const rows = this.parsedRows();
    if (!rows.length) return;
    this.importBusy.set(true);
    this.api.importRoster(rows, true).subscribe({
      next: (res) => {
        this.roster.set({ total: res.total, establishments: this.roster()?.establishments ?? [] });
        this.api.fetchRoster().subscribe((r) => this.roster.set(r));
        this.parsedRows.set([]);
        this.setImportMsg(`${res.imported} étudiant(s) importé(s)${res.skipped ? `, ${res.skipped} ligne(s) ignorée(s) (sans matricule)` : ''}.`, false);
        this.importBusy.set(false);
      },
      error: () => { this.setImportMsg("Échec de l'import. Réessayez.", true); this.importBusy.set(false); },
    });
  }

  clearRoster() {
    this.importBusy.set(true);
    this.api.clearRoster().subscribe({
      next: () => { this.roster.set({ total: 0, establishments: [] }); this.parsedRows.set([]); this.setImportMsg('Répertoire vidé.', false); this.importBusy.set(false); },
      error: () => { this.setImportMsg('Échec de la purge.', true); this.importBusy.set(false); },
    });
  }

  private setImportMsg(msg: string, err: boolean) { this.importMsg.set(msg); this.importErr.set(err); }

  /** Met à jour le nom et, tant que le lien n'a pas été personnalisé, le dérive automatiquement. */
  setName(name: string) {
    const p: Partial<PaymentInterface> = { name };
    if (!this.slugEdited()) p.customSlug = this.slugify(name);
    this.patch(p);
  }

  /** Édition manuelle du lien : on la mémorise pour ne plus l'écraser depuis le nom. */
  editSlug(v: string) {
    this.slugEdited.set(true);
    this.patch({ customSlug: v });
  }

  /** Change le pays et aligne la devise sur celle du pays choisi. */
  setCountry(code: string) {
    this.patch({ country: code, currency: countryOf(code).currency });
  }

  /** Normalise un texte en slug d'URL (minuscules, sans accents ni caractères spéciaux). */
  slugify(v: string): string {
    return (v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40);
  }

  /** Décrit, en clair, ce qui reste à compléter pour valider l'étape (ou '' si prête). */
  blockingReason(step: number): string {
    const d = this.data();
    if (!d || this.validUpTo(step)) return '';
    if (step === 0) {
      if (!d.name.trim()) return "Donnez un nom à votre interface pour continuer.";
      if (d.amountType === 'fixed') return 'Saisissez un montant fixe supérieur à 0.';
      if (d.amountType === 'preset') return 'Ajoutez au moins un montant prédéfini valide.';
      return 'Renseignez un minimum, et un maximum au moins égal au minimum.';
    }
    if (step === 1) {
      if (d.refType === 'custom' && !d.refLabel?.trim()) return 'Indiquez le libellé de la référence personnalisée.';
      return 'Chaque champ obligatoire doit avoir un libellé.';
    }
    if (step === 2) return 'Activez au moins un moyen de paiement.';
    return '';
  }

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

/** Normalise une clé/libellé (minuscule, sans accent, alphanumérique) — identique au backend. */
function normKey(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parseur CSV minimal (sans dépendance) : détecte le séparateur (`,` `;` ou tabulation), gère les
 * guillemets et les valeurs multi-lignes. La première ligne est l'en-tête ; chaque ligne devient
 * un objet en-tête → valeur.
 */
function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, ''); // BOM éventuel
  if (!clean.trim()) return [];
  const firstLine = clean.slice(0, clean.search(/\r?\n/) === -1 ? clean.length : clean.search(/\r?\n/));
  const delim = countDelim(firstLine, ';') > countDelim(firstLine, ',')
    ? ';'
    : (countDelim(firstLine, '\t') > countDelim(firstLine, ',') ? '\t' : ',');

  const records = tokenize(clean, delim);
  if (!records.length) return [];
  const headers = records[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (row.length === 1 && row[0].trim() === '') continue; // ligne vide
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => { if (h) obj[h] = (row[j] ?? '').trim(); });
    out.push(obj);
  }
  return out;
}

function countDelim(line: string, d: string): number {
  return line.split(d).length - 1;
}

/** Découpe le texte CSV en lignes de cellules, en respectant les guillemets. */
function tokenize(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else { cell += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
