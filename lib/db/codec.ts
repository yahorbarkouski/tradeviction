function fail(field: string, got: unknown): never {
  throw new Error(`bad row field ${field}: ${typeof got}`);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function str(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") fail(key, value);
  return value;
}

export function strNull(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail(key, value);
  return value;
}

export function int(row: Record<string, unknown>, key: string): number {
  const parsed = asFiniteNumber(row[key]);
  if (parsed === null) fail(key, row[key]);
  return parsed;
}

export function intNull(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  const parsed = asFiniteNumber(value);
  if (parsed === null) fail(key, value);
  return parsed;
}

export function intish(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (value === null || value === undefined) return 0;
  const parsed = asFiniteNumber(value);
  if (parsed === null) fail(key, value);
  return parsed;
}

export function num(row: Record<string, unknown>, key: string): number {
  const parsed = asFiniteNumber(row[key]);
  if (parsed === null) fail(key, row[key]);
  return parsed;
}

export function numNull(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  const parsed = asFiniteNumber(value);
  if (parsed === null) fail(key, value);
  return parsed;
}
