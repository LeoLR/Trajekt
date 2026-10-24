import { renderToString } from 'react-dom/server';
import { App } from './App';
import { Docs } from './Docs';

export function render(page: 'home' | 'docs' = 'home'): string {
  return renderToString(page === 'docs' ? <Docs /> : <App />);
}
