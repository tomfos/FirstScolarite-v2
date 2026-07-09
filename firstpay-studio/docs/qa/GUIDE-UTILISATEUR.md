# Guide utilisateur — First Collect

> Plateforme d'encaissement multicanal d'Afriland First Bank.
> Ce guide s'adresse aux **partenaires**, aux **agents de la banque**, aux **caissières** et aux **payeurs finaux**.
>
> Version : pré-production · Langue de l'application : français · Devise par défaut : XAF

---

## 1. Présentation

First Collect permet à un **partenaire** (établissement, entreprise, association) de créer des **interfaces de paiement** (pages de collecte publiques), de les publier via un lien partageable, puis de suivre les **transactions** encaissées. La **banque** administre la plateforme (partenaires, moyens de paiement, audit) et les **caissières** encaissent en agence pour le compte d'un partenaire.

Trois expériences coexistent :

| Public | Où | À quoi ça sert |
|--------|-----|----------------|
| **Portail partenaire** | `https://esign.afbdei.com` (après connexion) | Créer/publier des interfaces, suivre les transactions, gérer l'équipe |
| **Console banque** | même URL, comptes `bank_*` | Superviser la plateforme, créer des partenaires, régler les moyens de paiement |
| **Page payeur** | `https://esign.afbdei.com/{code}/{lien}` | Payer en ligne (aucune connexion requise) |

---

## 2. Rôles et accès

L'accès à chaque écran dépend du rôle du compte.

| Rôle | Libellé | Peut faire |
|------|---------|-----------|
| `bank_admin` | Administrateur Banque | Tout : partenaires, transactions plateforme, audit, paramètres plateforme |
| `bank_cashier` | Caissière Agence | Encaisser pour un partenaire, consulter ses propres encaissements |
| `partner_admin` | Administrateur Partenaire | Studio, transactions, utilisateurs, paramètres du partenaire |
| `partner_manager` | Gestionnaire Partenaire | Studio, transactions (pas d'utilisateurs ni de paramètres) |
| `partner_accountant` | Comptable Partenaire | Transactions et exports uniquement |
| `partner_viewer` | Lecture seule | Consultation du tableau de bord et des transactions |

> La matrice détaillée par module figure dans `docs/ROLES-MATRIX.md`.

---

## 3. Se connecter

1. Ouvrez `https://esign.afbdei.com`.
2. Saisissez votre **email** et votre **mot de passe**, puis cliquez sur **Se connecter**.
3. Vous arrivez sur votre tableau de bord selon votre rôle.

**Déconnexion** : bouton **Déconnexion** en haut à droite.
**Thème clair/sombre** : bouton ☀/☾ en haut à droite (mémorisé sur l'appareil).

En cas d'identifiants erronés : message « *Identifiants invalides. Vérifiez votre email et votre mot de passe.* »

---

## 4. Portail partenaire

### 4.1 Tableau de bord (`Tableau de bord`)

Vue d'ensemble : nombre de transactions, montant encaissé, taux de succès (30 jours), nombre d'interfaces. En dessous : accès rapides (Studio, Transactions, Utilisateurs, Paramètres), l'**activité récente** (5 dernières transactions) et le **top interfaces**.

### 4.2 Créer une interface de paiement (Studio)

Ouvrez **Studio de paiement** puis **+ Nouvelle interface**. L'assistant comporte **3 étapes**.

#### Étape 1 — Interface & montant
- **Nom de l'interface** (obligatoire) — sert aussi à générer automatiquement le lien public.
- **Description** (facultatif).
- **Lien public personnalisé** — modifiez-le pour obtenir une URL lisible ; sinon il est dérivé du nom.
- **Pays de la collecte** — définit l'indicatif téléphonique et la devise (Cameroun/XAF par défaut, 12 pays disponibles).
- **Montant à payer**, au choix :
  - **Montant fixe** — un seul montant.
  - **Montants prédéfinis** — plusieurs options (ex. Tranche 1, Tranche 2). Pour chaque option vous pouvez autoriser un **acompte** (versement partiel) avec un **minimum**. Vous pouvez aussi autoriser la **sélection de plusieurs montants** (panier).
  - **Montant libre** — le payeur saisit le montant, borné par un **minimum** et un **maximum**.

#### Étape 2 — Référence & formulaire
- **Référence de paiement** : automatique, ou personnalisée (dans ce cas indiquez un libellé).
- **Champs du formulaire** : ajoutez les informations à demander au payeur. Types disponibles :
  - **Texte**, **Liste** (options séparées par des virgules), **Date**, **Téléphone**.
  - **Matricule (auto-remplissage)** : le payeur saisit son matricule et ses informations se remplissent automatiquement depuis le **répertoire étudiants** que vous importez.
  - Options par champ : **obligatoire** et **lecture seule (auto-rempli)**.
- **Données étudiants** (visible si un champ *Matricule* existe) : rattachez un **établissement** (facultatif, restreint la recherche) puis **importez un fichier CSV** contenant au minimum une colonne `matricule`. Boutons : *Importer*, *Vider le répertoire*.

#### Étape 3 — Moyens & publication
- **Moyens de paiement** : cochez ceux à proposer (Orange Money, MTN MoMo, Carte bancaire, Virement). **Seuls les moyens activés par la banque** apparaissent. Vous pouvez activer un **QR code** par moyen.
- Vérifiez l'**URL publique** proposée.

**Enregistrer / Publier** :
- **Enregistrer le brouillon** conserve l'interface sans la rendre publique.
- **Aperçu et publier** ouvre une simulation du parcours payeur ; **Publier l'interface** la rend accessible au public.

### 4.3 Partager une interface

Depuis une interface publiée : **Partager le lien** ou **Partager & QR code**. Le lien se copie en un clic et se diffuse par WhatsApp, Email, SMS ou Telegram ; un QR code téléchargeable est également fourni.

### 4.4 Suivre les transactions

Écran **Transactions** : filtres (recherche, interface, statut Succès/En attente/Échec, moyen, période 7/30/90 jours ou tout l'historique), tableau (Référence, Payeur, Interface, Moyen, Statut, Montant, Date). Bouton **Exporter** → **CSV / JSON / Excel**.

### 4.5 Gérer l'équipe (`Utilisateurs`) — *partner_admin*

Inviter un utilisateur (nom, email, rôle : administrateur, gestionnaire, comptable, lecture seule), modifier ou retirer un membre.

### 4.6 Paramètres du partenaire (`Paramètres`) — *partner_admin*

- **Marque & identité** : logo, couleur principale (aperçu en direct).
- **Sécurité** : double authentification, clé API, sessions.
- **Notifications** : activer email/SMS par type d'événement (paiement réussi, échoué, rapport hebdomadaire, etc.).

> Certaines options de cette page (2FA, régénération de clé API, import de données) sont des aperçus fonctionnels ; leur activation réelle dépend du déploiement.

---

## 5. Console banque (`bank_admin`)

### 5.1 Console superviseur

Indicateurs plateforme : transactions totales, encaissé, taux de succès (avec débit temps réel « tx/min »), échecs.

### 5.2 Partenaires

- **Liste** avec recherche, secteur, nombre d'interfaces, statut.
- **+ Nouveau partenaire** : nom (obligatoire), secteur, administrateur (nom/email), **compte de règlement** (numéro obligatoire, titulaire, banque). À la création, la **clé API** et le **mot de passe temporaire** de l'administrateur sont affichés **une seule fois** — copiez-les immédiatement.
- **Ouvrir** (impersonation) : agir dans le portail du partenaire ; une bannière **Délégation active** apparaît, quittez avec **Quitter**.

### 5.3 Journal d'audit

Événements horodatés (publication, remboursement, connexion, suppression, délégation, paramètres, création, échec de connexion) filtrables par niveau (Info / Avertissements / Critiques).

### 5.4 Paramètres plateforme

Trois blocs :
- **Serveur SMTP** : configuration d'envoi d'emails + **envoi d'un test**.
- **Agrégateur TrustPayWay** (Orange/MTN) : activer les paiements réels, environnement **Sandbox/Production**, identifiants.
- **Passerelle carte MPGS (Mastercard)** : activer le paiement par carte, environnement, hôte, identifiants, version API.

> Les mots de passe/secrets ne sont jamais réaffichés : « (déjà défini) » signale une valeur enregistrée ; laissez le champ vide pour la conserver.

---

## 6. Caisse (`bank_cashier`)

1. **Choisir le partenaire** (recherche par nom/code/secteur).
2. **Choisir l'interface** active.
3. Saisir l'encaissement en 4 étapes : **Identification** (nom + téléphone du payeur, + champs éventuels) → **Montant** → **Mode** (moyen) → **Validation**.
4. **Valider l'encaissement** puis **imprimer le reçu**.

Écran **Mes encaissements** : historique des transactions de la caissière connectée.

---

## 7. Payer en ligne (page payeur)

Le payeur ouvre le lien reçu (`https://esign.afbdei.com/{code}/{lien}`). **Aucune connexion n'est requise.** Le parcours tient en **2 étapes** :

### Étape 1 — Détails
- **Vos informations** : renseignez les champs demandés. Si un **matricule** est requis, saisissez-le : vos informations se remplissent automatiquement (« ✓ Informations récupérées »). Le matricule doit être reconnu pour continuer.
- **Montant** : selon l'interface, le montant est fixe, à choisir parmi des options (avec éventuel acompte), ou libre (entre un minimum et un maximum). En panier, cochez les frais à régler ; le **total** s'affiche.

### Étape 2 — Paiement
- **Choisissez votre moyen** : Orange Money, MTN MoMo, Carte bancaire ou Virement.
  - **Mobile Money** : saisissez votre numéro. Une demande de validation est envoyée sur votre téléphone (composez `#150*50#` et validez avec votre code secret), ou scannez le QR code si proposé.
  - **Carte bancaire** : vous êtes redirigé vers une page bancaire sécurisée 3D-Secure.
  - **Virement** : les coordonnées bancaires (RIB Afriland First Bank) s'affichent ; indiquez la référence en motif.
- Cliquez sur **Payer {montant}**.

### Résultat
Un écran d'attente (« Paiement en cours… ») s'affiche, puis le résultat :
- **Paiement réussi** ✓ (montant confirmé + référence).
- **Paiement échoué** ✕ (aucun montant débité) avec un bouton **Réessayer**.
- **Paiement en attente** ⏳ (traitement plus long ; une confirmation suivra).

Vous pouvez revenir à l'étape précédente via **‹ Précédent** ou en cliquant sur une étape déjà franchie.

---

## 8. Dépannage rapide

| Symptôme | Cause probable / action |
|----------|-------------------------|
| « Lien de paiement invalide » | L'adresse est incomplète ; vérifiez le lien reçu. |
| « Page de paiement introuvable » | Le lien n'existe pas ou l'interface n'est plus publiée. |
| « Service indisponible » | Incident temporaire ; réessayez dans un instant. |
| « Matricule introuvable » | Vérifiez la saisie ; le matricule doit être présent dans le répertoire de l'établissement. |
| « Numéro de téléphone invalide » | Saisissez un numéro d'au moins 8 chiffres. |
| Un moyen de paiement n'apparaît pas | Il n'a pas été activé par la banque (paramètres plateforme) ou pas coché sur l'interface. |
| Paiement Mobile Money qui échoue systématiquement | Vérifier l'état de la clé de l'agrégateur côté banque. |
| Lien HTTPS cassé après régénération du site | Réappliquer le bloc 443 nginx et recharger (voir mémoire ops). |

---

*Document destiné à la formation et à l'assistance utilisateur. Pour la validation avant mise en production, voir `docs/qa/CAHIER-DE-TEST.md`.*
