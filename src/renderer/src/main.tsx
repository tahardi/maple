import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { App } from './App';
import { WindowErrorBoundary } from './shell/WindowErrorBoundary';

const root = document.getElementById('root');
if (!root) {
  throw new Error('rendering app: root element not found');
}

createRoot(root).render(
  <StrictMode>
    <WindowErrorBoundary
      onReload={() => {
        window.location.reload();
      }}
    >
      <App />
    </WindowErrorBoundary>
  </StrictMode>,
);
