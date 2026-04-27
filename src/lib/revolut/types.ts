export type ImportableTransaction = {
  transactionId: string;
  amount: string;
  currency?: string;
  bookingDate?: string;
  description: string;
  /** Categoría sugerida por el asistente según las instrucciones del usuario. */
  suggestedCategory?: string;
  /** Nota breve del asistente (p. ej. motivo de la categoría). */
  assistantNote?: string;
};

export type MatchedLine = {
  lineId: string;
  lineName: string;
  transactionId: string;
  amount: string;
};
