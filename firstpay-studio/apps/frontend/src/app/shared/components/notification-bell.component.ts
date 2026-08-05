import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiMessageDto, MessageApiService } from '../../core/api/message-api.service';

/**
 * Cloche de notifications côté partenaire : messages envoyés par la banque (ciblés ou diffusés
 * à tous). Cliquer un message non lu le marque lu (côté tenant, pas par utilisateur individuel).
 */
@Component({
  selector: 'fp-notification-bell',
  standalone: true,
  template: `
    <div class="bell-wrap">
      <button class="bell-btn" type="button" (click)="toggle()" aria-label="Notifications">
        🔔
        @if (unreadCount() > 0) { <span class="badge">{{ unreadCount() }}</span> }
      </button>

      @if (open()) {
        <div class="backdrop" (click)="open.set(false)"></div>
        <div class="panel" (click)="$event.stopPropagation()">
          <div class="panel-head">Messages</div>
          <div class="panel-body">
            @for (m of messages(); track m.id) {
              <button class="msg" type="button" [class.unread]="!m.read" (click)="openMsg(m)">
                <div class="msg-top"><span class="msg-subject">{{ m.subject }}</span><span class="msg-date">{{ date(m.createdAt) }}</span></div>
                <div class="msg-from">{{ m.senderName }}</div>
              </button>
            } @empty {
              <div class="empty">Aucun message pour le moment.</div>
            }
          </div>
        </div>
      }

      @if (active(); as m) {
        <div class="overlay" (click)="active.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="m-head">
              <div class="m-title">{{ m.subject }}</div>
              <button class="x" (click)="active.set(null)">✕</button>
            </div>
            <div class="m-body">
              <div class="m-meta">{{ m.senderName }} · {{ date(m.createdAt) }}</div>
              <p class="m-text">{{ m.body }}</p>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .bell-wrap { position: relative; }
    .bell-btn { position: relative; border: none; background: none; font-size: 18px; width: 34px; height: 34px;
      border-radius: 8px; cursor: pointer; display: grid; place-items: center; color: var(--text-2); }
    .bell-btn:hover { background: var(--bg); }
    .badge { position: absolute; top: 2px; right: 2px; background: var(--fp-red); color: #fff; font-size: 10px;
      font-weight: 700; min-width: 16px; height: 16px; border-radius: 999px; display: grid; place-items: center; padding: 0 3px; }

    .backdrop { position: fixed; inset: 0; z-index: 1090; }
    .panel { position: absolute; top: 42px; right: 0; width: 340px; max-height: 420px; overflow: auto;
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); z-index: 1091; }
    .panel-head { padding: 12px 16px; font-weight: 700; font-size: 13px; border-bottom: 1px solid var(--border); }
    .panel-body { display: flex; flex-direction: column; }
    .msg { display: block; width: 100%; text-align: left; border: none; background: none; padding: 12px 16px;
      border-bottom: 1px solid var(--border); cursor: pointer; font-family: inherit; }
    .msg:hover { background: var(--bg); }
    .msg.unread { background: var(--blue-soft, rgba(37,99,235,.06)); }
    .msg-top { display: flex; justify-content: space-between; gap: 8px; }
    .msg-subject { font-size: 13px; font-weight: 700; }
    .msg.unread .msg-subject::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 99px;
      background: var(--fp-red); margin-right: 6px; }
    .msg-date { font-size: 11px; color: var(--text-3); white-space: nowrap; }
    .msg-from { font-size: 11.5px; color: var(--text-3); margin-top: 2px; }
    .empty { padding: 24px 16px; text-align: center; color: var(--text-3); font-size: 13px; }

    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,.4); display: grid; place-items: center; z-index: 1100; }
    .modal { background: var(--surface); border-radius: 16px; width: 460px; max-width: 92vw; box-shadow: var(--shadow-lg); overflow: hidden; }
    .m-head { padding: 18px 22px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .m-title { font-size: 16px; font-weight: 700; }
    .x { border: none; background: var(--bg); width: 30px; height: 30px; border-radius: 8px; color: var(--text-2); flex-shrink: 0; }
    .m-body { padding: 22px; }
    .m-meta { font-size: 12px; color: var(--text-3); margin-bottom: 12px; }
    .m-text { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
  `],
})
export class NotificationBellComponent implements OnInit {
  private readonly api = inject(MessageApiService);

  readonly messages = signal<ApiMessageDto[]>([]);
  readonly open = signal(false);
  readonly active = signal<ApiMessageDto | null>(null);
  readonly unreadCount = computed(() => this.messages().filter((m) => !m.read).length);

  ngOnInit() { this.load(); }

  private load() {
    this.api.fetchMine().subscribe({ next: (m) => this.messages.set(m), error: () => {} });
  }

  toggle() { this.open.set(!this.open()); }

  openMsg(m: ApiMessageDto) {
    this.active.set(m);
    this.open.set(false);
    if (!m.read) {
      this.api.markRead(m.id).subscribe({
        next: () => this.messages.set(this.messages().map((x) => (x.id === m.id ? { ...x, read: true } : x))),
        error: () => {},
      });
    }
  }

  date(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
