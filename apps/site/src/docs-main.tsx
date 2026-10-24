import { createRoot, hydrateRoot } from 'react-dom/client';
import { Docs } from './Docs';
import './styles.css';

const root = document.getElementById('root')!;
if (root.firstElementChild) hydrateRoot(root, <Docs />);
else createRoot(root).render(<Docs />);
