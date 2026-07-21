import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ROLES_CATALOG } from '../../core/auth/roles';
import { ChangePasswordCardComponent } from '../../shared/components/change-password-card.component';

/**
 * Étape obligatoire après une connexion avec un mot de passe temporaire (création de
 * partenaire ou "mot de passe oublié") : bloque l'accès au reste de l'application tant
 * que le mot de passe n'a pas été changé (voir forceChangeGuard sur la route Shell).
 */
@Component({
  selector: 'fp-force-password-change',
  standalone: true,
  imports: [ChangePasswordCardComponent],
  template: `
    <div class="page">
      <div class="panel">
        <div class="head">
          <div class="title">Nouveau mot de passe requis</div>
          <p class="hint">Pour des raisons de sécurité, vous devez choisir un nouveau mot de passe avant de continuer.</p>
        </div>
        <fp-change-password-card (changed)="onChanged()" />
        <button class="logout" type="button" (click)="logout()">Se déconnecter</button>
      </div>
    </div>
  `,
  styles: [`
    .page { min-height: 100vh; display: grid; place-items: center; background: var(--bg); padding: 24px; }
    .panel { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 16px; }
    .head { text-align: center; margin-bottom: 4px; }
    .title { font-size: 20px; font-weight: 700; }
    .hint { color: var(--text-2); font-size: 13.5px; margin-top: 8px; }
    .logout { border: none; background: none; color: var(--text-3); font-size: 13px; font-weight: 600; align-self: center; }
    .logout:hover { color: var(--fp-red); }
  `],
})
export class ForcePasswordChangeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  onChanged() {
    this.auth.clearMustChangePassword();
    const role = this.auth.user()?.role;
    const home = role ? ROLES_CATALOG[role].home : 'login';
    this.router.navigate(['/', home]);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
