import { useState, useEffect } from 'react';
import { Stack, Button, TextField, Paper, Typography, Alert } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

export default function TripForm({ onPlanned }: Props) {
  const { control, handleSubmit, register, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { cycle_hours_used: 0 } as Partial<FormValues>,
  });

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

  return (
    <Paper sx={{ p: 4, maxWidth: 640, mx: 'auto' }}>
      <Typography variant="h3" gutterBottom>
        Plan a trip
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enter the three locations and your cycle hours already used.
        We'll plan rest, fuel, and pickup/dropoff stops under FMCSA 70-hour/8-day rules.
      </Typography>

      <Stack component="form" onSubmit={onSubmit} spacing={3}>
        <Controller
          name="current_location"
          control={control}
          render={({ field, fieldState }) => (
            <LocationAutocomplete
              label="Current location"
              value={field.value as PlaceOption | null}
              onChange={field.onChange}
              error={!!fieldState.error}
              helperText={fieldState.error?.message ?? fieldState.error?.root?.message}
            />
          )}
        />
        <Controller
          name="pickup_location"
          control={control}
          render={({ field, fieldState }) => (
            <LocationAutocomplete
              label="Pickup location"
              value={field.value as PlaceOption | null}
              onChange={field.onChange}
              error={!!fieldState.error}
              helperText={fieldState.error?.message ?? fieldState.error?.root?.message}
            />
          )}
        />
        <Controller
          name="dropoff_location"
          control={control}
          render={({ field, fieldState }) => (
            <LocationAutocomplete
              label="Drop-off location"
              value={field.value as PlaceOption | null}
              onChange={field.onChange}
              error={!!fieldState.error}
              helperText={fieldState.error?.message ?? fieldState.error?.root?.message}
            />
          )}
        />
        <TextField
          label="Current cycle used (hours)"
          type="number"
          inputProps={{ min: 0, max: 70, step: 0.5 }}
          helperText={errors.cycle_hours_used?.message ?? "How many hours you've already used in the current 8-day window"}
          error={!!errors.cycle_hours_used}
          {...register('cycle_hours_used', { valueAsNumber: true })}
        />

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

        <Button type="submit" variant="contained" size="large" disabled={planMutation.isPending}>
          {planMutation.isPending ? 'Planning…' : 'Plan trip'}
        </Button>
      </Stack>
    </Paper>
  );
}
