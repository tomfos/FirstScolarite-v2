/** Catalogue de rôles — fidèle au prototype (ROLES_CATALOG). Voir docs/ROLES-MATRIX.md */

export type Side = 'bank' | 'partner';
export type RoleId =
  | 'bank_admin' | 'bank_cashier'
  | 'partner_admin' | 'partner_manager' | 'partner_accountant' | 'partner_viewer';

/**
 * Axe fonctionnel du partenaire, orthogonal au rôle hiérarchique ci-dessus (un
 * partner_admin EMF et un partner_admin standard ont les mêmes droits d'admin, mais
 * pas les mêmes modules). 'standard' = comportement actuel inchangé ; 'emf' = premier
 * type fonctionnel introduit (accès commande de cartes / suivi des ventes).
 */
export type PartnerType = 'standard' | 'emf';

export interface RoleDef {
  label: string;
  side: Side;
  color: string;
  bg: string;
  desc: string;
  perms: string[];
  home: string;
  modules: string[];
}

export const ROLES_CATALOG: Record<RoleId, RoleDef> = {
  bank_admin: {
    label: 'Administrateur Banque', side: 'bank', color: '#0F1115', bg: '#F2F4F7',
    desc: "Accès complet à la plateforme First Collect. Supervise tous les partenaires, accède à l'audit, débogue les interfaces, dénoue les litiges.",
    perms: ['*', 'platform.read', 'platform.write', 'partners.manage', 'audit.read', 'impersonate', 'tx.refund'],
    home: 'admin_home',
    modules: ['admin_home', 'partners', 'collections', 'card_orders_admin', 'messages', 'transactions_all', 'audit', 'settings_platform'],
  },
  bank_cashier: {
    label: 'Caissière Agence', side: 'bank', color: '#7C3AED', bg: '#F1ECFE',
    desc: "Encaisse les paiements en agence pour les clients au guichet. Recherche l'interface, remplit le formulaire, valide l'encaissement, imprime le reçu.",
    perms: ['caisse.use', 'tx.read.own', 'receipts.print'],
    home: 'cashier',
    modules: ['cashier', 'cashier_history'],
  },
  partner_admin: {
    label: 'Administrateur Partenaire', side: 'partner', color: '#E53935', bg: '#FFF5F5',
    desc: "Contrôle complet de l'espace du partenaire. Crée et publie des interfaces, gère l'équipe, importe des données, configure la marque et les notifications.",
    perms: ['studio.*', 'tx.*', 'users.*', 'settings.*'],
    home: 'home',
    // 'cards' n'est effectivement accessible que si le partenaire est de type EMF
    // (voir NavItem.partnerTypes dans shell.component.ts et moduleGuard) — présent ici
    // pour autoriser le rôle, la restriction de type s'applique en plus, pas à la place.
    modules: ['home', 'studio', 'transactions', 'users', 'settings', 'cards'],
  },
  partner_manager: {
    label: 'Gestionnaire Partenaire', side: 'partner', color: '#2563EB', bg: '#E8F0FE',
    desc: "Crée et modifie les interfaces, consulte et exporte les transactions. N'invite pas de membres et ne modifie pas la marque.",
    perms: ['studio.read', 'studio.write', 'tx.read', 'tx.export'],
    home: 'home',
    modules: ['home', 'studio', 'transactions', 'cards'],
  },
  partner_accountant: {
    label: 'Comptable Partenaire', side: 'partner', color: '#1F8A5B', bg: '#E3F1E9',
    desc: 'Consulte et exporte toutes les transactions, accède aux rapports comptables. Ne modifie pas les interfaces.',
    perms: ['tx.read', 'tx.export', 'reports.read'],
    home: 'transactions',
    modules: ['home', 'transactions'],
  },
  partner_viewer: {
    label: 'Lecture seule', side: 'partner', color: '#7C8493', bg: '#F2F4F7',
    desc: 'Consulte les interfaces et transactions sans modifier ni exporter.',
    perms: ['studio.read', 'tx.read'],
    home: 'home',
    modules: ['home', 'studio_readonly', 'transactions'],
  },
};

export interface Account {
  id: string; email: string; name: string; role: RoleId;
  agency?: string; partnerName?: string; partnerType?: PartnerType;
}

export const DEMO_ACCOUNTS: Account[] = [
  { id: 'u-admin-bk', email: 'admin.banque@afrilandfirstbank.com', name: 'Cécile Mvondo', role: 'bank_admin', agency: 'Siège · Yaoundé' },
  { id: 'u-caisse-1', email: 'caisse.bonanjo@afrilandfirstbank.com', name: 'Sylvie Atangana', role: 'bank_cashier', agency: 'Agence Bonanjo · Douala' },
  { id: 'u-padmin', email: 'jospinleunou@softtech.cm', name: 'Jospin Leunou', role: 'partner_admin', partnerName: 'SOFT TECHNOLOGIES', partnerType: 'standard' },
  { id: 'u-pmgr', email: 'marie.ngono@softtech.cm', name: 'Marie Ngono', role: 'partner_manager', partnerName: 'SOFT TECHNOLOGIES', partnerType: 'standard' },
  { id: 'u-pacc', email: 'd.essomba@softtech.cm', name: 'Daniel Essomba', role: 'partner_accountant', partnerName: 'SOFT TECHNOLOGIES', partnerType: 'standard' },
  { id: 'u-pview', email: 's.mbarga@softtech.cm', name: 'Sophie Mbarga', role: 'partner_viewer', partnerName: 'SOFT TECHNOLOGIES', partnerType: 'standard' },
  { id: 'u-emf-admin', email: 'admin@emfdigital.cm', name: 'Awa Ndongo', role: 'partner_admin', partnerName: 'EMF DIGITAL FINANCE', partnerType: 'emf' },
];
