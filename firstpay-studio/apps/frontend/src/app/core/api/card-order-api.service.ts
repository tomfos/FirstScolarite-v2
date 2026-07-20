import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiCardOrderDto {
  id: string;
  tenantId: string;
  partnerName?: string;
  quantite: number;
  dateCommande: string;
  statut: 'en_cours' | 'livree' | 'annulee';
  quantiteVendue: number;
  quantiteActivee: number;
}

@Injectable({ providedIn: 'root' })
export class CardOrderApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Commandes du partenaire connecté. */
  fetchMine(): Observable<ApiCardOrderDto[]> {
    return this.http.get<ApiCardOrderDto[]>(`${this.base}/api/v1/card-orders`);
  }

  /** Vue banque : toutes les commandes, tous partenaires (bank_admin uniquement). */
  fetchAll(): Observable<ApiCardOrderDto[]> {
    return this.http.get<ApiCardOrderDto[]>(`${this.base}/api/v1/card-orders/all`);
  }

  create(quantite: number): Observable<ApiCardOrderDto> {
    return this.http.post<ApiCardOrderDto>(`${this.base}/api/v1/card-orders`, { quantite });
  }

  livrer(id: string): Observable<ApiCardOrderDto> {
    return this.http.post<ApiCardOrderDto>(`${this.base}/api/v1/card-orders/${id}/livrer`, {});
  }

  annuler(id: string): Observable<ApiCardOrderDto> {
    return this.http.post<ApiCardOrderDto>(`${this.base}/api/v1/card-orders/${id}/annuler`, {});
  }

  enregistrerVentes(id: string, quantiteVendue: number, quantiteActivee: number): Observable<ApiCardOrderDto> {
    return this.http.post<ApiCardOrderDto>(`${this.base}/api/v1/card-orders/${id}/enregistrer-ventes`, {
      quantiteVendue, quantiteActivee,
    });
  }
}
