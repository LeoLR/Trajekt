import { ExploreView } from '../../views/ExploreView';
import { requestLang } from '../context';

export const dynamic = 'force-dynamic';

export default async function ExplorePage() {
  return <ExploreView lang={await requestLang()} />;
}
