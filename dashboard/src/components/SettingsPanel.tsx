import { useState } from 'react';
import {
  Card, CardContent, Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Switch, FormControlLabel, Divider, Button, Chip, Tooltip,
} from '@mui/material';
import SpeedIcon from '@mui/icons-material/Speed';
import TuneIcon from '@mui/icons-material/Tune';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { RenderConfig, RenderQuality } from '../types';
import { RENDER_PRESETS } from '../types';

declare global {
  interface Window {
    __requestSimSpeed?: (scale: number) => void;
    __setOrderSettings?: (opts: { ordersPerHour?: number; avgDemandKwh?: number }) => void;
    __setChargeSettings?: (opts: { cRate?: number; robotBatteryKwh?: number }) => void;
  }
}

// ── Static option lists ─────────────────────────────────────────────────────
const SPEED_OPTIONS: { label: string; scale: number }[] = [
  { label: '1×',    scale: 1 },
  { label: '2×',    scale: 2 },
  { label: '5×',    scale: 5 },
  { label: '10×',   scale: 10 },
  { label: '60×',   scale: 60 },
  { label: '3600×', scale: 3600 },
];

const ORDER_RATE_OPTIONS = [20, 40, 60, 80, 100, 120, 150];
const AVG_DEMAND_OPTIONS  = [10, 20, 30, 40, 50];
const C_RATE_OPTIONS      = [1, 2, 5, 10];
const ROBOT_BATTERY_OPTIONS = [100, 200, 400];

const QUALITY_LABELS: Record<RenderQuality, string> = {
  low:    'Low  – fastest',
  medium: 'Medium  – balanced',
  high:   'High  – best quality',
  custom: 'Custom',
};

const SSAA_OPTIONS  = [{ label: '1× (native)', value: 1 }, { label: '1.5×', value: 1.5 }, { label: '2× (4K-equiv)', value: 2 }];
const SHADOW_OPTIONS = [
  { label: '1024  (fast)',   value: 1024 },
  { label: '2048  (good)',   value: 2048 },
  { label: '4096  (sharp)',  value: 4096 },
];

// ── Props ───────────────────────────────────────────────────────────────────
interface SettingsPanelProps {
  simRunning: boolean;
  renderConfig: RenderConfig;
  onRenderConfigChange: (patch: Partial<RenderConfig>) => void;
  onRunSimulation: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export function SettingsPanel({
  simRunning,
  renderConfig,
  onRenderConfigChange,
  onRunSimulation,
}: SettingsPanelProps) {
  // ── Simulation runtime settings (sent via postMessage) ──
  const [speed, setSpeed]                   = useState<number>(1);
  const [ordersPerHour, setOrdersPerHour]   = useState(100);
  const [avgDemandKwh, setAvgDemandKwh]     = useState(20);
  const [cRate, setCRate]                   = useState(10);
  const [robotBatteryKwh, setRobotBatteryKwh] = useState(100);

  const handleSpeed = (scale: number) => {
    setSpeed(scale);
    window.__requestSimSpeed?.(scale);
  };

  const pushOrderSettings = (opr: number, avg: number) => {
    window.__setOrderSettings?.({ ordersPerHour: opr, avgDemandKwh: avg });
  };

  const pushChargeSettings = (cr: number, rb: number) => {
    window.__setChargeSettings?.({ cRate: cr, robotBatteryKwh: rb });
  };

  // ── Render config helpers ──
  const applyPreset = (quality: Exclude<RenderQuality, 'custom'>) => {
    onRenderConfigChange({ quality, ...RENDER_PRESETS[quality] });
  };

  const patchRender = (patch: Partial<Omit<RenderConfig, 'quality'>>) => {
    onRenderConfigChange({ quality: 'custom', ...patch });
  };

  return (
    <Card variant="outlined" sx={{ mt: 1.5, bgcolor: 'background.paper' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>

        {/* ── Section: Renderer ── */}
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <TuneIcon sx={{ fontSize: 16 }} /> Renderer
        </Typography>

        {simRunning && (
          <Chip
            size="small"
            label="Restart sim to apply"
            color="warning"
            variant="outlined"
            icon={<RestartAltIcon sx={{ fontSize: 14 }} />}
            sx={{ mb: 1, fontSize: 10, height: 20 }}
          />
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.5 }}>
          {/* Quality preset */}
          <FormControl size="small" fullWidth>
            <InputLabel id="quality-label">Quality preset</InputLabel>
            <Select
              labelId="quality-label"
              value={renderConfig.quality}
              label="Quality preset"
              onChange={(e) => {
                const q = e.target.value as RenderQuality;
                if (q !== 'custom') applyPreset(q);
              }}
            >
              {(['low', 'medium', 'high', 'custom'] as RenderQuality[]).map((q) => (
                <MenuItem key={q} value={q} disabled={q === 'custom' && renderConfig.quality !== 'custom'}>
                  {QUALITY_LABELS[q]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Resolution scale */}
          <Tooltip title="Internal render buffer size. Higher = sharper but more GPU load." placement="left" arrow>
            <FormControl size="small" fullWidth>
              <InputLabel id="ssaa-label">Resolution (SSAA)</InputLabel>
              <Select
                labelId="ssaa-label"
                value={renderConfig.ssaa}
                label="Resolution (SSAA)"
                onChange={(e) => patchRender({ ssaa: Number(e.target.value) })}
              >
                {SSAA_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Tooltip>

          {/* Shadow map */}
          <Tooltip title="Shadow map texture size. Higher = crisper shadows, higher GPU VRAM cost." placement="left" arrow>
            <FormControl size="small" fullWidth>
              <InputLabel id="shadow-label">Shadow map</InputLabel>
              <Select
                labelId="shadow-label"
                value={renderConfig.shadowRes}
                label="Shadow map"
                onChange={(e) => patchRender({ shadowRes: Number(e.target.value) })}
              >
                {SHADOW_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Tooltip>

          {/* SSAO + Bloom toggles */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 0.5 }}>
            <Tooltip title="Screen-Space Ambient Occlusion — adds contact shadows. High GPU cost." placement="left" arrow>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={renderConfig.ssao}
                    onChange={(e) => patchRender({ ssao: e.target.checked })}
                    color="primary"
                  />
                }
                label={<Typography variant="caption">SSAO</Typography>}
                sx={{ mr: 0 }}
              />
            </Tooltip>
            <Tooltip title="Unreal Bloom glow effect. Low–medium GPU cost." placement="left" arrow>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={renderConfig.bloom}
                    onChange={(e) => patchRender({ bloom: e.target.checked })}
                    color="primary"
                  />
                }
                label={<Typography variant="caption">Bloom</Typography>}
                sx={{ mr: 0 }}
              />
            </Tooltip>
          </Box>

          {/* Run / Restart button */}
          <Button
            variant="contained"
            color={simRunning ? 'warning' : 'primary'}
            size="small"
            fullWidth
            startIcon={simRunning ? <RestartAltIcon /> : <PlayArrowIcon />}
            onClick={onRunSimulation}
            sx={{ mt: 0.5, fontFamily: 'JetBrains Mono', fontSize: 12 }}
          >
            {simRunning ? 'Restart Simulation' : 'Run Simulation'}
          </Button>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* ── Section: Sim controls ── */}
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <SpeedIcon sx={{ fontSize: 16 }} /> Simulation
        </Typography>

        <Box sx={{ mt: 1, mb: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="sim-speed-label">Sim speed</InputLabel>
            <Select
              labelId="sim-speed-label"
              value={speed}
              label="Sim speed"
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpeed(v);
                handleSpeed(v);
              }}
            >
              {SPEED_OPTIONS.map((opt) => (
                <MenuItem key={opt.scale} value={opt.scale}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Order settings
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.75 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="orders-rate-label">Orders / hour</InputLabel>
            <Select
              labelId="orders-rate-label"
              value={ordersPerHour}
              label="Orders / hour"
              onChange={(e) => {
                const v = Number(e.target.value);
                setOrdersPerHour(v);
                pushOrderSettings(v, avgDemandKwh);
              }}
            >
              {ORDER_RATE_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>{v}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="avg-demand-label">Avg demand (kWh)</InputLabel>
            <Select
              labelId="avg-demand-label"
              value={avgDemandKwh}
              label="Avg demand (kWh)"
              onChange={(e) => {
                const v = Number(e.target.value);
                setAvgDemandKwh(v);
                pushOrderSettings(ordersPerHour, v);
              }}
            >
              {AVG_DEMAND_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>{v}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          Charge / discharge
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.75 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="c-rate-label">C-rate</InputLabel>
            <Select
              labelId="c-rate-label"
              value={cRate}
              label="C-rate"
              onChange={(e) => {
                const v = Number(e.target.value);
                setCRate(v);
                pushChargeSettings(v, robotBatteryKwh);
              }}
            >
              {C_RATE_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>{v}C</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="robot-batt-label">Robot battery (kWh)</InputLabel>
            <Select
              labelId="robot-batt-label"
              value={robotBatteryKwh}
              label="Robot battery (kWh)"
              onChange={(e) => {
                const v = Number(e.target.value);
                setRobotBatteryKwh(v);
                pushChargeSettings(cRate, v);
              }}
            >
              {ROBOT_BATTERY_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>{v} kWh</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

      </CardContent>
    </Card>
  );
}
