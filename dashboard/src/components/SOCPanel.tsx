import { forwardRef, memo, useImperativeHandle, useRef, useState } from 'react';
import { Card, CardContent, Typography, Box, Button } from '@mui/material';
import type { RobotStatus } from '../types';

export interface SOCPanelHandle {
  update: (robots: RobotStatus[] | null) => void;
}

declare global {
  interface Window {
    __requestFollowRobot?: (robotId: number | null) => void;
  }
}

function socColor(soc: number) {
  if (soc >= 60) return '#3fb950';
  if (soc >= 30) return '#d29922';
  return '#f85149';
}

function stateLabel(state: string) {
  const labels: Record<string, string> = {
    idle: 'Idle',
    navigating: 'Navigating',
    charging: 'Charging',
    selfCharging: 'Self charging',
    returning: 'Returning',
  };
  return labels[state] ?? state;
}

const ROBOT_IDS = ['R1', 'R2'] as const;
const MONO = "'JetBrains Mono', monospace";

const SOCPanelInner = forwardRef<SOCPanelHandle>(
  function SOCPanelInner(_props, ref) {
    const [followedId, setFollowedId] = useState<number | null>(null);

    // Explicit top-level refs (Rules of Hooks: no refs inside loops)
    const r1SocRef = useRef<HTMLSpanElement>(null);
    const r1BarRef = useRef<HTMLDivElement>(null);
    const r1StateRef = useRef<HTMLSpanElement>(null);
    const r1PosRef = useRef<HTMLSpanElement>(null);

    const r2SocRef = useRef<HTMLSpanElement>(null);
    const r2BarRef = useRef<HTMLDivElement>(null);
    const r2StateRef = useRef<HTMLSpanElement>(null);
    const r2PosRef = useRef<HTMLSpanElement>(null);

    const robotRefs = {
      R1: { soc: r1SocRef, bar: r1BarRef, state: r1StateRef, pos: r1PosRef },
      R2: { soc: r2SocRef, bar: r2BarRef, state: r2StateRef, pos: r2PosRef },
    };

    useImperativeHandle(
      ref,
      () => ({
        update(robots) {
          if (!robots) return;
          for (const r of robots) {
            const refs = robotRefs[r.id as keyof typeof robotRefs];
            if (!refs) continue;
            const color = socColor(r.soc);

            if (refs.soc.current) {
              refs.soc.current.textContent = `${r.soc}%`;
              refs.soc.current.style.color = color;
            }
            if (refs.bar.current) {
              refs.bar.current.style.width = `${r.soc}%`;
              refs.bar.current.style.background = color;
            }
            if (refs.state.current) {
              refs.state.current.textContent = `SOC: ${r.soc}% · ${stateLabel(r.state)}`;
            }
            if (refs.pos.current) {
              const pos = r.position;
              const posStr =
                pos != null ? `(${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})` : '—';
              const headingStr = r.heading != null ? `${r.heading.toFixed(1)}°` : '—';
              refs.pos.current.textContent = `pos: ${posStr} · heading: ${headingStr}`;
            }
          }
        },
      }),
      // refs are stable (same object every render), safe to omit from deps
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const handleRobotClick = (id: string) => {
      const numId = parseInt(id.replace(/^R/i, ''), 10);
      if (Number.isNaN(numId)) return;
      const next = followedId === numId ? null : numId;
      setFollowedId(next);
      window.__requestFollowRobot?.(next);
    };

    return (
      <Card
        variant="outlined"
        sx={{ maxHeight: 320, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}
      >
        <CardContent sx={{ py: 1, px: 1.5, overflow: 'auto', flex: 1, minHeight: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
            Robot Status
          </Typography>
          <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {ROBOT_IDS.map((id) => {
              const numId = parseInt(id.replace(/^R/i, ''), 10);
              const isFollowed = followedId === numId;
              const refs = robotRefs[id];
              return (
                <Box key={id}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.25,
                    }}
                  >
                    <Button
                      size="small"
                      onClick={() => handleRobotClick(id)}
                      sx={{
                        minWidth: 0,
                        px: 0.5,
                        py: 0,
                        minHeight: 24,
                        fontFamily: 'JetBrains Mono',
                        fontSize: '0.75rem',
                        color: isFollowed ? 'primary.main' : 'text.primary',
                        textTransform: 'none',
                        border: isFollowed ? '1px solid' : 'none',
                        borderColor: 'primary.main',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      {id}
                    </Button>
                    {/* SOC % — updated directly, never re-rendered by React */}
                    <span
                      ref={refs.soc}
                      style={{ fontFamily: MONO, fontSize: '0.7rem', color: '#3fb950' }}
                    >
                      --%
                    </span>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.15, mb: 0.25, pl: 0.5 }}>
                    {/* State line — updated directly */}
                    <span ref={refs.state} style={{ fontSize: '0.65rem', color: '#8b949e' }}>
                      SOC: --% · --
                    </span>
                    {/* Position line — updated directly */}
                    <span
                      ref={refs.pos}
                      style={{ fontFamily: MONO, fontSize: '0.65rem', color: '#8b949e' }}
                    >
                      pos: -- · heading: --
                    </span>
                  </Box>
                  {/* SOC bar — width and color updated directly */}
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <div
                      ref={refs.bar}
                      style={{ height: '100%', borderRadius: 2, background: '#3fb950', width: '0%' }}
                    />
                  </div>
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>
    );
  },
);

export const SOCPanel = memo(SOCPanelInner);
