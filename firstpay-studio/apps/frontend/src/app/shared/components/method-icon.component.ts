import { Component, input } from '@angular/core';
import { Method } from '../../core/models/interface.model';

/**
 * Badge d'icône pour un moyen de paiement. Représentations simplifiées et reconnaissables
 * (couleur de marque + repère géométrique/monogramme), et non des reproductions exactes de
 * logos : carré Orange pour Orange Money, monogramme « MTN » sur fond jaune, cercles entrelacés
 * pour la carte, glyphe d'agence bancaire pour le virement. Réutilisé par le wizard studio,
 * les aperçus et (via un équivalent JS) la page payeur.
 */
@Component({
  selector: 'fp-method-icon',
  standalone: true,
  template: `
    @switch (method()) {
      @case ('orange') {
        <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" role="img" aria-label="Orange Money">
          <rect width="32" height="32" rx="8" fill="#FF7900" />
          <rect x="11.5" y="11.5" width="9" height="9" rx="1.5" fill="#fff" />
        </svg>
      }
      @case ('mtn') {
        <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" role="img" aria-label="MTN MoMo">
          <rect width="32" height="32" rx="8" fill="#FFCC00" />
          <text x="16" y="20.5" text-anchor="middle" font-family="Inter, Arial, sans-serif"
                font-size="10" font-weight="800" fill="#004F71">MTN</text>
        </svg>
      }
      @case ('card') {
        <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" role="img" aria-label="Carte bancaire">
          <rect width="32" height="32" rx="8" fill="#F3F4F7" />
          <circle cx="13.5" cy="16" r="6.5" fill="#EB001B" />
          <circle cx="18.5" cy="16" r="6.5" fill="#F79E1B" fill-opacity="0.92" />
        </svg>
      }
      @case ('transfer') {
        <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" role="img" aria-label="Virement bancaire">
          <rect width="32" height="32" rx="8" fill="#1F9D55" />
          <g fill="#fff">
            <path d="M16 7 L24 12 H8 Z" />
            <rect x="9.5" y="13" width="2.2" height="8" rx="0.5" />
            <rect x="14.9" y="13" width="2.2" height="8" rx="0.5" />
            <rect x="20.3" y="13" width="2.2" height="8" rx="0.5" />
            <rect x="7" y="22" width="18" height="2.6" rx="1" />
          </g>
        </svg>
      }
    }
  `,
  styles: [':host { display: inline-grid; place-items: center; line-height: 0; } svg { display: block; }'],
})
export class MethodIconComponent {
  readonly method = input.required<Method>();
  /** Taille du badge en pixels (carré). */
  readonly size = input(28);
}
