import { Injectable, signal } from '@angular/core';

/**
 * Gère le thème d'interface clair/sombre. Trois préférences :
 *   - 'light' / 'dark' : forcé par l'utilisateur ;
 *   - 'system' : suit le réglage du système d'exploitation (défaut).
 *
 * Le thème résolu est posé en attribut {@code data-theme} sur {@code <html>}, ce que
 * consomment les tokens CSS de styles.scss. Un script anti-FOUC dans index.html applique
 * déjà la bonne valeur avant le boot Angular ; ce service prend ensuite le relais.
 * La préférence est persistée dans localStorage (clé {@code fp_theme}).
 */
export type ThemePref = 'light' | 'dark' | 'system';
const THEME_KEY = 'fp_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly _pref = signal<ThemePref>(this.read());
  private readonly _resolved = signal<'light' | 'dark'>(this.resolve(this._pref()));

  /** Préférence choisie (light | dark | system). */
  readonly pref = this._pref.asReadonly();
  /** Thème réellement appliqué après résolution de 'system'. */
  readonly resolved = this._resolved.asReadonly();

  constructor() {
    // Quand la préférence est 'system', suivre les changements de thème de l'OS.
    this.media.addEventListener('change', () => {
      if (this._pref() === 'system') this.apply();
    });
    this.apply();
  }

  /** Fixe une préférence explicite (ou 'system'). */
  set(pref: ThemePref) {
    this._pref.set(pref);
    try { localStorage.setItem(THEME_KEY, pref); } catch { /* ignore */ }
    this.apply();
  }

  /** Bascule simple clair ↔ sombre à partir du thème actuellement affiché. */
  toggle() {
    this.set(this._resolved() === 'dark' ? 'light' : 'dark');
  }

  private apply() {
    const r = this.resolve(this._pref());
    this._resolved.set(r);
    try { document.documentElement.setAttribute('data-theme', r); } catch { /* ignore */ }
  }

  private resolve(p: ThemePref): 'light' | 'dark' {
    return p === 'system' ? (this.media.matches ? 'dark' : 'light') : p;
  }

  private read(): ThemePref {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
    } catch { return 'system'; }
  }
}
