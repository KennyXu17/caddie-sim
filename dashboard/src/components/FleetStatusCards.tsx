import { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { OrderDetail } from '../types';

export interface FleetStatusCardsHandle {
  update: (orders: OrderDetail[] | null) => void;
}

function statusColor(status: string): string {
  if (status === 'completed') return '#3fb950';
  if (status === 'charging') return '#58a6ff';
  if (status === 'waiting') return '#d29922';
  return '#8b949e';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ROW_STYLE =
  'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1)';
const LAST_ROW_STYLE =
  'display:flex;align-items:center;gap:8px;padding:4px 0';
const MONO = "font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#e6edf3";
const DIM = 'font-size:0.75rem;color:#8b949e';

// Inner component that holds all refs and imperative logic
const FleetStatusCardsInner = forwardRef<FleetStatusCardsHandle>(
  function FleetStatusCardsInner(_props, ref) {
    const listRef = useRef<HTMLDivElement>(null);
    const avgRef = useRef<HTMLSpanElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        update(orders) {
          const rows = orders ?? [];

          if (avgRef.current) {
            const waits = rows
              .filter((o) => o.waitTimeSec != null && !Number.isNaN(o.waitTimeSec))
              .map((o) => o.waitTimeSec as number);
            const avg = waits.length
              ? waits.reduce((a, b) => a + b, 0) / waits.length
              : 0;
            avgRef.current.textContent = waits.length
              ? `Avg wait: ${Math.round(avg)}s`
              : 'Avg wait: --';
          }

          const listEl = listRef.current;
          if (!listEl) return;

          if (rows.length === 0) {
            listEl.innerHTML =
              '<p style="font-size:0.875rem;color:#8b949e;margin:0">No orders yet.</p>';
            return;
          }

          const scrollTop = listEl.scrollTop;
          let html = '';
          for (let i = 0; i < rows.length; i++) {
            const o = rows[i];
            const style = i === rows.length - 1 ? LAST_ROW_STYLE : ROW_STYLE;
            const sColor = statusColor(o.orderStatus ?? '');
            html +=
              `<div style="${style}">` +
              `<span style="${MONO};min-width:52px">#${o.orderId}</span>` +
              `<span style="${DIM};min-width:72px;color:${sColor}">${esc(o.orderStatus ?? '')}</span>` +
              `<span style="${MONO};min-width:56px">${o.demandKwh != null ? o.demandKwh.toFixed(1) + ' kWh' : '--'}</span>` +
              `<span style="${MONO};min-width:44px">${o.waitTimeSec != null ? Math.round(o.waitTimeSec) + 's' : '--'}</span>` +
              `<span style="${MONO};min-width:36px">S${o.spotIndex ?? '?'}</span>` +
              `</div>`;
          }
          listEl.innerHTML = html;
          listEl.scrollTop = scrollTop;
        },
      }),
      [],
    );

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.0, minHeight: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
            Order Status
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AccessTimeIcon sx={{ fontSize: 14, color: '#8b949e' }} />
            <Typography
              variant="caption"
              color="text.secondary"
              fontFamily="JetBrains Mono"
              component="span"
              ref={avgRef}
            >
              Avg wait: --
            </Typography>
          </Box>
        </Box>
        <Card variant="outlined" sx={{ bgcolor: 'background.paper', flex: 1, minHeight: 0 }}>
          <CardContent sx={{ py: 1, '&:last-child': { pb: 1 }, maxHeight: 400, overflow: 'auto' }}>
            {/* Static header row */}
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
            {/* List area — populated entirely by direct DOM, never re-rendered by React */}
            <div ref={listRef}>
              <p style={{ fontSize: '0.875rem', color: '#8b949e', margin: 0 }}>No orders yet.</p>
            </div>
          </CardContent>
        </Card>
      </Box>
    );
  },
);

export const FleetStatusCards = memo(FleetStatusCardsInner);
