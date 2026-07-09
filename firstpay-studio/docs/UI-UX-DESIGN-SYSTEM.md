# Design System & Inventaire des écrans — Cash collect First

Référence fidèle extraite du prototype `Cash collect First (standalone).html`. Toute
implémentation Angular doit respecter ces tokens et cet inventaire.

## 1. Tokens (variables CSS — source de vérité)

```css
:root {
  --fp-red:        #E53935;   --fp-red-dark:  #C62828;
  --fp-red-soft:   #FDECEA;   --fp-red-50:    #FFF5F5;
  --bg:            #F7F8FA;   --surface:      #FFFFFF;
  --border:        #ECEEF2;   --border-strong:#D9DDE3;
  --text:          #1A1D21;   --text-2:       #5A6270;   --text-3: #8A93A0;
  --green:         #1F9D55;   --green-soft:   #E6F4EC;
  --amber:         #B7791F;   --amber-soft:   #FEF6E4;
  --blue:          #2563EB;   --blue-soft:    #E8F0FE;
  --shadow-sm: 0 1px 2px rgba(15,23,42,.04);
  --shadow-md: 0 4px 12px -2px rgba(15,23,42,.06), 0 2px 4px -2px rgba(15,23,42,.04);
  --shadow-lg: 0 10px 30px -10px rgba(15,23,42,.12);
  --radius: 10px;
}
```

- **Typographie** : `Inter` (400/500/600/700/800) ; chiffres/refs en `mono`.
- **Logo** : carré `FP`, dégradé `linear-gradient(135deg, #E53935, #C62828)`, radius 8–14.
- **Marque dynamique** : chaque partenaire a une `brandColor` (défaut `#E53935`) appliquée
  à sa page de paiement publique.

## 2. Layout

- **Sidebar** : 232 px, fond blanc, bordure droite `--border`, sticky pleine hauteur.
  Header (logo FP + libellé « Portail partenaire » / « Console superviseur »), nav
  filtrée par rôle, footer « Afriland First Bank ».
  Item actif : fond `--fp-red-50`, texte `--fp-red`, poids 600.
- **Topbar** : breadcrumb (uppercase, `--text-3`), titre + badge partenaire (`mono` code),
  badge « Mode {rôle} » côté banque, bannière d'impersonation côté délégation, menu profil
  + déconnexion. Bouton retour contextuel.
- **Zone principale** : fond `--bg`, motif `bg-lines` discret, cartes `--surface`.

## 3. Composants partagés

| Composant | Rôle |
|-----------|------|
| `StatusBadge` | état interface (`brouillon`/`actif`) & transaction (`success`/`pending`/`failed`) |
| `Stat` / `MetricCard` | carte métrique (label uppercase, valeur 22px/700, sous-titre) |
| `Panel` | carte titrée (`--surface`, `--border`, `--radius`) |
| `Toast` | notification éphémère (auto-dismiss ~3,2 s), `kind: success` |
| `Icon` (I.*) | icônes lucide-style, stroke 1.6 (Dashboard, Wallet, Chart, Users, Settings, Building, Shield, Sliders, Send, Edit, ArrowLeft…) |
| `PaymentPreview` | rendu de la page de paiement (méthodes, montant, QR) |

## 4. Inventaire des écrans

### Côté Partenaire
1. **Tableau de bord** (`home`) — métriques, top interfaces, activité récente.
2. **Studio de paiement** (`studio`) — liste interfaces (panneau gauche) + éditeur/détail :
   - **Éditeur 4 étapes** :
     1. Infos (nom, description, secteur, slug personnalisé)
     2. Montant (`fixed` / `preset` multi-sélection / `free` min-max), devise XAF
     3. Référence & champs personnalisés (`refType` auto/custom, champs text/select requis)
     4. Méthodes de paiement (`orange`, `mtn`, `card`, `transfer`) + QR par méthode
   - **Aperçu page de paiement** + **détail lecture seule** (stats, config).
   - **Aperçu de publication** (parcours payeur simulé) → publication.
3. **Mes transactions** (`transactions`) — vue globale + par interface, filtres, export.
4. **Utilisateurs & rôles** (`users`) — invitations, rôles partenaire, statut.
5. **Paramètres** (`settings`) — logo, couleur de marque, import données clients,
   sécurité, notifications (email/SMS par événement).
6. **Modales** : Partage (lien `pay.firstpay.cm/{code}/{slug}`, QR, email/WhatsApp/SMS),
   Suppression (validation progressive + motif).

### Côté Banque
7. **Console superviseur** (`admin_home`) — supervision plateforme.
8. **Partenaires** (`partners`) — liste, **impersonation/délégation** vers un partenaire.
9. **Transactions plateforme** (`transactions_all`) — toutes transactions, par partenaire.
10. **Journal d'audit** (`audit`) — événements sensibles, append-only.
11. **Paramètres plateforme** (`settings_platform`).

### Côté Caisse (agence)
12. **Caisse** (`cashier`) — recherche interface → **CashierProcess** (formulaire payeur) →
    encaissement → **ReceiptModal** (reçu imprimable).
13. **Mes encaissements** (`cashier_history`) — historique du caissier.

## 5. Données de référence (mock → à remplacer par l'API)

- Partenaire démo : `SOFT TECHNOLOGIES`, code `FSPAY_202605211633050082`, secteur Fintech.
- Interfaces seed : « Frais de scolarité 2025‑2026 » (preset multi), « Cotisation tontine »
  (fixe), « Don campagne santé » (libre min-max).
- Devise par défaut : **XAF** ; locale **fr‑FR** ; format montants `toLocaleString('fr-FR')`.
- Méthodes & poids réalistes : Orange 40 %, MTN 35 %, carte 18 %, virement 7 %.

> Règle de fidélité : reproduire **espacements, rayons, ombres, couleurs et libellés**
> du prototype. Les `inline styles` du prototype React sont convertis en classes/SCSS
> Angular adossées aux mêmes tokens.
