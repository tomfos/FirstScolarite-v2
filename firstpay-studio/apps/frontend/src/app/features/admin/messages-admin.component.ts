import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiMessageDto, MessageApiService } from '../../core/api/message-api.service';
import { PartnerApiService, PartnerListDto } from '../../core/api/partner-api.service';

/**
 * Messagerie banque -> partenaires : envoi ciblé (un partenaire) ou diffusé (tous), avec
 * historique. Le partenaire reçoit ces messages comme des notifications (cloche du portail).
 */
@Component({
  selector: 'fp-messages-admin',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './messages-admin.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div>
          <div class="eyebrow">Console superviseur · Module</div>
          <div class="title">Messages</div>
          <div class="subtitle">Communiquez avec un partenaire précis ou tous les partenaires à la fois.</div>
        </div>
      </div>

      <div class="body">
        <div class="compose">
          @if (error()) { <div class="err">{{ error() }}</div> }
          @if (sentOk()) { <div class="ok">Message envoyé.</div> }

          <div class="target-choice">
            <label class="radio"><input type="radio" name="target" [checked]="targetAll()" (change)="targetAll.set(true)"> Tous les partenaires</label>
            <label class="radio"><input type="radio" name="target" [checked]="!targetAll()" (change)="targetAll.set(false)"> Un partenaire précis</label>
          </div>

          @if (!targetAll()) {
            <label class="fld"><span>Partenaire</span>
              <select [ngModel]="targetTenantId()" (ngModelChange)="targetTenantId.set($event)">
                <option value="" disabled>Choisir un partenaire…</option>
                @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
              </select></label>
          }

          <label class="fld"><span>Sujet</span>
            <input [ngModel]="subject()" (ngModelChange)="subject.set($event)" placeholder="Ex : Maintenance programmée"></label>
          <label class="fld"><span>Message</span>
            <textarea rows="4" [ngModel]="body()" (ngModelChange)="body.set($event)" placeholder="Votre message…"></textarea></label>

          <button class="primary" [disabled]="!canSend() || sending()" (click)="send()">
            {{ sending() ? 'Envoi en cours…' : 'Envoyer' }}
          </button>
        </div>

        <div class="history">
          <div class="history-title">Historique</div>
          <div class="table">
            <div class="thead"><div>Destinataire</div><div>Sujet</div><div>Expéditeur</div><div>Date</div></div>
            @for (m of sent(); track m.id) {
              <div class="trow">
                <div class="p-name">{{ m.targetLabel }}</div>
                <div>{{ m.subject }}</div>
                <div>{{ m.senderName }}</div>
                <div>{{ date(m.createdAt) }}</div>
              </div>
            } @empty {
              <div class="no-rows">Aucun message envoyé pour le moment.</div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MessagesAdminComponent implements OnInit {
  private readonly api = inject(MessageApiService);
  private readonly partnerApi = inject(PartnerApiService);

  readonly partners = signal<PartnerListDto[]>([]);
  readonly sent = signal<ApiMessageDto[]>([]);
  readonly error = signal('');
  readonly sentOk = signal(false);
  readonly sending = signal(false);

  readonly targetAll = signal(true);
  readonly targetTenantId = signal('');
  readonly subject = signal('');
  readonly body = signal('');

  readonly canSend = computed(() =>
    !!this.subject().trim() && !!this.body().trim() && (this.targetAll() || !!this.targetTenantId()));

  ngOnInit() {
    this.partnerApi.listPartners().subscribe({ next: (p) => this.partners.set(p), error: () => {} });
    this.reload();
  }

  private reload() {
    this.api.fetchSent().subscribe({
      next: (m) => this.sent.set(m),
      error: () => this.error.set("Impossible de charger l'historique."),
    });
  }

  send() {
    if (!this.canSend()) return;
    this.sending.set(true); this.error.set(''); this.sentOk.set(false);
    this.api.send({
      tenantId: this.targetAll() ? null : this.targetTenantId(),
      subject: this.subject().trim(),
      body: this.body().trim(),
    }).subscribe({
      next: (msg) => {
        this.sending.set(false); this.sentOk.set(true);
        this.sent.set([msg, ...this.sent()]);
        this.subject.set(''); this.body.set('');
        setTimeout(() => this.sentOk.set(false), 2500);
      },
      error: () => { this.sending.set(false); this.error.set("Échec de l'envoi."); },
    });
  }

  date(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
