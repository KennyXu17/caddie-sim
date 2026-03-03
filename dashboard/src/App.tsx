import { useEffect, useRef, useState } from 'react';
import { ThemeProvider, CssBaseline, Box, Paper, Typography } from '@mui/material';
import { dashboardTheme } from './theme';
import { FleetStatusCards } from './components/FleetStatusCards';
import { SOCPanel } from './components/SOCPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { OrderStatsPanel } from './components/OrderStatsPanel';
import type { SimulatorState } from './types';

/** 仿真页 URL：单独打开时只跑 sim，与 dashboard 不同主线程，避免 React 重绘导致卡顿 */
const SIM_URL = typeof window !== 'undefined' ? new URL('/', window.location.href).href : '';

declare global {
  interface Window {
    __simulatorContainer?: HTMLElement | null;
    __dashboardSetState?: ((state: SimulatorState) => void) | null;
    __requestSimSpeed?: (scale: number) => void;
    __requestFollowRobot?: (id: number | null) => void;
    __setOrderSettings?: (opts: { ordersPerHour?: number; avgDemandKwh?: number; demandStdKwh?: number }) => void;
    __setChargeSettings?: (opts: { cRate?: number; robotBatteryKwh?: number }) => void;
  }
}

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [simState, setSimState] = useState<SimulatorState | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'simState' && event.data.payload != null) {
        setSimState(event.data.payload as SimulatorState);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    const post = (msg: object) => win?.postMessage(msg, '*');
    window.__requestSimSpeed = (scale: number) => post({ type: 'setSimSpeed', value: scale });
    window.__requestFollowRobot = (id: number | null) => post({ type: 'followRobot', id });
    window.__setOrderSettings = (opts) => post({ type: 'setOrderSettings', opts });
    window.__setChargeSettings = (opts) => post({ type: 'setChargeSettings', opts });
    return () => {
      window.__requestSimSpeed = undefined;
      window.__requestFollowRobot = undefined;
      window.__setOrderSettings = undefined;
      window.__setChargeSettings = undefined;
    };
  }, []);

  return (
    <ThemeProvider theme={dashboardTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            py: 1.5,
            px: 2,
            borderRadius: 0,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              animation: 'pulse 1.5s ease-in-out infinite',
              '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
            }}
          />
          <Typography variant="h6" fontFamily="JetBrains Mono" fontWeight={600}>
            Parking Robot Digital Twin
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            Fleet monitoring
          </Typography>
        </Paper>

        <Box
          sx={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '200px 1fr 200px',
            gridTemplateRows: '1fr auto',
            gap: 1.5,
            p: 1.5,
            minHeight: 0,
            height: 'calc(100vh - 65px)',
          }}
        >
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              gridRow: '1 / -1',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              bgcolor: 'background.paper',
            }}
          >
            <FleetStatusCards orderDetails={simState?.orderDetails} />
          </Paper>

          <Paper
            elevation={0}
            sx={{
              gridColumn: 2,
              gridRow: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              p: 0,
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            <iframe
              ref={iframeRef}
              src={SIM_URL}
              title="Simulator"
              style={{
                width: '100%',
                height: '100%',
                minHeight: 400,
                border: 'none',
                display: 'block',
                backgroundColor: 'var(--mui-palette-background-default, #0d1117)',
              }}
            />
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              gridRow: '1 / -1',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
              bgcolor: 'background.paper',
            }}
          >
            <SOCPanel robots={simState?.robots} />
            <SettingsPanel />
          </Paper>

          <Paper
            elevation={0}
            sx={{
              gridColumn: 2,
              gridRow: 2,
              p: 1.5,
              bgcolor: 'background.paper',
            }}
          >
            <OrderStatsPanel
              orderStats={simState?.orderStats}
              totalKwhDelivered={simState?.totalKwhDelivered}
              simTimeSec={simState?.simTimeSec}
              orderDetails={simState?.orderDetails}
            />
          </Paper>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
