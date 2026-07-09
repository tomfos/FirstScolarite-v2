import { Component, Input } from '@angular/core';

/**
 * Carte placeholder fidèle au design system, affichée pour les écrans dont
 * l'implémentation détaillée est planifiée (voir docs/PHASES.md).
 */
@Component({
  selector: 'fp-placeholder',
  standalone: true,
  template: `
    <div class="wrap">
      <div class="bg-lines"></div>
      <div class="card">
        <div class="badge">{{ phase }}</div>
        <h1>{{ title }}</h1>
        <p>{{ desc }}</p>
        <div class="note">Écran à implémenter — fidèle au prototype First Collect.</div>
      </div>
    </div>
  `,
  styles: [`
    .wrap { flex: 1; position: relative; display: grid; place-items: center; padding: 40px; }
    .card {
      position: relative; z-index: 1; background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 36px 40px; max-width: 560px; box-shadow: var(--shadow-md);
    }
    .badge {
      display: inline-block; background: var(--fp-red-50); color: var(--fp-red);
      font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; margin-bottom: 14px;
    }
    h1 { font-size: 24px; font-weight: 700; letter-spacing: -.01em; }
    p { color: var(--text-2); margin-top: 8px; line-height: 1.55; }
    .note { margin-top: 18px; font-size: 12px; color: var(--text-3); border-top: 1px solid var(--border); padding-top: 14px; }
  `],
})
export class FeaturePlaceholderComponent {
  @Input() title = '';
  @Input() phase = '';
  @Input() desc = '';
}
