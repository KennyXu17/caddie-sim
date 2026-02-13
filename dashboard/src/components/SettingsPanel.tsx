import { useState } from 'react';
import { Card, CardContent, Typography, Box, Button } from '@mui/material';
import SpeedIcon from '@mui/icons-material/Speed';

declare global {
  interface Window {
    __requestSimSpeed?: (scale: number) => void;
  }
}

const SPEED_OPTIONS = [1, 2, 5, 10, 20, 50, 100];

export function SettingsPanel() {
  const [speed, setSpeed] = useState(1);

  const handleSpeed = (scale: number) => {
    setSpeed(scale);
    window.__requestSimSpeed?.(scale);
  };

  return (
    <Card variant="outlined" sx={{ mt: 1.5, bgcolor: 'background.paper' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <SpeedIcon sx={{ fontSize: 18 }} /> Setting
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          Sim speed
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {SPEED_OPTIONS.map((scale) => (
            <Button
              key={scale}
              size="small"
              variant={speed === scale ? 'contained' : 'outlined'}
              onClick={() => handleSpeed(scale)}
              sx={{
                minWidth: 36,
                fontFamily: 'JetBrains Mono',
                fontSize: '0.75rem',
              }}
            >
              ×{scale}
            </Button>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
