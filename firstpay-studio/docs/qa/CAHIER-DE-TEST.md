# Cahier de test fonctionnel — Cash Collect First (FirstPay Studio)

> **Objet** : validation fonctionnelle complète avant mise en production.
> **Portée** : portail partenaire, console banque, caisse, page payeur publique, API/backend, intégrations de paiement, exigences non-fonctionnelles.
> **Version** : pré-production · **Endpoint public** : `https://esign.afbdei.com`

---

## 0. Cadre de test

### 0.1 Environnements

| Environnement | Frontend | Gateway | Notes |
|---|---|---|---|
| Dev (compose) | `:14200` (portail), `:14300` (payeur) | `:18080` | `PAYMENT_SIMULATION_ENABLED` possiblement `true` |
| Pré-prod / Prod | `https://esign.afbdei.com` | via nginx/Caddy | simulation `false`, TrustPayWay/MPGS réels |

### 0.2 Comptes de test (seed)

| Email | Mot de passe | Rôle |
|---|---|---|
| admin.banque@afrilandfirstbank.com | `demo` | bank_admin |
| caisse.bonanjo@afrilandfirstbank.com | `demo` | bank_cashier |
| jospinleunou@softtech.cm | `demo` | partner_admin |
| marie.ngono@softtech.cm | `demo` | partner_manager |
| d.essomba@softtech.cm | `demo` | partner_accountant |
| s.mbarga@softtech.cm | `demo` | partner_viewer |

> Tenants de démo : **SOFT** (`demo-soft-key`), **EPAL** (`demo-epal-key`). Clé de charge : `loadtest-key-2026` (doit correspondre à un `api_key_hash` réel).

### 0.3 Conventions

- **Priorité** : P1 Critique (bloquant go/no-go) · P2 Haute · P3 Moyenne · P4 Basse.
- **Type** : F Fonctionnel · N Négatif · S Sécurité · U UX · NF Non-fonctionnel.
- Un cas est **OK** si le résultat observé == résultat attendu, sinon **KO** + n° d'anomalie.
- Colonnes de suivi à remplir par le testeur : *Statut*, *Testé le*, *Par*, *Anomalie*.

### 0.4 Matrice RBAC de référence (à vérifier — voir §2)

| Module / rôle | bank_admin | bank_cashier | partner_admin | partner_manager | partner_accountant | partner_viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Tableau de bord partenaire | – | – | ✅ | ✅ | ✅ | ✅ |
| Studio (écriture) | ✅ | – | ✅ | ✅ | – | ❌ (voir ANO-01) |
| Transactions partenaire | – | – | ✅ | ✅ | ✅ | ✅ |
| Utilisateurs | – | – | ✅ | – | – | – |
| Paramètres partenaire | – | – | ✅ | – | – | – |
| Console banque | ✅ | – | – | – | – | – |
| Partenaires | ✅ | – | – | – | – | – |
| Transactions plateforme | ✅ | – | – | – | – | – |
| Journal d'audit | ✅ | – | – | – | – | – |
| Paramètres plateforme | ✅ | – | – | – | – | – |
| Caisse | – | ✅ | – | – | – | – |

---

## 1. Authentification & connexion

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| AUTH-01 | Connexion valide partenaire | Compte partner_admin | Saisir email+mdp valides → *Se connecter* | Redirection vers `home` ; badge partenaire affiché | P1 | F |
| AUTH-02 | Connexion valide banque | Compte bank_admin | Idem | Redirection vers `admin_home` ; « Mode Administrateur Banque » | P1 | F |
| AUTH-03 | Connexion valide caisse | Compte bank_cashier | Idem | Redirection vers `cashier` | P1 | F |
| AUTH-04 | Identifiants invalides | — | Email valide + mauvais mdp | Bannière « Identifiants invalides… » ; pas de navigation | P1 | N |
| AUTH-05 | Email vide | — | Laisser email vide → *Se connecter* | Bouton désactivé / aucune action | P2 | N |
| AUTH-06 | Rôle inconnu | Compte au rôle non catalogué | Se connecter | « Rôle inconnu pour ce compte. » | P3 | N |
| AUTH-07 | Token JWT expiré au rechargement | Session ouverte, JWT expiré | Recharger la page | Session purgée, retour `/login` | P2 | S |
| AUTH-08 | Persistance de session | Connecté | Recharger la page (JWT valide) | Toujours connecté, contexte conservé | P2 | F |
| AUTH-09 | Déconnexion | Connecté | Cliquer *Déconnexion* | Auth+tenant effacés, retour `/login` | P1 | F |
| AUTH-10 | Comptes démo masqués en prod | Prod (`showDemoAccounts=false`) | Ouvrir `/login` | La grille de comptes démo n'apparaît pas | P2 | S |
| AUTH-11 | Durée de vie JWT | Connecté | Attendre > 8 h (TTL 28800 s) | JWT rejeté ; reconnexion requise (401 sur API) | P3 | S |

---

## 2. Navigation, thème & contrôle d'accès (RBAC / guards)

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| NAV-01 | Menu partenaire | Connecté partner_admin | Observer la barre latérale | Tableau de bord, Studio, Transactions, Utilisateurs, Paramètres | P2 | F |
| NAV-02 | Menu banque | bank_admin | Observer | Tableau de bord, Partenaires, Transactions plateforme, Journal d'audit, Paramètres plateforme | P2 | F |
| NAV-03 | Menu caisse | bank_cashier | Observer | Caisse, Mes encaissements | P2 | F |
| NAV-04 | Guard — accès direct interdit | partner_accountant | Naviguer à `/users` via URL | Redirection vers `home` (module non autorisé) | P1 | S |
| NAV-05 | Guard — non authentifié | Déconnecté | Ouvrir `/studio` | Redirection `/login` | P1 | S |
| NAV-06 | Bascule thème | Connecté | Cliquer ☀/☾ | Thème alterne clair/sombre, persiste après rechargement | P3 | U |
| NAV-07 | Fil d'ariane & badges | bank_admin | Naviguer entre écrans | Fil d'ariane « Plateforme › … » cohérent | P4 | U |
| ANO-01 | **Écart : Studio visible mais bloqué (viewer)** | partner_viewer | Cliquer *Studio de paiement* dans le menu | Le menu propose Studio mais le guard redirige vers `home` (module `studio_readonly` ≠ `studio`) — **incohérence à corriger/valider** | P2 | S |
| ANO-02 | **Écart : Transactions plateforme** | bank_admin | Ouvrir *Transactions plateforme* | La route `/transactions_all` n'a pas `scope:'platform'` → affiche les données du store partenaire et le titre « Mes transactions ». **Vérifier la portée réelle des données** | P2 | F |

---

## 3. Tableaux de bord

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| DASH-01 | KPIs partenaire | partner_admin, transactions existantes | Ouvrir `home` | 4 cartes (Transactions, Encaissé, Taux de succès, Interfaces) cohérentes avec les données | P2 | F |
| DASH-02 | Live tx/min (SSE) | partner_admin | Observer le taux de succès | Mise à jour temps réel depuis `/api/v1/reports/live-stats` | P3 | F |
| DASH-03 | Activité récente | partner_admin | Observer le panneau | 5 dernières transactions avec icône statut | P3 | F |
| DASH-04 | Top interfaces | partner_admin | Observer | 3 interfaces les plus actives (barres) | P4 | U |
| DASH-05 | Accès rapides | partner_admin | Cliquer chaque carte module | Navigation correcte (studio/transactions/users/settings) | P3 | F |
| DASH-06 | Console banque KPIs | bank_admin | Ouvrir `admin_home` | Transactions totales, Encaissé, Taux (live tpm), Échecs | P2 | F |
| DASH-07 | Repli sans API reporting | reporting indisponible | Ouvrir dashboard | Repli sur données locales sans crash | P3 | N |

---

## 4. Studio — liste des interfaces

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| STU-01 | Afficher la liste | partner_admin | Ouvrir Studio | Cartes interfaces (nom, slug, statut, tx, encaissé) | P2 | F |
| STU-02 | Recherche | ≥2 interfaces | Taper un nom | Filtre insensible à la casse | P3 | F |
| STU-03 | Filtres statut | interfaces mixtes | Cliquer Toutes/Actives/Brouillons | Compteurs et liste cohérents | P3 | F |
| STU-04 | Nouvelle interface (droit) | partner_admin | Bouton *+ Nouvelle interface* | Ouvre l'éditeur vierge | P2 | F |
| STU-05 | Bouton masqué en lecture seule | partner_viewer (via impersonation banque) | Ouvrir Studio | *+ Nouvelle* et actions d'écriture masquées | P2 | S |
| STU-06 | Détail lecture seule | interface sélectionnée non éditée | Sélectionner une interface | URL publique, stats, aperçu LIVE, configuration | P3 | F |
| STU-07 | Copier le lien | interface actif | Bouton copier | Bascule « Copier » → « ✓ » 1,6 s | P4 | U |
| STU-08 | Supprimer une interface | partner_admin | 🗑 → confirmer « Supprimer définitivement… » | Interface retirée + toast « Interface supprimée. » | P2 | F |
| STU-09 | Annuler la suppression | — | 🗑 → Annuler | Aucune suppression | P3 | N |

---

## 5. Studio — éditeur (assistant 3 étapes)

### 5.1 Étape 1 — Interface & montant

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| STU-10 | Nom requis | Éditeur ouvert | Laisser le nom vide → *Suivant* | Bloqué : « Donnez un nom à votre interface pour continuer. » | P1 | N |
| STU-11 | Slug auto | — | Saisir « Frais scolarité 2026 » | Slug dérivé (slugify, ≤40 car.), tag « auto » | P3 | F |
| STU-12 | Slug manuel | — | Éditer le lien public | Dérivation stoppée, tag « auto » disparaît | P3 | F |
| STU-13 | Pays → devise/indicatif | — | Choisir Côte d'Ivoire | Devise XOF, indicatif +225 | P2 | F |
| STU-14 | Montant fixe valide | fixed | Saisir 50000 | Étape valide (montant > 0) | P1 | F |
| STU-15 | Montant fixe invalide | fixed | Saisir 0 | Bloqué : « Saisissez un montant fixe supérieur à 0. » | P2 | N |
| STU-16 | Presets + acompte | preset | Ajouter 2 presets ; cocher *Acompte autorisé* + min | Panneau minimum affiché ; étape valide si ≥1 preset > 0 | P1 | F |
| STU-17 | Preset invalide | preset | Aucun preset avec montant > 0 | Bloqué : « Ajoutez au moins un montant prédéfini valide. » | P2 | N |
| STU-18 | Panier multi-montants | preset | Cocher *Sélection de plusieurs montants* | `multiSelect` activé (reflété dans l'aperçu) | P2 | F |
| STU-19 | Supprimer preset | preset ≥2 | ✕ sur un preset | Retiré ; ✕ désactivé s'il n'en reste qu'un | P3 | F |
| STU-20 | Montant libre valide | free | min=1000, max=100000 | Étape valide (min>0 et max≥min) | P2 | F |
| STU-21 | Montant libre invalide | free | max < min | Bloqué : « Renseignez un minimum, et un maximum au moins égal au minimum. » | P2 | N |

### 5.2 Étape 2 — Référence & formulaire

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| STU-22 | Référence auto | — | Choisir *Référence automatique* | Aucun champ additionnel requis | P3 | F |
| STU-23 | Référence personnalisée | — | Choisir *personnalisée* sans libellé → *Suivant* | Bloqué : « Indiquez le libellé de la référence personnalisée. » | P2 | N |
| STU-24 | Ajouter un champ texte | — | *+ Ajouter un champ*, type Texte, libellé | Champ ajouté ; options obligatoire/lecture seule | P2 | F |
| STU-25 | Champ Liste | — | Type Liste + options « A,B,C » | Options découpées (trim, non vides) | P3 | F |
| STU-26 | Champ Date / Téléphone | — | Ajouter chaque type | Rendu correct dans l'aperçu (placeholders JJ/MM/AAAA, +indicatif) | P3 | F |
| STU-27 | Champ obligatoire sans libellé | — | Champ requis, libellé vide → *Suivant* | Bloqué : « Chaque champ obligatoire doit avoir un libellé. » | P2 | N |
| STU-28 | Champ Matricule | — | Ajouter type *Matricule* | Aide auto-remplissage ; pas de toggles requis/lecture seule ; panneau *Données étudiants* apparaît | P1 | F |

### 5.3 Import répertoire étudiants (matricule) — voir aussi §5.5

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| ROS-01 | Import CSV valide | champ matricule présent, droit écriture | Choisir CSV avec colonne `matricule` | « {n} ligne(s) prête(s) à importer » puis *Importer* → « {imported} importé(s), {skipped} ignorée(s) » | P1 | F |
| ROS-02 | CSV sans colonne matricule | — | Importer un CSV sans `matricule` | « Aucune colonne « matricule » détectée… » | P2 | N |
| ROS-03 | CSV vide | — | Importer un fichier vide | « Fichier vide ou illisible. » | P3 | N |
| ROS-04 | Détection délimiteur | — | CSV avec `;` ou tab | Import correct (parser détecte `, ; \t`, gère guillemets/multiligne) | P3 | F |
| ROS-05 | Établissement rattaché | — | Renseigner *Établissement* + importer | Recherche matricule restreinte à cet établissement | P2 | F |
| ROS-06 | Vider le répertoire | roster > 0 | *Vider le répertoire* | « Répertoire vidé. » ; total = 0 | P3 | F |
| ROS-07 | Import interdit lecture seule | partner_viewer | — | Contrôles d'import masqués | P2 | S |

### 5.4 Étape 3 — Moyens & publication

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| STU-29 | Chargement des moyens dispo | — | Ouvrir l'étape 3 | « Chargement… » puis liste filtrée par `/settings/payment-methods` | P2 | F |
| STU-30 | Seuls moyens activés banque | agrégateur désactivé côté banque | Ouvrir l'étape 3 | Orange/MTN absents ; message d'invitation à contacter l'admin si aucun dispo | P1 | F |
| STU-31 | Activer un moyen + QR | ≥1 moyen dispo | Cocher *Actif* puis *QR* | QR activable uniquement si moyen actif | P2 | F |
| STU-32 | Aucun moyen actif | — | Décocher tous | Bloqué : « Activez au moins un moyen de paiement. » | P2 | N |
| STU-33 | Réconciliation des moyens | brouillon avec moyen devenu indispo | Ouvrir l'éditeur | Moyen indispo désactivé ; si aucun actif, 1er dispo auto-activé | P2 | F |
| STU-34 | Enregistrer brouillon | étapes 1-2 valides | *Enregistrer le brouillon* | Interface sauvegardée en `brouillon` | P1 | F |
| STU-35 | Navigation étapes | — | Tenter d'aller en avant sur étape invalide | Étape suivante désactivée ; retour arrière toujours permis | P3 | U |

### 5.5 Aperçu en direct

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| STU-36 | Aperçu reflète la config | Éditeur | Modifier nom/montant/champs/moyens | L'aperçu mobile se met à jour en direct | P3 | U |

---

## 6. Publication & partage

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| PUB-01 | Simulation parcours payeur | interface valide | *Aperçu et publier* | Modale simulant le parcours (Identification→Confirmation), bascule Mobile/Web | P2 | F |
| PUB-02 | Publier | simulation ouverte | *Publier l'interface* | Statut → `actif` ; ouverture auto de la modale de partage ; « Interface publiée 🎉 » | P1 | F |
| PUB-03 | Publier depuis brouillon | interface `brouillon` | *🚀 Publier* | Ouvre l'éditeur puis la publication | P2 | F |
| PUB-04 | Partage lien + QR | interface `actif` | *Partager & QR code* | Onglets Lien (copier, WhatsApp/Email/SMS/Telegram) et QR (télécharger) | P2 | F |
| PUB-05 | Interface publiée résout côté public | interface `actif`, tenant `ACTIVE` | Ouvrir l'URL publique | Page payeur se charge (voir §11) | P1 | F |
| PUB-06 | Brouillon non public | interface `brouillon` | Ouvrir l'URL publique | 404 « Page de paiement introuvable » | P1 | S |

---

## 7. Transactions & export

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| TX-01 | Liste transactions partenaire | transactions existantes | Ouvrir Transactions | Tableau (Réf, Payeur, Interface, Moyen, Statut, Montant, Date) | P2 | F |
| TX-02 | Bandeau stats | — | Observer | Période, Encaissé (succès), Succès/En attente/Échec | P3 | F |
| TX-03 | Recherche | — | Chercher payeur/réf/téléphone | Filtrage correct | P3 | F |
| TX-04 | Filtre interface | ≥2 interfaces | Sélectionner une interface | Liste filtrée | P3 | F |
| TX-05 | Filtre statut | — | Succès/En attente/Échec | Liste filtrée | P3 | F |
| TX-06 | Filtre moyen | — | Orange/MTN/Carte/Virement | Liste filtrée | P3 | F |
| TX-07 | Filtre période | — | 7/30/90/Tout | Liste filtrée par plage | P3 | F |
| TX-08 | Pagination 60 lignes | > 60 tx | Observer | 60 affichées + avis « 60 sur {n}… » | P4 | U |
| TX-09 | Export CSV | ≥1 tx | Exporter → CSV → Télécharger | `transactions-firstpay.csv`, BOM UTF-8, en-têtes FR, libellés moyens/statuts | P2 | F |
| TX-10 | Export JSON | — | Exporter → JSON | JSON indenté valide | P3 | F |
| TX-11 | Export Excel | — | Exporter → xls | Fichier tab-séparé `.xls` ouvrable | P3 | F |
| TX-12 | Liste vide | aucun résultat | Filtrer sans correspondance | « Aucune transaction ne correspond à ces filtres. » | P4 | U |

---

## 8. Caisse (encaissement en agence)

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| CASH-01 | Choisir un partenaire | bank_cashier | Rechercher + sélectionner un partenaire actif | Impersonation ; interfaces chargées | P1 | F |
| CASH-02 | Partenaire inactif non sélectionnable | — | — | Partenaires inactifs non cliquables | P2 | S |
| CASH-03 | Choisir interface active | partenaire choisi | Sélectionner interface `actif` | Démarre le formulaire d'encaissement | P1 | F |
| CASH-04 | Identification requise | — | Étape Identification sans nom/téléphone | *Suivant* bloqué tant que nom+téléphone vides | P2 | N |
| CASH-05 | Montant | — | Étape Montant (fixe/preset/libre) | *Suivant* si montant > 0 | P1 | F |
| CASH-06 | Mode de paiement | — | Choisir un moyen actif | *Suivant* si moyen sélectionné | P2 | F |
| CASH-07 | Valider encaissement | étapes complètes | *Valider l'encaissement* | Transaction créée (`externalRef` `CASH-…`, `X-Idempotency-Key`) ; reçu affiché | P1 | F |
| CASH-08 | Imprimer le reçu | encaissement validé | *Imprimer* | Fenêtre d'impression (ticket CCF) | P3 | U |
| CASH-09 | Échec réseau | backend KO | Valider | « Échec de l'encaissement. Vérifiez la connexion ou réessayez. » | P2 | N |
| CASH-10 | Historique caissière | encaissements passés | Ouvrir *Mes encaissements* | Uniquement les tx de la caissière (cashierId ou réf `CASH-`) | P2 | F |
| CASH-11 | Changer de partenaire | — | *‹ Changer de partenaire* | Retour à la sélection | P3 | F |

---

## 9. Administration banque — Partenaires

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| PART-01 | Lister les partenaires | bank_admin | Ouvrir Partenaires | Table (nom+code, secteur, #interfaces, statut) | P2 | F |
| PART-02 | Créer un partenaire | bank_admin | *+ Nouveau* : nom + compte de règlement → Créer | 201 ; écran succès avec **clé API** + **mot de passe temp.** (une fois) ; audit `partner_create` | P1 | F |
| PART-03 | Nom/compte requis | — | Laisser nom ou compte vide | Bouton *Créer* désactivé | P2 | N |
| PART-04 | Création interdite (non admin) | partner_admin (API directe) | POST `/api/v1/partners` | **403** | P1 | S |
| PART-05 | Impersonation | bank_admin | *Ouvrir* un partenaire actif | Délégation ; bannière « Délégation active » ; audit `impersonate_start` ; portail partenaire | P1 | F |
| PART-06 | Quitter la délégation | en délégation | *Quitter* | Retour au compte banque + son `home` | P2 | F |
| PART-07 | Impersonation caisse | bank_cashier | Ouvrir partenaire via caisse | Délégation autorisée (rôle délégué partner_admin) | P2 | F |
| PART-08 | Clé API non réaffichée | partenaire créé | Rouvrir la fiche | La clé n'est plus visible (affichée une seule fois) | P2 | S |
| PART-09 | Tenant inconnu à l'impersonation | — | Impersonate tenant inexistant (API) | **404** | P3 | N |

---

## 10. Administration banque — Journal d'audit

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| AUD-01 | Afficher le journal | bank_admin | Ouvrir Journal d'audit | Événements horodatés (acteur, cible, partenaire) | P2 | F |
| AUD-02 | Filtres niveau | — | Info/Avertissements/Critiques | Requête `?level=` et liste filtrée | P3 | F |
| AUD-03 | Traçage des actions | — | Publier/supprimer/déléguer/paramétrer | Entrées d'audit correspondantes créées | P2 | F |
| AUD-04 | Plafond limite | — | — | `limit` plafonné à 500 côté serveur | P4 | S |
| AUD-05 | Journal vide | filtre sans résultat | — | « Aucun événement pour ce filtre. » | P4 | U |

---

## 11. Page payeur publique — parcours en 2 étapes

### 11.1 Résolution du lien & démarrage

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| PAY-01 | Chargement d'une interface | interface `actif`, tenant `ACTIVE` | Ouvrir `/{code}/{lien}` | Page chargée, marque appliquée (nom, logo, couleur) ; barre à **2 étapes** « Détails · Paiement » | P1 | F |
| PAY-02 | Lien invalide | URL sans segments | Ouvrir `/` | « Lien de paiement invalide. » | P2 | N |
| PAY-03 | Lien introuvable (404) | slug inexistant | Ouvrir | « Page de paiement introuvable » | P2 | N |
| PAY-04 | Service indisponible | backend KO | Ouvrir | « Service indisponible » | P2 | N |

### 11.2 Étape 1 — Détails (identification + montant)

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| PAY-05 | Champs d'identification | interface avec champs | Observer l'étape Détails | Rendu par type (texte/liste/date/téléphone/lecture seule) + `*` sur obligatoires | P2 | F |
| PAY-06 | Aucun champ | interface sans champ | — | Section « Vos informations » masquée | P3 | U |
| PAY-07 | Matricule — recherche & auto-remplissage | champ matricule + roster | Saisir un matricule connu | Debounce 500 ms ; « ✓ Informations récupérées » ; champs remplis | P1 | F |
| PAY-08 | Matricule introuvable | — | Saisir un matricule absent | « Matricule introuvable dans les données de l'établissement… » ; blocage | P1 | N |
| PAY-09 | Matricule requis pour continuer | matricule non vérifié | *Continuer* | Bloqué : « Veuillez saisir votre matricule. » / « …introuvable… » | P1 | N |
| PAY-10 | Réponse obsolète ignorée | — | Modifier vite le matricule | La réponse d'une saisie précédente est ignorée (garde anti-stale) | P3 | F |
| PAY-11 | Champ requis manquant | — | Laisser un champ requis vide → *Continuer* | « Champ requis : {libellé} » | P2 | N |
| PAY-12 | Montant fixe | fixed | Observer | Montant affiché en lecture seule | P2 | F |
| PAY-13 | Montant libre bornes | free min/max | Saisir 0 → *Continuer* | « Veuillez saisir un montant. » (bornes min/max = indices ; contrôle strict côté serveur) | P2 | N |
| PAY-14 | Preset simple | preset | Choisir une option | 1er preset présélectionné ; total affiché | P2 | F |
| PAY-15 | Preset panier | multiSelect | Cocher plusieurs frais | Total = somme ; « Total · {n} frais » | P2 | F |
| PAY-16 | Acompte valide | preset allowPartial | Saisir un montant partiel ≥ min | Total = acompte | P2 | F |
| PAY-17 | Acompte < min | — | Saisir < min | « Acompte « {label} » : minimum {min}… » | P2 | N |
| PAY-18 | Acompte > total | — | Saisir > montant | « Acompte « {label} » : ne peut dépasser {montant}… » | P2 | N |
| PAY-19 | Aucun montant choisi | preset | *Continuer* sans sélection | « Veuillez choisir un montant. » | P2 | N |

### 11.3 Étape 2 — Paiement (moyen + détails)

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| PAY-20 | Liste des moyens | interface avec moyens | Passer à l'étape Paiement | Moyens activés listés ; 1er sélectionné par défaut ; bouton « Payer {total} » | P1 | F |
| PAY-21 | Changement de moyen | ≥2 moyens | Cliquer un autre moyen | Panneau détails re-render en place (numéro/carte/virement) | P1 | F |
| PAY-22 | Numéro Mobile Money requis | orange/mtn | *Payer* sans numéro | « Numéro de téléphone invalide. » (< 8 chiffres) | P1 | N |
| PAY-23 | QR Mobile Money | moyen + QR activé | Sélectionner ce moyen | Encart QR + consigne de scan | P3 | F |
| PAY-24 | Consigne USSD | mobile sans QR | Sélectionner | Note « …Composez #150*50#… » | P3 | U |
| PAY-25 | Virement | transfer activé | Sélectionner | Panneau RIB (Afriland First Bank, RIB `10005 00027 11122334455 17`, montant) + consigne référence | P2 | F |
| PAY-26 | Carte — redirection | card activé (MPGS configuré) | *Payer* | Redirection vers page 3D-Secure Mastercard | P1 | F |
| PAY-27 | Retour navigation | étape 2 | *‹ Précédent* / clic étape 1 | Retour à l'étape Détails (avant uniquement bloqué) | P3 | U |

### 11.4 Soumission, suivi & résultats

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| PAY-28 | Paiement Mobile Money réussi | moyen mobile réel/simulé | Payer + valider sur téléphone | Écran « Paiement en cours… » puis « Paiement réussi » + réf | P1 | F |
| PAY-29 | Payload /pay correct | — | Payer (preset+partial) | Body contient `method`, `fields`, `presetIds`, `presetAmounts`, `phone` (voir §12) | P2 | F |
| PAY-30 | Paiement refusé | serveur renvoie erreur | Payer | Message serveur ou « Le paiement a été refusé. » ; retour étape Paiement | P2 | N |
| PAY-31 | Erreur réseau | coupure réseau | Payer | « Erreur réseau. Réessayez. » | P2 | N |
| PAY-32 | Polling final | tx en cours | Attendre | Sondage `/public/tx/{id}` toutes les 2 s jusqu'à SUCCESS/FAILED | P2 | F |
| PAY-33 | Timeout → En attente | tx jamais finalisée | Attendre ~60 s (30 essais) | « Paiement en attente » (repli PENDING) | P2 | N |
| PAY-34 | Échec | tx FAILED | — | « Paiement échoué » + bouton *Réessayer* (recharge) | P2 | F |
| PAY-35 | Retour carte MPGS | returnUrl `?tx=` | Revenir de Mastercard | Reprise directe du suivi (écran de résultat) | P1 | F |
| PAY-36 | MPGS indisponible → repli | session 409/erreur | Payer par carte | Repli sur suivi standard sans blocage | P2 | N |
| PAY-37 | Annulation carte | page MPGS | Annuler | « Paiement carte annulé. » ; retour étape Paiement | P3 | N |
| PAY-38 | Dégradation sans GSAP | GSAP non chargé | Ouvrir | Page pleinement fonctionnelle, sans animations | P4 | NF |

---

## 12. Backend / API — validations serveur & sécurité

> Base : toutes les routes passent par la gateway (`X-Tenant-Id`, `X-User-Role` injectés — non falsifiables). Réponses attendues à vérifier via `curl`/Postman.

### 12.1 Montant & champs (source de vérité serveur — `PublicCheckoutService`)

| ID | Titre | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|
| API-01 | Montant fixe autoritaire | POST `/pay` avec `amount` falsifié sur interface `fixed` | Montant client ignoré, `fixedAmount` utilisé | P1 | S |
| API-02 | Preset invalide | `presetId` inexistant | 400 « Montant proposé invalide » | P2 | N |
| API-03 | Preset vide | aucun preset sélectionné | 400 « Veuillez choisir un montant proposé » | P2 | N |
| API-04 | Libre hors bornes | `amount` < min ou > max | 400 « inférieur/supérieur » | P1 | N |
| API-05 | Acompte < min | `presetAmounts` < minAmount | 400 « Acompte inférieur au minimum » | P2 | N |
| API-06 | Acompte > total | `presetAmounts` > montant | 400 « Acompte supérieur au montant » | P2 | N |
| API-07 | Champ requis manquant | omettre un champ requis non-readonly | 400 « Champ requis manquant: {label} » | P1 | N |
| API-08 | Téléphone invalide (serveur) | `phone` < 8 chiffres, méthode mobile | 400 « Numéro de téléphone invalide » | P2 | N |
| API-09 | Moyen indisponible | `method` non activé sur l'interface | 400 « Moyen de paiement non disponible » | P1 | S |
| API-10 | Matricule requis | interface matricule, valeur absente | 400 « Matricule requis » | P2 | N |
| API-11 | Matricule enrichi côté serveur | envoyer champs falsifiés + matricule valide | Valeurs du roster réinjectées (écrasent le navigateur) | P1 | S |
| API-12 | Résolution interface | `/public/p/{code}/{slug}` interface non `actif`/tenant non `ACTIVE` | 404 | P1 | S |
| API-13 | `/pay` accepté | requête valide | **202** + `{transactionId, reference, status:"PENDING"}` | P1 | F |
| API-14 | Réponse publique sans secret | `/public/p/...` | Pas de tenantId/compteurs exposés | P2 | S |

### 12.2 Authz / RBAC / isolation

| ID | Titre | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|
| API-15 | Sans auth | appel `/api/v1/interfaces` sans token/clé | 401 « Authentification manquante » | P1 | S |
| API-16 | JWT invalide | Bearer falsifié | 401 | P1 | S |
| API-17 | Clé API inconnue | `X-API-Key` inconnue | 401 | P1 | S |
| API-18 | Partner-service indispo | gateway → résolution KO | 503 (sauf `TENANT_FALLBACK_ENABLED` dev) | P2 | N |
| API-19 | Platform settings réservé | GET/PUT `/settings/platform` en partner_admin | 403 | P1 | S |
| API-20 | Création partenaire réservée | POST `/partners` non bank_admin | 403 | P1 | S |
| API-21 | Isolation multi-tenant | tenant A tente de lire l'interface de B | Aucune donnée croisée (scope `X-Tenant-Id`) | P1 | S |
| API-22 | Endpoints internes protégés | appel `/internal/...` via gateway | Non exposé (403 sans `X-Internal-Token`) | P1 | S |
| API-23 | Secrets masqués | GET `/settings/platform` | Secrets masqués ; jamais renvoyés en clair | P1 | S |

### 12.3 Rate limiting, idempotence, résilience

| ID | Titre | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|
| API-24 | Rate limit par tenant | dépasser TPM (`X-Tenant-Rate-Limit`) | **429** + `X-RateLimit-Limit` | P2 | NF |
| API-25 | Idempotence création tx | POST `/transactions` 2× même `X-Idempotency-Key` | Une seule transaction ; rejeu renvoie l'existante | P1 | F |
| API-26 | Idempotency-Key requise | POST `/transactions` sans clé | Rejet (clé requise) | P2 | N |
| API-27 | Validation montant tx | `amount` < 0.0001 | 400 (`@DecimalMin`) | P2 | N |
| API-28 | Circuit breaker → 503 | saturer la gateway `transaction-cb` | Fallback 503 « Service momentanément indisponible » | P2 | NF |
| API-29 | Délestage r2dbc | saturer le pool (>3 s d'acquisition) | 503 (fail-fast, pas de file infinie) | P2 | NF |
| API-30 | Traitement / remboursement | POST `/transactions/{id}/process` puis `/refund` | PENDING→SUCCESS→REFUNDED ; remboursement non-SUCCESS → 422 ; inconnu → 404 | P2 | F |
| API-31 | SSE flux transactions | GET `/transactions/stream` | Événements temps réel par tenant | P3 | F |
| API-32 | CORS | requête cross-origin depuis origine non autorisée | Bloquée (allowed-origins = `FRONTEND_ORIGIN`) | P2 | S |

---

## 13. Intégrations de paiement (payment-service)

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| PSP-01 | TrustPayWay actif | `aggEnabled`, clé valide | Paiement Orange/MTN | Login → token caché (Redis) → process-payment → PENDING | P1 | F |
| PSP-02 | **Clé agrégateur inactive** | clé TPW non active côté fournisseur | Paiement mobile | Échec « API key is not active » — **problème fournisseur, pas code** (voir mémoire) | P1 | N |
| PSP-03 | Repli simulation | agrégateur non prêt + `PAYMENT_SIMULATION_ENABLED` | Paiement mobile | Connecteur simulé (~5 % d'échecs) | P3 | F |
| PSP-04 | Statut mobile | tx PENDING | Réconciliation planifiée (30 s) | INITIATED/PENDING/FAILED/SUCCESSFUL correctement mappés | P2 | F |
| PSP-05 | Webhook TrustPayWay | callback réseau | POST `/webhooks/trustpayway/{network}` avec `orderId` | Réconciliation + publication Kafka ; `orderId` absent → `{received:false}` | P2 | F |
| PSP-06 | MPGS session | `mpgsEnabled`, tx avec montant | POST `/public/checkout/mpgs/session` | `{sessionId, checkoutJsUrl, ...}` | P1 | F |
| PSP-07 | MPGS non configuré | `mpgsEnabled=false` | POST session | **409** | P2 | N |
| PSP-08 | MPGS tx sans montant | tx amount nul | POST session | **422** | P3 | N |
| PSP-09 | MPGS finalisation retour | retour Mastercard | GET `/public/checkout/mpgs/return?tx=` | Statut autoritaire récupéré, finalisé une fois (dédup Redis), 302 vers `/{code}/{slug}?tx=` | P1 | F |
| PSP-10 | Normalisation msisdn | numéro 9 chiffres | Paiement | Préfixe `237` ajouté | P3 | F |
| PSP-11 | Bulkhead par PSP | saturer un PSP | — | Isolation : un PSP saturé n'impacte pas les autres | P3 | NF |

---

## 14. Utilisateurs & Paramètres partenaire

| ID | Titre | Préconditions | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|---|
| USR-01 | Lister utilisateurs | partner_admin | Ouvrir Utilisateurs | Cartes (nom, email, rôle, statut) | P3 | F |
| USR-02 | Inviter | — | *+ Inviter* : nom+email+rôle → Envoyer | Utilisateur `pending` créé (POST `/users`) | P2 | F |
| USR-03 | Champs requis | — | Nom ou email vide | Bouton désactivé | P3 | N |
| USR-04 | Modifier / Retirer | utilisateur existant | ✎ / 🗑 (confirm) | Mise à jour / suppression (DELETE `/users/{id}`) | P3 | F |
| USR-05 | Accès réservé | partner_manager | Ouvrir `/users` | Bloqué (module non autorisé) | P2 | S |
| SET-01 | Marque & couleur | partner_admin | Charger logo, choisir couleur | Aperçu « Payer maintenant » en direct ; PUT `/settings` | P3 | F |
| SET-02 | Notifications | — | Basculer email/SMS par événement | Préférences persistées (PUT `/settings`) | P3 | F |
| SET-03 | Sécurité (simulée) | — | 2FA / régénérer clé / sessions | **Simulations UI** (à confirmer non branché) — voir ANO-03 | P3 | U |
| SET-04 | Import données (simulé) | — | Déposer un fichier | « import simulé terminé » — simulation | P4 | U |

---

## 15. Exigences non-fonctionnelles

### 15.1 Performance / charge

| ID | Titre | Étapes | Résultat attendu (SLO) | Prio | Type |
|---|---|---|---|---|---|
| NFR-01 | Smoke k6 | `run-k6.sh smoke` (5 rps × 30 s) | 0 erreur 401/403/429 ; 202/200 | P1 | NF |
| NFR-02 | Load k6 | `run-k6.sh load` (TARGET_TPS 150) | p99 < 500 ms ; `http_req_failed` < 0,1 % ; `tx_rejected` < 0,1 % | P1 | NF |
| NFR-03 | Burst k6 | `run-k6.sh burst` (×5) | Pas de wedge outbox ; récupération après pic | P1 | NF |
| NFR-04 | Auth de charge | `API_KEY=loadtest-key-2026` | La clé correspond à un `api_key_hash` réel (sinon 401/403) | P2 | NF |
| NFR-05 | Cible débit | Gatling multi-injecteurs | Vers 1M tx/min ; RTO < 30 s ; duplication 0 % | P3 | NF |

### 15.2 Observabilité / résilience / ops

| ID | Titre | Étapes | Résultat attendu | Prio | Type |
|---|---|---|---|---|---|
| NFR-06 | Health/readiness | GET `/actuator/health`, `/health/readiness` | 200 UP | P1 | NF |
| NFR-07 | Métriques Prometheus | scrape `/actuator/prometheus` | Cibles `firstpay-services` UP | P2 | NF |
| NFR-08 | Traces Jaeger | générer du trafic | Traces visibles (échantillon 5 % prod) | P3 | NF |
| NFR-09 | Alertes | déclencher latence/erreurs | Règles (P99>500ms/2m, 5xx>1%/5m, ServiceDown/1m…) remontent | P3 | NF |
| NFR-10 | Reverse proxy HTTPS | ouvrir `https://esign.afbdei.com` | TLS OK ; `/api/`, `/public/`, `/app.js` routés correctement | P1 | NF |
| NFR-11 | Cache page payeur | déployer une nouvelle `app.js` | ETag/Last-Modified changent → navigateurs revalident (pas de cache figé) | P2 | NF |
| NFR-12 | Ports prod non exposés | `docker compose ... config` | Seul Caddy/nginx exposé ; services internes non publiés | P1 | S |
| NFR-13 | Idle-in-transaction | charge | Sessions idle tuées après 30 s (anti-wedge) | P2 | NF |

---

## 16. Anomalies connues / points à confirmer (à statuer avant prod)

| ID | Description | Impact | Action QA |
|---|---|---|---|
| ANO-01 | Menu *Studio* affiché à `partner_viewer` alors que le guard bloque la route (`studio_readonly` ≠ `studio`) | Incohérence UX / confusion | Confirmer le comportement et décider (masquer le menu ou autoriser une vue lecture) |
| ANO-02 | Route `/transactions_all` sans `scope:'platform'` → lit le store partenaire, titre « Mes transactions » | La console banque peut ne pas voir *toutes* les transactions plateforme | Vérifier la source de données réelle en bank_admin |
| ANO-03 | Paramètres partenaire : 2FA, régénération clé API, sessions, import — **simulations UI** | Fonctions annoncées mais non branchées | Confirmer périmètre livré ; retirer ou signaler « bientôt » |
| ANO-04 | Studio détail : « Taux de succès 94,2 % » **codé en dur** | Donnée non réelle | Remplacer par la vraie métrique ou masquer |
| ANO-05 | Section `platform` du composant Paramètres partenaire : **code mort** (aucune route ne fournit le scope) | Aucun (invisible) | Nettoyage éventuel |
| ANO-06 | RIB du virement **codé en dur** (`10005 00027 11122334455 17`) — non piloté par le partenaire | Tous les virements pointent le même compte | Confirmer si volontaire (compte de règlement banque) |
| ANO-07 | Clé TrustPayWay « not active » → **tous** les paiements MTN/Orange échouent | Bloquant paiements mobiles | Faire activer la clé côté fournisseur avant prod (test PSP-02) |
| ANO-08 | Mot de passe non requis au login côté client ; comptes démo acceptent `"demo"` | Sécurité en prod | Vérifier `showDemoAccounts=false` + comptes démo désactivés en prod |

---

## 17. Checklist Go / No-Go production

- [ ] Tous les cas **P1** OK (aucun bloquant ouvert).
- [ ] Clé TrustPayWay **active** (PSP-02) — paiement mobile réel validé de bout en bout.
- [ ] MPGS carte validé en environnement Production (PSP-06/09, PAY-26/35).
- [ ] Isolation multi-tenant et 403/401 confirmés (API-15→23, API-21).
- [ ] Comptes démo désactivés / `showDemoAccounts=false` (AUTH-10, ANO-08).
- [ ] Ports internes non exposés, HTTPS OK (NFR-10/12).
- [ ] Smoke + Load k6 dans les SLO (NFR-01→03).
- [ ] Health/readiness + métriques + alertes opérationnels (NFR-06→09).
- [ ] Sauvegarde PostgreSQL vérifiée avant bascule.
- [ ] Anomalies ANO-01→08 statuées (corrigées ou acceptées avec justification).

---

## Annexe A — Matrice de traçabilité (extrait)

| Fonctionnalité | Cas de test |
|---|---|
| Connexion / rôles | AUTH-01→11, NAV-01→05 |
| Studio — création interface | STU-10→36, ROS-01→07 |
| Publication / partage | PUB-01→06 |
| Parcours payeur (2 étapes) | PAY-01→38 |
| Validations serveur | API-01→14 |
| Sécurité / RBAC | NAV-04/05, API-15→23, API-32, SEC/ANO-08 |
| Paiements (PSP) | PSP-01→11 |
| Transactions / export | TX-01→12 |
| Caisse | CASH-01→11 |
| Administration banque | PART-01→09, AUD-01→05, PLAT (via API-19/23) |
| Non-fonctionnel | NFR-01→13 |

---

*Cahier de test généré pour la campagne de validation pré-production. Compléter les colonnes de suivi (Statut / Testé le / Par / Anomalie) lors de l'exécution. Le guide fonctionnel associé : `docs/qa/GUIDE-UTILISATEUR.md`.*
