import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('rendering app: root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
