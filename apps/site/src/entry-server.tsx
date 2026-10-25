import { renderToString } from 'react-dom/server';
import { App } from './App';
import { Docs } from './Docs';
import { DocsFr } from './DocsFr';

export type PageId = 'home' | 'docs' | 'fr-home' | 'fr-docs';

export function render(page: PageId = 'home'): string {
  switch (page) {
    case 'docs': return renderToString(<Docs />);
    case 'fr-home': return renderToString(<App lang="fr" />);
    case 'fr-docs': return renderToString(<DocsFr />);
    default: return renderToString(<App />);
  }
}
