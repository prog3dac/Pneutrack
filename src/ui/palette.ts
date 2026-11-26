/**
 * Voci della palette dell'editor e sigle dei componenti. Stanno qui, e non nell'editor, perché
 * anche il catalogo dei simboli (simboli.html) le usa: così le due pagine non si disallineano.
 */
import type { ComponentData, TypeDef } from "../model/components";

/** Prefisso della sigla di ogni tipo: il primo componente inserito si chiama prefisso + 1 (V1, C1…). */
export const DESIGNATION_PREFIX: Record<string, string> = {
  pressure_source: "P", pressure_regulator: "R", silencer: "SL", exhaust: "S", plug: "T", junction: "N",
  directional_valve: "V", flow_control_valve: "F", single_acting_cylinder: "C",
  double_acting_cylinder: "C", double_rod_cylinder: "C", rotary_actuator: "RA",
  air_reservoir: "SB", air_filter: "FI", lubricator: "LU", frl_unit: "FRL", pressure_gauge: "M",
  check_valve: "NR", pilot_check_valve: "NRP", shuttle_valve: "OR", and_valve: "AND",
  quick_exhaust_valve: "SR", one_way_flow_control: "RF", relief_valve: "VS", sequence_valve: "SQ",
  time_delay_valve: "TM", air_motor: "MP",
  shutoff_valve: "RB", lockout_valve: "SZ", quick_coupling: "IR", fixed_orifice: "UG", soft_start_valve: "AP",
  double_pilot_check: "NRD", rodless_cylinder: "C", gripper: "PZ", vacuum_ejector: "EV", suction_cup: "VT",
  compressor: "CP", vacuum_pump: "PV", filter_regulator: "FR", air_dryer: "ES", three_way_cock: "RB",
  flexible_hose: "TF", rotary_joint: "GR", manifold: "BD", sheet_reference: "RM", roller_flow_control: "RF",
  relieving_regulator: "R", piloted_regulator: "R", proportional_regulator: "RP", pressure_intensifier: "MT",
  locking_cylinder: "C", end_lock_cylinder: "C", bellows_cylinder: "C", diaphragm_cylinder: "C", pneumatic_muscle: "MU",
  pressure_sensor: "BP", pressure_indicator: "IN", flow_meter: "FM", differential_gauge: "M", thermometer: "TT",
  // circuito elettrico: sigle didattiche (S comandi, K relè, KT temporizzatori, Y bobine, B sensori, H lampade)
  electric_supply: "G", pushbutton: "S", limit_switch: "S", relay_coil: "K", timer_relay: "KT",
  relay_contact: "KA", valve_solenoid: "Y", proximity_sensor: "B", pressure_switch: "BP", signal_lamp: "H",
  wire_junction: "N", wire_reference: "RE",
};

/** Prefisso della sigla di un tipo ("X" se il tipo non ne ha uno). */
export const designationPrefix = (type: string): string => DESIGNATION_PREFIX[type] || "X";

/** Voce della palette: un tipo con le opzioni di una sua configurazione. */
export interface PaletteItem { type: TypeDef; preset: number; label: string; data: ComponentData }

/** Voci della palette, nell'ordine in cui compaiono: una per configurazione predefinita, oppure una sola per tipo. */
export function paletteItems(catalog: TypeDef[]): PaletteItem[] {
  return catalog.filter((t) => !t.hidden).flatMap((t) => (t.presets ?? [{ label: t.label }]).map((preset, i) => ({
    type: t, preset: t.presets ? i : -1, label: preset.label,
    data: { id: "", type: t.type, params: { ...t.defaults, ...preset.params },
            ...Object.fromEntries((t.options ?? []).map((o) => [o.name, preset.options?.[o.name] ?? o.default])) },
  })));
}

/** Sezioni della palette, nell'ordine dei tipi (solo quelle con almeno un tipo visibile). */
export const paletteCategories = (catalog: TypeDef[]): string[] =>
  [...new Set(catalog.filter((t) => !t.hidden).map((t) => t.category))];
