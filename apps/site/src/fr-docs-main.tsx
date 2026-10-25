import { createRoot, hydrateRoot } from 'react-dom/client';
import { DocsFr } from './DocsFr';
import './styles.css';

const root = document.getElementById('root')!;
if (root.firstElementChild) hydrateRoot(root, <DocsFr />);
else createRoot(root).render(<DocsFr />);
