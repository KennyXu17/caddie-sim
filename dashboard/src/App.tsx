import { useEffect, useRef, useState } from 'react';
import { ThemeProvider, CssBaseline, Box, Paper, Typography, Button } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { dashboardTheme } from './theme';
import { FleetStatusCards } from './components/FleetStatusCards';
import { SOCPanel } from './components/SOCPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { OrderStatsPanel } from './components/OrderStatsPanel';
import type { FleetStatusCardsHandle } from './components/FleetStatusCards';
import type { SOCPanelHandle } from './components/SOCPanel';
import type { OrderStatsPanelHandle } from './components/OrderStatsPanel';
import type { SimulatorState } from './types';

declare global {
  interface Window {
    __dashboardSetState?: ((state: SimulatorState) => void) | null;
    // Sim control functions — set here to forward postMessage to the sim popup window
    __requestSimSpeed?: (scale: number) => void;
    __requestFollowRobot?: (id: number | null) => void;
    __setOrderSettings?: (opts: { ordersPerHour?: number; avgDemandKwh?: number }) => void;
    __setChargeSettings?: (opts: { cRate?: number; robotBatteryKwh?: number }) => void;
  }
}

// URL of the standalone simulator page (Three.js only, no React)
const SIM_URL = '/';

export default function App() {
  const centerAreaRef = useRef<HTMLDivElement>(null);
  const simWindowRef = useRef<Window | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  const fleetRef = useRef<FleetStatusCardsHandle>(null);
  const socRef = useRef<SOCPanelHandle>(null);
  const statsRef = useRef<OrderStatsPanelHandle>(null);

  // Receive sim state from the popup window via postMessage.
  // Completely decoupled from React state — update DOM directly.
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'simState') {
        const state = e.data.payload as SimulatorState;
        fleetRef.current?.update(state.orderDetails ?? null);
        socRef.current?.update(state.robots ?? null);
        statsRef.current?.update(state);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Poll every second to detect if the popup was closed externally
  useEffect(() => {
    const timer = setInterval(() => {
      if (simWindowRef.current?.closed) {
        simWindowRef.current = null;
        setSimRunning(false);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const openSimulator = () => {
    // If the popup is already open, just bring it to focus
    if (simWindowRef.current && !simWindowRef.current.closed) {
      simWindowRef.current.focus();
      return;
    }

    // Calculate screen coordinates of the center area so the popup fills it exactly
    const rect = centerAreaRef.current?.getBoundingClientRect();
    // Compensate for browser chrome (tab bar + address bar) using outerHeight vs innerHeight
    const chromeTop = window.outerHeight - window.innerHeight;
    const chromeLeft = window.outerWidth - window.innerWidth;
    const left = Math.round(window.screenX + chromeLeft + (rect?.left ?? 0));
    const top = Math.round(window.screenY + chromeTop + (rect?.top ?? 0));
    const width = Math.round(rect?.width ?? 900);
    const height = Math.round(rect?.height ?? 600);

    const simWin = window.open(
      SIM_URL,
      'caddie-sim-window',
      `width=${width},height=${height},left=${left},top=${top},` +
        'menubar=no,toolbar=no,location=no,status=no,resizable=yes',
    );

    if (!simWin) {
      alert('Pop-up blocked — please allow pop-ups for this site and try again.');
      return;
    }

    simWindowRef.current = simWin;
    setSimRunning(true);

    // Forward control commands from dashboard panels to the sim popup via postMessage.
    // SettingsPanel and SOCPanel call these window-level functions when the user
    // changes settings or clicks a robot — we intercept and relay to the sim window.
    window.__requestSimSpeed = (scale) =>
      simWindowRef.current?.postMessage({ type: 'setSimSpeed', value: scale }, '*');
    window.__requestFollowRobot = (id) =>
      simWindowRef.current?.postMessage({ type: 'followRobot', id }, '*');
    window.__setOrderSettings = (opts) =>
      simWindowRef.current?.postMessage({ type: 'setOrderSettings', opts }, '*');
    window.__setChargeSettings = (opts) =>
      simWindowRef.current?.postMessage({ type: 'setChargeSettings', opts }, '*');
  };

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
        {/* Header */}
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
              bgcolor: simRunning ? 'success.main' : 'text.disabled',
              animation: simRunning ? 'pulse 1.5s ease-in-out infinite' : 'none',
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

        {/* Main grid */}
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
          {/* Left panel — order list */}
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
            <FleetStatusCards ref={fleetRef} />
          </Paper>

          {/* Center — simulation viewport placeholder */}
          <Paper
            elevation={0}
            ref={centerAreaRef}
            sx={{
              gridColumn: 2,
              gridRow: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              bgcolor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
              position: 'relative',
            }}
          >
            {simRunning ? (
              /* Sim is running in a separate window */
              <Box sx={{ textAlign: 'center', opacity: 0.55 }}>
                <Typography
                  variant="caption"
                  display="block"
                  color="text.secondary"
                  fontFamily="JetBrains Mono"
                  sx={{ mb: 1.5 }}
                >
                  Simulation running in a separate window
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<OpenInNewIcon />}
                  onClick={openSimulator}
                  sx={{ fontFamily: 'JetBrains Mono', fontSize: '0.7rem' }}
                >
                  Focus Simulator
                </Button>
              </Box>
            ) : (
              /* Not started yet */
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  variant="caption"
                  display="block"
                  color="text.secondary"
                  fontFamily="JetBrains Mono"
                  sx={{ mb: 2, fontSize: '0.75rem' }}
                >
                  Simulator not running
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<PlayArrowIcon />}
                  onClick={openSimulator}
                  sx={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}
                >
                  Run Simulation
                </Button>
                <Typography
                  variant="caption"
                  display="block"
                  color="text.secondary"
                  sx={{ mt: 1.5, fontSize: '0.65rem', opacity: 0.6 }}
                >
                  Opens in a separate window — each has its own main thread
                </Typography>
              </Box>
            )}
          </Paper>

          {/* Right panel — robot status + settings */}
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
            <SOCPanel ref={socRef} />
            <SettingsPanel />
          </Paper>

          {/* Bottom center — financial metrics */}
          <Paper
            elevation={0}
            sx={{
              gridColumn: 2,
              gridRow: 2,
              p: 1.5,
              bgcolor: 'background.paper',
            }}
          >
            <OrderStatsPanel ref={statsRef} />
          </Paper>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
