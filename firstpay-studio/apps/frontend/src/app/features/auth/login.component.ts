import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { DEMO_ACCOUNTS, ROLES_CATALOG, Account, RoleId, PartnerType } from '../../core/auth/roles';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { demoApiKeyForPartner, demoTenantIdForPartner, DEMO_PARTNER_SHOWCASE } from '../../core/auth/api-keys';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'fp-login',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './login.component.scss',
  template: `
    <div class="page">
      <div class="brand-panel">
        <div class="brand-top">
          <div class="logo">FC</div>
          <div>
            <div class="bname">FIRST COLLECT</div>
            <div class="bsub">Afriland First Bank</div>
          </div>
        </div>
        <div>
          <div class="eyebrow">Plateforme partenaires</div>
          <h1>Collectez,<br>encaissez,<br>pilotez.</h1>
          <p>Le portail unifié pour gérer vos interfaces de paiement, vos transactions et votre équipe.</p>
        </div>
        <div class="copyright">© 2026 Afriland First Bank · Aide</div>
      </div>

      <div class="form-panel">
        <h2>Connexion</h2>
        <p class="hint">Connectez-vous avec votre email et votre mot de passe.</p>
        @if (error()) { <div class="error">{{ error() }}</div> }

        <form class="login-form" (ngSubmit)="submit()">
          <label class="fld"><span>Email</span>
            <input type="email" name="email" [ngModel]="email()" (ngModelChange)="email.set($event)" placeholder="vous@entreprise.cm" autocomplete="username"></label>
          <label class="fld"><span>Mot de passe</span>
            <input type="password" name="password" [ngModel]="password()" (ngModelChange)="password.set($event)" placeholder="••••••••" autocomplete="current-password"></label>
          <button class="submit" type="submit" [disabled]="loading() || !email()">{{ loading() ? 'Connexion…' : 'Se connecter' }}</button>
        </form>

        @if (showDemoAccounts) {
          <div class="sep"><span>Accès démo rapide</span></div>
          <div class="accounts">
            @for (acc of accounts; track acc.id) {
              <button class="account" (click)="loginDemo(acc)">
                <span class="dot" [style.background]="ROLES_CATALOG[acc.role].color"></span>
                <span class="acc-main">
                  <span class="acc-name">{{ acc.name }}</span>
                  <span class="acc-role">{{ ROLES_CATALOG[acc.role].label }}</span>
                </span>
                <span class="acc-meta">{{ acc.partnerName || acc.agency }}</span>
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly tenant = inject(TenantContextService);
  readonly accounts = DEMO_ACCOUNTS;
  readonly ROLES_CATALOG = ROLES_CATALOG;
  readonly showDemoAccounts = environment.showDemoAccounts;

  readonly email = signal('');
  readonly password = signal('');
  readonly loading = signal(false);
  readonly error = signal('');

  /** Connexion réelle email + mot de passe (unifiée pour tous les profils). */
  submit() {
    const email = this.email().trim();
    if (!email) return;
    this.loading.set(true); this.error.set('');
    this.authApi.login(email, this.password()).subscribe((res) => {
      this.loading.set(false);
      if (!res?.token) { this.error.set('Identifiants invalides. Vérifiez votre email et votre mot de passe.'); return; }
      const role = res.role as RoleId;
      const cat = ROLES_CATALOG[role];
      if (!cat) { this.error.set('Rôle inconnu pour ce compte.'); return; }
      const account: Account = {
        id: res.email, email: res.email, name: res.name, role,
        partnerName: cat.side === 'partner' ? res.partner : undefined,
        partnerType: cat.side === 'partner' ? (res.partnerType as PartnerType) : undefined,
      };
      this.auth.login(account, res.token);
      if (res.tenantId) this.tenant.setTenantId(res.tenantId);
      if (cat.side === 'partner' && res.partner) {
        this.tenant.setPartner({
          name: res.partner,
          code: res.code ?? '',
          shortCode: res.shortCode ?? '',
          sector: res.sector ?? '',
        });
      }
      this.router.navigate(['/', cat.home]);
    });
  }

  /** Raccourci démo : ouvre la session côté client puis tente un vrai JWT (mot de passe « demo »). */
  loginDemo(acc: Account) {
    this.auth.login(acc);
    if (acc.partnerName) {
      const showcase = DEMO_PARTNER_SHOWCASE[acc.partnerName];
      if (showcase) this.tenant.setPartner({ name: acc.partnerName, ...showcase });
      this.tenant.setTenantId(demoTenantIdForPartner(acc.partnerName) ?? '');
      this.tenant.setApiKey(demoApiKeyForPartner(acc.partnerName));
    }
    this.authApi.login(acc.email, 'demo').subscribe((res) => {
      if (res?.token) {
        this.auth.setToken(res.token);
        if (res.tenantId) this.tenant.setTenantId(res.tenantId);
      }
    });
    this.router.navigate(['/', ROLES_CATALOG[acc.role].home]);
  }
}
