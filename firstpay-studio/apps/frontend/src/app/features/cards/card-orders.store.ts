import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { tap, catchError, of } from 'rxjs';
import { ApiCardOrderDto, CardOrderApiService } from '../../core/api/card-order-api.service';

interface CardOrdersState {
  orders: ApiCardOrderDto[];
  loaded: boolean;
  loading: boolean;
  creating: boolean;
  error: string | null;
}

/** Store commande de cartes (partenaire EMF) — données chargées depuis partner-service. */
export const CardOrdersStore = signalStore(
  { providedIn: 'root' },
  withState<CardOrdersState>({
    orders: [],
    loaded: false,
    loading: false,
    creating: false,
    error: null,
  }),
  withComputed((store) => ({
    totalCommande: computed(() => store.orders().reduce((s, o) => s + o.quantite, 0)),
    totalVendues: computed(() => store.orders().reduce((s, o) => s + o.quantiteVendue, 0)),
    totalActivees: computed(() => store.orders().reduce((s, o) => s + o.quantiteActivee, 0)),
    stockRestant: computed(() => {
      const commande = store.orders().reduce((s, o) => s + o.quantite, 0);
      const activees = store.orders().reduce((s, o) => s + o.quantiteActivee, 0);
      return Math.max(0, commande - activees);
    }),
  })),
  withMethods((store, api = inject(CardOrderApiService)) => ({
    loadFromApi() {
      patchState(store, { loading: true, error: null });
      api.fetchMine().pipe(
        tap((orders) => patchState(store, { orders, loaded: true, loading: false, error: null })),
        catchError(() => {
          patchState(store, { loaded: true, loading: false, error: 'Impossible de charger les commandes.' });
          return of(null);
        }),
      ).subscribe();
    },

    passerCommande(quantite: number, onDone?: (ok: boolean) => void) {
      patchState(store, { creating: true, error: null });
      api.create(quantite).subscribe({
        next: (order) => {
          patchState(store, { orders: [order, ...store.orders()], creating: false });
          onDone?.(true);
        },
        error: () => {
          patchState(store, { creating: false, error: "Échec de l'enregistrement de la commande." });
          onDone?.(false);
        },
      });
    },
  })),
);
