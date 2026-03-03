import { useState } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { orderStats as mockOrderStats } from '../data/mockData';
import type { OrderStats, OrderDetail } from '../types';

const SIM_HOURS_PER_YEAR = 24 * 365; // 8760
const DEFAULT_ORDERS_PER_HOUR = 100;

export function OrderStatsPanel({
  orderStats: orderStatsProp,
  totalKwhDelivered: totalKwhDeliveredProp,
  simTimeSec: simTimeSecProp,
  orderDetails: orderDetailsProp,
}: {
  orderStats?: OrderStats | null;
  totalKwhDelivered?: number;
  simTimeSec?: number;
  orderDetails?: OrderDetail[] | null;
}) {
  const orderStats = orderStatsProp ?? mockOrderStats;
  const totalKwhDelivered = totalKwhDeliveredProp ?? 0;
  const simTimeSec = simTimeSecProp ?? 0;
  const orderDetails = orderDetailsProp ?? [];
  const [chargingPricePerKwh] = useState(0.5);
  const [gridPricePerKwh] = useState(0.25);

  const completed = orderStats.completed || 0;
  const totalOrders = orderDetails.length || 0;
  const completionRate = totalOrders > 0 ? completed / totalOrders : 0;

  const revenue = (chargingPricePerKwh - gridPricePerKwh) * totalKwhDelivered;
  const revenuePerOrder = completed > 0 ? revenue / completed : 0;
  const kwhPerOrder = completed > 0 ? totalKwhDelivered / completed : 0;

  const simTimeHours = simTimeSec > 0 ? simTimeSec / 3600 : 0;
  const revenuePerSimHour = simTimeHours > 0 ? revenue / simTimeHours : 0;
  const ordersPerSimHour = simTimeHours > 0 ? completed / simTimeHours : DEFAULT_ORDERS_PER_HOUR;
  // Annual revenue at current completion rate (only completed orders generate revenue)
  const annualEstimatedRevenue =
    simTimeHours > 0
      ? revenuePerSimHour * SIM_HOURS_PER_YEAR
      : revenuePerOrder * DEFAULT_ORDERS_PER_HOUR * SIM_HOURS_PER_YEAR;
  const annualEstimatedOrders =
    simTimeHours > 0 ? ordersPerSimHour * SIM_HOURS_PER_YEAR : DEFAULT_ORDERS_PER_HOUR * SIM_HOURS_PER_YEAR;
  const annualEstimatedKwh = annualEstimatedOrders * (kwhPerOrder || 20);
  // If 100% completion with same order volume, revenue would be higher (for reference)
  const annualRevenueAt100 =
    completionRate > 0 ? annualEstimatedRevenue / completionRate : annualEstimatedRevenue;

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper', height: '100%' }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
          Financial Metrics
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1, alignItems: 'flex-start' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
            <AttachMoneyIcon sx={{ fontSize: 16, color: '#58a6ff' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Energy Delivered
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" display="block" sx={{ fontSize: '0.75rem' }}>
                {totalKwhDelivered.toFixed(1)} kWh
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
            <AttachMoneyIcon sx={{ fontSize: 16, color: '#3fb950' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Total Revenue
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" display="block" color="success.main" sx={{ fontSize: '0.75rem' }}>
                ${revenue.toFixed(2)}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
            <AttachMoneyIcon sx={{ fontSize: 16, color: '#d29922' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Revenue / Order
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" display="block" sx={{ fontSize: '0.75rem' }}>
                ${revenuePerOrder.toFixed(2)}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
            <AttachMoneyIcon sx={{ fontSize: 16, color: '#8b949e' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                kWh / Order
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" display="block" sx={{ fontSize: '0.75rem' }}>
                {kwhPerOrder.toFixed(1)} kWh
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
            <AssessmentIcon sx={{ fontSize: 16, color: '#a371f7' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Completion Rate
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" display="block" sx={{ fontSize: '0.75rem' }}>
                {totalOrders > 0 ? (completionRate * 100).toFixed(1) : '—'}%
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
            <TrendingUpIcon sx={{ fontSize: 16, color: '#a371f7' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Est. Annual Revenue
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" display="block" color="secondary.main" sx={{ fontSize: '0.75rem' }}>
                ${(annualEstimatedRevenue / 1000).toFixed(1)}k
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
                at {totalOrders > 0 ? (completionRate * 100).toFixed(0) : '—'}% completion
              </Typography>
            </Box>
          </Box>
          {totalOrders > 0 && completionRate > 0 && completionRate < 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
              <TrendingUpIcon sx={{ fontSize: 16, color: '#8b949e' }} />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  Est. Annual (if 100%)
                </Typography>
                <Typography variant="body2" fontFamily="JetBrains Mono" display="block" sx={{ fontSize: '0.75rem' }}>
                  ${(annualRevenueAt100 / 1000).toFixed(1)}k
                </Typography>
              </Box>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
            <TrendingUpIcon sx={{ fontSize: 16, color: '#8b949e' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Est. Annual Orders
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" display="block" sx={{ fontSize: '0.75rem' }}>
                {(annualEstimatedOrders / 1000).toFixed(1)}k
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
            <TrendingUpIcon sx={{ fontSize: 16, color: '#8b949e' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Est. Annual kWh
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" display="block" sx={{ fontSize: '0.75rem' }}>
                {(annualEstimatedKwh / 1000).toFixed(1)}k kWh
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 90 }}>
            <AttachMoneyIcon sx={{ fontSize: 16, color: '#8b949e' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Charging Price
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" sx={{ fontSize: '0.75rem' }}>
                {chargingPricePerKwh} $/kWh
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 90 }}>
            <AttachMoneyIcon sx={{ fontSize: 16, color: '#8b949e' }} />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Grid Price
              </Typography>
              <Typography variant="body2" fontFamily="JetBrains Mono" sx={{ fontSize: '0.75rem' }}>
                {gridPricePerKwh} $/kWh
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
