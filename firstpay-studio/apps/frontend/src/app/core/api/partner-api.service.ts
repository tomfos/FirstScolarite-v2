import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CustomField, PaymentInterface } from '../models/interface.model';
import { Transaction } from '../models/transaction.model';

export interface ApiInterfaceDto {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  sector?: string;
  country?: string;
  slug: string;
  customSlug?: string;
  status: string;
  tx: number;
  collected: number;
  amountType: string;
  fixedAmount?: string;
  minAmount?: string;
  maxAmount?: string;
  currency: string;
  presets: { id: number; label: string; amount: string; allowPartial?: boolean; minAmount?: string }[];
  multiSelect: boolean;
  refType: string;
  refLabel?: string;
  refFormat?: string;
  customFields: { id: string; type: string; label: string; required: boolean; readonly?: boolean; options?: string[] }[];
  methods: Record<string, boolean>;
  qrCodes: Record<string, boolean>;
  establishment?: string;
}

/** Aperçu du répertoire étudiants d'un partenaire. */
export interface RosterSummaryDto {
  total: number;
  establishments: string[];
}

/** Bilan d'un import de répertoire. */
export interface RosterImportResult {
  imported: number;
  skipped: number;
  total: number;
}

export interface ApiTransactionDto {
  id: string;
  tenantId?: string;
  interfaceId?: string;
  externalRef: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  method?: string;
  payer?: string;
  reference?: string;
  phone?: string;
  createdAt: string;
  processedAt?: string;
}

export interface PartnerListDto {
  id: string;
  code: string;
  shortCode: string;
  name: string;
  sector: string;
  status: string;
  interfaceCount: number;
}

export interface CreatePartnerRequest {
  name: string;
  sector: string;
  adminName: string;
  adminEmail: string;
  settlementAccount: string;
  accountHolder: string;
  settlementBank: string;
}

export interface CreatePartnerResponse {
  partner: PartnerListDto;
  apiKey: string;
  adminEmail?: string;
  tempPassword?: string;
}

export interface ImpersonateResponse {
  token: string;
  tenantId: string;
  partner: string;
  code: string;
  shortCode: string;
  sector: string;
  tokenType: string;
}

@Injectable({ providedIn: 'root' })
export class PartnerApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  fetchInterfaces(): Observable<PaymentInterface[]> {
    return this.http.get<ApiInterfaceDto[]>(`${this.base}/api/v1/interfaces`).pipe(
      map((rows) => rows.map(mapInterface)),
    );
  }

  fetchTransactions(): Observable<Transaction[]> {
    return this.http.get<ApiTransactionDto[]>(`${this.base}/api/v1/transactions?limit=200`).pipe(
      map((rows) => rows.map(mapTransaction)),
    );
  }

  saveInterface(payload: Partial<PaymentInterface>): Observable<PaymentInterface> {
    const body = toSavePayload(payload);
    const isNew = !payload.id || payload.id.startsWith('new-');
    const url = isNew
      ? `${this.base}/api/v1/interfaces`
      : `${this.base}/api/v1/interfaces/${payload.id}`;
    const req = isNew
      ? this.http.post<ApiInterfaceDto>(url, body)
      : this.http.put<ApiInterfaceDto>(url, body);
    return req.pipe(map(mapInterface));
  }

  deleteInterface(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/v1/interfaces/${id}`);
  }

  listPartners(): Observable<PartnerListDto[]> {
    return this.http.get<PartnerListDto[]>(`${this.base}/api/v1/partners`);
  }

  createPartner(req: CreatePartnerRequest): Observable<CreatePartnerResponse> {
    return this.http.post<CreatePartnerResponse>(`${this.base}/api/v1/partners`, req);
  }

  /** JWT de délégation banque → partenaire (role partner_admin, tenant cible). */
  impersonate(tenantId: string): Observable<ImpersonateResponse> {
    return this.http.post<ImpersonateResponse>(`${this.base}/api/v1/partners/${tenantId}/impersonate`, {});
  }

  fetchUsers(): Observable<ApiUserDto[]> {
    return this.http.get<ApiUserDto[]>(`${this.base}/api/v1/users`);
  }

  saveUser(user: ApiUserDto): Observable<ApiUserDto> {
    return this.http.post<ApiUserDto>(`${this.base}/api/v1/users`, user);
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/v1/users/${id}`);
  }

  fetchSettings(): Observable<ApiSettingsDto> {
    return this.http.get<ApiSettingsDto>(`${this.base}/api/v1/settings`);
  }

  saveSettings(settings: ApiSettingsDto): Observable<ApiSettingsDto> {
    return this.http.put<ApiSettingsDto>(`${this.base}/api/v1/settings`, settings);
  }

  /* ------------------------ Répertoire étudiants (matricule) ------------------------ */

  fetchRoster(): Observable<RosterSummaryDto> {
    return this.http.get<RosterSummaryDto>(`${this.base}/api/v1/roster`);
  }

  /** Importe des lignes (en-tête → valeur). `replace` remplace le répertoire existant. */
  importRoster(rows: Record<string, string>[], replace = true): Observable<RosterImportResult> {
    return this.http.post<RosterImportResult>(`${this.base}/api/v1/roster/import`, { rows, replace });
  }

  clearRoster(): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/v1/roster`);
  }
}

export interface ApiUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export interface ApiSettingsDto {
  tenantId?: string;
  logoUrl?: string | null;
  logoName?: string | null;
  brandColor: string;
  notifications: Record<string, unknown>;
}

function mapInterface(d: ApiInterfaceDto): PaymentInterface {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? '',
    sector: d.sector ?? '',
    country: d.country ?? 'CM',
    slug: d.slug,
    customSlug: d.customSlug ?? d.slug,
    status: d.status as PaymentInterface['status'],
    tx: d.tx,
    collected: d.collected,
    amountType: d.amountType as PaymentInterface['amountType'],
    fixedAmount: d.fixedAmount ?? '',
    minAmount: d.minAmount ?? '',
    maxAmount: d.maxAmount ?? '',
    currency: d.currency,
    presets: d.presets ?? [],
    multiSelect: d.multiSelect,
    refType: d.refType as PaymentInterface['refType'],
    refLabel: d.refLabel ?? '',
    refFormat: d.refFormat ?? 'any',
    customFields: (d.customFields ?? []).map((f) => ({
      id: f.id,
      type: f.type as CustomField['type'],
      label: f.label,
      required: f.required,
      readonly: !!f.readonly,
      options: f.options,
    })),
    methods: {
      orange: !!d.methods?.['orange'],
      mtn: !!d.methods?.['mtn'],
      card: !!d.methods?.['card'],
      transfer: !!d.methods?.['transfer'],
    },
    qrCodes: d.qrCodes ?? {},
    establishment: d.establishment ?? '',
  };
}

function mapTransaction(d: ApiTransactionDto): Transaction {
  const status = d.status.toLowerCase() as Transaction['status'];
  return {
    id: d.id,
    reference: d.reference ?? d.externalRef,
    payer: d.payer ?? '—',
    phone: d.phone ?? '',
    interfaceId: d.interfaceId ?? '',
    interfaceName: '',
    method: (d.method ?? 'orange') as Transaction['method'],
    status: status === 'success' ? 'success' : status === 'failed' ? 'failed' : status === 'pending' ? 'pending' : 'pending',
    amount: Number(d.amount),
    date: d.createdAt,
    fields: {},
  };
}

function toSavePayload(p: Partial<PaymentInterface>) {
  return {
    id: p.id?.startsWith('new-') ? null : p.id,
    name: p.name,
    description: p.description,
    sector: p.sector,
    country: p.country,
    customSlug: p.customSlug,
    status: p.status,
    amountType: p.amountType,
    fixedAmount: p.fixedAmount,
    minAmount: p.minAmount,
    maxAmount: p.maxAmount,
    currency: p.currency,
    presets: p.presets,
    multiSelect: p.multiSelect,
    refType: p.refType,
    refLabel: p.refLabel,
    refFormat: p.refFormat,
    customFields: p.customFields,
    methods: p.methods,
    qrCodes: p.qrCodes,
    establishment: p.establishment ?? '',
  };
}
