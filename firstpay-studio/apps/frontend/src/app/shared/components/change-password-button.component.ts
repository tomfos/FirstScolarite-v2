import { Component, signal } from '@angular/core';
import { ChangePasswordCardComponent } from './change-password-card.component';

/**
 * Cadenas topbar — uniquement pour les rôles sans écran Paramètres (bank_cashier,
 * partner_manager, partner_accountant, partner_viewer). Les rôles qui ont un écran
 * Paramètres (partner_admin, bank_admin) y changent leur mot de passe directement,
 * pas ici (voir shell.component.ts : condition d'affichage).
 */
@Component({
  selector: 'fp-change-password-button',
  standalone: true,
  imports: [ChangePasswordCardComponent],
  template: `
    <button class="pwd-btn" type="button" (click)="open.set(true)" title="Changer mon mot de passe" aria-label="Changer mon mot de passe">🔒</button>
    @if (open()) {
      <div class="overlay" (click)="open.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="m-head">
            <div class="m-title">Mon compte</div>
            <button class="x" (click)="open.set(false)">✕</button>
          </div>
          <div class="m-body"><fp-change-password-card /></div>
        </div>
      </div>
    }
  `,
  styles: [`
    .pwd-btn { border: none; background: none; font-size: 16px; width: 34px; height: 34px;
      border-radius: 8px; cursor: pointer; display: grid; place-items: center; color: var(--text-2); }
    .pwd-btn:hover { background: var(--bg); }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,.4); display: grid; place-items: center; z-index: 1100; }
    .modal { background: var(--surface); border-radius: 16px; width: 440px; max-width: 92vw; box-shadow: var(--shadow-lg); overflow: hidden; }
    .m-head { padding: 18px 22px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .m-title { font-size: 16px; font-weight: 700; }
    .x { border: none; background: var(--bg); width: 30px; height: 30px; border-radius: 8px; color: var(--text-2); flex-shrink: 0; }
    .m-body { padding: 22px; }
  `],
})
export class ChangePasswordButtonComponent {
  readonly open = signal(false);
}
