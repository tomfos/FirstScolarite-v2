/** Annuaire des partenaires côté banque (données API partner-service). */
export interface PartnerRecord {
  name: string; code: string; shortCode: string; sector: string; partnerType: string;
  interfaces: number; active: boolean; status: string; tenantId?: string;
}
