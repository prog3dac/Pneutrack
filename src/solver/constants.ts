/** Costanti fisiche e condizioni di riferimento ANR (ISO 8778). */
export const R_AIR = 287.05; // J/(kg·K)
export const KAPPA = 1.4;
export const P_ATM = 101325; // Pa
export const T_REF = 293.15; // K (20 °C)
export const RHO_ANR = 1.185; // kg/m³ a 20 °C, 100 kPa ass., 65% UR
export const BAR = 1e5; // Pa

/**
 * Attrito delle guarnizioni dei cilindri dovuto alla pressione: frazione della forza della pressione relativa
 * di ogni camera che si aggiunge all'attrito coulombiano (le labbra premono di più sulla canna quando la camera
 * è in pressione; i cataloghi danno un attrito del 3–8 % della forza teorica).
 */
export const SEAL_PRESSURE_FRICTION = 0.03;
/**
 * Attrito viscoso dei cilindri per metro di circonferenza del pistone [N·s/m²]: cresce con la lunghezza delle
 * guarnizioni, ≈ 100 N·s/m per l'alesaggio 32 (valori misurati in letteratura: 50–150 N·s/m).
 */
export const VISCOUS_PER_PERIMETER = 1000;
