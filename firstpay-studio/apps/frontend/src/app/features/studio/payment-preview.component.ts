import { AfterViewInit, Component, ElementRef, computed, inject, input } from '@angular/core';
import { gsap } from 'gsap';
import { CustomField, PaymentInterface, METHOD_LABELS, Method } from '../../core/models/interface.model';
import { Partner } from '../../core/tenant/tenant-context.service';

/** Aperçu de la page de paiement publique (mobile-like), reflète la config en direct. */
@Component({
  selector: 'fp-payment-preview',
  standalone: true,
  styleUrl: './payment-preview.component.scss',
  template: `
    <div class="frame">
      <div class="phone">
        <div class="brandbar">
          <div class="brand-logo">{{ partner().shortCode }}</div>
          <div class="brand-name">{{ partner().name }}</div>
        </div>
        <div class="body">
          <div class="iface-name">{{ data().name || 'Nom de votre interface' }}</div>
          @if (data().description) { <div class="iface-desc">{{ data().description }}</div> }

          <div class="amount-block">
            @switch (data().amountType) {
              @case ('fixed') {
                <div class="lbl">Montant à payer</div>
                <div class="big">{{ fr(+data().fixedAmount || 0) }} <span>{{ data().currency }}</span></div>
              }
              @case ('preset') {
                <div class="lbl">Choisissez {{ data().multiSelect ? 'un ou plusieurs montants' : 'un montant' }}</div>
                <div class="presets">
                  @for (p of validPresets(); track p.id) {
                    <div class="preset">
                      <span>
                        {{ p.label || 'Montant' }}
                        @if (p.allowPartial) { <em class="acompte">acompte dès {{ fr(+(p.minAmount || 0)) }}</em> }
                      </span>
                      <b>{{ fr(+p.amount || 0) }} {{ data().currency }}</b>
                    </div>
                  }
                </div>
              }
              @case ('free') {
                <div class="lbl">Montant libre</div>
                <div class="free-input">0 {{ data().currency }}</div>
                <div class="hint">Entre {{ fr(+data().minAmount || 0) }} et {{ fr(+data().maxAmount || 0) }} {{ data().currency }}</div>
              }
            }
          </div>

          @if (data().customFields.length) {
            <div class="fields">
              @for (f of data().customFields; track f.id) {
                <div class="field">
                  <div class="f-lbl">{{ f.label }} @if (f.required) { <span class="req">*</span> }</div>
                  <div class="f-box" [class.readonly]="f.readonly">{{ fieldPlaceholder(f) }}</div>
                </div>
              }
            </div>
          }

          <div class="methods">
            <div class="m-lbl">Moyens de paiement</div>
            <div class="m-grid">
              @for (m of activeMethods(); track m) {
                <div class="m-pill" [class.orange]="m==='orange'" [class.mtn]="m==='mtn'">{{ label(m) }}</div>
              }
            </div>
          </div>

          <button class="pay-btn">Payer maintenant</button>
          <div class="secured">🔒 Paiement sécurisé · Afriland First Bank</div>
        </div>
      </div>
    </div>
  `,
})
export class PaymentPreviewComponent implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly data = input.required<PaymentInterface>();
  readonly partner = input.required<Partner>();

  ngAfterViewInit() {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const el: HTMLElement = this.host.nativeElement;
    const q = (s: string) => Array.from(el.querySelectorAll(s)) as HTMLElement[];
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from(el.querySelectorAll('.brandbar'), { y: -10, opacity: 0, duration: 0.4 })
      .from(q('.body > *'), { y: 16, opacity: 0, duration: 0.5, stagger: 0.07 }, '-=0.15');
    // Effet dynamique : le bouton « Payer » respire légèrement
    gsap.to(el.querySelectorAll('.pay-btn'), {
      scale: 1.015, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1,
    });
  }

  readonly validPresets = computed(() => this.data().presets.filter((p) => p.amount));
  readonly activeMethods = computed(() =>
    (Object.entries(this.data().methods).filter(([, v]) => v).map(([k]) => k)) as Method[]);

  fr(n: number) { return n.toLocaleString('fr-FR'); }
  label(m: Method) { return METHOD_LABELS[m]; }
  fieldPlaceholder(f: CustomField): string {
    if (f.readonly) return 'Auto-rempli';
    switch (f.type) {
      case 'select': return 'Sélectionner…';
      case 'date': return 'JJ/MM/AAAA';
      case 'phone': return '+237 6XX XX XX XX';
      default: return 'Saisir…';
    }
  }
}
