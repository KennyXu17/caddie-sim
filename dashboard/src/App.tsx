import { useEffect, useRef, useState } from 'react';
import { ThemeProvider, CssBaseline, Box, Paper, Typography } from '@mui/material';
import { dashboardTheme } from './theme';
import { FleetStatusCards } from './components/FleetStatusCards';
import { SOCPanel } from './components/SOCPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { OrderStatsPanel } from './components/OrderStatsPanel';
import type { SimulatorState } from './types';

declare global {
  interface Window {
    __simulatorContainer?: HTMLElement | null;
    __dashboardSetState?: ((state: SimulatorState) => void) | null;
  }
}

export default function App() {
  const simContainerRef = useRef<HTMLDivElement>(null);
  const [simState, setSimState] = useState<SimulatorState | null>(null);

  useEffect(() => {
    window.__dashboardSetState = setSimState;
    return () => {
      window.__dashboardSetState = null;
    };
  }, []);

  useEffect(() => {
    const el = simContainerRef.current;
    if (!el) return;
    window.__simulatorContainer = el;
    import('/src/main_sim.js');
    return () => {
      window.__simulatorContainer = null;
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
            <FleetStatusCards fleetSummary={simState?.fleetSummary} />
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
            <Box
              ref={simContainerRef}
              sx={{ width: '100%', height: '100%', minHeight: 400, position: 'relative', bgcolor: 'background.default' }}
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
            <OrderStatsPanel orderStats={simState?.orderStats} totalKwhDelivered={simState?.totalKwhDelivered} />
          </Paper>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
