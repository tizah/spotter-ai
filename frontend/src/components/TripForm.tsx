import { useState, useEffect } from 'react';
import {
  Stack,
  Button,
  TextField,
  Typography,
  Alert,
  Box,
  LinearProgress,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Compass, Package, Flag, Clock } from 'lucide-react';
import LocationAutocomplete, { type PlaceOption } from './LocationAutocomplete';
import { usePlanTrip } from '../api/trips';
import type { TripPlan } from '../types';

const locationSchema = z.object({
  label: z.string().min(2, 'Required'),
  lat: z.number(),
  lon: z.number(),
});

const schema = z.object({
  current_location: locationSchema,
  pickup_location: locationSchema,
  dropoff_location: locationSchema,
  cycle_hours_used: z.number().min(0, 'Must be 0 or more').max(70, 'Cannot exceed 70'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  onPlanned: (plan: TripPlan) => void;
}

function getCycleBarColor(value: number): 'success' | 'warning' | 'error' {
  if (value >= 60) return 'error';
  if (value >= 50) return 'warning';
  return 'success';
}

export default function TripForm({ onPlanned }: Props) {
  const { control, handleSubmit, register, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { cycle_hours_used: 0 } as Partial<FormValues>,
  });

  const cycleValue = watch('cycle_hours_used') ?? 0;
  const clampedCycle = Math.max(0, Math.min(70, Number(cycleValue) || 0));
  const cyclePercent = (clampedCycle / 70) * 100;

  const planMutation = usePlanTrip();
  const [showColdStart, setShowColdStart] = useState(false);

  useEffect(() => {
    if (planMutation.isPending) {
      const t = setTimeout(() => setShowColdStart(true), 3000);
      return () => clearTimeout(t);
    }
    setShowColdStart(false);
  }, [planMutation.isPending]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await planMutation.mutateAsync({
      current_location: { lat: values.current_location.lat, lon: values.current_location.lon, label: values.current_location.label },
      pickup_location: { lat: values.pickup_location.lat, lon: values.pickup_location.lon, label: values.pickup_location.label },
      dropoff_location: { lat: values.dropoff_location.lat, lon: values.dropoff_location.lon, label: values.dropoff_location.label },
      cycle_hours_used: values.cycle_hours_used,
    });
    onPlanned(result);
  });

  const iconSx = { color: 'text.secondary', flexShrink: 0 };

  return (
    <Stack component="form" onSubmit={onSubmit} spacing={3}>
      <Controller
        name="current_location"
        control={control}
        render={({ field, fieldState }) => (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Box sx={{ ...iconSx, mt: 1 }}><Compass size={20} /></Box>
            <Box sx={{ flex: 1 }}>
              <LocationAutocomplete
                label="Where are you now?"
                value={field.value as PlaceOption | null}
                onChange={field.onChange}
                error={!!fieldState.error}
                helperText={fieldState.error?.message ?? fieldState.error?.root?.message}
              />
            </Box>
          </Box>
        )}
      />
      <Controller
        name="pickup_location"
        control={control}
        render={({ field, fieldState }) => (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Box sx={{ ...iconSx, mt: 1 }}><Package size={20} /></Box>
            <Box sx={{ flex: 1 }}>
              <LocationAutocomplete
                label="Where's the pickup?"
                value={field.value as PlaceOption | null}
                onChange={field.onChange}
                error={!!fieldState.error}
                helperText={fieldState.error?.message ?? fieldState.error?.root?.message}
              />
            </Box>
          </Box>
        )}
      />
      <Controller
        name="dropoff_location"
        control={control}
        render={({ field, fieldState }) => (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Box sx={{ ...iconSx, mt: 1 }}><Flag size={20} /></Box>
            <Box sx={{ flex: 1 }}>
              <LocationAutocomplete
                label="Where's it going?"
                value={field.value as PlaceOption | null}
                onChange={field.onChange}
                error={!!fieldState.error}
                helperText={fieldState.error?.message ?? fieldState.error?.root?.message}
              />
            </Box>
          </Box>
        )}
      />

      {/* Cycle hours with live progress bar */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ ...iconSx, mt: 1 }}><Clock size={20} /></Box>
        <Box sx={{ flex: 1 }}>
          <TextField
            label="Cycle hours used"
            type="number"
            inputProps={{ min: 0, max: 70, step: 0.5 }}
            helperText={errors.cycle_hours_used?.message ?? 'Hours used in your current 8-day window'}
            error={!!errors.cycle_hours_used}
            {...register('cycle_hours_used', { valueAsNumber: true })}
          />
          <Box sx={{ mt: 0.75, px: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={cyclePercent}
              color={getCycleBarColor(clampedCycle)}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: 'grey.100',
                transition: 'none',
                '& .MuiLinearProgress-bar': {
                  transition: 'transform 0.2s ease, background-color 0.3s ease',
                },
              }}
            />
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>0</Typography>
              <Typography
                sx={{
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color:
                    clampedCycle >= 60 ? 'error.main' : clampedCycle >= 50 ? 'warning.main' : 'success.main',
                }}
              >
                {clampedCycle.toFixed(1)}h used
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>70</Typography>
            </Stack>
          </Box>
        </Box>
      </Box>

      {showColdStart && planMutation.isPending && (
        <Alert severity="info">
          Warming up the server — first request can take ~30s on the free tier.
        </Alert>
      )}

      {planMutation.isError && (
        <Alert severity="error">
          Could not plan trip: {(planMutation.error as Error)?.message ?? 'Unknown error'}
        </Alert>
      )}

      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={planMutation.isPending}
        sx={{ py: 1.5, fontSize: '1rem' }}
      >
        {planMutation.isPending ? 'Planning…' : 'Plan my trip'}
      </Button>
    </Stack>
  );
}
