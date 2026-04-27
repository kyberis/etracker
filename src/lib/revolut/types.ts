export type ImportableTransaction = {
  transactionId: string;
  amount: string;
  currency?: string;
  bookingDate?: string;
  description: string;
};

export type MatchedLine = {
  lineId: string;
  lineName: string;
  transactionId: string;
  amount: string;
};
