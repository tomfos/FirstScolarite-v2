import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { forkJoin, tap, catchError, of } from 'rxjs';
import {
  PaymentInterface, NEW_INTERFACE, InterfaceStatus,
} from '../../core/models/interface.model';
import { Transaction } from '../../core/models/transaction.model';
import { PartnerApiService } from '../../core/api/partner-api.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

interface StudioState {
  interfaces: PaymentInterface[];
  transactions: Transaction[];
  selectedId: string | null;
  editing: PaymentInterface | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'interface';

/** Store Studio — données chargées depuis partner-service / transaction-service. */
export const StudioStore = signalStore(
  { providedIn: 'root' },
  withState<StudioState>({
    interfaces: [],
    transactions: [],
    selectedId: null,
    editing: null,
    loaded: false,
    loading: false,
    error: null,
  }),
  withComputed((store) => ({
    selected: computed(() => store.interfaces().find((i) => i.id === store.selectedId()) ?? null),
    activeCount: computed(() => store.interfaces().filter((i) => i.status === 'actif').length),
    draftCount: computed(() => store.interfaces().filter((i) => i.status === 'brouillon').length),
  })),
  withMethods((store, api = inject(PartnerApiService), tenant = inject(TenantContextService)) => ({
    loadFromApi() {
      patchState(store, { loading: true, error: null });
      forkJoin({ ifaces: api.fetchInterfaces(), txs: api.fetchTransactions() }).pipe(
        tap(({ ifaces, txs }) => {
          const enrichedTxs = enrichTxNames(txs, ifaces);
          patchState(store, {
            interfaces: ifaces,
            transactions: enrichedTxs,
            selectedId: ifaces[0]?.id ?? null,
            loaded: true,
            loading: false,
            error: null,
          });
        }),
        catchError(() => {
          patchState(store, {
            loaded: true,
            loading: false,
            error: 'Impossible de charger les données depuis l\'API.',
          });
          return of(null);
        }),
      ).subscribe();
    },

    select(id: string) { patchState(store, { selectedId: id }); },

    openEditor(id: string) {
      const it = store.interfaces().find((i) => i.id === id);
      if (it) patchState(store, { selectedId: id, editing: structuredClone(it) });
    },

    openNew() {
      // Le secteur n'est plus choisi à la création : il est hérité du profil partenaire.
      const sector = tenant.partner()?.sector || 'Autre';
      patchState(store, { selectedId: null, editing: NEW_INTERFACE(sector) });
    },

    patchEditing(patch: Partial<PaymentInterface>) {
      const cur = store.editing();
      if (cur) patchState(store, { editing: { ...cur, ...patch } });
    },

    cancel() { patchState(store, { editing: null }); },

    save(status?: InterfaceStatus) {
      const d = store.editing();
      if (!d) return;
      const next: PaymentInterface = { ...d };
      if (status) next.status = status;
      next.slug = next.customSlug || slugify(next.name);

      api.saveInterface(next).subscribe({
        next: (saved) => {
          patchState(store, {
            editing: saved,
            selectedId: saved.id,
            interfaces: upsertInterface(store.interfaces(), saved),
            error: null,
          });
        },
        error: () => patchState(store, { error: 'Échec de l\'enregistrement de l\'interface.' }),
      });
    },

    remove(id: string) {
      api.deleteInterface(id).subscribe({
        next: () => {
          patchState(store, {
            interfaces: store.interfaces().filter((i) => i.id !== id),
            selectedId: store.selectedId() === id ? null : store.selectedId(),
            editing: store.editing()?.id === id ? null : store.editing(),
            error: null,
          });
        },
        error: () => patchState(store, { error: 'Suppression impossible.' }),
      });
    },
  })),
);

function upsertInterface(list: PaymentInterface[], item: PaymentInterface): PaymentInterface[] {
  const idx = list.findIndex((i) => i.id === item.id);
  if (idx >= 0) { const c = [...list]; c[idx] = item; return c; }
  return [item, ...list];
}

function enrichTxNames(txs: Transaction[], ifaces: PaymentInterface[]): Transaction[] {
  const byId = Object.fromEntries(ifaces.map((i) => [i.id, i.name]));
  return txs.map((t) => ({ ...t, interfaceName: byId[t.interfaceId] ?? (t.interfaceName || '—') }));
}
