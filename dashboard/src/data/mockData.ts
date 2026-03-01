import type { RobotStatus, OrderStats, FleetSummary, OrderDetail } from '../types';

export const fleetSummary: FleetSummary = {
  total: 12,
  active: 5,
  idle: 4,
  charging: 3,
};

export const robots: RobotStatus[] = [
  { id: 'R-01', soc: 87, state: 'active', position: { x: 10, y: 0, z: -5 }, heading: 180 },
  { id: 'R-02', soc: 42, state: 'charging', position: { x: -8, y: 0, z: -12 }, heading: 90 },
  { id: 'R-03', soc: 94, state: 'idle', position: { x: 0, y: 0, z: 0 }, heading: 180 },
  { id: 'R-04', soc: 31, state: 'charging', position: { x: 5, y: 0, z: -20 }, heading: 0 },
  { id: 'R-05', soc: 68, state: 'active', position: { x: -15, y: 0, z: 3 }, heading: 270 },
  { id: 'R-06', soc: 100, state: 'idle', position: { x: 12, y: 0, z: 8 }, heading: 180 },
  { id: 'R-07', soc: 55, state: 'active', position: { x: -3, y: 0, z: -8 }, heading: 45 },
  { id: 'R-08', soc: 22, state: 'charging', position: { x: 18, y: 0, z: -15 }, heading: 90 },
  { id: 'R-09', soc: 76, state: 'idle', position: { x: -10, y: 0, z: 5 }, heading: 180 },
  { id: 'R-10', soc: 91, state: 'active', position: { x: 7, y: 0, z: -3 }, heading: 135 },
  { id: 'R-11', soc: 45, state: 'active', position: { x: -20, y: 0, z: -10 }, heading: 0 },
  { id: 'R-12', soc: 63, state: 'idle', position: { x: 2, y: 0, z: 12 }, heading: 270 },
];

export const orderStats: OrderStats = {
  waiting: 0,
  charging: 0,
  completed: 0,
  avgWaitTimeSec: 0,
};

export const orderDetails: OrderDetail[] = [
  {
    orderId: 1,
    vehicleId: 1,
    spotIndex: 5,
    side: 'left',
    orderStatus: 'in_progress',
    vehiclePhase: 'parked',
    needsCharging: true,
    demandKwh: 18,
    waitTimeSec: 120,
  },
  {
    orderId: 2,
    vehicleId: 2,
    spotIndex: 22,
    side: 'right',
    orderStatus: 'completed',
    vehiclePhase: 'leaving',
    needsCharging: false,
    demandKwh: 0,
    waitTimeSec: 95,
  },
];
