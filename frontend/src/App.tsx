import { useState } from 'react';
import { ThemeProvider, CssBaseline, Container, AppBar, Toolbar, Typography } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme } from './theme';
import TripFormPage from './pages/TripFormPage';
import TripResultPage from './pages/TripResultPage';
import type { TripPlan } from './types';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 * 5 } },
});

export default function App() {
  const [plan, setPlan] = useState<TripPlan | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Toolbar>
            <Typography variant="h4" component="h1" sx={{ flex: 1 }}>
              Spotter Trip Planner
            </Typography>
          </Toolbar>
        </AppBar>
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {!plan ? (
            <TripFormPage onPlanned={setPlan} />
          ) : (
            <TripResultPage plan={plan} onReset={() => setPlan(null)} />
          )}
        </Container>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
