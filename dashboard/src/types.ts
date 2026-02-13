export type RobotStateLabel = 'active' | 'idle' | 'charging';

export interface RobotStatus {
  id: string;
  soc: number;
  state: string; // from sim: 'idle'|'navigating'|'charging'|'selfCharging'|'returning'
  position?: { x: number; y?: number; z: number };
}

export interface SimulatorState {
  fleetSummary: FleetSummary;
  robots: RobotStatus[];
  orderStats: OrderStats;
  totalKwhDelivered?: number;
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
