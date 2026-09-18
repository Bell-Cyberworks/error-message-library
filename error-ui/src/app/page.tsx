import type { Metadata } from 'next';
import {
  FALLBACK_HEADER,
  FALLBACK_MESSAGE,
  lookupErrorDetails,
  normalizeParams,
  type RawSearchParams,
} from '@/lib/lookup';

export const metadata: Metadata = {
  title: 'Error',
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const rawParams = await searchParams;
  const params = normalizeParams(rawParams);
  const details = await lookupErrorDetails(params);

  if (!details) {
    return (
      <main className="error-page">
        <div className="error-card" role="alert">
          <h1 className="error-card__header">{FALLBACK_HEADER}</h1>
          <p className="error-card__message">{FALLBACK_MESSAGE}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="error-page">
      <div className="error-card" role="alert">
        <h1 className="error-card__header">{details.header}</h1>
        <p className="error-card__code">{details.code}</p>
        <p className="error-card__message">{details.friendlyMessage}</p>
      </div>
    </main>
  );
}
