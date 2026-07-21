import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountApiService } from '../../core/api/account-api.service';

/**
 * Carte "Mot de passe" — intégrée dans les écrans Paramètres (partenaire) et Paramètres
 * plateforme (banque), pas une modale flottante : accessible à qui a une page Paramètres.
 */
@Component({
  selector: 'fp-change-password-card',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="card">
      <div class="card-title">Mot de passe</div>
      <div class="pwd-body">
        @if (error()) { <div class="err">{{ error() }}</div> }
        @if (success()) { <div class="ok-banner">✓ Mot de passe changé avec succès.</div> }
        <label class="fld"><span>Mot de passe actuel</span>
          <input type="password" [ngModel]="current()" (ngModelChange)="current.set($event)" autocomplete="current-password"></label>
        <div class="two">
          <label class="fld"><span>Nouveau mot de passe</span>
            <input type="password" [ngModel]="next()" (ngModelChange)="next.set($event)" autocomplete="new-password"
              placeholder="8 caractères minimum"></label>
          <label class="fld"><span>Confirmer</span>
            <input type="password" [ngModel]="confirm()" (ngModelChange)="confirm.set($event)" autocomplete="new-password"></label>
        </div>
        <button class="primary" [disabled]="!canSubmit() || saving()" (click)="submit()">
          {{ saving() ? 'Enregistrement…' : 'Changer le mot de passe' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* Reproduit .card/.card-title des pages Paramètres — non hérité (encapsulation Angular),
       donc porté ici pour que ce composant ait le même rendu partout où il est intégré. */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 22px; box-shadow: var(--shadow-sm); }
    .card-title { font-size: 14px; font-weight: 700; margin-bottom: 16px; }
    .pwd-body { padding-top: 4px; }
    .fld { display: block; margin-bottom: 14px; }
    .fld > span { display: block; font-size: 12.5px; font-weight: 600; margin-bottom: 6px; }
    .fld input { width: 100%; height: 38px; padding: 0 12px; border: 1px solid var(--border-strong); border-radius: 8px; outline: none; font-family: inherit; font-size: 14px; background: var(--surface); }
    .fld input:focus { border-color: var(--fp-red); box-shadow: 0 0 0 3px rgba(229,57,53,.12); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .err { background: var(--fp-red-soft); color: var(--fp-red-dark); padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; font-size: 13px; }
    .ok-banner { background: var(--green-soft); color: var(--green); border: 1px solid #C8E8D5; padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 600; margin-bottom: 14px; }
    .primary { padding: 9px 18px; border-radius: 9px; border: none; background: var(--fp-red); color: #fff; font-weight: 700; font-size: 13px; box-shadow: 0 4px 10px -3px rgba(229,57,53,.45); }
    .primary:disabled { opacity: .5; }
  `],
})
export class ChangePasswordCardComponent {
  private readonly api = inject(AccountApiService);

  readonly current = signal('');
  readonly next = signal('');
  readonly confirm = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal(false);

  readonly canSubmit = () => this.current().length > 0 && this.next().length >= 8 && this.next() === this.confirm();

  submit() {
    if (!this.canSubmit()) return;
    if (this.next() !== this.confirm()) { this.error.set('La confirmation ne correspond pas au nouveau mot de passe.'); return; }
    this.saving.set(true); this.error.set(''); this.success.set(false);
    this.api.changePassword(this.current(), this.next()).subscribe({
      next: () => {
        this.saving.set(false); this.success.set(true);
        this.current.set(''); this.next.set(''); this.confirm.set('');
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.status === 403 ? 'Mot de passe actuel incorrect.' : 'Échec du changement de mot de passe.');
      },
    });
  }
}
