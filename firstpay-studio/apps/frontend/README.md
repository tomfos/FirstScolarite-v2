# Cash collect First — Frontend (Angular 21)

Portail standalone, Signals, routing par rôle. Design system fidèle au prototype
(`docs/UI-UX-DESIGN-SYSTEM.md`).

## Dev
```bash
npm install
npm start          # http://localhost:4200
```

## Structure
```
src/app/
├── core/
│   ├── auth/      # roles.ts (catalogue), auth.service (Signals), guard, interceptor
│   ├── tenant/    # contexte tenant (X-Tenant-Id)
│   ├── api/       # services HTTP + SSE
│   └── layout/    # shell : sidebar + topbar
├── shared/        # composants, tokens, icônes réutilisables
└── features/      # dashboard, studio, transactions, users, settings, admin, cashier, auth
```

## État
- ✅ Socle : design tokens, login multi-rôle, shell (sidebar/topbar), routing gardé par rôle.
- ✅ **Phase 5 (portail partenaire)** : Dashboard, Studio (liste + éditeur 4 étapes + aperçu live),
  Transactions (filtres + export CSV/JSON/Excel réel), Utilisateurs (invitation/rôles),
  Paramètres (marque, import, sécurité, notifications), modale Partage (lien/QR/canaux).
  Stores NgRx Signals : `StudioStore`, `UsersStore`, `SettingsStore`.
- ✅ **Phase 6 (banque & caisse)** : Console superviseur, Partenaires (+ délégation/impersonation),
  Journal d'audit, Caisse (sélection partenaire → interface → encaissement 4 étapes → reçu imprimable).
- 🔜 Brancher l'API réelle (remplacer les seeds/mock par partner-service + SSE `/live-stats`).

## Conventions
- `inject()` plutôt que constructeur, composants `standalone`, `OnPush` implicite via Signals.
- Tous les styles s'appuient sur les variables CSS de `src/styles.scss` (jamais de couleurs en dur hors logo dégradé).
