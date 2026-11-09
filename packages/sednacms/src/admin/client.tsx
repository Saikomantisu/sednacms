import { adapter } from 'virtual:sedna/adapter';
import { createRoot } from 'react-dom/client';
import { setAdminAdapter } from './adapter.js';
import { App } from './app.js';

setAdminAdapter(adapter);

const container = document.querySelector<HTMLDivElement>('#app');
if (container) createRoot(container).render(<App />);
