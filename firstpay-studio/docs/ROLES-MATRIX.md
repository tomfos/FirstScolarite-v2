# Matrice des rôles & permissions — Cash collect First

Catalogue de rôles fidèle au prototype (`ROLES_CATALOG`). Deux « côtés » : `bank` et
`partner`. Un `bank_admin` peut **impersonate** (déléguer sur) un partenaire et agit
alors comme `partner_admin`.

## Rôles

| Rôle | Côté | Couleur | Home | Modules |
|------|------|---------|------|---------|
| `bank_admin` — Administrateur Banque | bank | `#0F1115` | `admin_home` | admin_home, partners, transactions_all, audit, settings_platform |
| `bank_cashier` — Caissière Agence | bank | `#7C3AED` | `cashier` | cashier, cashier_history |
| `partner_admin` — Administrateur Partenaire | partner | `#E53935` | `home` | home, studio, transactions, users, settings |
| `partner_manager` — Gestionnaire Partenaire | partner | `#2563EB` | `home` | home, studio, transactions |
| `partner_accountant` — Comptable Partenaire | partner | `#1F8A5B` | `transactions` | home, transactions |
| `partner_viewer` — Lecture seule | partner | `#7C8493` | `home` | home, studio (lecture), transactions |

## Permissions (scopes)

| Rôle | Permissions |
|------|-------------|
| `bank_admin` | `*`, `platform.read/write`, `partners.manage`, `audit.read`, `impersonate`, `tx.refund` |
| `bank_cashier` | `caisse.use`, `tx.read.own`, `receipts.print` |
| `partner_admin` | `studio.*`, `tx.*`, `users.*`, `settings.*` |
| `partner_manager` | `studio.read/write`, `tx.read`, `tx.export` |
| `partner_accountant` | `tx.read`, `tx.export`, `reports.read` |
| `partner_viewer` | `studio.read`, `tx.read` |

## Navigation par rôle (sidebar)

- **partner_admin** : Tableau de bord · Studio · Transactions · Utilisateurs · Paramètres
- **partner_manager** : Tableau de bord · Studio · Transactions
- **partner_accountant** : Tableau de bord · Transactions
- **partner_viewer** : Tableau de bord · Studio (lecture) · Transactions
- **bank_admin** : Tableau de bord · Partenaires · Transactions plateforme · Journal d'audit · Paramètres plateforme
- **bank_cashier** : Caisse · Mes encaissements

## Comptes de démonstration

| Email | Nom | Rôle | Rattachement |
|-------|-----|------|--------------|
| `admin.banque@afrilandfirstbank.com` | Cécile Mvondo | bank_admin | Siège · Yaoundé |
| `caisse.bonanjo@afrilandfirstbank.com` | Sylvie Atangana | bank_cashier | Agence Bonanjo · Douala |
| `jospinleunou@softtech.cm` | Jospin Leunou | partner_admin | SOFT TECHNOLOGIES |
| `marie.ngono@softtech.cm` | Marie Ngono | partner_manager | SOFT TECHNOLOGIES |
| `d.essomba@softtech.cm` | Daniel Essomba | partner_accountant | SOFT TECHNOLOGIES |
| `s.mbarga@softtech.cm` | Sophie Mbarga | partner_viewer | SOFT TECHNOLOGIES |

## Application côté backend

- Le `tenant_id` isole les données partenaire (multi-tenant) ; un `bank_admin` traverse
  les tenants (scope `*`), un partenaire est borné à son `tenant_id`.
- L'impersonation génère un contexte `partner_admin` borné au `tenant_id` ciblé, et est
  **journalisée dans l'audit** (`audit.read`).
- Les scopes sont portés par le JWT et vérifiés par `shared-security` dans chaque service.
