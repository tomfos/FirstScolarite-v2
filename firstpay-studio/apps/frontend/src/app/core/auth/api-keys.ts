/** Clés API de démo (dev local avec TENANT_FALLBACK_ENABLED=true). */
export const DEMO_API_KEYS: Record<string, string> = {
  SOFT: 'demo-soft-key',
  EPAL: 'demo-epal-key',
};

export const DEMO_TENANT_IDS: Record<string, string> = {
  'SOFT TECHNOLOGIES': '11111111-1111-1111-1111-111111111111',
  'ÉCOLE LES PALMIERS': '22222222-2222-2222-2222-222222222222',
  'EMF DIGITAL FINANCE': '33333333-3333-3333-3333-333333333333',
};

/** Raccourci démo uniquement — en prod, utiliser JWT ou clé API renvoyée à la création. */
export function demoApiKeyForPartner(partnerName?: string): string | null {
  if (partnerName === 'ÉCOLE LES PALMIERS') return DEMO_API_KEYS['EPAL'];
  if (partnerName === 'SOFT TECHNOLOGIES') return DEMO_API_KEYS['SOFT'];
  return null;
}

export function demoTenantIdForPartner(partnerName?: string): string | null {
  return DEMO_TENANT_IDS[partnerName ?? ''] ?? null;
}

/** Vitrine (code/shortCode/sector) affichée dans le topbar avant que la vraie réponse API n'arrive. */
export const DEMO_PARTNER_SHOWCASE: Record<string, { code: string; shortCode: string; sector: string }> = {
  'SOFT TECHNOLOGIES': { code: 'FSPAY_202605211633050082', shortCode: 'SOFT', sector: 'Fintech' },
  'ÉCOLE LES PALMIERS': { code: 'FSPAY_202604130910470215', shortCode: 'EPAL', sector: 'Éducation' },
  'EMF DIGITAL FINANCE': { code: 'FSPAY_202607200001', shortCode: 'EMFDF', sector: 'Finance' },
};
