import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PARTNER_ROLES, PartnerRole, PartnerUser, UsersStore } from './users.store';

@Component({
  selector: 'fp-users',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './users.component.scss',
  template: `
    <div class="page">
      <div class="head">
        <div>
          <div class="eyebrow">Portail partenaire · Module</div>
          <div class="title">Utilisateurs &amp; rôles</div>
          <div class="subtitle">Gérez les membres qui accèdent à votre portail First Collect et leurs permissions.</div>
        </div>
        <button class="primary" (click)="openInvite()">+ Inviter un utilisateur</button>
      </div>

      <div class="filters">
        <div class="search"><span>⌕</span>
          <input [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Rechercher par nom ou email…"></div>
      </div>

      <div class="list">
        @for (u of filtered(); track u.id) {
          <div class="user-card">
            <div class="avatar" [style.background]="role(u.role).bg" [style.color]="role(u.role).color">{{ initials(u.name) }}</div>
            <div class="u-main">
              <div class="u-name">{{ u.name }} @if (u.status === 'pending') { <span class="pending">Invitation en attente</span> }</div>
              <div class="u-email">{{ u.email }}</div>
            </div>
            <div class="u-role">
              <span class="role-badge" [style.background]="role(u.role).bg" [style.color]="role(u.role).color" [style.borderColor]="role(u.role).border">{{ role(u.role).label }}</span>
              <div class="u-seen">{{ u.lastSeen }}</div>
            </div>
            <div class="u-actions">
              <button class="icon" (click)="openEdit(u)" title="Modifier">✎</button>
              <button class="icon danger" (click)="remove(u)" title="Retirer">🗑</button>
            </div>
          </div>
        }
      </div>

      <!-- Invite / edit modal -->
      @if (draft(); as d) {
        <div class="overlay" (click)="draft.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="m-head"><div class="m-title">{{ d.id ? 'Modifier le membre' : 'Inviter un utilisateur' }}</div>
              <button class="x" (click)="draft.set(null)">✕</button></div>
            <div class="m-body">
              <label class="fld"><span>Nom complet</span><input [ngModel]="d.name" (ngModelChange)="patch({ name: $event })" placeholder="Ex : Marie Ngono"></label>
              <label class="fld"><span>Email</span><input type="email" [ngModel]="d.email" (ngModelChange)="patch({ email: $event })" placeholder="prenom.nom@entreprise.cm"></label>
              <div class="fld"><span>Rôle</span>
                <div class="roles">
                  @for (r of roleKeys; track r) {
                    <button class="role-opt" [class.on]="d.role === r" (click)="patch({ role: r })">
                      <div class="ro-top"><span class="ro-dot" [style.background]="PARTNER_ROLES[r].color"></span>{{ PARTNER_ROLES[r].label }}</div>
                      <div class="ro-desc">{{ PARTNER_ROLES[r].desc }}</div>
                    </button>
                  }
                </div>
              </div>
            </div>
            <div class="m-foot">
              <button class="ghost" (click)="draft.set(null)">Annuler</button>
              <button class="primary" (click)="save()" [disabled]="!d.name || !d.email">{{ d.id ? 'Enregistrer' : "Envoyer l'invitation" }}</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class UsersComponent implements OnInit {
  readonly store = inject(UsersStore);
  readonly PARTNER_ROLES = PARTNER_ROLES;
  readonly roleKeys = Object.keys(PARTNER_ROLES) as PartnerRole[];
  readonly search = signal('');
  readonly draft = signal<PartnerUser | null>(null);

  ngOnInit() { this.store.loadFromApi(); }

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase();
    return this.store.users().filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  });

  role(r: PartnerRole) { return PARTNER_ROLES[r]; }
  initials(n: string) { return n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }

  openInvite() { this.draft.set({ id: '', name: '', email: '', role: 'manager', status: 'pending', lastSeen: '—' }); }
  openEdit(u: PartnerUser) { this.draft.set({ ...u }); }
  patch(p: Partial<PartnerUser>) { const d = this.draft(); if (d) this.draft.set({ ...d, ...p }); }
  save() { const d = this.draft(); if (d) { this.store.upsert(d); this.draft.set(null); } }
  remove(u: PartnerUser) { if (confirm(`Retirer ${u.name} de l'équipe ?`)) this.store.remove(u.id); }
}
