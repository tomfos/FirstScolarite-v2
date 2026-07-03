/** Modèles du domaine Studio — fidèles à la structure du prototype. */

export type InterfaceStatus = 'brouillon' | 'actif' | 'pause';
export type AmountType = 'fixed' | 'preset' | 'free';
export type RefType = 'auto' | 'custom';
export type FieldType = 'text' | 'select' | 'date' | 'phone';
export type Method = 'orange' | 'mtn' | 'card' | 'transfer';

export interface Preset {
  id: number;
  label: string;
  amount: string;
  /** Autorise un versement partiel (acompte) entre `minAmount` et `amount`. */
  allowPartial?: boolean;
  /** Minimum à verser quand l'acompte est autorisé. */
  minAmount?: string;
}

export interface CustomField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  /** Champ non modifiable par le payeur (auto-rempli depuis les données importées). */
  readonly?: boolean;
  options?: string[];
}

export type MethodMap = Record<Method, boolean>;

export interface PaymentInterface {
  id: string;
  name: string;
  description: string;
  sector: string;
  slug: string;
  customSlug: string;
  status: InterfaceStatus;
  tx: number;
  collected: number;
  amountType: AmountType;
  fixedAmount: string;
  minAmount: string;
  maxAmount: string;
  currency: string;
  presets: Preset[];
  multiSelect: boolean;
  refType: RefType;
  refLabel: string;
  refFormat: string;
  customFields: CustomField[];
  methods: MethodMap;
  qrCodes: Partial<MethodMap>;
}

export const NEW_INTERFACE = (sector = 'Fintech'): PaymentInterface => ({
  id: 'new-' + Date.now(),
  name: '', description: '', sector, customSlug: '', status: 'brouillon',
  slug: 'nouvelle-interface', tx: 0, collected: 0,
  amountType: 'fixed', fixedAmount: '', minAmount: '', maxAmount: '', currency: 'XAF',
  presets: [{ id: 1, label: '', amount: '' }],
  multiSelect: false, refType: 'auto', refLabel: '', refFormat: 'any',
  customFields: [],
  methods: { orange: true, mtn: true, card: false, transfer: false },
  qrCodes: { orange: true, mtn: true, card: false, transfer: false },
});

export const METHOD_LABELS: Record<Method, string> = {
  orange: 'Orange Money', mtn: 'MTN MoMo', card: 'Carte bancaire', transfer: 'Virement',
};

/** Données seed (mock) — remplacées par partner-service en Phase 5/8. */
export const SEED_INTERFACES: PaymentInterface[] = [
  {
    id: 'if-1', name: 'Frais de scolarité 2025-2026',
    description: "Paiement des frais de scolarité pour l'année académique 2025-2026.",
    sector: 'Éducation', slug: 'frais-scolarite-2025-2026', customSlug: 'frais-scolarite-2025-2026',
    status: 'actif', tx: 1284, collected: 47620000,
    amountType: 'preset', fixedAmount: '', minAmount: '', maxAmount: '', currency: 'XAF',
    presets: [
      { id: 1, label: 'Inscription', amount: '25000' },
      { id: 2, label: 'Tranche 1', amount: '150000' },
      { id: 3, label: 'Tranche 2', amount: '150000' },
      { id: 4, label: 'Solde', amount: '75000' },
    ],
    multiSelect: true, refType: 'custom', refLabel: 'Matricule élève', refFormat: 'alphanum',
    customFields: [
      { id: 'cf-1', type: 'text', label: 'Matricule élève', required: true },
      { id: 'cf-2', type: 'select', label: 'Classe', required: true, options: ['6e', '5e', '4e', '3e', '2nde', '1ère', 'Terminale'] },
      { id: 'cf-3', type: 'text', label: 'Nom du parent', required: false },
    ],
    methods: { orange: true, mtn: true, card: true, transfer: true },
    qrCodes: { orange: true, mtn: true, card: true, transfer: false },
  },
  {
    id: 'if-2', name: 'Cotisation tontine mensuelle',
    description: 'Collecte mensuelle pour la tontine du groupe Mboa.',
    sector: 'Fintech', slug: 'tontine-mboa', customSlug: 'tontine-mboa',
    status: 'actif', tx: 342, collected: 8550000,
    amountType: 'fixed', fixedAmount: '25000', minAmount: '', maxAmount: '', currency: 'XAF',
    presets: [{ id: 1, label: '', amount: '' }],
    multiSelect: false, refType: 'auto', refLabel: '', refFormat: 'any',
    customFields: [{ id: 'cf-1', type: 'text', label: 'Numéro adhérent', required: true }],
    methods: { orange: true, mtn: true, card: false, transfer: false },
    qrCodes: { orange: true, mtn: true, card: false, transfer: false },
  },
  {
    id: 'if-3', name: 'Don campagne santé', description: '',
    sector: 'ONG / Associatif', slug: 'don-sante', customSlug: 'don-sante',
    status: 'brouillon', tx: 0, collected: 0,
    amountType: 'free', fixedAmount: '', minAmount: '1000', maxAmount: '500000', currency: 'XAF',
    presets: [{ id: 1, label: '', amount: '' }],
    multiSelect: false, refType: 'auto', refLabel: '', refFormat: 'any',
    customFields: [{ id: 'cf-1', type: 'text', label: 'Message (optionnel)', required: false }],
    methods: { orange: true, mtn: false, card: true, transfer: false },
    qrCodes: { orange: true, mtn: false, card: true, transfer: false },
  },
];
