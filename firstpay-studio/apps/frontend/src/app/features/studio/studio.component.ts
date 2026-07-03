import { Component, computed, inject, signal } from '@angular/core';
import { InterfaceListComponent } from './interface-list.component';
import { EditorComponent } from './editor.component';
import { PaymentPreviewComponent } from './payment-preview.component';
import { PublishPreviewComponent } from './publish-preview.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ShareModalComponent } from '../../shared/components/share-modal.component';
import { StudioStore } from './studio.store';
import { PaymentInterface } from '../../core/models/interface.model';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { payHost } from '../../shared/pay-url';

@Component({
  selector: 'fp-studio',
  standalone: true,
  imports: [InterfaceListComponent, EditorComponent, PaymentPreviewComponent, PublishPreviewComponent, StatusBadgeComponent, ShareModalComponent],
  styleUrl: './studio.component.scss',
  template: `
    <div class="studio">
      <fp-interface-list (share)="onShare($event)" (remove)="confirmRemove($event)" />

      @if (store.editing()) {
        <fp-editor (cancel)="store.cancel()"
                   (saved)="toast.set('Modifications enregistrées.')"
                   (publish)="publishPreview.set(true)" />
      } @else if (store.selected(); as it) {
        <!-- Détail lecture seule -->
        <div class="detail">
          <div class="bg-lines"></div>
          <div class="detail-head">
            <div>
              <div class="eyebrow">Aperçu</div>
              <div class="title-row">
                <span class="d-name">{{ it.name }}</span>
                <fp-status-badge [status]="it.status" />
              </div>
              <div class="d-url mono">{{ payHost }}/{{ partner().shortCode }}/{{ it.slug }}</div>
            </div>
            <div class="detail-actions">
              @if (it.status === 'brouillon') {
                <button class="edit-btn" (click)="publishFrom(it.id)">🚀 Publier</button>
              } @else {
                <button class="share-btn" (click)="shareTarget.set(it)">🔗 Partager le lien</button>
              }
              <button class="ghost-btn" (click)="store.openEditor(it.id)">✎ Modifier</button>
            </div>
          </div>
          <div class="detail-body">
            <div class="d-stats">
              <div class="d-stat"><div class="ds-lbl">Transactions</div><div class="ds-val">{{ fr(it.tx) }}</div><div class="ds-sub">cumul total</div></div>
              <div class="d-stat"><div class="ds-lbl">Encaissé</div><div class="ds-val">{{ fr(Math.round(it.collected/1000)) }} k</div><div class="ds-sub">{{ it.currency }}</div></div>
              <div class="d-stat"><div class="ds-lbl">Panier moyen</div><div class="ds-val">{{ fr(it.tx ? Math.round(it.collected/it.tx/100)*100 : 0) }}</div><div class="ds-sub">{{ it.currency }}</div></div>
              <div class="d-stat"><div class="ds-lbl">Taux de succès</div><div class="ds-val">94,2 %</div><div class="ds-sub">30 derniers jours</div></div>
            </div>
            <div class="d-grid">
              <div class="d-panel">
                <div class="d-panel-head">Aperçu de la page de paiement</div>
                <div class="d-panel-body"><fp-payment-preview [data]="it" [partner]="partner()" /></div>
              </div>
              <div class="d-panel">
                <div class="d-panel-head">Configuration</div>
                <div class="d-panel-body cfg">
                  <div class="cfg-row"><span>Type de montant</span><b>{{ amountLabel(it.amountType) }}</b></div>
                  <div class="cfg-row"><span>Devise</span><b>{{ it.currency }}</b></div>
                  <div class="cfg-row"><span>Référence</span><b>{{ it.refType === 'auto' ? 'Automatique' : it.refLabel || 'Personnalisée' }}</b></div>
                  <div class="cfg-row"><span>Champs</span><b>{{ it.customFields.length }}</b></div>
                  <div class="cfg-row"><span>Moyens actifs</span><b>{{ activeMethods(it) }}</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      } @else {
        <div class="empty-editor">
          <div>
            <div class="ee-title">Aucune interface sélectionnée</div>
            <div class="ee-sub">Choisissez une interface à gauche ou créez-en une nouvelle.</div>
            <button class="ee-btn" (click)="store.openNew()">+ Nouvelle interface</button>
          </div>
        </div>
      }

      @if (shareTarget(); as st) {
        <fp-share-modal
          [url]="payHost + '/' + partner().shortCode + '/' + st.slug"
          [name]="st.name" [partnerName]="partner().name"
          (close)="shareTarget.set(null)" />
      }

      @if (publishPreview() && store.editing(); as d) {
        <fp-publish-preview [data]="d" [partner]="partner()" [isPublishing]="publishing()"
                            (close)="publishPreview.set(false)" (confirm)="doPublish()" />
      }

      @if (toast()) { <div class="toast">✓ {{ toast() }}</div> }
    </div>
  `,
})
export class StudioComponent {
  readonly store = inject(StudioStore);
  private readonly tenant = inject(TenantContextService);
  readonly Math = Math;
  readonly partner = computed(() => this.tenant.partner()!);
  readonly payHost = payHost();
  readonly toast = signal<string | null>(null);
  readonly shareTarget = signal<PaymentInterface | null>(null);
  readonly publishPreview = signal(false);
  readonly publishing = signal(false);

  fr(n: number) { return n.toLocaleString('fr-FR'); }
  onShare(id: string) {
    this.shareTarget.set(this.store.interfaces().find((i) => i.id === id) ?? null);
  }
  amountLabel(t: string) { return t === 'fixed' ? 'Fixe' : t === 'preset' ? 'Prédéfini' : 'Libre'; }
  activeMethods(it: { methods: Record<string, boolean> }) {
    return Object.entries(it.methods).filter(([, v]) => v).length + ' / 4';
  }

  /** Publie une interface directement depuis son aperçu (brouillon → actif). */
  publishFrom(id: string) {
    this.store.openEditor(id);
    this.publishPreview.set(true);
  }

  doPublish() {
    if (this.publishing()) return;
    const d = this.store.editing();
    this.publishing.set(true);
    // Laisse l'état « Publication… » visible, puis persiste (status=actif) et ferme l'aperçu.
    setTimeout(() => {
      this.store.save('actif');
      this.publishing.set(false);
      this.publishPreview.set(false);
      this.store.cancel();
      // Ouvre aussitôt le partage : le partenaire voit et copie le lien public immédiatement.
      if (d) {
        const slug = d.customSlug?.trim() || this.slugify(d.name);
        this.shareTarget.set({ ...d, slug, status: 'actif' });
      }
      this.flash('Interface publiée 🎉 — voici le lien public à partager.');
    }, 650);
  }

  private slugify(s: string) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'interface';
  }
  confirmRemove(id: string) {
    const it = this.store.interfaces().find((i) => i.id === id);
    if (it && confirm(`Supprimer définitivement « ${it.name} » ?`)) {
      this.store.remove(id);
      this.flash('Interface supprimée.');
    }
  }
  private flash(msg: string) { this.toast.set(msg); setTimeout(() => this.toast.set(null), 3200); }
}
