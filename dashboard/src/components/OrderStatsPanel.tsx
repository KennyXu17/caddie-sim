import { useState } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ElectricCarIcon from '@mui/icons-material/ElectricCar';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { orderStats as mockOrderStats } from '../data/mockData';
import type { OrderStats } from '../types';

const orderItemDefs = [
  { key: 'waiting' as const, label: 'Waiting', getValue: (s: OrderStats) => s.waiting, icon: ScheduleIcon, color: '#d29922' },
  { key: 'charging' as const, label: 'Assigned', getValue: (s: OrderStats) => s.charging, icon: ElectricCarIcon, color: '#58a6ff' },
  { key: 'completed' as const, label: 'Completed', getValue: (s: OrderStats) => s.completed, icon: CheckCircleIcon, color: '#3fb950' },
  { key: 'avgWait' as const, label: 'Avg wait (s)', getValue: (s: OrderStats) => s.avgWaitTimeSec, icon: AccessTimeIcon, color: '#8b949e' },
];

export function OrderStatsPanel({
  orderStats: orderStatsProp,
  totalKwhDelivered: totalKwhDeliveredProp,
}: {
  orderStats?: OrderStats | null;
  totalKwhDelivered?: number;
}) {
  const orderStats = orderStatsProp ?? mockOrderStats;
  const totalKwhDelivered = totalKwhDeliveredProp ?? 0;
  const [chargingPricePerKwh] = useState(0.5);
  const [gridPricePerKwh] = useState(0.25);
  const revenue = (chargingPricePerKwh - gridPricePerKwh) * totalKwhDelivered;

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', height: '100%' }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
          Order Statistics
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.5, alignItems: 'flex-start' }}>
          {orderItemDefs.map(({ key, label, getValue, icon: Icon, color }) => (
            <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
              <Icon sx={{ fontSize: 22, color }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="h6" fontFamily="JetBrains Mono" display="block">
                  {getValue(orderStats)}
                </Typography>
              </Box>
            </Box>
          ))}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
            <AttachMoneyIcon sx={{ fontSize: 22, color: '#8b949e' }} />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Charging Price
              </Typography>
              <Typography variant="h6" fontFamily="JetBrains Mono" display="block">
                {chargingPricePerKwh} $/kWh
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
            <AttachMoneyIcon sx={{ fontSize: 22, color: '#8b949e' }} />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Grid Price
              </Typography>
              <Typography variant="h6" fontFamily="JetBrains Mono" display="block">
                {gridPricePerKwh} $/kWh
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
            <AttachMoneyIcon sx={{ fontSize: 22, color: '#3fb950' }} />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Revenue
              </Typography>
              <Typography variant="h6" fontFamily="JetBrains Mono" display="block" color="success.main">
                ${revenue.toFixed(2)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
