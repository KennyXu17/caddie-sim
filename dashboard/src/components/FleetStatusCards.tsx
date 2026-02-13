import { Card, CardContent, Typography, Box } from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PowerIcon from '@mui/icons-material/Power';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { fleetSummary as mockFleetSummary } from '../data/mockData';
import type { FleetSummary } from '../types';

const cardDefs = [
  { key: 'total' as const, label: 'Total Robots', getValue: (s: FleetSummary) => s.total, icon: DirectionsCarIcon, color: '#58a6ff' },
  { key: 'active' as const, label: 'Active', getValue: (s: FleetSummary) => s.active, icon: PowerIcon, color: '#3fb950' },
  { key: 'idle' as const, label: 'Idle', getValue: (s: FleetSummary) => s.idle, icon: HourglassEmptyIcon, color: '#8b949e' },
  { key: 'charging' as const, label: 'Charging', getValue: (s: FleetSummary) => s.charging, icon: BatteryChargingFullIcon, color: '#d29922' },
];

export function FleetStatusCards({ fleetSummary }: { fleetSummary?: FleetSummary | null }) {
  const summary = fleetSummary ?? mockFleetSummary;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
        Fleet Status
      </Typography>
      {cardDefs.map(({ key, label, getValue, icon: Icon, color }) => (
        <Card key={key} variant="outlined" sx={{ bgcolor: 'background.paper' }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Icon sx={{ fontSize: 20, color }} />
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
              </Box>
              <Typography variant="h6" fontFamily="JetBrains Mono">
                {getValue(summary)}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
