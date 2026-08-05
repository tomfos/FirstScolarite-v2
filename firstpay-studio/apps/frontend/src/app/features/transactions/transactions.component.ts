import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { StudioStore } from '../studio/studio.store';
import { Transaction, TxStatus } from '../../core/models/transaction.model';
import { METHOD_LABELS, Method } from '../../core/models/interface.model';
import { AuthService } from '../../core/auth/auth.service';
import { TransactionApiService } from '../../core/api/transaction-api.service';

type TxScope = 'partner' | 'platform' | 'cashier' | 'collections';

const STATUS_LABEL: Record<TxStatus, string> = { success: 'Succès', pending: 'En attente', failed: 'Échec' };
const METHOD_COLOR: Record<Method, string> = { orange: '#FF7900', mtn: '#B89F00', card: '#2563EB', transfer: '#1F9D55' };

@Component({
  selector: 'fp-transactions',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './transactions.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div>
          <div class="eyebrow">{{ eyebrow() }}</div>
          <div class="title">{{ title() }}</div>
        </div>
        <div class="head-actions">
          <button class="ghost" (click)="exportOpen.set(true)">⭳ Exporter</button>
          @if (scope() === 'partner') {
            <button class="primary" (click)="go('studio')">+ Nouvelle interface</button>
          }
        </div>
      </div>

      <!-- Stats strip -->
      <div class="strip">
        <div class="tx-stat"><div class="ts-lbl">Sur la période</div><div class="ts-val">{{ fr(filtered().length) }}</div><div class="ts-sub">transactions</div></div>
        <div class="tx-stat"><div class="ts-lbl">Encaissé</div><div class="ts-val green">{{ fr(Math.round(breakdown().amount/1000)) }} k</div><div class="ts-sub">XAF</div></div>
        <div class="tx-stat"><div class="ts-lbl"><span class="dot green"></span>Succès</div><div class="ts-val">{{ fr(breakdown().success) }}</div></div>
        <div class="tx-stat"><div class="ts-lbl"><span class="dot amber"></span>En attente</div><div class="ts-val">{{ fr(breakdown().pending) }}</div></div>
        <div class="tx-stat"><div class="ts-lbl"><span class="dot red"></span>Échec</div><div class="ts-val">{{ fr(breakdown().failed) }}</div></div>
      </div>

      <!-- Filters -->
      <div class="filters">
        <div class="search"><span>⌕</span>
          <input [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Rechercher payeur, référence, téléphone…"></div>
        <select [ngModel]="interfaceId()" (ngModelChange)="interfaceId.set($event)">
          <option value="all">Toutes les interfaces</option>
          @if (scope() !== 'cashier') {
            @for (it of store.interfaces(); track it.id) { <option [value]="it.id">{{ it.name }}</option> }
          }
        </select>
        <select [ngModel]="status()" (ngModelChange)="status.set($event)">
          <option value="all">Tous les statuts</option><option value="success">Succès</option>
          <option value="pending">En attente</option><option value="failed">Échec</option>
        </select>
        <select [ngModel]="method()" (ngModelChange)="method.set($event)">
          <option value="all">Tous les moyens</option><option value="orange">Orange Money</option>
          <option value="mtn">MTN MoMo</option><option value="card">Carte</option><option value="transfer">Virement</option>
        </select>
        <select [ngModel]="range()" (ngModelChange)="range.set($event)">
          <option value="7">7 derniers jours</option><option value="30">30 derniers jours</option>
          <option value="90">90 derniers jours</option><option value="all">Tout l'historique</option>
        </select>
      </div>

      <!-- Table -->
      <div class="table-wrap">
        <div class="table">
          <div class="thead">
            <div class="c-ref">Référence</div><div class="c-payer">Payeur</div><div class="c-iface">Interface</div>
            <div class="c-method">Moyen</div><div class="c-status">Statut</div><div class="c-amount">Montant</div><div class="c-date">Date</div>
          </div>
          @for (t of pageRows(); track t.id; let i = $index) {
            <div class="trow" [class.alt]="i % 2 === 1">
              <div class="c-ref mono">{{ t.reference }}</div>
              <div class="c-payer"><div class="payer">{{ t.payer }}</div><div class="phone">{{ t.phone }}</div></div>
              <div class="c-iface">{{ t.interfaceName }}</div>
              <div class="c-method"><span class="m-chip" [style.color]="mcolor(t.method)" [style.borderColor]="mcolor(t.method)+'40'" [style.background]="mcolor(t.method)+'15'">{{ mlabel(t.method) }}</span></div>
              <div class="c-status"><span class="s-chip" [class]="t.status">{{ slabel(t.status) }}</span></div>
              <div class="c-amount">{{ fr(t.amount) }} <span>XAF</span></div>
              <div class="c-date">{{ date(t.date) }}</div>
            </div>
          } @empty {
            <div class="no-rows">Aucune transaction ne correspond à ces filtres.</div>
          }
          @if (filtered().length > 60) {
            <div class="more">60 sur {{ fr(filtered().length) }} transactions affichées · affinez vos filtres ou exportez la liste complète</div>
          }
        </div>
      </div>

      <!-- Export modal -->
      @if (exportOpen()) {
        <div class="overlay" (click)="exportOpen.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="m-head"><div class="m-title">Exporter {{ fr(filtered().length) }} transactions</div>
              <button class="x" (click)="exportOpen.set(false)">✕</button></div>
            <div class="m-body">
              <div class="m-lbl">Format</div>
              <div class="fmt">
                @for (f of ['csv','json','xls']; track f) {
                  <button class="fmt-btn" [class.on]="format() === f" (click)="format.set(f)">{{ f.toUpperCase() }}</button>
                }
              </div>
              <button class="primary full" (click)="doExport()">⭳ Télécharger</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class TransactionsComponent implements OnInit {
  readonly store = inject(StudioStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly txApi = inject(TransactionApiService);
  readonly Math = Math;

  readonly scope = toSignal(this.route.data.pipe(map((d) => (d['scope'] as TxScope) ?? 'partner')), { initialValue: 'partner' as TxScope });
  readonly title = computed(() => ({
    partner: 'Mes transactions', platform: 'Transactions plateforme',
    cashier: 'Mes encaissements', collections: 'Encaissements',
  })[this.scope()]);
  readonly eyebrow = computed(() => ({
    partner: 'Portail partenaire · Module', platform: 'Console superviseur · Module',
    cashier: 'Caisse agence · Module', collections: 'Console superviseur · Module',
  })[this.scope()]);

  private readonly platformTxs = signal<Transaction[]>([]);
  private readonly cashierTxs = signal<Transaction[]>([]);
  /** Tous les encaissements caisse (toutes agences confondues) — supervision bank_admin. */
  private readonly collectionsTxs = signal<Transaction[]>([]);

  readonly search = signal('');
  readonly interfaceId = signal('all');
  readonly status = signal('all');
  readonly method = signal('all');
  readonly range = signal('30');
  readonly exportOpen = signal(false);
  readonly format = signal('csv');

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase();
    const now = Date.now();
    const days = this.range() === 'all' ? Infinity : +this.range() * 86400000;
    const source = this.scope() === 'platform' ? this.platformTxs()
      : this.scope() === 'cashier' ? this.cashierTxs()
      : this.scope() === 'collections' ? this.collectionsTxs()
      : this.store.transactions();
    return source.filter((t) => {
      if (this.interfaceId() !== 'all' && t.interfaceId !== this.interfaceId()) return false;
      if (this.status() !== 'all' && t.status !== this.status()) return false;
      if (this.method() !== 'all' && t.method !== this.method()) return false;
      if (now - new Date(t.date).getTime() > days) return false;
      if (q && !(t.payer.toLowerCase().includes(q) || t.reference.toLowerCase().includes(q) || t.phone.includes(q))) return false;
      return true;
    });
  });

  ngOnInit() {
    if (this.scope() === 'partner') this.store.loadFromApi();
    if (this.scope() === 'platform' || this.scope() === 'cashier' || this.scope() === 'collections') {
      this.txApi.getAll().subscribe({
        next: (rows) => {
          const mapped = this.mapApiRows(rows);
          if (this.scope() === 'platform') this.platformTxs.set(mapped);
          else if (this.scope() === 'collections') {
            // Tous les encaissements caisse, toutes agences/caissières confondues (supervision).
            this.collectionsTxs.set(mapped.filter((t) => t.reference.startsWith('CASH-')));
          } else {
            const uid = this.auth.user()?.id;
            this.cashierTxs.set(mapped.filter((t) => t.fields?.['cashierId'] === uid || t.reference.startsWith('CASH-')));
          }
        },
        error: () => {
          if (this.scope() === 'platform') this.platformTxs.set([]);
          else if (this.scope() === 'collections') this.collectionsTxs.set([]);
          else this.cashierTxs.set([]);
        },
      });
    }
  }

  private mapApiRows(rows: unknown[]): Transaction[] {
    return rows.map((raw, i) => {
      const r = raw as Record<string, unknown>;
      const meta = (r['metadata'] ?? {}) as Record<string, string>;
      return {
        id: String(r['id'] ?? 'api-' + i),
        reference: String(r['externalRef'] ?? r['reference'] ?? 'FP-' + i),
        payer: meta['payer'] ?? '—',
        phone: meta['phone'] ?? '',
        interfaceId: meta['interfaceId'] ?? '',
        interfaceName: meta['interfaceName'] ?? '—',
        method: (meta['method'] ?? r['method'] ?? 'transfer') as Method,
        status: String(r['status'] ?? 'success').toLowerCase() as TxStatus,
        amount: +(r['amount'] ?? 0),
        date: String(r['createdAt'] ?? new Date().toISOString()),
        fields: meta,
      };
    });
  }

  readonly pageRows = computed(() => this.filtered().slice(0, 60));

  readonly breakdown = computed(() => {
    const out = { success: 0, pending: 0, failed: 0, amount: 0 };
    for (const t of this.filtered()) {
      out[t.status]++;
      if (t.status === 'success') out.amount += t.amount;
    }
    return out;
  });

  fr(n: number) { return n.toLocaleString('fr-FR'); }
  mlabel(m: Method) { return METHOD_LABELS[m]; }
  mcolor(m: Method) { return METHOD_COLOR[m]; }
  slabel(s: TxStatus) { return STATUS_LABEL[s]; }
  date(d: string) { return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  go(r: string) { this.router.navigate(['/', r]); }

  doExport() {
    const rows = this.filtered();
    const cols: (keyof Transaction)[] = ['reference', 'payer', 'phone', 'interfaceName', 'method', 'status', 'amount', 'date'];
    const headers = ['Référence', 'Payeur', 'Téléphone', 'Interface', 'Moyen', 'Statut', 'Montant (XAF)', 'Date'];
    let content = '', mime = 'text/csv;charset=utf-8';
    const ext = this.format();
    if (this.format() === 'json') {
      content = JSON.stringify(rows.map((t) => ({ ...t })), null, 2);
      mime = 'application/json';
    } else {
      const sep = this.format() === 'xls' ? '\t' : ',';
      const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
      const line = (t: Transaction) => cols.map((c) => esc(
        c === 'method' ? METHOD_LABELS[t.method] : c === 'status' ? STATUS_LABEL[t.status] : t[c])).join(sep);
      content = [headers.map(esc).join(sep), ...rows.map(line)].join('\n');
      if (this.format() === 'xls') mime = 'application/vnd.ms-excel';
    }
    const blob = new Blob(['﻿' + content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transactions-firstpay.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.exportOpen.set(false);
  }
}
