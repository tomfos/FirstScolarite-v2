import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { BRAND_PALETTE, NOTIF_EVENTS, SettingsStore } from './settings.store';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { ChangePasswordCardComponent } from '../../shared/components/change-password-card.component';
import { PartnerApiService } from '../../core/api/partner-api.service';

type Section = 'brand' | 'import' | 'security' | 'notifications' | 'platform';

@Component({
  selector: 'fp-settings',
  standalone: true,
  imports: [FormsModule, ChangePasswordCardComponent],
  styleUrl: './settings.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div class="eyebrow">{{ isPlatform() ? 'Console superviseur · Module' : 'Portail partenaire · Module' }}</div>
        <div class="title">{{ isPlatform() ? 'Paramètres plateforme' : 'Paramètres' }}</div>
      </div>

      <div class="layout">
        <!-- Section nav -->
        <nav class="snav">
          @for (s of sections(); track s.id) {
            <button class="snav-item" [class.active]="section() === s.id" (click)="section.set(s.id)">
              <span class="snav-ic">{{ s.glyph }}</span>{{ s.label }}
            </button>
          }
        </nav>

        <div class="scontent">
          @switch (section()) {
            @case ('brand') {
              <div class="card">
                <div class="card-title">Logo &amp; identité visuelle</div>
                <div class="logo-row">
                  <div class="logo-box" [style.borderColor]="store.logo() ? store.brandColor() : 'var(--border-strong)'">
                    @if (store.logo()) { <img [src]="store.logo()" alt="Logo"> } @else { <span class="logo-ph">Aucun logo</span> }
                  </div>
                  <div>
                    <label class="upload">⭱ Téléverser un logo
                      <input type="file" accept="image/*" hidden (change)="onLogo($event)"></label>
                    <div class="logo-hint">PNG, JPG ou SVG · affiché sur vos pages de paiement.</div>
                    @if (store.logoName()) { <div class="logo-name">{{ store.logoName() }} · <button class="link" (click)="store.setLogo(null, null)">retirer</button></div> }
                  </div>
                </div>
              </div>
              <div class="card">
                <div class="card-title">Couleur principale</div>
                <div class="swatches">
                  @for (c of palette; track c) {
                    <button class="swatch" [class.on]="store.brandColor() === c" [style.background]="c" (click)="store.setBrandColor(c)">
                      @if (store.brandColor() === c) { <span class="tick">✓</span> }
                    </button>
                  }
                </div>
                <div class="preview-line">Aperçu : <span class="chip" [style.background]="store.brandColor()">Payer maintenant</span></div>
              </div>
            }

            @case ('import') {
              <div class="card">
                <div class="card-title">Import de données clients</div>
                <div class="dropzone">
                  <div class="dz-ic">⭱</div>
                  <div class="dz-main">Glissez un fichier CSV ou Excel, ou cliquez pour parcourir</div>
                  <div class="dz-sub">Colonnes attendues : nom, téléphone, référence, email (optionnel).</div>
                  <label class="upload">Choisir un fichier <input type="file" accept=".csv,.xlsx,.xls" hidden (change)="onImport($event)"></label>
                </div>
                @if (importMsg()) { <div class="ok-banner">✓ {{ importMsg() }}</div> }
              </div>
            }

            @case ('security') {
              <fp-change-password-card />
              <div class="card">
                <div class="card-title">Sécurité</div>
                <div class="sec-row"><div><div class="sec-name">Authentification à deux facteurs (2FA)</div><div class="sec-desc">Renforce la connexion de votre équipe.</div></div>
                  <label class="switch"><input type="checkbox" [checked]="twofa()" (change)="twofa.set($any($event.target).checked)"><span class="slider"></span></label></div>
                <div class="sec-row"><div><div class="sec-name">Clé API partenaire</div><div class="sec-desc mono">fpk_live_••••••••••••3a7f</div></div>
                  <button class="ghost" [disabled]="regenerating()" (click)="regenerateApiKey()">{{ regenerating() ? 'Génération…' : 'Régénérer' }}</button></div>
                @if (newApiKey()) {
                  <div class="ok-banner">✓ Nouvelle clé générée — copiez-la maintenant, elle ne sera plus jamais affichée :<br><span class="mono key-value">{{ newApiKey() }}</span></div>
                }
                @if (regenerateError()) { <div class="err-banner">{{ regenerateError() }}</div> }
                <div class="sec-row"><div><div class="sec-name">Sessions actives</div><div class="sec-desc">2 appareils connectés.</div></div>
                  <button class="ghost danger">Tout déconnecter</button></div>
              </div>
            }

            @case ('notifications') {
              <div class="card">
                <div class="card-title">Notifications</div>
                <div class="notif-head"><span class="nh-event">Événement</span><span class="nh-ch">Email</span><span class="nh-ch">SMS</span></div>
                @for (e of notifEvents; track e.key) {
                  <div class="notif-row">
                    <div class="ne-main"><div class="ne-name">{{ e.label }}</div><div class="ne-desc">{{ e.desc }}</div></div>
                    <label class="switch"><input type="checkbox" [checked]="store.notifications()[e.key].email" (change)="store.toggleNotif(e.key, 'email', $any($event.target).checked)"><span class="slider"></span></label>
                    <label class="switch"><input type="checkbox" [checked]="store.notifications()[e.key].sms" (change)="store.toggleNotif(e.key, 'sms', $any($event.target).checked)"><span class="slider"></span></label>
                  </div>
                }
              </div>
            }

            @case ('platform') {
              <div class="card">
                <div class="card-title">Limites &amp; quotas</div>
                <div class="sec-row"><div><div class="sec-name">Rate limit gateway</div><div class="sec-desc">Requêtes / minute par tenant (défaut 1200).</div></div>
                  <input class="num-input" type="number" [ngModel]="rateLimit()" (ngModelChange)="rateLimit.set(+$event)" min="100"></div>
                <div class="sec-row"><div><div class="sec-name">Taille max payload</div><div class="sec-desc">Corps HTTP max en Ko.</div></div>
                  <input class="num-input" type="number" [ngModel]="payloadKb()" (ngModelChange)="payloadKb.set(+$event)" min="64"></div>
              </div>
              <div class="card">
                <div class="card-title">Fonctionnalités</div>
                <div class="sec-row"><div><div class="sec-name">Mode maintenance</div><div class="sec-desc">Bloque les encaissements hors caisse interne.</div></div>
                  <label class="switch"><input type="checkbox" [checked]="maintenance()" (change)="maintenance.set($any($event.target).checked)"><span class="slider"></span></label></div>
                <div class="sec-row"><div><div class="sec-name">Nouveaux partenaires</div><div class="sec-desc">Autoriser l'enrôlement self-service.</div></div>
                  <label class="switch"><input type="checkbox" [checked]="selfEnroll()" (change)="selfEnroll.set($any($event.target).checked)"><span class="slider"></span></label></div>
                @if (saved()) { <div class="ok-banner">✓ Paramètres plateforme enregistrés (simulation).</div> }
                <button class="primary" style="margin-top:12px" (click)="savePlatform()">Enregistrer</button>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  readonly store = inject(SettingsStore);
  private readonly tenant = inject(TenantContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly partnerApi = inject(PartnerApiService);

  readonly isPlatform = toSignal(this.route.data.pipe(map((d) => d['scope'] === 'platform')), { initialValue: false });
  readonly sections = computed(() => this.isPlatform()
    ? [{ id: 'platform' as Section, label: 'Plateforme', glyph: '⚙' }]
    : [
      { id: 'brand' as Section, label: 'Marque & identité', glyph: '◆' },
      { id: 'import' as Section, label: 'Import de données', glyph: '⭱' },
      { id: 'security' as Section, label: 'Sécurité', glyph: '⛨' },
      { id: 'notifications' as Section, label: 'Notifications', glyph: '🔔' },
    ]);

  ngOnInit() {
    if (!this.isPlatform()) this.store.loadFromApi();
    else this.section.set('platform');
  }
  readonly palette = BRAND_PALETTE;
  readonly notifEvents = NOTIF_EVENTS;
  readonly section = signal<Section>('brand');
  readonly importMsg = signal<string | null>(null);
  readonly twofa = signal(false);
  readonly regenerating = signal(false);
  readonly newApiKey = signal<string | null>(null);
  readonly regenerateError = signal('');
  readonly rateLimit = signal(1200);
  readonly payloadKb = signal(256);
  readonly maintenance = signal(false);
  readonly selfEnroll = signal(true);
  readonly saved = signal(false);

  savePlatform() { this.saved.set(true); setTimeout(() => this.saved.set(false), 3000); }

  regenerateApiKey() {
    this.regenerating.set(true); this.regenerateError.set(''); this.newApiKey.set(null);
    this.partnerApi.regenerateApiKey().subscribe({
      next: (res) => { this.regenerating.set(false); this.newApiKey.set(res.apiKey); },
      error: () => { this.regenerating.set(false); this.regenerateError.set('Échec de la régénération de la clé API.'); },
    });
  }

  onLogo(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.store.setLogo(reader.result as string, file.name);
    reader.readAsDataURL(file);
  }

  onImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.importMsg.set(`Fichier « ${file.name} » prêt — import simulé terminé.`);
  }
}
