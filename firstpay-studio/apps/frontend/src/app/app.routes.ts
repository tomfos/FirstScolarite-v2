import { Routes } from '@angular/router';
import { authGuard, moduleGuard } from './core/auth/auth.guard';
import { ShellComponent } from './core/layout/shell.component';

/**
 * Routing par rôle. Chaque route porte `data.module` vérifié par `moduleGuard`
 * contre les modules autorisés du rôle effectif (voir docs/ROLES-MATRIX.md).
 */
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    canActivateChild: [moduleGuard],
    children: [
      // Partenaire
      { path: 'home', data: { module: 'home' }, loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'studio', data: { module: 'studio' }, loadComponent: () => import('./features/studio/studio.component').then((m) => m.StudioComponent) },
      { path: 'transactions', data: { module: 'transactions', scope: 'partner' }, loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent) },
      { path: 'cards', data: { module: 'cards', partnerTypes: ['emf'] }, loadComponent: () => import('./features/cards/cards.component').then((m) => m.CardsComponent) },
      { path: 'users', data: { module: 'users' }, loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent) },
      { path: 'settings', data: { module: 'settings' }, loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent) },
      // Banque
      { path: 'admin_home', data: { module: 'admin_home' }, loadComponent: () => import('./features/admin/admin-home.component').then((m) => m.AdminHomeComponent) },
      { path: 'partners', data: { module: 'partners' }, loadComponent: () => import('./features/admin/partners.component').then((m) => m.PartnersComponent) },
      { path: 'collections', data: { module: 'collections', scope: 'collections' }, loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent) },
      { path: 'card_orders_admin', data: { module: 'card_orders_admin' }, loadComponent: () => import('./features/admin/card-orders-admin.component').then((m) => m.CardOrdersAdminComponent) },
      { path: 'messages', data: { module: 'messages' }, loadComponent: () => import('./features/admin/messages-admin.component').then((m) => m.MessagesAdminComponent) },
      { path: 'transactions_all', data: { module: 'transactions_all' }, loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent) },
      { path: 'audit', data: { module: 'audit' }, loadComponent: () => import('./features/admin/audit.component').then((m) => m.AuditComponent) },
      { path: 'settings_platform', data: { module: 'settings_platform', scope: 'platform' }, loadComponent: () => import('./features/admin/platform-settings.component').then((m) => m.PlatformSettingsComponent) },
      // Caisse
      { path: 'cashier', data: { module: 'cashier' }, loadComponent: () => import('./features/cashier/cashier.component').then((m) => m.CashierComponent) },
      { path: 'cashier_history', data: { module: 'cashier_history', scope: 'cashier' }, loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'home' },
    ],
  },
  { path: '**', redirectTo: '' },
];
