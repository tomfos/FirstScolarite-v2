import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd, RouterModule } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../auth/auth.service';
import { ROLES_CATALOG, RoleId, PartnerType } from '../auth/roles';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ThemeService } from '../theme/theme.service';
import { StudioStore } from '../../features/studio/studio.store';
import { ToastComponent } from '../../shared/components/toast.component';

/**
 * partnerTypes : filtre additionnel, orthogonal à `roles` — si présent, l'item n'est
 * visible que pour les partenaires de ce(s) type(s) fonctionnel(s) (voir PartnerType).
 * Absent = pas de restriction de type (comportement actuel pour tous les items banque
 * et les items partenaire communs à tous les types).
 */
interface NavItem { id: string; label: string; roles: RoleId[]; partnerTypes?: PartnerType[]; }

const NAV: NavItem[] = [
  { id: 'home', label: 'Tableau de bord', roles: ['partner_admin', 'partner_manager', 'partner_accountant', 'partner_viewer'] },
  { id: 'studio', label: 'Studio de paiement', roles: ['partner_admin', 'partner_manager', 'partner_viewer'] },
  { id: 'transactions', label: 'Transactions', roles: ['partner_admin', 'partner_manager', 'partner_accountant', 'partner_viewer'] },
  { id: 'cards', label: 'Commande de cartes', roles: ['partner_admin', 'partner_manager'], partnerTypes: ['emf'] },
  { id: 'users', label: 'Utilisateurs', roles: ['partner_admin'] },
  { id: 'settings', label: 'Paramètres', roles: ['partner_admin'] },
  { id: 'admin_home', label: 'Tableau de bord', roles: ['bank_admin'] },
  { id: 'partners', label: 'Partenaires', roles: ['bank_admin'] },
  { id: 'collections', label: 'Encaissements', roles: ['bank_admin'] },
  { id: 'card_orders_admin', label: 'Commandes de cartes', roles: ['bank_admin'] },
  { id: 'transactions_all', label: 'Transactions plateforme', roles: ['bank_admin'] },
  { id: 'audit', label: "Journal d'audit", roles: ['bank_admin'] },
  { id: 'settings_platform', label: 'Paramètres plateforme', roles: ['bank_admin'] },
  { id: 'cashier', label: 'Caisse', roles: ['bank_cashier'] },
  { id: 'cashier_history', label: 'Mes encaissements', roles: ['bank_cashier'] },
];

const BREADCRUMB: Record<string, string> = {
  home: 'Tableau de bord', studio: 'Studio', transactions: 'Transactions', cards: 'Commande de cartes',
  users: 'Utilisateurs', settings: 'Paramètres', admin_home: 'Supervision', partners: 'Partenaires',
  collections: 'Encaissements', card_orders_admin: 'Commandes de cartes',
  transactions_all: 'Transactions plateforme', audit: 'Audit',
  settings_platform: 'Paramètres plateforme', cashier: 'Caisse', cashier_history: 'Mes encaissements',
};

@Component({
  selector: 'fp-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, RouterModule, ToastComponent],
  styleUrl: './shell.component.scss',
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="logo">FC</div>
          <div>
            <div class="brand-name">FIRST COLLECT</div>
            <div class="brand-sub">{{ sideLabel() }}</div>
          </div>
        </div>
        <nav>
          @for (it of items(); track it.id) {
            <a [routerLink]="['/', it.id]" routerLinkActive="active" class="nav-item">{{ it.label }}</a>
          }
        </nav>
        <div class="foot">
          <div class="foot-1">Plateforme de Transactions et<br>Données Partenaires</div>
          <div class="foot-2">Afriland First Bank</div>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="crumb">
            <div class="crumb-label">{{ roleDef()?.side === 'bank' ? 'Plateforme' : 'Partenaire' }} › {{ breadcrumb() }}</div>
            <div class="crumb-row">
              @if (partner(); as p) {
                <span class="partner-badge">{{ p.name }} · <span class="mono">{{ p.code }}</span></span>
              }
              @if (auth.isBank() && !auth.isImpersonating()) {
                <span class="role-badge" [style.background]="roleDef()?.bg" [style.color]="roleDef()?.color">
                  Mode {{ roleDef()?.label }}
                </span>
              }
              @if (auth.isImpersonating()) {
                <span class="imp-badge">Délégation active
                  <button (click)="exitImpersonate()">Quitter</button>
                </span>
              }
            </div>
          </div>
          <div class="topbar-right">
            <button class="theme-toggle" type="button" (click)="theme.toggle()"
                    [attr.aria-label]="theme.resolved() === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'"
                    [attr.title]="theme.resolved() === 'dark' ? 'Thème clair' : 'Thème sombre'">
              @if (theme.resolved() === 'dark') {
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
                </svg>
              } @else {
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
                </svg>
              }
            </button>
            <span class="user">{{ auth.user()?.name }}</span>
            <button class="logout" (click)="logout()">Déconnexion</button>
          </div>
        </header>

        <div class="content"><router-outlet /></div>
      </div>
    </div>
    <fp-toast />
  `,
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly tenant = inject(TenantContextService);
  private readonly router = inject(Router);
  private readonly studioStore = inject(StudioStore);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly breadcrumb = computed(() => {
    const seg = this.url().split('/').filter(Boolean)[0] ?? 'home';
    return BREADCRUMB[seg] ?? seg;
  });

  ngOnInit() {
    this.studioStore.loadFromApi();
  }

  readonly roleDef = this.auth.roleDef;
  readonly items = computed(() => {
    const role = this.auth.effectiveRole();
    if (!role) return [];
    const partnerType = this.auth.effectivePartnerType();
    return NAV.filter((n) => n.roles.includes(role) && (!n.partnerTypes || (!!partnerType && n.partnerTypes.includes(partnerType))));
  });
  readonly sideLabel = computed(() => (this.auth.isBank() ? 'Console superviseur' : 'Portail partenaire'));
  readonly partner = computed(() =>
    this.auth.isBank() && !this.auth.isImpersonating() ? null : this.tenant.partner());

  exitImpersonate() {
    this.auth.exitImpersonate();
    const home = ROLES_CATALOG[this.auth.user()!.role].home;
    this.router.navigate(['/', home]);
  }

  logout() {
    this.auth.logout();
    this.tenant.clear();
    this.router.navigate(['/login']);
  }
}
