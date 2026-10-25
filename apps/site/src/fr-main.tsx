import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root')!;
if (root.firstElementChild) hydrateRoot(root, <App lang="fr" />);
else createRoot(root).render(<App lang="fr" />);
