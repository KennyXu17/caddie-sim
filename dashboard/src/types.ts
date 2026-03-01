export type RobotStateLabel = 'active' | 'idle' | 'charging';

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
