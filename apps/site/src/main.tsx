import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root')!;
// En production la page est pré-rendue (scripts/prerender.mjs) : on hydrate.
if (root.firstElementChild) hydrateRoot(root, <App />);
else createRoot(root).render(<App />);
