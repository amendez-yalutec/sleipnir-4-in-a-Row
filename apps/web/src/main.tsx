import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { createApiClient } from './api/client.ts';
import '@fontsource-variable/outfit';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <App
      client={createApiClient()}
      initialMoves={new URLSearchParams(location.search).get('moves')}
    />
  </StrictMode>,
);
