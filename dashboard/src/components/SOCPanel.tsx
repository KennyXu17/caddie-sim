import { useState } from 'react';
import { Card, CardContent, Typography, Box, LinearProgress, Button } from '@mui/material';
import { robots as mockRobots } from '../data/mockData';
import type { RobotStatus } from '../types';

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

export function SOCPanel({ robots: robotsProp }: { robots?: RobotStatus[] | null }) {
  const robots = robotsProp ?? mockRobots;
  const [followedId, setFollowedId] = useState<number | null>(null);

  const handleRobotClick = (r: RobotStatus) => {
    const id = parseInt(r.id.replace(/^R/i, ''), 10);
    if (Number.isNaN(id)) return;
    const next = followedId === id ? null : id;
    setFollowedId(next);
    window.__requestFollowRobot?.(next);
  };

  return (
    <Card variant="outlined" sx={{ maxHeight: 320, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <CardContent sx={{ py: 1, px: 1.5, overflow: 'auto', flex: 1, minHeight: 0 }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
          Robot Status
        </Typography>
        <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {robots.map((r) => {
            const robotId = parseInt(r.id.replace(/^R/i, ''), 10);
            const isFollowed = !Number.isNaN(robotId) && followedId === robotId;
            const pos = r.position;
            const posStr = pos != null ? `(${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})` : '—';
            const headingStr = r.heading != null ? `${r.heading.toFixed(1)}°` : '—';
            return (
            <Box key={r.id}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                <Button
                  size="small"
                  onClick={() => handleRobotClick(r)}
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
                  {r.id}
                </Button>
                <Typography variant="caption" fontFamily="JetBrains Mono" color={socColor(r.soc)} sx={{ fontSize: '0.7rem' }}>
                  {r.soc}%
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.15, mb: 0.25, pl: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  SOC: {r.soc}% · {stateLabel(r.state)}
                </Typography>
                <Typography variant="caption" fontFamily="JetBrains Mono" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  pos: {posStr} · heading: {headingStr}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={r.soc}
                sx={{
                  height: 4,
                  borderRadius: 0.5,
                  bgcolor: 'rgba(255,255,255,0.08)',
                  '& .MuiLinearProgress-bar': { bgcolor: socColor(r.soc) },
                }}
              />
            </Box>
          ); })}
        </Box>
      </CardContent>
    </Card>
  );
}
