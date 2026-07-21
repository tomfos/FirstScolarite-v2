import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiMessageDto {
  id: string;
  tenantId: string | null;
  targetLabel: string | null;
  subject: string;
  body: string;
  senderName: string;
  createdAt: string;
  read: boolean;
}

export interface SendMessageRequest {
  tenantId: string | null;
  subject: string;
  body: string;
}

@Injectable({ providedIn: 'root' })
export class MessageApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Messages destinés au partenaire connecté (ciblés ou diffusés à tous). */
  fetchMine(): Observable<ApiMessageDto[]> {
    return this.http.get<ApiMessageDto[]>(`${this.base}/api/v1/messages`);
  }

  /** Vue banque : tout l'historique envoyé. */
  fetchSent(): Observable<ApiMessageDto[]> {
    return this.http.get<ApiMessageDto[]>(`${this.base}/api/v1/messages/sent`);
  }

  send(req: SendMessageRequest): Observable<ApiMessageDto> {
    return this.http.post<ApiMessageDto>(`${this.base}/api/v1/messages`, req);
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/api/v1/messages/${id}/lu`, {});
  }
}
