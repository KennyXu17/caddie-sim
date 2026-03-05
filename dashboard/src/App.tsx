import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeProvider, CssBaseline, Box, Paper, Typography, Button, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { dashboardTheme } from './theme';
import { FleetStatusCards } from './components/FleetStatusCards';
import { SOCPanel } from './components/SOCPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { OrderStatsPanel } from './components/OrderStatsPanel';
import type { SimulatorState, RenderConfig } from './types';
import { DEFAULT_RENDER_CONFIG } from './types';

declare global {
  interface Window {
    __requestSimSpeed?: (scale: number) => void;
    __requestFollowRobot?: (id: number | null) => void;
    __setOrderSettings?: (opts: { ordersPerHour?: number; avgDemandKwh?: number }) => void;
    __setChargeSettings?: (opts: { cRate?: number; robotBatteryKwh?: number }) => void;
  }
}

/** Build the simulator popup URL, embedding render config as query params. */
function buildSimUrl(rc: RenderConfig): string {
  const base = new URL('/', window.location.href);
  base.searchParams.set('quality', rc.quality === 'custom' ? 'medium' : rc.quality);
  base.searchParams.set('ssaa',   String(rc.ssaa));
  base.searchParams.set('shadow', String(rc.shadowRes));
  base.searchParams.set('ssao',           rc.ssao  ? '1' : '0');
  base.searchParams.set('bloom',          rc.bloom ? '1' : '0');
  base.searchParams.set('dpr',            String(rc.dpr));
  base.searchParams.set('shadow_every',   String(rc.shadowEvery));
  base.searchParams.set('vehicle_shadow', rc.vehicleShadow ? '1' : '0');
  base.searchParams.set('robot_shadow',   rc.robotShadow   ? '1' : '0');
  return base.href;
}

export default function App() {
  const simPanelRef = useRef<HTMLDivElement>(null);
  const simWindowRef = useRef<Window | null>(null);
  const checkClosedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simState, setSimState] = useState<SimulatorState | null>(null);

  // ── Screen recording ──────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `caddie-sim-${ts}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
      };

      // Stop recording automatically if user closes the share dialog / stream ends
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });

      recorder.start(500); // collect a chunk every 500 ms
      setRecording(true);
    } catch {
      // User cancelled the screen-picker — do nothing
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Render config — configured before launch, passed as URL query params
  const [renderConfig, setRenderConfig] = useState<RenderConfig>(DEFAULT_RENDER_CONFIG);

  // Receive state from simulator popup
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'simState' && event.data.payload != null) {
        setSimState(event.data.payload as SimulatorState);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Wire up command helpers to send postMessage to popup window
  useEffect(() => {
    const post = (msg: object) => {
      const win = simWindowRef.current;
      if (win && !win.closed) win.postMessage(msg, '*');
    };
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

  const openSimulator = useCallback((rc?: RenderConfig) => {
    const el = simPanelRef.current;
    if (!el) return;

    // Close existing popup first
    if (simWindowRef.current && !simWindowRef.current.closed) {
      simWindowRef.current.close();
    }
    if (checkClosedTimerRef.current) {
      clearInterval(checkClosedTimerRef.current);
      checkClosedTimerRef.current = null;
    }

    // Compute popup position to exactly match the panel's screen coordinates
    const rect = el.getBoundingClientRect();
    const left = Math.round(window.screenX + rect.left);
    const top  = Math.round(window.screenY + rect.top);
    const width  = Math.round(rect.width);
    const height = Math.round(rect.height);

    const features = [
      'popup=yes',
      `left=${left}`,
      `top=${top}`,
      `width=${width}`,
      `height=${height}`,
      'toolbar=no',
      'menubar=no',
      'status=no',
      'location=no',
      'scrollbars=no',
      'resizable=yes',
    ].join(',');

    const simUrl = buildSimUrl(rc ?? renderConfig);
    const win = window.open(simUrl, 'caddie-sim', features);
    if (!win) {
      alert('弹窗被拦截，请在浏览器中允许此页面弹出新窗口后再试。');
      return;
    }

    simWindowRef.current = win;
    setSimRunning(true);

    // Watch for popup being closed by the user
    checkClosedTimerRef.current = setInterval(() => {
      if (simWindowRef.current?.closed) {
        setSimRunning(false);
        setSimState(null);
        simWindowRef.current = null;
        if (checkClosedTimerRef.current) {
          clearInterval(checkClosedTimerRef.current);
          checkClosedTimerRef.current = null;
        }
      }
    }, 800);
  }, [renderConfig]);

  const stopSimulator = useCallback(() => {
    if (simWindowRef.current && !simWindowRef.current.closed) {
      simWindowRef.current.close();
    }
    simWindowRef.current = null;
    setSimRunning(false);
    setSimState(null);
    if (checkClosedTimerRef.current) {
      clearInterval(checkClosedTimerRef.current);
      checkClosedTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkClosedTimerRef.current) clearInterval(checkClosedTimerRef.current);
    };
  }, []);

  return (
    <ThemeProvider theme={dashboardTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
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
              bgcolor: simRunning ? 'success.main' : 'primary.main',
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
          <Box sx={{ flex: 1 }} />

          {/* Record button */}
          <Tooltip
            title={recording ? 'Stop recording & save WebM' : 'Record screen (select "Entire screen" or the sim window)'}
            placement="bottom"
            arrow
          >
            <Button
              size="small"
              variant={recording ? 'contained' : 'outlined'}
              color="error"
              startIcon={recording
                ? <StopCircleIcon sx={{ animation: 'recPulse 1s ease-in-out infinite', '@keyframes recPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
                : <FiberManualRecordIcon />}
              onClick={recording ? stopRecording : startRecording}
              sx={{ fontFamily: 'JetBrains Mono', fontSize: 12, mr: 1 }}
            >
              {recording ? 'Stop REC' : 'REC'}
            </Button>
          </Tooltip>

          {simRunning ? (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={stopSimulator}
              sx={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}
            >
              Stop Simulation
            </Button>
          ) : (
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              onClick={() => openSimulator()}
              sx={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}
            >
              Run Simulation
            </Button>
          )}
        </Paper>

        {/* Main grid */}
        <Box
          sx={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '200px 1fr 240px',
            gridTemplateRows: '1fr auto',
            gap: 1.5,
            p: 1.5,
            minHeight: 0,
            height: 'calc(100vh - 65px)',
          }}
        >
          {/* Left panel */}
          <Paper
            elevation={0}
            sx={{ p: 1.5, gridRow: '1 / -1', display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'background.paper' }}
          >
            <FleetStatusCards orderDetails={simState?.orderDetails} />
          </Paper>

          {/* Center: simulation area placeholder */}
          <Paper
            elevation={0}
            sx={{ gridColumn: 2, gridRow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden', bgcolor: 'background.paper' }}
          >
            <Box
              ref={simPanelRef}
              sx={{
                width: '100%',
                height: '100%',
                minHeight: 400,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#0d1117',
                gap: 2,
              }}
            >
              {simRunning ? (
                <>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: 'success.main',
                      animation: 'pulse 1.5s ease-in-out infinite',
                      '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
                    }}
                  />
                  <Typography variant="body2" color="text.secondary" fontFamily="JetBrains Mono">
                    Simulation running in separate window
                  </Typography>
                  <Button size="small" variant="text" onClick={() => openSimulator()} sx={{ fontSize: 11, color: 'text.disabled' }}>
                    Re-open window
                  </Button>
                </>
              ) : (
                <>
                  <Typography variant="body2" color="text.disabled" fontFamily="JetBrains Mono" sx={{ mb: 1 }}>
                    Simulation not running
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<PlayArrowIcon />}
                    onClick={() => openSimulator()}
                    sx={{ fontFamily: 'JetBrains Mono' }}
                  >
                    Run Simulation
                  </Button>
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 1, textAlign: 'center', maxWidth: 260 }}>
                    Simulator runs in a dedicated window for smooth rendering
                  </Typography>
                </>
              )}
            </Box>
          </Paper>

          {/* Right panel */}
          <Paper
            elevation={0}
            sx={{ p: 1.5, gridRow: '1 / -1', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto', bgcolor: 'background.paper' }}
          >
            <SOCPanel robots={simState?.robots} />
            <SettingsPanel
              simRunning={simRunning}
              renderConfig={renderConfig}
              onRenderConfigChange={(patch) => setRenderConfig((prev) => ({ ...prev, ...patch }))}
              onRunSimulation={() => openSimulator()}
            />
          </Paper>

          {/* Bottom stats */}
          <Paper
            elevation={0}
            sx={{ gridColumn: 2, gridRow: 2, p: 1.5, bgcolor: 'background.paper' }}
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
