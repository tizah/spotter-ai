import { ThemeProvider, CssBaseline, Container, AppBar, Toolbar, Typography } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 * 5 } },
});

export default function App() {
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
          <Typography variant="body1" color="text.secondary">
            Trip form and results will appear here.
          </Typography>
        </Container>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
