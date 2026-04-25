import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface PlaceOption {
  label: string;
  lat: number;
  lon: number;
}

async function searchPlaces(q: string, signal: AbortSignal): Promise<PlaceOption[]> {
  if (q.trim().length < 3) return [];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('geocoding_failed');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = await r.json();
  return data.map((row) => ({ label: row.display_name, lat: +row.lat, lon: +row.lon }));
}

function useDebounced(value: string, delay = 350): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface Props {
  label: string;
  value: PlaceOption | null;
  onChange: (v: PlaceOption | null) => void;
  error?: boolean;
  helperText?: string;
}

export default function LocationAutocomplete({ label, value, onChange, error, helperText }: Props) {
  const [input, setInput] = useState('');
  const debounced = useDebounced(input);
  const { data = [], isFetching } = useQuery({
    queryKey: ['places', debounced],
    queryFn: ({ signal }) => searchPlaces(debounced, signal),
    enabled: debounced.length >= 3,
    staleTime: 1000 * 60 * 60,
  });

  return (
    <Autocomplete
      options={data}
      value={value}
      onChange={(_, v) => onChange(v)}
      onInputChange={(_, v) => setInput(v)}
      getOptionLabel={(o) => o.label}
      filterOptions={(x) => x}
      loading={isFetching}
      isOptionEqualToValue={(opt, val) => opt.lat === val.lat && opt.lon === val.lon}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error}
          helperText={helperText}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {isFetching ? <CircularProgress size={18} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
