import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { TripPlan } from '../types';

export interface PlanTripInput {
  current_location: { label: string } | { lat: number; lon: number; label?: string };
  pickup_location: { label: string } | { lat: number; lon: number; label?: string };
  dropoff_location: { label: string } | { lat: number; lon: number; label?: string };
  cycle_hours_used: number;
  start_datetime?: string;
  home_terminal_tz?: string;
}

export function usePlanTrip() {
  return useMutation({
    mutationFn: (input: PlanTripInput) =>
      api<TripPlan>('/api/trips', { method: 'POST', body: JSON.stringify(input) }),
  });
}

export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: ['trip', id],
    enabled: !!id,
    queryFn: () => api<TripPlan>(`/api/trips/${id}`),
  });
}
