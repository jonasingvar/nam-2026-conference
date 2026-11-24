import { Deck } from '../components/presentation/Deck.jsx';
import { BuiltOnVercel } from '../components/presentation/kit.jsx';
import { CHAPTERS } from '../components/presentation/chapters.js';

/** /engineering-presentation — the software factory: the ticket → production, on Vercel. */
export function PresentationPage() {
  return <Deck chapters={CHAPTERS} title="The software factory" brand={<BuiltOnVercel />} />;
}
