import type { VocabItem } from '../types';

export interface ReaderLookupResult {
  raw: string;
  cleaned: string;
  isPhrase: boolean;
  contextSentence: string;
  /** Token index range within the source paragraph (for ← / → expand buttons) */
  paraKey?: string;
  wordStartIdx?: number;
  wordEndIdx?: number;
  paragraphWords?: string[];
  loading: boolean;
  phonetic?: string;
  partOfSpeech?: string;
  definitions: Array<{ def: string; example?: string }>;
  viMeaning?: string;
  sheetMatch?: VocabItem;
  error?: string;
}

export function cleanPhraseText(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    .trim();
}

export function getCambridgeUrl(term: string): string {
  const clean = term.trim().toLowerCase();
  if (clean.includes(' ')) {
    return `https://dictionary.cambridge.org/search/direct/?datasetsearch=english&q=${encodeURIComponent(clean)}`;
  }
  return `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(clean)}`;
}

/**
 * Look up either a single English word (Free Dictionary API + MyMemory EN->VI)
 * or a multi-word English phrase/collocation (MyMemory EN->VI + automatic 'phrase' tag).
 */
export async function lookupTermOnline(cleaned: string): Promise<{
  phonetic?: string;
  partOfSpeech?: string;
  definitions: Array<{ def: string; example?: string }>;
  viMeaning?: string;
  error?: string;
}> {
  const isPhrase = cleaned.includes(' ');
  const query = cleaned.slice(0, 240);

  try {
    const requests: Array<Promise<Response>> = [
      fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=en|vi`
      ),
    ];
    if (!isPhrase) {
      requests.push(
        fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query.toLowerCase())}`)
      );
    }

    const settled = await Promise.allSettled(requests);
    const transRes = settled[0];
    const dictRes = settled[1];

    let viMeaning: string | undefined;
    if (transRes.status === 'fulfilled' && transRes.value.ok) {
      const transJson = await transRes.value.json();
      const translated = transJson?.responseData?.translatedText;
      if (typeof translated === 'string' && translated.trim()) {
        viMeaning = translated.trim();
      }
    }

    let phonetic: string | undefined;
    let partOfSpeech: string | undefined = isPhrase ? 'phrase' : undefined;
    const definitions: Array<{ def: string; example?: string }> = [];

    if (dictRes && dictRes.status === 'fulfilled' && dictRes.value.ok) {
      const dictJson = await dictRes.value.json();
      const entry = Array.isArray(dictJson) ? dictJson[0] : null;
      if (entry) {
        phonetic =
          entry.phonetic ||
          entry.phonetics?.find((p: { text?: string }) => p.text)?.text ||
          undefined;
        const firstMeaning = entry.meanings?.[0];
        if (firstMeaning) {
          partOfSpeech = firstMeaning.partOfSpeech;
          for (const d of (firstMeaning.definitions || []).slice(0, 2)) {
            if (d.definition) {
              definitions.push({ def: d.definition, example: d.example });
            }
          }
        }
      }
    }

    return { phonetic, partOfSpeech, definitions, viMeaning };
  } catch {
    return {
      partOfSpeech: isPhrase ? 'phrase' : undefined,
      definitions: [],
      error: 'Không kết nối được từ điển / dịch trực tuyến.',
    };
  }
}

/**
 * Extract selected English phrase from native browser drag/highlight selection.
 * Returns null if selection is empty, a single word (handled by normal tap), or too long.
 */
export function getSelectedPhraseFromWindow(): string | null {
  if (typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;
  const text = cleanPhraseText(sel.toString());
  if (!text || !text.includes(' ')) return null;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 18) return null;
  return text;
}
