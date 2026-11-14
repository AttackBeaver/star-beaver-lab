import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { AuthProvider } from './hooks/useAuth';

// Порядок провайдеров:
// 1. ThemeProvider — тема не зависит от auth, ставим снаружи.
// 2. AuthProvider — внутри; при 401 от /auth/profile → user = null,
//    тема при этом не должна сбрасываться.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);