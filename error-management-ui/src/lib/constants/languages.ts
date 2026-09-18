// Fixed v1 default list of BCP-47 language tags offered when authoring/adding a language for
// an error code (US-4.2). management-ui-backlog.md's "Open questions" section leaves the
// language list source unresolved ("is it a fixed predefined list ... or something an Admin
// configures?") — this is a placeholder default to unblock v1, not a final decision, and
// should become Admin-configurable later.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'pl', label: 'Polish' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const LANGUAGE_CODES: readonly string[] = LANGUAGES.map((language) => language.code);

/** Display label for a language code, falling back to the raw code for any value that isn't
 *  (or is no longer) in the fixed list above — e.g. content authored before a future change
 *  to this list. */
export function getLanguageLabel(code: string): string {
  return LANGUAGES.find((language) => language.code === code)?.label ?? code;
}
