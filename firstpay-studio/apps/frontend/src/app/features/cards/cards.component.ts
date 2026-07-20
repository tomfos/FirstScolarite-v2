import { Component } from '@angular/core';
import { PanelComponent } from '../../shared/components/panel.component';

/**
 * Écran EMF : commande de cartes prépayées + suivi des ventes. Réservé aux
 * partenaires de type 'emf' (voir moduleGuard / NavItem.partnerTypes). Placeholder
 * volontaire — la logique métier (portée depuis angular-front) arrive dans une
 * tranche ultérieure, une fois le plomberie partnerType validée de bout en bout.
 */
@Component({
  selector: 'fp-cards',
  standalone: true,
  imports: [PanelComponent],
  template: `
    <div class="page">
      <div class="head">
        <div class="eyebrow">Espace partenaire EMF</div>
        <div class="title">Commande de cartes</div>
        <div class="subtitle">Suivi des ventes et commande de cartes prépayées.</div>
      </div>
      <fp-panel title="Bientôt disponible">
        <div class="body">
          Cet écran est réservé aux partenaires de type EMF — vous le voyez parce que
          votre compte porte ce type. La commande de cartes et le suivi des ventes
          seront branchés ici dans une prochaine étape.
        </div>
      </fp-panel>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 20px; }
    .eyebrow { font-size: 12.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
    .title { font-size: 22px; font-weight: 700; margin-top: 4px; }
    .subtitle { color: var(--text-muted); font-size: 13.5px; margin-top: 4px; }
    .body { padding: 20px; color: var(--text-muted); font-size: 14px; line-height: 1.6; }
  `],
})
export class CardsComponent {}
