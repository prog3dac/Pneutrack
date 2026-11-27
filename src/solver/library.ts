import { BAR, P_ATM, SEAL_PRESSURE_FRICTION, VISCOUS_PER_PERIMETER } from "../solver/constants";
import { cFromDm3 } from "../solver/flow";

/** Elemento di flusso tra due nodi (orifizio ISO 6358). */
export interface FlowElement {
  a: number;
  b: number;
  C: number; // [m³/(s·Pa)]
  bcrit: number;
  /** se presente, attivo solo quando l'input del componente vale `value` */
  when?: { input: string; value: number };
  /** se presente, il flusso è ammesso solo in quella direzione */
  direction?: "ab" | "ba";
}

export interface CylinderSpec {
  id: string;
  capNode: number;
  rodNode: number;
  A1: number;
  A2: number;
  stroke: number;
  Vcap0: number;
  Vrod0: number;
  mass: number;
  load: number;
  frictionCoulomb: number;
  frictionViscous: number;
  /** attrito delle guarnizioni che cresce con la pressione relativa delle camere [-] */
  frictionPressure: number;
  x0: number;
}

export interface BuildResult {
  elements?: FlowElement[];
  fixed?: { node: number; pressure: number }[];
  cylinders?: CylinderSpec[];
}

export interface ComponentDef {
  type: string;
  label: string;
  ports: string[];
  /** porte che, se non collegate, sono aperte all'atmosfera */
  exhaustPorts?: string[];
  defaults: Record<string, number>;
  build(id: string, p: Record<string, number>, node: (port: string) => number): BuildResult;
}

const orifice = (a: number, b: number, c: number, bc: number, extra: Partial<FlowElement> = {}): FlowElement => ({
  a,
  b,
  C: cFromDm3(c),
  bcrit: bc,
  ...extra,
});

const valveDefaults = { C_dm3_s_bar: 1.5, b: 0.35 };

const defs: ComponentDef[] = [
  {
    type: "supply",
    label: "Alimentazione",
    ports: ["out"],
    defaults: { pressure_bar_g: 6 },
    build: (_id, p, n) => ({ fixed: [{ node: n("out"), pressure: p.pressure_bar_g! * BAR + P_ATM }] }),
  },
  {
    type: "atmosphere",
    label: "Atmosfera",
    ports: ["a"],
    defaults: {},
    build: (_id, _p, n) => ({ fixed: [{ node: n("a"), pressure: P_ATM }] }),
  },
  {
    type: "valve52",
    label: "Valvola 5/2",
    ports: ["1", "2", "3", "4", "5"],
    exhaustPorts: ["3", "5"],
    defaults: valveDefaults,
    // input = 0: 1→2 e 4→5 (riposo); input = 1: 1→4 e 2→3 (azionata)
    build(id, p, n) {
      const c = p.C_dm3_s_bar!, b = p.b!;
      const w = (v: number) => ({ input: id, value: v });
      return {
        elements: [
          orifice(n("1"), n("2"), c, b, { when: w(0) }),
          orifice(n("4"), n("5"), c, b, { when: w(0) }),
          orifice(n("1"), n("4"), c, b, { when: w(1) }),
          orifice(n("2"), n("3"), c, b, { when: w(1) }),
        ],
      };
    },
  },
  {
    type: "valve32",
    label: "Valvola 3/2 NC",
    ports: ["1", "2", "3"],
    exhaustPorts: ["3"],
    defaults: valveDefaults,
    // input = 0: 2→3 (scarico); input = 1: 1→2
    build(id, p, n) {
      const w = (v: number) => ({ input: id, value: v });
      return {
        elements: [
          orifice(n("2"), n("3"), p.C_dm3_s_bar!, p.b!, { when: w(0) }),
          orifice(n("1"), n("2"), p.C_dm3_s_bar!, p.b!, { when: w(1) }),
        ],
      };
    },
  },
  {
    type: "throttle",
    label: "Strozzatore",
    ports: ["1", "2"],
    defaults: { C_dm3_s_bar: 0.3, b: 0.5 },
    build: (_id, p, n) => ({ elements: [orifice(n("1"), n("2"), p.C_dm3_s_bar!, p.b!)] }),
  },
  {
    type: "oneWayThrottle",
    label: "Regolatore unidirezionale",
    ports: ["1", "2"],
    // 1→2 strozzato; 2→1 libero attraverso il ritegno
    defaults: { C_dm3_s_bar: 0.3, b: 0.5, Cfree_dm3_s_bar: 1.5, bfree: 0.35 },
    build: (_id, p, n) => ({
      elements: [
        orifice(n("1"), n("2"), p.C_dm3_s_bar!, p.b!, { direction: "ab" }),
        orifice(n("1"), n("2"), p.Cfree_dm3_s_bar!, p.bfree!, { direction: "ba" }),
      ],
    }),
  },
  {
    type: "checkValve",
    label: "Valvola di non ritorno",
    ports: ["in", "out"],
    defaults: { C_dm3_s_bar: 1.5, b: 0.35 },
    build: (_id, p, n) => ({ elements: [orifice(n("in"), n("out"), p.C_dm3_s_bar!, p.b!, { direction: "ab" })] }),
  },
  {
    type: "cylinderDA",
    label: "Cilindro doppio effetto",
    ports: ["cap", "rod"],
    defaults: {
      bore_mm: 32,
      rod_mm: 12,
      stroke_mm: 100,
      deadVolumeCap_cm3: 5,
      deadVolumeRod_cm3: 5,
      mass_kg: 1,
      load_N: 0,
      frictionCoulomb_N: 5,
      x0_mm: 0,
    },
    build(id, p, n) {
      const A1 = (Math.PI * (p.bore_mm! / 1000) ** 2) / 4;
      const A2 = A1 - (Math.PI * (p.rod_mm! / 1000) ** 2) / 4;
      return {
        cylinders: [
          {
            id,
            capNode: n("cap"),
            rodNode: n("rod"),
            A1,
            A2,
            stroke: p.stroke_mm! / 1000,
            Vcap0: p.deadVolumeCap_cm3! * 1e-6,
            Vrod0: p.deadVolumeRod_cm3! * 1e-6,
            mass: p.mass_kg!,
            load: p.load_N!,
            frictionCoulomb: p.frictionCoulomb_N!,
            // se manca, dalla circonferenza del pistone come nello schema dell'editor
            frictionViscous: p.frictionViscous_Ns_m ?? VISCOUS_PER_PERIMETER * Math.PI * (p.bore_mm! / 1000),
            frictionPressure: p.frictionPressure ?? SEAL_PRESSURE_FRICTION,
            x0: p.x0_mm! / 1000,
          },
        ],
      };
    },
  },
];

export const library: ReadonlyMap<string, ComponentDef> = new Map(defs.map((d) => [d.type, d]));
