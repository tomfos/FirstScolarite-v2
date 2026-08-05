import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { CardOrdersStore } from './card-orders.store';

/**
 * Écran EMF : commande de cartes prépayées + suivi des ventes. Réservé aux partenaires de type
 * 'emf' (moduleGuard / NavItem.partnerTypes). Le partenaire ne commande qu'une quantité — pas de
 * prix, pas de type de carte, pas de PAN ni de carte individuelle visible ici (voir le plan :
 * cette plateforme n'a pas d'équivalent dossier KYC/client pour y accrocher une activation par
 * carte, contrairement au système dont cette fonctionnalité est portée). Les compteurs
 * vendues/activées sont mis à jour côté banque (écran "Commandes de cartes" bank_admin).
 */
@Component({
  selector: 'fp-cards',
  standalone: true,
  imports: [FormsModule, StatCardComponent],
  styleUrl: './cards.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div>
          <div class="eyebrow">Espace partenaire EMF</div>
          <div class="title">Commande de cartes</div>
          <div class="subtitle">Commandez des lots de cartes prépayées et suivez leur statut.</div>
        </div>
        <button class="new-btn" (click)="openCreate()">+ Nouvelle commande</button>
      </div>

      <div class="body">
        @if (store.error()) { <div class="err">{{ store.error() }}</div> }

        <div class="stats">
          <fp-stat-card label="Total commandé" [value]="fr(store.totalCommande())" icon="▤" accent="#2563EB" />
          <fp-stat-card label="Cartes vendues" [value]="fr(store.totalVendues())" icon="✓" accent="#1F8A5B" />
          <fp-stat-card label="Cartes activées" [value]="fr(store.totalActivees())" icon="★" accent="#7C3AED" />
          <fp-stat-card label="Stock restant" [value]="fr(store.stockRestant())" icon="▣" accent="#B7791F" />
        </div>

        <div class="table">
          <div class="thead">
            <div>Quantité</div><div>Statut</div><div>Vendues</div><div>Activées</div><div>Date de commande</div>
          </div>
          @for (o of store.orders(); track o.id; let i = $index) {
            <div class="trow" [class.alt]="i % 2 === 1">
              <div class="mono">{{ fr(o.quantite) }}</div>
              <div><span class="s-chip" [class]="o.statut">{{ statutLabel(o.statut) }}</span></div>
              <div>{{ fr(o.quantiteVendue) }}</div>
              <div>{{ fr(o.quantiteActivee) }}</div>
              <div>{{ date(o.dateCommande) }}</div>
            </div>
          } @empty {
            <div class="no-rows">Aucune commande pour le moment.</div>
          }
        </div>
      </div>

      @if (draftOpen()) {
        <div class="overlay" (click)="closeCreate()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="m-head">
              <div class="m-title">Nouvelle commande</div>
              <button class="x" (click)="closeCreate()">✕</button>
            </div>
            <div class="m-body">
              @if (error()) { <div class="err">{{ error() }}</div> }
              <label class="fld"><span>Quantité de cartes</span>
                <input type="number" min="1" [ngModel]="quantite()" (ngModelChange)="quantite.set($event)" placeholder="1000"></label>
              <div class="hint">Le nombre de cartes prépayées que vous souhaitez pouvoir vendre depuis votre stock. Ex. 5 000 cartes.</div>
            </div>
            <div class="m-foot">
              <button class="ghost" (click)="closeCreate()">Annuler</button>
              <button class="primary" [disabled]="!quantite() || quantite()! < 1 || store.creating()" (click)="submitCreate()">
                {{ store.creating() ? 'Envoi en cours…' : 'Confirmer la commande' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class CardsComponent implements OnInit {
  readonly store = inject(CardOrdersStore);

  readonly draftOpen = signal(false);
  readonly quantite = signal<number | null>(1000);
  readonly error = signal('');

  ngOnInit() { this.store.loadFromApi(); }

  openCreate() { this.error.set(''); this.quantite.set(1000); this.draftOpen.set(true); }
  closeCreate() { this.draftOpen.set(false); }

  submitCreate() {
    const q = this.quantite();
    if (!q || q < 1) return;
    this.store.passerCommande(q, (ok) => {
      if (ok) this.draftOpen.set(false);
      else this.error.set("Échec de l'enregistrement de la commande.");
    });
  }

  fr(n: number) { return n.toLocaleString('fr-FR'); }
  date(d: string) { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  statutLabel(s: string) {
    return ({ en_cours: 'En cours', livree: 'Livrée', annulee: 'Annulée' } as Record<string, string>)[s] ?? s;
  }
}
