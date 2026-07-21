import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiCardOrderDto, CardOrderApiService } from '../../core/api/card-order-api.service';
import { exportToExcel } from '../../shared/utils/excel-export.util';

/**
 * Vue banque des commandes de cartes, tous partenaires EMF confondus. Livrer/Annuler font
 * avancer le cycle de vie ; Enregistrer ventes n'est possible que sur une commande livrée
 * (même règle que l'activation individuelle dans le système d'origine — voir CardOrderController).
 */
@Component({
  selector: 'fp-card-orders-admin',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './card-orders-admin.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div>
          <div class="eyebrow">Console superviseur · Module</div>
          <div class="title">Commandes de cartes</div>
          <div class="subtitle">Toutes les commandes de cartes prépayées, tous partenaires EMF confondus.</div>
        </div>
        <div class="head-right">
          <span class="count">{{ rows().length }} commande(s)</span>
          <button class="ghost" [disabled]="exporting()" (click)="exportExcel()">
            {{ exporting() ? 'Export…' : '⭳ Exporter (Excel)' }}
          </button>
        </div>
      </div>

      <div class="body">
        @if (error()) { <div class="err">{{ error() }}</div> }

        <div class="table">
          <div class="thead">
            <div>Partenaire</div><div>Quantité</div><div>Statut</div><div>Vendues</div><div>Activées</div><div>Date</div><div></div>
          </div>
          @for (o of rows(); track o.id; let i = $index) {
            <div class="trow" [class.alt]="i % 2 === 1">
              <div class="p-name">{{ o.partnerName }}</div>
              <div class="mono">{{ fr(o.quantite) }}</div>
              <div><span class="s-chip" [class]="o.statut">{{ statutLabel(o.statut) }}</span></div>
              <div>{{ fr(o.quantiteVendue) }}</div>
              <div>{{ fr(o.quantiteActivee) }}</div>
              <div>{{ date(o.dateCommande) }}</div>
              <div class="actions">
                @if (o.statut === 'en_cours') {
                  <button class="mini primary" [disabled]="busyId() === o.id" (click)="livrer(o)">Livrer</button>
                  <button class="mini ghost" [disabled]="busyId() === o.id" (click)="annuler(o)">Annuler</button>
                }
                @if (o.statut === 'livree') {
                  <button class="mini ghost" [disabled]="busyId() === o.id" (click)="openVentes(o)">Enregistrer ventes</button>
                }
              </div>
            </div>
          } @empty {
            <div class="no-rows">Aucune commande pour le moment.</div>
          }
        </div>
      </div>

      @if (ventesTarget(); as t) {
        <div class="overlay" (click)="closeVentes()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="m-head">
              <div class="m-title">Enregistrer les ventes — {{ t.partnerName }}</div>
              <button class="x" (click)="closeVentes()">✕</button>
            </div>
            <div class="m-body">
              @if (ventesError()) { <div class="err">{{ ventesError() }}</div> }
              <div class="hint" style="margin-bottom: 14px;">Commande de {{ fr(t.quantite) }} cartes. Valeurs bornées à cette quantité.</div>
              <label class="fld"><span>Cartes vendues</span>
                <input type="number" min="0" [ngModel]="ventesVendue()" (ngModelChange)="ventesVendue.set($event)"></label>
              <label class="fld"><span>Cartes activées</span>
                <input type="number" min="0" [ngModel]="ventesActivee()" (ngModelChange)="ventesActivee.set($event)"></label>
            </div>
            <div class="m-foot">
              <button class="ghost" (click)="closeVentes()">Annuler</button>
              <button class="primary" [disabled]="busyId() === t.id" (click)="submitVentes(t)">
                {{ busyId() === t.id ? 'Enregistrement…' : 'Enregistrer' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class CardOrdersAdminComponent implements OnInit {
  private readonly api = inject(CardOrderApiService);

  readonly rows = signal<ApiCardOrderDto[]>([]);
  readonly error = signal('');
  readonly busyId = signal<string | null>(null);

  readonly ventesTarget = signal<ApiCardOrderDto | null>(null);
  readonly ventesVendue = signal(0);
  readonly ventesActivee = signal(0);
  readonly ventesError = signal('');
  readonly exporting = signal(false);

  ngOnInit() { this.reload(); }

  async exportExcel() {
    this.exporting.set(true);
    try {
      await exportToExcel(
        `commandes-cartes-${new Date().toISOString().slice(0, 10)}`,
        'Commandes de cartes',
        [
          { header: 'Partenaire', key: 'partner', width: 28 },
          { header: 'Quantité', key: 'quantite', width: 12 },
          { header: 'Statut', key: 'statut', width: 14 },
          { header: 'Vendues', key: 'vendues', width: 12 },
          { header: 'Activées', key: 'activees', width: 12 },
          { header: 'Date de commande', key: 'date', width: 18 },
        ],
        this.rows().map((o) => ({
          partner: o.partnerName ?? '',
          quantite: o.quantite,
          statut: this.statutLabel(o.statut),
          vendues: o.quantiteVendue,
          activees: o.quantiteActivee,
          date: this.date(o.dateCommande),
        })),
      );
    } finally {
      this.exporting.set(false);
    }
  }

  private reload() {
    this.error.set('');
    this.api.fetchAll().subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.error.set('Impossible de charger les commandes.'),
    });
  }

  livrer(o: ApiCardOrderDto) {
    this.busyId.set(o.id);
    this.api.livrer(o.id).subscribe({
      next: (updated) => { this.replace(updated); this.busyId.set(null); },
      error: () => { this.error.set(`Échec : impossible de livrer la commande de ${o.partnerName}.`); this.busyId.set(null); },
    });
  }

  annuler(o: ApiCardOrderDto) {
    this.busyId.set(o.id);
    this.api.annuler(o.id).subscribe({
      next: (updated) => { this.replace(updated); this.busyId.set(null); },
      error: () => { this.error.set(`Échec : impossible d'annuler la commande de ${o.partnerName}.`); this.busyId.set(null); },
    });
  }

  openVentes(o: ApiCardOrderDto) {
    this.ventesError.set('');
    this.ventesVendue.set(o.quantiteVendue);
    this.ventesActivee.set(o.quantiteActivee);
    this.ventesTarget.set(o);
  }
  closeVentes() { this.ventesTarget.set(null); }

  submitVentes(o: ApiCardOrderDto) {
    this.busyId.set(o.id);
    this.api.enregistrerVentes(o.id, this.ventesVendue(), this.ventesActivee()).subscribe({
      next: (updated) => { this.replace(updated); this.busyId.set(null); this.closeVentes(); },
      error: () => { this.ventesError.set('Échec de l\'enregistrement.'); this.busyId.set(null); },
    });
  }

  private replace(updated: ApiCardOrderDto) {
    this.rows.set(this.rows().map((r) => (r.id === updated.id ? { ...updated, partnerName: r.partnerName } : r)));
  }

  fr(n: number) { return n.toLocaleString('fr-FR'); }
  date(d: string) { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  statutLabel(s: string) {
    return ({ en_cours: 'En cours', livree: 'Livrée', annulee: 'Annulée' } as Record<string, string>)[s] ?? s;
  }
}
