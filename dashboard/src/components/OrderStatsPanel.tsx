import React, { forwardRef, memo, useImperativeHandle, useRef, type RefObject } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssessmentIcon from '@mui/icons-material/Assessment';
import type { SimulatorState } from '../types';

export interface OrderStatsPanelHandle {
  update: (state: SimulatorState) => void;
}

const SIM_HOURS_PER_YEAR = 24 * 365;
const DEFAULT_ORDERS_PER_HOUR = 100;
const CHARGING_PRICE_PER_KWH = 0.5;
const GRID_PRICE_PER_KWH = 0.25;

const MONO = "'JetBrains Mono', monospace";

function MetricBox({
  icon,
  iconColor,
  label,
  valueRef,
  subRef,
  minWidth = 120,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  valueRef: RefObject<HTMLSpanElement>;
  subRef?: RefObject<HTMLSpanElement>;
  minWidth?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth }}>
      <span style={{ color: iconColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <div>
        <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'block' }}>{label}</span>
        <span ref={valueRef} style={{ fontFamily: MONO, fontSize: '0.75rem', display: 'block', color: '#e6edf3' }}>
          --
        </span>
        {subRef && (
          <span ref={subRef} style={{ fontSize: '0.6rem', color: '#8b949e', display: 'block' }}>
            --
          </span>
        )}
      </div>
    </div>
  );
}

const OrderStatsPanelInner = forwardRef<OrderStatsPanelHandle>(
  function OrderStatsPanelInner(_props, ref) {
    const energyRef = useRef<HTMLSpanElement>(null);
    const revenueRef = useRef<HTMLSpanElement>(null);
    const revPerOrderRef = useRef<HTMLSpanElement>(null);
    const kwhPerOrderRef = useRef<HTMLSpanElement>(null);
    const completionRef = useRef<HTMLSpanElement>(null);
    const annualRevRef = useRef<HTMLSpanElement>(null);
    const annualRevSubRef = useRef<HTMLSpanElement>(null);
    const annualRev100Ref = useRef<HTMLSpanElement>(null);
    const annualRev100BoxRef = useRef<HTMLDivElement>(null);
    const annualOrdersRef = useRef<HTMLSpanElement>(null);
    const annualKwhRef = useRef<HTMLSpanElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        update(state) {
          const kwh = state.totalKwhDelivered ?? 0;
          const simTimeSec = state.simTimeSec ?? 0;
          const orderDetails = state.orderDetails ?? [];
          const orderStats = state.orderStats;

          const completed = orderStats?.completed ?? 0;
          const totalOrders = orderDetails.length;
          const completionRate = totalOrders > 0 ? completed / totalOrders : 0;

          const revenue = (CHARGING_PRICE_PER_KWH - GRID_PRICE_PER_KWH) * kwh;
          const revenuePerOrder = completed > 0 ? revenue / completed : 0;
          const kwhPerOrder = completed > 0 ? kwh / completed : 0;

          const simTimeHours = simTimeSec > 0 ? simTimeSec / 3600 : 0;
          const revenuePerSimHour = simTimeHours > 0 ? revenue / simTimeHours : 0;
          const ordersPerSimHour =
            simTimeHours > 0 ? completed / simTimeHours : DEFAULT_ORDERS_PER_HOUR;

          const annualEstimatedRevenue =
            simTimeHours > 0
              ? revenuePerSimHour * SIM_HOURS_PER_YEAR
              : revenuePerOrder * DEFAULT_ORDERS_PER_HOUR * SIM_HOURS_PER_YEAR;
          const annualEstimatedOrders =
            simTimeHours > 0
              ? ordersPerSimHour * SIM_HOURS_PER_YEAR
              : DEFAULT_ORDERS_PER_HOUR * SIM_HOURS_PER_YEAR;
          const annualEstimatedKwh = annualEstimatedOrders * (kwhPerOrder || 20);
          const annualRevenueAt100 =
            completionRate > 0
              ? annualEstimatedRevenue / completionRate
              : annualEstimatedRevenue;

          const pct = totalOrders > 0 ? (completionRate * 100).toFixed(1) : '—';

          if (energyRef.current) energyRef.current.textContent = `${kwh.toFixed(1)} kWh`;
          if (revenueRef.current) {
            revenueRef.current.textContent = `$${revenue.toFixed(2)}`;
            revenueRef.current.style.color = '#3fb950';
          }
          if (revPerOrderRef.current)
            revPerOrderRef.current.textContent = `$${revenuePerOrder.toFixed(2)}`;
          if (kwhPerOrderRef.current)
            kwhPerOrderRef.current.textContent = `${kwhPerOrder.toFixed(1)} kWh`;
          if (completionRef.current) completionRef.current.textContent = `${pct}%`;
          if (annualRevRef.current)
            annualRevRef.current.textContent = `$${(annualEstimatedRevenue / 1000).toFixed(1)}k`;
          if (annualRevSubRef.current)
            annualRevSubRef.current.textContent = `at ${pct} completion`;
          if (annualOrdersRef.current)
            annualOrdersRef.current.textContent = `${(annualEstimatedOrders / 1000).toFixed(1)}k`;
          if (annualKwhRef.current)
            annualKwhRef.current.textContent = `${(annualEstimatedKwh / 1000).toFixed(1)}k kWh`;

          // Show/hide "at 100%" box
          const show100 = totalOrders > 0 && completionRate > 0 && completionRate < 1;
          if (annualRev100BoxRef.current) {
            annualRev100BoxRef.current.style.display = show100 ? 'flex' : 'none';
          }
          if (annualRev100Ref.current)
            annualRev100Ref.current.textContent = `$${(annualRevenueAt100 / 1000).toFixed(1)}k`;
        },
      }),
      [],
    );

    return (
      <Card variant="outlined" sx={{ bgcolor: 'background.paper', height: '100%' }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
            Financial Metrics
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1, alignItems: 'flex-start' }}>
            <MetricBox
              icon={<AttachMoneyIcon style={{ fontSize: 16 }} />}
              iconColor="#58a6ff"
              label="Energy Delivered"
              valueRef={energyRef}
            />
            <MetricBox
              icon={<AttachMoneyIcon style={{ fontSize: 16 }} />}
              iconColor="#3fb950"
              label="Total Revenue"
              valueRef={revenueRef}
            />
            <MetricBox
              icon={<AttachMoneyIcon style={{ fontSize: 16 }} />}
              iconColor="#d29922"
              label="Revenue / Order"
              valueRef={revPerOrderRef}
            />
            <MetricBox
              icon={<AttachMoneyIcon style={{ fontSize: 16 }} />}
              iconColor="#8b949e"
              label="kWh / Order"
              valueRef={kwhPerOrderRef}
            />
            <MetricBox
              icon={<AssessmentIcon style={{ fontSize: 16 }} />}
              iconColor="#a371f7"
              label="Completion Rate"
              valueRef={completionRef}
            />
            <MetricBox
              icon={<TrendingUpIcon style={{ fontSize: 16 }} />}
              iconColor="#a371f7"
              label="Est. Annual Revenue"
              valueRef={annualRevRef}
              subRef={annualRevSubRef}
            />
            {/* "at 100%" box — shown/hidden via direct style.display */}
            <div
              ref={annualRev100BoxRef}
              style={{ display: 'none', alignItems: 'center', gap: 6, minWidth: 120 }}
            >
              <span style={{ color: '#8b949e', display: 'flex', alignItems: 'center' }}>
                <TrendingUpIcon style={{ fontSize: 16 }} />
              </span>
              <div>
                <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'block' }}>
                  Est. Annual (if 100%)
                </span>
                <span
                  ref={annualRev100Ref}
                  style={{ fontFamily: MONO, fontSize: '0.75rem', display: 'block', color: '#e6edf3' }}
                >
                  --
                </span>
              </div>
            </div>
            <MetricBox
              icon={<TrendingUpIcon style={{ fontSize: 16 }} />}
              iconColor="#8b949e"
              label="Est. Annual Orders"
              valueRef={annualOrdersRef}
            />
            <MetricBox
              icon={<TrendingUpIcon style={{ fontSize: 16 }} />}
              iconColor="#8b949e"
              label="Est. Annual kWh"
              valueRef={annualKwhRef}
            />
            {/* Static price display (no live update needed) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
              <span style={{ color: '#8b949e', display: 'flex', alignItems: 'center' }}>
                <AttachMoneyIcon style={{ fontSize: 16 }} />
              </span>
              <div>
                <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'block' }}>
                  Charging Price
                </span>
                <span style={{ fontFamily: MONO, fontSize: '0.75rem', color: '#e6edf3' }}>
                  {CHARGING_PRICE_PER_KWH} $/kWh
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
              <span style={{ color: '#8b949e', display: 'flex', alignItems: 'center' }}>
                <AttachMoneyIcon style={{ fontSize: 16 }} />
              </span>
              <div>
                <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'block' }}>
                  Grid Price
                </span>
                <span style={{ fontFamily: MONO, fontSize: '0.75rem', color: '#e6edf3' }}>
                  {GRID_PRICE_PER_KWH} $/kWh
                </span>
              </div>
            </div>
          </Box>
        </CardContent>
      </Card>
    );
  },
);

export const OrderStatsPanel = memo(OrderStatsPanelInner);
