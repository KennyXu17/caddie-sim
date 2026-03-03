import { memo, useState } from 'react';
import { Card, CardContent, Typography, Box, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import SpeedIcon from '@mui/icons-material/Speed';

declare global {
  interface Window {
    __requestSimSpeed?: (scale: number) => void;
    __setOrderSettings?: (opts: { ordersPerHour?: number; avgDemandKwh?: number }) => void;
    __setChargeSettings?: (opts: { cRate?: number; robotBatteryKwh?: number }) => void;
  }
}

const SPEED_OPTIONS: { label: string; scale: number }[] = [
  { label: '1x', scale: 1 },
  { label: '2x', scale: 2 },
  { label: '5x', scale: 5 },
  { label: '10x', scale: 10 },
  { label: '60x', scale: 60 },
  { label: '3600x', scale: 3600 },
];

const ORDER_RATE_OPTIONS = [20, 40, 60, 80, 100, 120, 150];
const AVG_DEMAND_OPTIONS = [10, 20, 30, 40, 50];
const C_RATE_OPTIONS = [1, 2, 5, 10];
const ROBOT_BATTERY_OPTIONS = [100, 200, 400];

export const SettingsPanel = memo(function SettingsPanel() {
  const [speed, setSpeed] = useState<number>(1);
  const [ordersPerHour, setOrdersPerHour] = useState(100);
  const [avgDemandKwh, setAvgDemandKwh] = useState(20);
  const [cRate, setCRate] = useState(10);
  const [robotBatteryKwh, setRobotBatteryKwh] = useState(100);

  const handleSpeed = (scale: number) => {
    setSpeed(scale);
    window.__requestSimSpeed?.(scale);
  };

  const pushOrderSettings = (nextOrdersPerHour: number, nextAvgDemandKwh: number) => {
    window.__setOrderSettings?.({
      ordersPerHour: nextOrdersPerHour,
      avgDemandKwh: nextAvgDemandKwh,
    });
  };

  const pushChargeSettings = (nextCRate: number, nextRobotBatteryKwh: number) => {
    window.__setChargeSettings?.({
      cRate: nextCRate,
      robotBatteryKwh: nextRobotBatteryKwh,
    });
  };

  return (
    <Card variant="outlined" sx={{ mt: 1.5, bgcolor: 'background.paper' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <SpeedIcon sx={{ fontSize: 18 }} /> Setting
        </Typography>
        <Box sx={{ mt: 1, mb: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="sim-speed-label">Sim speed</InputLabel>
            <Select
              labelId="sim-speed-label"
              value={speed}
              label="Sim speed"
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpeed(v);
                handleSpeed(v);
              }}
            >
              {SPEED_OPTIONS.map((opt) => (
                <MenuItem key={opt.scale} value={opt.scale}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          Order settings
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="orders-rate-label">Orders/hour</InputLabel>
            <Select
              labelId="orders-rate-label"
              value={ordersPerHour}
              label="Orders/hour"
              onChange={(e) => {
                const v = Number(e.target.value);
                setOrdersPerHour(v);
                pushOrderSettings(v, avgDemandKwh);
              }}
            >
              {ORDER_RATE_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="avg-demand-label">Avg demand (kWh)</InputLabel>
            <Select
              labelId="avg-demand-label"
              value={avgDemandKwh}
              label="Avg demand (kWh)"
              onChange={(e) => {
                const v = Number(e.target.value);
                setAvgDemandKwh(v);
                pushOrderSettings(ordersPerHour, v);
              }}
            >
              {AVG_DEMAND_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          Charge / discharge
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="c-rate-label">C-rate</InputLabel>
            <Select
              labelId="c-rate-label"
              value={cRate}
              label="C-rate"
              onChange={(e) => {
                const v = Number(e.target.value);
                setCRate(v);
                pushChargeSettings(v, robotBatteryKwh);
              }}
            >
              {C_RATE_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}C
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="robot-batt-label">Robot battery (kWh)</InputLabel>
            <Select
              labelId="robot-batt-label"
              value={robotBatteryKwh}
              label="Robot battery (kWh)"
              onChange={(e) => {
                const v = Number(e.target.value);
                setRobotBatteryKwh(v);
                pushChargeSettings(cRate, v);
              }}
            >
              {ROBOT_BATTERY_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>
                  {v} kWh
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </CardContent>
    </Card>
  );
});
