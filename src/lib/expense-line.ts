import { Prisma } from "@prisma/client";

/**
 * Hoy como `Date` UTC a medianoche. Es el default de `occurredOn` cuando el
 * que crea la línea no conoce la fecha real del gasto (cargas manuales por
 * chat, fotos, Revolut sin `bookingDate`, etc.). Lo dejamos sin hora para que
 * la deduplicación a nivel DB no varíe entre zonas horarias.
 */
export function todayUtcDate(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Parsea un string ISO `yyyy-MM-dd` en un `Date` UTC a medianoche. Devuelve
 * null si el input es inválido o no representa una fecha real.
 */
export function parseIsoDate(input: string | undefined | null): Date | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

/**
 * `true` si el error es una violación de constraint único de Prisma (P2002).
 * La usamos para tratar duplicados como "ya estaba registrado" en flujos de
 * importación (Revolut, foto/CSV via agent) en vez de propagar 500 al usuario.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
