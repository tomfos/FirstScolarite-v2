import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformApiService, PlatformSettings } from '../../core/api/platform-api.service';
import { ChangePasswordCardComponent } from '../../shared/components/change-password-card.component';

const EMPTY: PlatformSettings = {
  smtpHost: '', smtpPort: 587, smtpUsername: '', smtpPassword: '',
  smtpFromEmail: '', smtpFromName: 'First Collect — Afriland First Bank',
  smtpUseTls: true, smtpEnabled: false, appBaseUrl: 'http://localhost:14200', passwordSet: false,
  aggEnabled: false, aggMode: 'production',
  aggBaseUrl: 'https://mobilewallet.trustpayway.com', aggAppId: '', aggSecret: '', aggSecretSet: false,
  aggSandboxBaseUrl: 'https://mobilewallet.trustpayway.com', aggSandboxAppId: '', aggSandboxSecret: '',
  aggSandboxSecretSet: false,
  mpgsEnabled: false, mpgsMode: 'production', mpgsApiVersion: '100',
  mpgsHost: 'na-gateway.mastercard.com', mpgsMerchantId: '', mpgsPassword: '', mpgsPasswordSet: false,
  mpgsSandboxHost: 'test-gateway.mastercard.com', mpgsSandboxMerchantId: '', mpgsSandboxPassword: '',
  mpgsSandboxPasswordSet: false,
};

@Component({
  selector: 'fp-platform-settings',
  standalone: true,
  imports: [FormsModule, ChangePasswordCardComponent],
  styleUrl: './platform-settings.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div class="eyebrow">Plateforme First Collect · Administration</div>
        <div class="title">Paramètres plateforme</div>
        <div class="subtitle">Configuration SMTP et agrégateur de paiement mobile (TrustPayWay) pour les encaissements MTN / Orange Money.</div>
      </div>

      <div class="body">
        <div class="card">
          <div class="card-head">
            <div class="card-title">Serveur SMTP</div>
            <label class="switch-row">
              <span>Activer l'envoi d'emails</span>
              <span class="switch"><input type="checkbox" [ngModel]="s().smtpEnabled" (ngModelChange)="patch({ smtpEnabled: $event })"><span class="slider"></span></span>
            </label>
          </div>

          <div class="grid">
            <label class="fld c2"><span>Hôte SMTP <i>*</i></span>
              <input [ngModel]="s().smtpHost" (ngModelChange)="patch({ smtpHost: $event })" placeholder="smtp.gmail.com"></label>
            <label class="fld"><span>Port</span>
              <input type="number" [ngModel]="s().smtpPort" (ngModelChange)="patch({ smtpPort: +$event })" placeholder="587"></label>

            <label class="fld"><span>Nom d'utilisateur</span>
              <input [ngModel]="s().smtpUsername" (ngModelChange)="patch({ smtpUsername: $event })" placeholder="no-reply@afrilandfirstbank.com"></label>
            <label class="fld"><span>Mot de passe @if (s().passwordSet) { <em>(déjà défini)</em> }</span>
              <input type="password" [ngModel]="s().smtpPassword" (ngModelChange)="patch({ smtpPassword: $event })" [placeholder]="s().passwordSet ? '•••••••• (laisser vide pour conserver)' : 'Mot de passe / app password'"></label>

            <label class="fld"><span>Expéditeur (email)</span>
              <input type="email" [ngModel]="s().smtpFromEmail" (ngModelChange)="patch({ smtpFromEmail: $event })" placeholder="no-reply@afrilandfirstbank.com"></label>
            <label class="fld"><span>Expéditeur (nom)</span>
              <input [ngModel]="s().smtpFromName" (ngModelChange)="patch({ smtpFromName: $event })"></label>

            <label class="toggle c2">
              <input type="checkbox" [ngModel]="s().smtpUseTls" (ngModelChange)="patch({ smtpUseTls: $event })">
              <span>Utiliser STARTTLS (recommandé)</span>
            </label>

            <label class="fld c2"><span>URL de l'application (envoyée aux partenaires)</span>
              <input [ngModel]="s().appBaseUrl" (ngModelChange)="patch({ appBaseUrl: $event })" placeholder="https://esign.afbdei.com"></label>
          </div>

          <div class="actions smtp-actions">
            <div class="test">
              <input [ngModel]="testTo()" (ngModelChange)="testTo.set($event)" placeholder="email de test…">
              <button class="ghost" [disabled]="testing() || !s().smtpEnabled" (click)="sendTest()">{{ testing() ? 'Envoi…' : 'Envoyer un test' }}</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="card-title">Agrégateur TrustPayWay</div>
            <label class="switch-row">
              <span>Activer les paiements réels</span>
              <span class="switch"><input type="checkbox" [ngModel]="s().aggEnabled" (ngModelChange)="patch({ aggEnabled: $event })"><span class="slider"></span></span>
            </label>
          </div>

          <div class="env-switch" role="tablist">
            <button type="button" role="tab" [class.active]="s().aggMode === 'sandbox'"
              (click)="patch({ aggMode: 'sandbox' })">🧪 Sandbox (test)</button>
            <button type="button" role="tab" [class.active]="s().aggMode === 'production'"
              (click)="patch({ aggMode: 'production' })">🚀 Production</button>
          </div>
          <div class="env-hint">
            Environnement actif : <b>{{ s().aggMode === 'sandbox' ? 'Sandbox (test)' : 'Production' }}</b>.
            Les deux jeux d'identifiants sont conservés — basculez à tout moment sans les ressaisir.
          </div>

          <div class="env-block" [class.active]="s().aggMode === 'sandbox'">
            <div class="env-block-title">🧪 Identifiants Sandbox @if (s().aggMode === 'sandbox') { <span class="badge">actif</span> }</div>
            <div class="grid">
              <label class="fld c2"><span>URL de l'API</span>
                <input [ngModel]="s().aggSandboxBaseUrl" (ngModelChange)="patch({ aggSandboxBaseUrl: $event })" placeholder="https://mobilewallet.trustpayway.com"></label>
              <label class="fld c2"><span>Application ID (app_id)</span>
                <input [ngModel]="s().aggSandboxAppId" (ngModelChange)="patch({ aggSandboxAppId: $event })" placeholder="38e1a762-cceb-4d71-9340-c76ad040b42a"></label>
              <label class="fld c2"><span>Secret (clé secrète) @if (s().aggSandboxSecretSet) { <em>(déjà défini)</em> }</span>
                <input type="password" [ngModel]="s().aggSandboxSecret" (ngModelChange)="patch({ aggSandboxSecret: $event })" [placeholder]="s().aggSandboxSecretSet ? '•••••••• (laisser vide pour conserver)' : 'Secret sandbox (Bearer de /api/login)'"></label>
            </div>
          </div>

          <div class="env-block" [class.active]="s().aggMode === 'production'">
            <div class="env-block-title">🚀 Identifiants Production @if (s().aggMode === 'production') { <span class="badge">actif</span> }</div>
            <div class="grid">
              <label class="fld c2"><span>URL de l'API</span>
                <input [ngModel]="s().aggBaseUrl" (ngModelChange)="patch({ aggBaseUrl: $event })" placeholder="https://mobilewallet.trustpayway.com"></label>
              <label class="fld c2"><span>Application ID (app_id)</span>
                <input [ngModel]="s().aggAppId" (ngModelChange)="patch({ aggAppId: $event })" placeholder="b59325d6-21c2-4669-b7c8-8490a6673df7"></label>
              <label class="fld c2"><span>Secret (clé secrète) @if (s().aggSecretSet) { <em>(déjà défini)</em> }</span>
                <input type="password" [ngModel]="s().aggSecret" (ngModelChange)="patch({ aggSecret: $event })" [placeholder]="s().aggSecretSet ? '•••••••• (laisser vide pour conserver)' : 'Secret obtenu à l’inscription'"></label>
            </div>
          </div>

          <div class="note agg-note">
            Réseaux supportés : <b>MTN</b> et <b>Orange</b> (selon le moyen choisi lors du paiement).
            Statuts de réconciliation : <code>INITIATED</code>, <code>PENDING</code>, <code>FAILED</code>, <code>SUCCESSFUL</code>.
            Les paiements en attente sont vérifiés automatiquement via <code>GET /api/&#123;network&#125;/get-status/&#123;transaction_id&#125;</code>.
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="card-title">Passerelle carte MPGS (Mastercard)</div>
            <label class="switch-row">
              <span>Activer le paiement par carte</span>
              <span class="switch"><input type="checkbox" [ngModel]="s().mpgsEnabled" (ngModelChange)="patch({ mpgsEnabled: $event })"><span class="slider"></span></span>
            </label>
          </div>

          <div class="env-switch" role="tablist">
            <button type="button" role="tab" [class.active]="s().mpgsMode === 'sandbox'"
              (click)="patch({ mpgsMode: 'sandbox' })">🧪 Sandbox (test)</button>
            <button type="button" role="tab" [class.active]="s().mpgsMode === 'production'"
              (click)="patch({ mpgsMode: 'production' })">🚀 Production</button>
          </div>
          <div class="env-hint">
            Environnement actif : <b>{{ s().mpgsMode === 'sandbox' ? 'Sandbox (test)' : 'Production' }}</b>.
            Paiement carte via <b>Hosted Checkout</b> (redirection sécurisée 3D-Secure). Bascule sans ressaisie.
          </div>

          <div class="env-block" [class.active]="s().mpgsMode === 'sandbox'">
            <div class="env-block-title">🧪 Identifiants Sandbox @if (s().mpgsMode === 'sandbox') { <span class="badge">actif</span> }</div>
            <div class="grid">
              <label class="fld c2"><span>Hôte passerelle</span>
                <input [ngModel]="s().mpgsSandboxHost" (ngModelChange)="patch({ mpgsSandboxHost: $event })" placeholder="test-gateway.mastercard.com"></label>
              <label class="fld c2"><span>Merchant ID</span>
                <input [ngModel]="s().mpgsSandboxMerchantId" (ngModelChange)="patch({ mpgsSandboxMerchantId: $event })" placeholder="TESTAFB-MARCHANT"></label>
              <label class="fld c2"><span>Mot de passe API @if (s().mpgsSandboxPasswordSet) { <em>(déjà défini)</em> }</span>
                <input type="password" [ngModel]="s().mpgsSandboxPassword" (ngModelChange)="patch({ mpgsSandboxPassword: $event })" [placeholder]="s().mpgsSandboxPasswordSet ? '•••••••• (laisser vide pour conserver)' : 'Mot de passe marchand de test'"></label>
            </div>
          </div>

          <div class="env-block" [class.active]="s().mpgsMode === 'production'">
            <div class="env-block-title">🚀 Identifiants Production @if (s().mpgsMode === 'production') { <span class="badge">actif</span> }</div>
            <div class="grid">
              <label class="fld c2"><span>Hôte passerelle</span>
                <input [ngModel]="s().mpgsHost" (ngModelChange)="patch({ mpgsHost: $event })" placeholder="na-gateway.mastercard.com"></label>
              <label class="fld c2"><span>Merchant ID</span>
                <input [ngModel]="s().mpgsMerchantId" (ngModelChange)="patch({ mpgsMerchantId: $event })" placeholder="001020345"></label>
              <label class="fld c2"><span>Mot de passe API @if (s().mpgsPasswordSet) { <em>(déjà défini)</em> }</span>
                <input type="password" [ngModel]="s().mpgsPassword" (ngModelChange)="patch({ mpgsPassword: $event })" [placeholder]="s().mpgsPasswordSet ? '•••••••• (laisser vide pour conserver)' : 'Mot de passe marchand de production'"></label>
            </div>
          </div>

          <div class="grid">
            <label class="fld"><span>Version API REST</span>
              <input [ngModel]="s().mpgsApiVersion" (ngModelChange)="patch({ mpgsApiVersion: $event })" placeholder="100"></label>
          </div>

          <div class="note agg-note">
            Flux : la page payeur crée la transaction, ouvre la page Mastercard hébergée, puis le retour
            confirme le paiement côté serveur (<code>GET .../order/&#123;id&#125;</code>). Le mot de passe marchand
            ne quitte jamais le serveur.
          </div>
        </div>

        @if (msg()) { <div class="banner" [class.ok]="msgOk()" [class.ko]="!msgOk()">{{ msg() }}</div> }

        <div class="save-row">
          <button class="primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Enregistrement…' : 'Enregistrer' }}</button>
        </div>

        <fp-change-password-card />

        <div class="note">
          ℹ️ À la création d'un partenaire, un email contenant le <b>lien de l'application</b> et un
          <b>mot de passe temporaire</b> est automatiquement envoyé à son administrateur (si le SMTP est activé).
        </div>
      </div>
    </div>
  `,
})
export class PlatformSettingsComponent implements OnInit {
  private readonly api = inject(PlatformApiService);
  readonly s = signal<PlatformSettings>({ ...EMPTY });
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly testTo = signal('');
  readonly msg = signal('');
  readonly msgOk = signal(true);

  ngOnInit() {
    this.api.get().subscribe((cfg) => {
      if (cfg) this.s.set({ ...EMPTY, ...cfg, smtpPassword: '', aggSecret: '', aggSandboxSecret: '', mpgsPassword: '', mpgsSandboxPassword: '' });
    });
  }

  patch(p: Partial<PlatformSettings>) { this.s.set({ ...this.s(), ...p }); }

  save() {
    this.saving.set(true); this.msg.set('');
    this.api.save(this.s()).subscribe((res) => {
      this.saving.set(false);
      if (res) {
        this.s.set({ ...EMPTY, ...res, smtpPassword: '', aggSecret: '', aggSandboxSecret: '', mpgsPassword: '', mpgsSandboxPassword: '' });
        this.flash('Paramètres enregistrés.', true);
      } else this.flash("Échec de l'enregistrement (droits ou backend).", false);
    });
  }

  sendTest() {
    this.testing.set(true); this.msg.set('');
    this.api.test(this.s(), this.testTo()).subscribe((res) => {
      this.testing.set(false);
      if (res?.sent) this.flash('Email de test envoyé ✓', true);
      else if (res?.error) this.flash('Test non envoyé : ' + res.error, false);
      else this.flash('Test non envoyé (backend injoignable).', false);
    });
  }

  private flash(m: string, ok: boolean) { this.msg.set(m); this.msgOk.set(ok); }
}
