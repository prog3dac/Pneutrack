/**
 * Formato JSON di uno schema pneumatico (versione 1).
 * Unità "da catalogo": bar relativi, mm, cm³, dm³/(s·bar), kg, N.
 */
export const SCHEMA_VERSION = 1;

/** Riferimento a una porta: "idComponente.porta", es. "V1.4". */
export type PortRef = string;

export interface ComponentInstance {
  id: string;
  type: string;
  params?: Record<string, number>;
}

export interface Connection {
  from: PortRef;
  to: PortRef;
}

export interface Schema {
  version: typeof SCHEMA_VERSION;
  /** Volume di ogni nodo di raccordo/tubo [cm³] (default 1). */
  nodeVolume_cm3?: number;
  /** Temperatura dell'aria [°C] (default 20). */
  temperature_C?: number;
  components: ComponentInstance[];
  connections: Connection[];
}

export type Diagnostic = { level: "error" | "warning"; message: string };

export function splitPortRef(ref: PortRef): [string, string] | null {
  const i = ref.lastIndexOf(".");
  if (i <= 0 || i === ref.length - 1) return null;
  return [ref.slice(0, i), ref.slice(i + 1)];
}
