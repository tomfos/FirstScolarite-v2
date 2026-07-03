import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuditApiService, AuditEventDto } from '../../core/api/audit-api.service';

type Level = 'info' | 'warning' | 'danger';

const KINDS: Record<string, { label: string; color: string; glyph: string }> = {
  publish: { label: 'Publication', color: '#1F8A5B', glyph: '↗' },
  refund: { label: 'Remboursement', color: '#B7791F', glyph: '↩' },
  login: { label: 'Connexion', color: '#2563EB', glyph: '🔑' },
  delete: { label: 'Suppression', color: '#E53935', glyph: '🗑' },
  impersonate: { label: 'Délégation', color: '#7C3AED', glyph: '◑' },
  settings: { label: 'Paramètres', color: '#5A6270', glyph: '⚙' },
  create: { label: 'Création', color: '#2563EB', glyph: '+' },
  login_fail: { label: 'Tentative échouée', color: '#E53935', glyph: '⛨' },
};

const FALLBACK: AuditEventDto[] = [];

@Component({
  selector: 'fp-audit',
  standalone: true,
  styleUrl: './audit.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div class="eyebrow">Plateforme FirstStudioPay · Supervision</div>
        <div class="title">Journal d'audit</div>
        <div class="subtitle">Toutes les actions critiques sur la plateforme, en temps réel, conservées 12 mois.</div>
      </div>

      <div class="filters">
        @for (f of chips; track f.id) {
          <button class="chip" [class.on]="filter() === f.id" (click)="filter.set(f.id); load()">{{ f.label }}</button>
        }
      </div>

      <div class="body">
        <div class="list">
          @for (e of filtered(); track e.id) {
            <div class="ev" [class.warning]="e.level === 'warning'" [class.danger]="e.level === 'danger'">
              <div class="ev-ic" [style.background]="kind(e.kind).color + '18'" [style.color]="kind(e.kind).color">{{ kind(e.kind).glyph }}</div>
              <div class="ev-main">
                <div class="ev-line"><span class="ev-kind" [style.color]="kind(e.kind).color">{{ kind(e.kind).label }}</span><span class="ev-target">· {{ e.target }}</span></div>
                <div class="ev-meta">par <b>{{ e.actor }}</b> · {{ e.partner }}</div>
              </div>
              <div class="ev-ts">{{ formatTs(e.ts) }}</div>
            </div>
          } @empty {
            <div class="empty">Aucun événement pour ce filtre.</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class AuditComponent implements OnInit {
  private readonly auditApi = inject(AuditApiService);
  readonly filter = signal<'all' | Level>('all');
  readonly chips: { id: 'all' | Level; label: string }[] = [
    { id: 'all', label: 'Tous les événements' }, { id: 'info', label: 'Info' },
    { id: 'warning', label: 'Avertissements' }, { id: 'danger', label: 'Critiques' },
  ];
  private readonly events = signal<AuditEventDto[]>(FALLBACK);

  ngOnInit() { this.load(); }

  load() {
    this.auditApi.list(this.filter()).subscribe({
      next: (rows) => this.events.set(rows),
      error: () => this.events.set([]),
    });
  }

  readonly filtered = computed(() => {
    const f = this.filter();
    return this.events().filter((e) => f === 'all' || e.level === f);
  });

  kind(k: string) { return KINDS[k] ?? KINDS['settings']; }
  formatTs(ts: string) {
    const d = Date.parse(ts);
    return Number.isNaN(d) ? ts : new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
