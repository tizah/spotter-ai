import { useState } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Container,
  AppBar,
  Toolbar,
  Box,
  Typography,
  Button,
  IconButton,
  Snackbar,
  GlobalStyles,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
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
  const [toastOpen, setToastOpen] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setToastOpen(true);
    });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles styles={{ 'html, body, #root': { margin: 0, padding: 0 } }} />
        {plan ? (
          <>
            <AppBar
              position="sticky"
              elevation={0}
              sx={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)',
              }}
            >
              <Toolbar>
                <Typography
                  variant="h4"
                  sx={{ fontWeight: 700, color: '#fff', flexGrow: 1 }}
                >
                  Trip
                  <Box
                    component="span"
                    sx={{ color: 'secondary.light', ml: 0.5 }}
                  >
                    Planner
                  </Box>
                </Typography>
                <IconButton
                  onClick={handleCopyLink}
                  sx={{ color: 'rgba(255,255,255,0.8)', mr: 1 }}
                  size="small"
                  aria-label="Copy share link"
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
                <Button
                  variant="outlined"
                  onClick={() => setPlan(null)}
                  sx={{
                    color: '#fff',
                    borderColor: 'rgba(255,255,255,0.4)',
                    '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                  }}
                >
                  New trip
                </Button>
              </Toolbar>
            </AppBar>
            <Container maxWidth="xl" sx={{ py: 3 }}>
              <TripResultPage plan={plan} />
            </Container>
          </>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', m: 0, p: 0 }}>
            <TripFormPage onPlanned={setPlan} />
          </Box>
        )}

        <Snackbar
          open={toastOpen}
          onClose={() => setToastOpen(false)}
          autoHideDuration={2000}
          message="Link copied"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
