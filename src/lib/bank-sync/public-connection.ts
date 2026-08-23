export type PublicBankConnection = {
  id: string;
  institutionName: string;
  institutionCountry: string;
  status: string;
  validUntil: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  expiresSoon: boolean;
  accounts: Array<{
    id: string;
    name: string | null;
    ibanMasked: string | null;
    currency: string;
    bankName: string | null;
  }>;
};
