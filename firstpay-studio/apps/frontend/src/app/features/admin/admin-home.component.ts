import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ReportingApiService } from '../../core/api/reporting-api.service';
import { StatCardComponent } from '../../shared/components/stat-card.component';

@Component({
  selector: 'fp-admin-home',
  standalone: true,
  imports: [StatCardComponent],
  styleUrl: './admin-home.component.scss',
  template: `
    <div class="page">
      <div class="bg-lines"></div>
      <div class="inner">
        <div class="hero">
          <div class="hero-blob"></div>
          <div class="eyebrow">Console superviseur · Afriland First Bank</div>
          <div class="hello">Bonjour {{ firstName() }}.</div>
          <div class="sub">Vous avez un accès complet à la plateforme FirstStudioPay : supervision, audit, débogage des partenaires.</div>
        </div>

        <div class="stats">
          <fp-stat-card label="Transactions totales" [value]="fr(stats().totalTx)" sub="tous partenaires" icon="∿" accent="#2563EB" />
          <fp-stat-card label="Encaissé" [value]="fr(Math.round(stats().amount/1000)) + ' k XAF'" sub="cumul plateforme" icon="₣" accent="#1F8A5B" />
          <fp-stat-card label="Taux de succès" [value]="stats().rate + ' %'" [sub]="liveTpm() ? liveTpm() + ' tx/min en direct' : 'moy. 30 jours'" icon="↗" accent="#7C3AED" />
          <fp-stat-card label="Échecs" [value]="fr(stats().failed)" sub="sur la période" icon="✕" accent="#B7791F" />
        </div>

        <div class="modules">
          @for (m of modules; track m.route) {
            <div class="module" (click)="go(m.route)">
              <div class="m-ic" [style.background]="m.color">{{ m.glyph }}</div>
              <div class="m-title">{{ m.title }}</div>
              <div class="m-desc">{{ m.desc }}</div>
              <div class="m-cta" [style.color]="m.color">{{ m.cta }} →</div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class AdminHomeComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly reporting = inject(ReportingApiService);
  readonly Math = Math;

  private liveSub?: Subscription;
  readonly liveTpm = signal<number | null>(null);
  readonly stats = signal({ totalTx: 0, amount: 0, rate: 0, failed: 0 });

  readonly modules = [
    { route: 'partners', color: '#E53935', glyph: '🏢', title: 'Partenaires',
      desc: 'Liste de tous les partenaires enrôlés. Recherche, statut, accès en délégation pour intervenir à leur place.', cta: 'Superviser' },
    { route: 'transactions_all', color: '#2563EB', glyph: '∿', title: 'Transactions plateforme',
      desc: 'Vision exhaustive de toutes les transactions, tous partenaires confondus. Outils de remboursement et de réconciliation.', cta: 'Inspecter' },
    { route: 'audit', color: '#7C3AED', glyph: '⛨', title: "Journal d'audit",
      desc: 'Toutes les actions critiques : publications, suppressions, délégations, tentatives de connexion. Conservé 12 mois.', cta: 'Consulter' },
  ];

  ngOnInit() {
    this.reporting.summary().subscribe((s) => {
      if (s) {
        this.stats.set({
          totalTx: s.totalTx,
          amount: +s.amountTotal,
          rate: Math.round(s.successRate * 10) / 10,
          failed: s.failedCount,
        });
      }
    });
    this.liveSub = this.reporting.liveStats().subscribe({
      next: (s) => this.liveTpm.set(s.tpm),
      error: () => {},
    });
  }

  ngOnDestroy() { this.liveSub?.unsubscribe(); }

  firstName() { return (this.auth.user()?.name ?? '').split(' ')[0]; }
  fr(n: number) { return n.toLocaleString('fr-FR'); }
  go(r: string) { this.router.navigate(['/', r]); }
}
