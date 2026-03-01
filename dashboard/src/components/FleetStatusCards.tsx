import { Card, CardContent, Typography, Box } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { orderDetails as mockOrderDetails } from '../data/mockData';
import type { OrderDetail } from '../types';

export function FleetStatusCards({ orderDetails }: { orderDetails?: OrderDetail[] | null }) {
  const rows = orderDetails ?? mockOrderDetails;
  const waits = rows
    .map((o) => o.waitTimeSec)
    .filter((v): v is number => v != null && !Number.isNaN(v));
  const avgWaitSec = waits.length ? waits.reduce((s, v) => s + v, 0) / waits.length : 0;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.0, minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
          Order Status
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AccessTimeIcon sx={{ fontSize: 14, color: '#8b949e' }} />
          <Typography variant="caption" color="text.secondary" fontFamily="JetBrains Mono">
            Avg wait: {waits.length ? `${Math.round(avgWaitSec)}s` : '--'}
          </Typography>
        </Box>
      </Box>
      <Card variant="outlined" sx={{ bgcolor: 'background.paper', flex: 1, minHeight: 0 }}>
        <CardContent sx={{ py: 1, '&:last-child': { pb: 1 }, maxHeight: 400, overflow: 'auto' }}>
          {rows.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No orders yet.
            </Typography>
          )}
          {rows.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.25,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 52, fontWeight: 600 }}>
                Order
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 72, fontWeight: 600 }}>
                Status
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56, fontWeight: 600 }}>
                Demand
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 44, fontWeight: 600 }}>
                Wait
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, fontWeight: 600 }}>
                Spot
              </Typography>
            </Box>
          )}
          {rows.map((o) => (
            <Box
              key={o.orderId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-of-type': { borderBottom: 'none' },
              }}
            >
              <Typography variant="body2" fontFamily="JetBrains Mono" sx={{ minWidth: 52 }}>
                #{o.orderId}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 72 }}>
                {o.orderStatus}
              </Typography>
              <Typography variant="caption" fontFamily="JetBrains Mono" sx={{ minWidth: 56 }}>
                {o.demandKwh != null ? `${o.demandKwh.toFixed(1)} kWh` : '--'}
              </Typography>
              <Typography variant="caption" fontFamily="JetBrains Mono" sx={{ minWidth: 44 }}>
                {o.waitTimeSec != null ? `${Math.round(o.waitTimeSec)}s` : '--'}
              </Typography>
              <Typography variant="caption" fontFamily="JetBrains Mono" sx={{ minWidth: 36 }}>
                S{o.spotIndex ?? '?'}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}
