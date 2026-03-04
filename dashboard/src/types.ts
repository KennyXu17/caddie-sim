export type RobotStateLabel = 'active' | 'idle' | 'charging';

// ── Renderer / performance settings ──────────────────────────────────────────
export type RenderQuality = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface RenderConfig {
  quality: RenderQuality;
  /** Internal render resolution multiplier (1 = native, 2 = 4× pixels) */
  ssaa: number;
  /** Shadow map size in pixels (one side) */
  shadowRes: number;
  /** Screen-Space Ambient Occlusion (expensive; GPU-only recommended) */
  ssao: boolean;
  /** Unreal Bloom post-process */
  bloom: boolean;
  /** Device pixel ratio cap: 1 = logical pixels (fast), 2 = Retina/HiDPI (4× GPU cost!) */
  dpr: number;
}

// Mirrors the presets in main_sim.js _renderConfig
export const RENDER_PRESETS: Record<Exclude<RenderQuality, 'custom'>, Omit<RenderConfig, 'quality'>> = {
  //  ultra: full quality, dedicated GPU only
  ultra:  { ssaa: 2,   shadowRes: 2048, ssao: true,  bloom: true,  dpr: 2 },
  //  high: SSAO on, no Bloom, 2048 shadow — mid-range GPU
  high:   { ssaa: 1,   shadowRes: 2048, ssao: true,  bloom: false, dpr: 1 },
  //  medium: default — fast on iGPU / Retina laptops (no SSAO/Bloom, DPR=1)
  medium: { ssaa: 1,   shadowRes: 1024, ssao: false, bloom: false, dpr: 1 },
  //  low: minimal GPU — targets 60fps on any hardware
  low:    { ssaa: 1,   shadowRes: 512,  ssao: false, bloom: false, dpr: 1 },
};

export const DEFAULT_RENDER_CONFIG: RenderConfig = { quality: 'ultra', ...RENDER_PRESETS.ultra };

export interface RobotStatus {
  id: string;
  soc: number;
  state: string; // from sim: 'idle'|'navigating'|'charging'|'selfCharging'|'returning'
  position?: { x: number; y?: number; z: number };
  heading?: number; // 0°=North(-Z), 90°=East(+X), 180°=South(+Z), 270°=West(-X)
}

export interface SimulatorState {
  simTimeSec?: number;
  fleetSummary: FleetSummary;
  robots: RobotStatus[];
  orderStats: OrderStats;
  totalKwhDelivered?: number;
  orderDetails?: OrderDetail[];
}

export interface OrderStats {
  waiting: number;   // in spot but not yet charging
  charging: number;  // currently being charged
  completed: number; // charging over
  avgWaitTimeSec: number; // from car arrived at spot to beginning charging
}

export interface FleetSummary {
  total: number;
  active: number;
  idle: number;
  charging: number;
}

export interface OrderDetail {
  orderId: number;
  vehicleId: number | null;
  spotIndex: number;
  side: 'left' | 'right';
  orderStatus: string;
  vehiclePhase?: string | null;
  needsCharging?: boolean | null;
  demandKwh?: number | null;
  waitTimeSec?: number | null;
}
