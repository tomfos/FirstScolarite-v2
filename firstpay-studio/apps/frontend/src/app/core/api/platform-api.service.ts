import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PlatformSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpFromEmail: string;
  smtpFromName: string;
  smtpUseTls: boolean;
  smtpEnabled: boolean;
  appBaseUrl: string;
  passwordSet?: boolean;
  aggEnabled: boolean;
  aggMode: 'sandbox' | 'production';
  aggBaseUrl: string;
  aggAppId: string;
  aggSecret: string;
  aggSecretSet?: boolean;
  aggSandboxBaseUrl: string;
  aggSandboxAppId: string;
  aggSandboxSecret: string;
  aggSandboxSecretSet?: boolean;
  mpgsEnabled: boolean;
  mpgsMode: 'sandbox' | 'production';
  mpgsApiVersion: string;
  mpgsHost: string;
  mpgsMerchantId: string;
  mpgsPassword: string;
  mpgsPasswordSet?: boolean;
  mpgsSandboxHost: string;
  mpgsSandboxMerchantId: string;
  mpgsSandboxPassword: string;
  mpgsSandboxPasswordSet?: boolean;
}

/**
 * Disponibilité par moyen de paiement, dérivée côté serveur des réglages admin
 * (agrégateur MTN/Orange, passerelle carte). Lisible par les utilisateurs studio,
 * sans aucun secret. Voir PaymentMethodsController (partner-service).
 */
export interface MethodAvailability {
  orange: boolean;
  mtn: boolean;
  card: boolean;
  transfer: boolean;
}

/** Paramètres plateforme (config SMTP) — réservés à l'admin banque. */
@Injectable({ providedIn: 'root' })
export class PlatformApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/v1/settings/platform`;

  get(): Observable<PlatformSettings | null> {
    return this.http.get<PlatformSettings>(this.base).pipe(catchError(() => of(null)));
  }

  save(settings: PlatformSettings): Observable<PlatformSettings | null> {
    return this.http.put<PlatformSettings>(this.base, settings).pipe(catchError(() => of(null)));
  }

  /** Teste la config en cours d'édition (envoyée telle quelle) — pas besoin d'enregistrer d'abord. */
  test(settings: PlatformSettings, to: string): Observable<{ sent: boolean; error?: string } | null> {
    return this.http
      .post<{ sent: boolean; error?: string }>(`${this.base}/test`, { settings, to })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Disponibilité des moyens de paiement configurés par l'admin (sans secret).
   * Accessible aux utilisateurs studio pour n'afficher que les moyens réellement activés.
   */
  availableMethods(): Observable<MethodAvailability | null> {
    return this.http
      .get<MethodAvailability>(`${environment.apiUrl}/api/v1/settings/payment-methods`)
      .pipe(catchError(() => of(null)));
  }
}
