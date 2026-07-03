import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LoginResponse {
  token: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  partner: string;
  code: string;
  shortCode: string;
  sector: string;
  tokenType: string;
}

/**
 * Authentification réelle du portail : échange email/mot de passe contre un JWT émis
 * par partner-service (via la gateway, route publique /api/v1/auth/login). En cas
 * d'échec (backend indisponible, compte hors-seed), renvoie null → le portail bascule
 * sur l'accès par API-key (mode démo hors-ligne).
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  login(email: string, password: string): Observable<LoginResponse | null> {
    return this.http
      .post<LoginResponse>(`${this.base}/api/v1/auth/login`, { email, password })
      .pipe(catchError(() => of(null)));
  }
}
