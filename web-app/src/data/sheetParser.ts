import Papa from 'papaparse';
import { loadedAt, rawSheets, task1Images } from 'virtual:vocab-sheets';
import type {
  CollocationItem,
  DeckInfo,
  IdiomItem,
  IeltsSpeakingItem,
  IeltsTask1Example,
  IeltsTask1Item,
  IeltsTask1Section,
  IeltsTask2Format,
  IeltsTask2Prompt,
  IeltsTask2Section,
  LyricLine,
  LyricSection,
  LyricVocabItem,
  NewsArticleItem,
  NewsParagraph,
  NewsQuizQuestion,
  NewsVocabItem,
  ParsedLibrary,
  PhrasalVerbItem,
  PrepositionItem,
  PrepositionMistake,
  PrepositionUse,
  SongLyricItem,
  SpeakingPart,
  VocabItem,
  WordDefinition,
  WordPair,
} from '../types';

function parseCsvRows(csvText: string): string[][] {
  if (!csvText.trim()) return [];
  const res = Papa.parse<string[]>(csvText, {
    skipEmptyLines: false,
  });
  return (res.data || []).map((row) => row.map((c) => (c ?? '').trim()));
}

function cleanFormulaTitle(val: string): string {
  const m = val.match(/^=UPPER\("(.+)"\)$/i);
  if (m) return m[1].trim();
  return val.trim();
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function splitLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function parsePairList(raw: string): WordPair[] {
  if (!raw.trim()) return [];
  const sep = raw.includes(';') ? ';' : /[,/]/;
  return raw
    .split(sep)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^([^(]+?)\s*\(([^)]+)\)$/);
      if (m) return { word: m[1].trim(), meaning: m[2].trim() };
      return { word: part };
    });
}

function parseWordFamily(raw: string): Record<string, WordPair[]> {
  const result: Record<string, WordPair[]> = {};
  for (const line of splitLines(raw)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const pos = line.slice(0, idx).trim();
    const rest = line.slice(idx + 1).trim();
    if (!pos || !rest) continue;
    const pairs = rest
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const m = p.match(/^([^(]+?)\s*\(([^)]+)\)$/);
        if (m) return { word: m[1].trim(), meaning: m[2].trim() };
        return { word: p };
      });
    if (pairs.length) result[pos] = pairs;
  }
  return result;
}

function parseDefinitions(raw: string): WordDefinition[] {
  return splitLines(raw).map((line) => {
    const cleaned = line.replace(/^\d+\.\s*/, '');
    const [defPart, exPart] = cleaned.split(/\s*\|\s*Ex:\s*/i);
    const posMatch = defPart.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (posMatch) {
      return {
        partOfSpeech: posMatch[1].trim(),
        definition: posMatch[2].trim(),
        example: exPart?.trim(),
      };
    }
    return {
      definition: defPart.trim(),
      example: exPart?.trim(),
    };
  });
}

function makeId(deck: string, word: string, idx: number): string {
  const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${deck}::${slug || 'item'}::${idx}`;
}

function parseCoreVocabulary(rows: string[][], deck: string): VocabItem[] {
  const items: VocabItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const word = r[0] || '';
    if (!word) continue;
    const defs = parseDefinitions(r[6] || '');
    const examples = [
      ...(r[7] ? [r[7]] : []),
      ...defs.map((d) => d.example).filter((e): e is string => Boolean(e) && e !== r[7]),
    ];
    items.push({
      id: makeId(deck, word, i),
      word,
      deck,
      partOfSpeech: r[1] || undefined,
      level: r[2] || undefined,
      phoneticUk: r[3] || undefined,
      phoneticUs: r[4] || undefined,
      meaning: r[5] || '',
      definitions: defs,
      examples,
      collocations: [],
      synonyms: parsePairList(r[8] || ''),
      antonyms: parsePairList(r[9] || ''),
      wordFamily: parseWordFamily(r[10] || ''),
    });
  }
  return items;
}

function parseComprehensibleInput(
  rows: string[][],
  deck: string
): { vocab: VocabItem[]; collocations: CollocationItem[] } {
  const vocab: VocabItem[] = [];
  const collocations: CollocationItem[] = [];
  let headerIdx = rows.findIndex((r) => r.some((c) => /Từ vựng/i.test(c)));
  if (headerIdx === -1) headerIdx = 4;

  const headerRow = rows[headerIdx] || [];
  const topicCol = headerRow.findIndex((c) => /^(chủ đề|topic|category)/i.test(c));
  const subtopicCol = headerRow.findIndex((c) => /^(nhóm con|subtopic|subcategory|nhóm)/i.test(c));

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const rawWord = r[2] || '';
    if (!rawWord) continue;

    // Extract all IPA blocks like /ˈsɪŋɡl bed/ (no leading/trailing whitespace inside slashes)
    // while preserving English word separators like "Trash can / Litter bin".
    const ipaRegex = /\/(?!\s)[^/]+?(?<!\s)\//g;
    const ipaMatches = rawWord.match(ipaRegex) || [];
    const cleanedWord = rawWord
      .replace(ipaRegex, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+-\s+\)/g, ')')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*\/\s*$/g, '')
      .trim();
    const word = cleanedWord || rawWord;
    const phonetic = ipaMatches.length > 0 ? ipaMatches.join(' · ') : undefined;
    const imageUrl = isUrl(r[0] || '') ? r[0] : undefined;
    const meaning = r[3] || '';
    const colLines = splitLines(r[4] || '').map((l) => l.replace(/^\d+\.\s*/, ''));
    const exLines = splitLines(r[5] || '').map((l) => l.replace(/^\d+\.\s*/, ''));
    const memoryTip = r[6] || undefined;
    const topic = topicCol >= 0 ? r[topicCol] || undefined : undefined;
    const subtopic = subtopicCol >= 0 ? r[subtopicCol] || undefined : undefined;

    vocab.push({
      id: makeId(deck, word, i),
      word,
      deck,
      section: topic || 'Chưa phân loại',
      subtopic,
      meaning,
      phoneticUk: phonetic,
      phoneticUs: phonetic,
      imageUrl,
      definitions: [],
      examples: exLines,
      collocations: colLines,
      memoryTip,
      synonyms: [],
      antonyms: [],
      wordFamily: {},
    });

    colLines.forEach((line, idx) => {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const phrase = line.slice(0, colonIdx).trim();
        const colMeaning = line.slice(colonIdx + 1).trim();
        if (phrase && colMeaning) {
          collocations.push({
            id: `ci-col::${i}::${idx}`,
            phrase,
            meaning: colMeaning,
            example: exLines[idx] || exLines[0],
            sourceDeck: deck,
            topic: topic || 'Chưa phân loại',
            subtopic,
            relatedWord: word,
          });
        }
      }
    });
  }

  return { vocab, collocations };
}

function parseBooks(rows: string[][], deck: string): VocabItem[] {
  const items: VocabItem[] = [];
  let section = 'Books';
  let headerSeen = false;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nonEmpty = r.filter(Boolean);
    if (!nonEmpty.length) continue;

    if (/^=UPPER\(/i.test(r[0] || '')) {
      section = cleanFormulaTitle(r[0]);
      continue;
    }
    if (/^Word\/Sentence$/i.test(r[0] || '')) {
      headerSeen = true;
      continue;
    }
    if (!headerSeen) continue;

    const word = r[0] || '';
    if (!word) continue;
    const pos = r[1] || undefined;
    const meaning = r[2] || '';
    const cambridge = isUrl(r[3] || '') ? r[3] : undefined;
    const syns = parsePairList(r[4] || '');
    const img = isUrl(r[5] || '') ? r[5] : undefined;

    items.push({
      id: makeId(deck, word, i),
      word,
      deck,
      section,
      partOfSpeech: pos,
      meaning,
      cambridgeUrl: cambridge,
      imageUrl: img,
      definitions: [],
      examples: [],
      collocations: [],
      synonyms: syns,
      antonyms: [],
      wordFamily: {},
    });
  }
  return items;
}

function parseIeltsReading(rows: string[][], deck: string): VocabItem[] {
  const items: VocabItem[] = [];
  let passageTitle = 'IELTS Reading';
  let headerRow = -1;
  let rightWordCol = -1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some(Boolean)) continue;

    // Detect passage title rows (col 0 filled, cols 1..6 empty, not a table header)
    if (
      r[0] &&
      !r[1] &&
      !r[2] &&
      !r[3] &&
      !r[4] &&
      !r[5] &&
      !r[6] &&
      !/^(=UPPER|Reading|Word)$/i.test(r[0]) &&
      r[0].length > 10
    ) {
      passageTitle = cleanFormulaTitle(r[0]);
      continue;
    }

    // Skip "Reading / Question" sub-banner rows between passages
    if (/^Reading$/i.test(r[0] || '') && !r[2]) {
      continue;
    }

    if (/^Word$/i.test(r[0] || '') && r.some((c) => /^Meaning$/i.test(c))) {
      headerRow = i;
      rightWordCol = r.findIndex((c, idx) => idx > 0 && /^Word$/i.test(c));
      continue;
    }

    if (headerRow === -1) continue;

    // Left table: Word(0), Paragraph(1), Meaning(2), Cambridge/Example(3), Example/Cambridge(4), Paraphrase(5)
    const leftWord = r[0] || '';
    if (leftWord && !/^Word$/i.test(leftWord)) {
      const c3 = r[3] || '';
      const c4 = r[4] || '';
      const cambridgeUrl = isUrl(c3) ? c3 : isUrl(c4) ? c4 : undefined;
      const example = !isUrl(c3) && c3 ? c3 : !isUrl(c4) && c4 ? c4 : undefined;
      const para = r[5] || undefined;

      items.push({
        id: makeId(deck, `${leftWord}-R`, i),
        word: leftWord,
        deck,
        section: passageTitle,
        subtopic: r[1] ? `Reading (P.${r[1]})` : 'Reading',
        meaning: r[2] || '',
        cambridgeUrl,
        examples: example ? [example] : [],
        paraphrase: para,
        synonyms: para ? parsePairList(para) : [],
        definitions: [],
        collocations: [],
        antonyms: [],
        wordFamily: {},
      });
    }

    // Right table (Question): Word(rc), Meaning(rc+1), Cambridge(rc+2), Example(rc+3), Paraphrase(rc+4)
    if (rightWordCol > 0) {
      const qWord = r[rightWordCol] || '';
      if (qWord && !/^(Word|Question)$/i.test(qWord)) {
        const q2 = r[rightWordCol + 2] || '';
        const q3 = r[rightWordCol + 3] || '';
        const cambridgeUrl = isUrl(q2) ? q2 : isUrl(q3) ? q3 : undefined;
        const example = !isUrl(q2) && q2 ? q2 : !isUrl(q3) && q3 ? q3 : undefined;
        const para = r[rightWordCol + 4] || undefined;

        items.push({
          id: makeId(deck, `${qWord}-Q`, i),
          word: qWord,
          deck,
          section: passageTitle,
          subtopic: 'Question',
          meaning: r[rightWordCol + 1] || '',
          cambridgeUrl,
          examples: example ? [example] : [],
          paraphrase: para,
          synonyms: para ? parsePairList(para) : [],
          definitions: [],
          collocations: [],
          antonyms: [],
          wordFamily: {},
        });
      }
    }
  }
  return items;
}

function parseIeltsListening(rows: string[][], deck: string): VocabItem[] {
  const items: VocabItem[] = [];
  const colSections: Record<number, string> = {};
  const activeWordCols: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some(Boolean)) continue;

    // Detect section headers per column
    let isSectionRow = false;
    r.forEach((cell, cIdx) => {
      if (/^=UPPER\(/i.test(cell)) {
        colSections[cIdx] = cleanFormulaTitle(cell);
        isSectionRow = true;
      }
    });
    if (isSectionRow) continue;

    // Detect header row containing "Word"
    const wordCols = r
      .map((c, idx) => (/^Word$/i.test(c) ? idx : -1))
      .filter((idx) => idx >= 0);
    if (wordCols.length > 0) {
      wordCols.forEach((wc) => {
        if (!activeWordCols.includes(wc)) activeWordCols.push(wc);
      });
      continue;
    }

    for (const wc of activeWordCols) {
      const w = r[wc] || '';
      const m = r[wc + 1] || '';
      if (!w || /^Word$/i.test(w)) continue;
      items.push({
        id: makeId(deck, `${w}-${wc}`, i),
        word: w,
        deck,
        section: colSections[wc] || 'Listening',
        meaning: m,
        definitions: [],
        examples: [],
        collocations: [],
        synonyms: [],
        antonyms: [],
        wordFamily: {},
      });
    }
  }
  return items;
}

function parseAdjectivePractice(rows: string[][], deck: string): VocabItem[] {
  const items: VocabItem[] = [];
  const headerIdx = rows.findIndex((r) => /^Word$/i.test(r[0] || ''));
  if (headerIdx === -1) return items;

  let current: VocabItem | null = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some(Boolean)) continue;

    if (r[0]) {
      current = {
        id: makeId(deck, r[0], i),
        word: r[0],
        deck,
        partOfSpeech: 'adjective',
        meaning: r[1] || '',
        cambridgeUrl: isUrl(r[2] || '') ? r[2] : undefined,
        examples: r[3] ? [r[3]] : [],
        definitions: [],
        collocations: [],
        synonyms: [],
        antonyms: [],
        wordFamily: {},
      };
      items.push(current);
    }

    if (current) {
      if (r[4]) current.synonyms.push({ word: r[4], meaning: r[5] || undefined });
      if (r[8]) current.antonyms.push({ word: r[8], meaning: r[9] || undefined });
    }
  }
  return items;
}

function parseAdjective(rows: string[][], deck: string): VocabItem[] {
  const items: VocabItem[] = [];
  const headerIdx = rows.findIndex((r) => /^Word$/i.test(r[0] || ''));
  if (headerIdx === -1) return items;
  const headerRow = rows[headerIdx] || [];
  const catCol = headerRow.findIndex((c) => /^(category|chủ đề|topic)/i.test(c));

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some(Boolean)) continue;
    const word = r[0] || '';
    if (
      !word ||
      /^(Word|Category|Link)$/i.test(word) ||
      /^=UPPER\(/i.test(word) ||
      /^\*\*/.test(word)
    ) {
      continue;
    }
    items.push({
      id: makeId(deck, word, i),
      word,
      deck,
      section: catCol >= 0 ? r[catCol] || undefined : undefined,
      partOfSpeech: 'adjective',
      meaning: r[1] || '',
      synonyms: parsePairList(r[2] || ''),
      antonyms: parsePairList(r[3] || ''),
      definitions: [],
      examples: [],
      collocations: [],
      wordFamily: {},
    });
  }
  return items;
}

function parseGenericVocab(rows: string[][], deck: string): VocabItem[] {
  const items: VocabItem[] = [];
  let headerIdx = -1;
  let wordCol = 0;
  let meaningCol = 1;
  let posCol = -1;
  let phoneticCol = -1;
  let formsCol = -1;
  let exampleCol = -1;
  let synCol = -1;
  let antCol = -1;
  let imgCol = -1;
  let cambridgeCol = -1;
  let topicCol = -1;
  let subtopicCol = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    const wIdx = r.findIndex((c) => /^(word|phrase|term|từ vựng)/i.test(c));
    if (wIdx !== -1) {
      headerIdx = i;
      wordCol = wIdx;
      const mIdx = r.findIndex((c, idx) => idx !== wIdx && /(meaning|nghĩa|vietnamese)/i.test(c));
      if (mIdx !== -1) meaningCol = mIdx;
      posCol = r.findIndex((c) => /(part of speech|type|từ loại)/i.test(c));
      phoneticCol = r.findIndex((c) => /(phonetic|phiên âm|ipa)/i.test(c));
      formsCol = r.findIndex((c) => /(verb forms|v2\/v3|forms)/i.test(c));
      exampleCol = r.findIndex((c) => /(example|sentence|ví dụ)/i.test(c));
      synCol = r.findIndex((c) => /synonym|đồng nghĩa/i.test(c));
      antCol = r.findIndex((c) => /antonym|trái nghĩa/i.test(c));
      imgCol = r.findIndex((c) => /image|link ảnh/i.test(c));
      cambridgeCol = r.findIndex((c) => /cambridge/i.test(c));
      topicCol = r.findIndex((c) => /^(chủ đề|topic|category)/i.test(c));
      subtopicCol = r.findIndex((c) => /^(nhóm con|subtopic|subcategory)/i.test(c));
      break;
    }
  }
  if (headerIdx === -1) return items;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const word = r[wordCol] || '';
    if (!word || /^=/.test(word)) continue;
    const meaning = r[meaningCol] || '';
    if (!meaning && !r[exampleCol]) continue;

    const rawPos = posCol >= 0 ? r[posCol] || undefined : undefined;
    const rawForms = formsCol >= 0 ? r[formsCol] || undefined : undefined;
    const rawPhonetic = phoneticCol >= 0 ? r[phoneticCol] || undefined : undefined;
    const partOfSpeech = rawPos || (rawForms ? `verb · ${rawForms}` : undefined);

    items.push({
      id: makeId(deck, word, i),
      word,
      deck,
      section: topicCol >= 0 ? r[topicCol] || undefined : undefined,
      subtopic: subtopicCol >= 0 ? r[subtopicCol] || undefined : undefined,
      meaning,
      partOfSpeech,
      phoneticUk: rawPhonetic,
      phoneticUs: rawPhonetic,
      examples: exampleCol >= 0 && r[exampleCol] ? splitLines(r[exampleCol]) : [],
      synonyms: synCol >= 0 ? parsePairList(r[synCol] || '') : [],
      antonyms: antCol >= 0 ? parsePairList(r[antCol] || '') : [],
      imageUrl: imgCol >= 0 && isUrl(r[imgCol] || '') ? r[imgCol] : undefined,
      cambridgeUrl: cambridgeCol >= 0 && isUrl(r[cambridgeCol] || '') ? r[cambridgeCol] : undefined,
      definitions: [],
      collocations: [],
      wordFamily: {},
    });
  }
  return items;
}

function parsePhrasalVerbsLibrary(rows: string[][]): PhrasalVerbItem[] {
  const out: PhrasalVerbItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const examples = splitLines(r[6] || '').map((line) => {
      const cleaned = line.replace(/^-\s*/, '');
      const [sentence, translation] = cleaned.split(/\s*=>\s*/);
      return { sentence: sentence.trim(), translation: translation?.trim() };
    });
    const commonForms: Record<string, string> = {};
    (r[7] || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        const idx = part.indexOf(':');
        if (idx > 0) commonForms[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      });

    out.push({
      id: `pv::${i}`,
      verb: r[0],
      type: r[1] || 'general',
      difficulty: r[2] || 'intermediate',
      particles: (r[3] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      meaningsVi: splitLines(r[4] || '').map((l) => l.replace(/^\d+\.\s*/, '')),
      definitions: splitLines(r[5] || '').map((l) => l.replace(/^\d+\.\s*/, '')),
      examples,
      commonForms,
      usage: r[8] || undefined,
      synonyms: (r[9] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      source: 'Phrasal Verbs Library',
    });
  }
  return out;
}

function parsePersonalPhrasalVerbs(rows: string[][]): PhrasalVerbItem[] {
  const out: PhrasalVerbItem[] = [];
  const headerIdx = rows.findIndex((r) => /^Word$/i.test(r[0] || ''));
  if (headerIdx === -1) return out;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({
      id: `pv-user::${i}`,
      verb: r[0],
      type: 'custom',
      difficulty: 'custom',
      particles: r[0].split(' ').slice(1),
      meaningsVi: r[2] ? [r[2]] : [],
      definitions: r[3] ? [r[3]] : [],
      examples: r[4] ? [{ sentence: r[4] }] : [],
      commonForms: {},
      synonyms: [],
      source: 'Phrasal Verb',
    });
  }
  return out;
}

function parsePrepositions(rows: string[][]): PrepositionItem[] {
  const out: PrepositionItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;

    const uses: PrepositionUse[] = [];
    let currentUse: PrepositionUse | null = null;
    for (const line of splitLines(r[3] || '')) {
      if (/^\d+\.\s*/.test(line)) {
        const cleaned = line.replace(/^\d+\.\s*/, '');
        const [usage, description] = cleaned.split(/\s*[—–-]\s*/);
        currentUse = {
          usage: (usage || cleaned).trim(),
          description: (description || '').trim(),
          examples: [],
        };
        uses.push(currentUse);
      } else if (currentUse) {
        const cleaned = line.replace(/^[•-]\s*/, '');
        const [sentence, translation] = cleaned.split(/\s*=>\s*/);
        currentUse.examples.push({ sentence: sentence.trim(), translation: translation?.trim() });
      }
    }

    const commonMistakes: PrepositionMistake[] = splitLines(r[4] || '').map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      return {
        incorrect: (parts[0] || '').replace(/^✗\s*/, ''),
        correct: (parts[1] || '').replace(/^✓\s*/, ''),
        explanation: parts[2] || '',
      };
    });

    out.push({
      id: `prep::${i}`,
      preposition: r[0],
      meaning: r[1] || '',
      category: r[2] || 'general',
      uses,
      commonMistakes,
      relatedPrepositions: (r[5] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  return out;
}

function parseIdioms(rows: string[][]): IdiomItem[] {
  const out: IdiomItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const examples = splitLines(r[8] || '').map((line) => {
      const cleaned = line.replace(/^-\s*/, '');
      const ctxMatch = cleaned.match(/\[([^\]]+)\]$/);
      const withoutCtx = ctxMatch ? cleaned.slice(0, ctxMatch.index).trim() : cleaned;
      const [sentence, translation] = withoutCtx.split(/\s*=>\s*/);
      return {
        sentence: sentence.trim(),
        translation: translation?.trim(),
        context: ctxMatch?.[1]?.trim(),
      };
    });

    out.push({
      id: `idiom::${i}`,
      idiom: r[0],
      vietnamese: r[1] || '',
      meaning: r[2] || '',
      category: r[3] || 'general',
      difficulty: r[4] || 'intermediate',
      formality: r[5] || 'neutral',
      frequency: r[6] || 'common',
      origin: r[7] || undefined,
      examples,
      usage: r[9] || undefined,
      synonyms: (r[10] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      relatedIdioms: (r[11] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  return out;
}

function parseCollocations(rows: string[][]): CollocationItem[] {
  const out: CollocationItem[] = [];
  const header = rows[0] || [];
  const topicCol = header.findIndex((c) => /^(chủ đề|topic|category)/i.test(c));
  const subtopicCol = header.findIndex((c) => /^(nhóm con|subtopic)/i.test(c));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[1]) continue;
    out.push({
      id: `col::${r[0] || i}`,
      phrase: r[1],
      meaning: r[2] || '',
      example: r[3] || undefined,
      exampleTranslation: r[4] || undefined,
      sourceDeck: 'Collocations',
      topic: (topicCol >= 0 ? r[topicCol] : '') || 'Collocations Cơ bản',
      subtopic: subtopicCol >= 0 ? r[subtopicCol] || undefined : undefined,
    });
  }
  return out;
}

function detectChartType(text: string, fallback: string): string {
  const low = text.toLowerCase();
  if (/bar\s+charts?/.test(low)) return 'Bar Chart';
  if (/line\s+graphs?|line\s+charts?/.test(low)) return 'Line Graph';
  if (/pie\s+charts?/.test(low)) return 'Pie Chart';
  if (/\btable\b/.test(low)) return 'Table';
  if (/\bmap\b/.test(low)) return 'Map';
  if (/\bprocess\b|\bdiagram\b/.test(low)) return 'Process';
  return fallback;
}

function makeTask1Title(intro: string, idx: number): string {
  const cleaned = intro
    .replace(/[[\]]/g, '')
    .replace(
      /^the\s+(?:bar\s+charts?|line\s+graphs?|pie\s+charts?|graphs?|charts?|tables?|maps?|diagrams?)\s+(?:below\s+)?(?:illustrates?|shows?|compares?|gives?\s+information\s+about|depicts?)\s+/i,
      ''
    )
    .replace(/\.$/, '')
    .trim();
  if (!cleaned) return `IELTS Writing Task 1 #${idx}`;
  const cap = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cap.length > 92 ? cap.slice(0, 89).trimEnd() + '…' : cap;
}

function parseIeltsTask1Sheet(
  rows: string[][],
  sheetName: string,
  taskType: 'chart' | 'map' | 'process',
  embeddedMap: Record<string, string> = {}
): { tasks: IeltsTask1Item[]; examples: IeltsTask1Example[] } {
  const headerIdx = rows.findIndex((r) => /^Word$/i.test(r[0] || ''));
  if (headerIdx === -1) return { tasks: [], examples: [] };
  const header = rows[headerIdx] || [];
  const meaningCol = header.findIndex((c) => /meaning|nghĩa/i.test(c));
  const partCol = header.findIndex((c) => /^part$/i.test(c));
  const imgCol = header.findIndex((c) => /image|ảnh/i.test(c));

  type RawEntry = { rowNum: number; text: string; meaning?: string; part: string; img?: string };
  type RawBlock = { entries: RawEntry[]; continuationOfPrev: boolean };
  const blocks: RawBlock[] = [];
  const examples: IeltsTask1Example[] = [];
  let current: RawEntry[] = [];
  let nextContinuation = false;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const text = (r[0] || '').trim();
    if (!text) {
      if (current.length > 0) {
        blocks.push({ entries: current, continuationOfPrev: nextContinuation });
        current = [];
      }
      nextContinuation = false;
      continue;
    }
    const rowNum = i + 1; // 1-based Google Sheet row number
    const meaning = meaningCol >= 0 ? (r[meaningCol] || '').trim() || undefined : undefined;
    const part = (partCol >= 0 ? (r[partCol] || '').trim() : '') || 'Sample';

    // Separate "... Example" rows into the dedicated Example Templates list
    if (/\bexample\b/i.test(part)) {
      if (current.length > 0) {
        blocks.push({ entries: current, continuationOfPrev: nextContinuation });
        current = [];
      }
      nextContinuation = false;
      const basePart = part.replace(/\s*\bexample\b\s*/gi, '').trim() || 'Example';
      examples.push({
        id: `t1ex::${sheetName}::${rowNum}`,
        taskType,
        sourceSheet: sheetName,
        part,
        basePart,
        text,
        meaning,
      });
      continue;
    }

    const rawImg = imgCol >= 0 ? (r[imgCol] || '').trim() : '';
    const img = isUrl(rawImg) ? rawImg : embeddedMap[String(rowNum)];

    // If a brand new Introduction starts after Body 1/Body 2 without a blank separator, split cleanly
    // and mark as continuation of the previous prompt so it shares the same chart/diagram image.
    if (
      /^Introduction$/i.test(part) &&
      current.some((e) => !/^Introduction$/i.test(e.part))
    ) {
      blocks.push({ entries: current, continuationOfPrev: nextContinuation });
      current = [];
      nextContinuation = true;
    }
    current.push({ rowNum, text, meaning, part, img });
  }
  if (current.length > 0) {
    blocks.push({ entries: current, continuationOfPrev: nextContinuation });
  }

  const partOrder = ['Introduction', 'Overview', 'Body 1', 'Body 2'];
  const fallbackLabel =
    taskType === 'map' ? 'Map' : taskType === 'process' ? 'Process' : 'Chart';

  let prevImageUrl: string | undefined;
  const tasks: IeltsTask1Item[] = [];

  for (const { entries: block, continuationOfPrev } of blocks) {
    const sectionsMap = new Map<string, IeltsTask1Section>();
    let imageUrl: string | undefined;

    for (const entry of block) {
      if (!imageUrl && entry.img) imageUrl = entry.img;
      const existing = sectionsMap.get(entry.part);
      if (existing) {
        existing.sentences.push({ text: entry.text, meaning: entry.meaning });
      } else {
        sectionsMap.set(entry.part, {
          part: entry.part,
          sentences: [{ text: entry.text, meaning: entry.meaning }],
        });
      }
    }

    // Fallback: match any embedded image whose row falls inside this block's row span
    if (!imageUrl) {
      const minR = block[0].rowNum;
      const maxR = block[block.length - 1].rowNum;
      for (const [rKey, url] of Object.entries(embeddedMap)) {
        const rn = Number(rKey);
        if (rn >= minR - 1 && rn <= maxR) {
          imageUrl = url;
          break;
        }
      }
    }

    const sections = Array.from(sectionsMap.values()).sort((a, b) => {
      const ia = partOrder.indexOf(a.part);
      const ib = partOrder.indexOf(b.part);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });

    const firstIntro =
      sections.find((s) => s.part === 'Introduction')?.sentences[0]?.text ||
      sections.find((s) => s.part === 'Overview')?.sentences[0]?.text ||
      block[0]?.text ||
      '';
    const title = makeTask1Title(firstIntro, tasks.length + 1);

    // Merge into the previous prompt when:
    // 1. This essay immediately followed the previous essay without a blank row (continuationOfPrev)
    //    and does NOT carry a brand-new distinct image of its own, OR
    // 2. It explicitly points to the exact same prompt image as the previous prompt.
    const prevTask = tasks[tasks.length - 1];
    const shouldMergeIntoPrev =
      Boolean(prevTask) &&
      ((continuationOfPrev && (!imageUrl || imageUrl === prevTask.imageUrl)) ||
        (Boolean(imageUrl) && imageUrl === prevTask.imageUrl));

    if (shouldMergeIntoPrev && prevTask) {
      const nextNum = prevTask.essays.length + 1;
      prevTask.essays.push({
        id: `${prevTask.id}::essay-${nextNum}`,
        label: `Bài mẫu ${nextNum}`,
        sections,
      });
      continue;
    }

    if (!imageUrl && continuationOfPrev && prevImageUrl) {
      imageUrl = prevImageUrl;
    }
    prevImageUrl = imageUrl;

    const taskId = `task1::${sheetName}::${tasks.length + 1}`;
    tasks.push({
      id: taskId,
      title,
      sourceSheet: sheetName,
      taskType,
      chartType:
        taskType === 'map'
          ? 'Map'
          : taskType === 'process'
            ? 'Process'
            : detectChartType(firstIntro, fallbackLabel),
      imageUrl,
      sections,
      essays: [
        {
          id: `${taskId}::essay-1`,
          label: 'Bài mẫu 1',
          sections,
        },
      ],
    });
  }

  // Fallback: if any remaining prompt has no image but matches an earlier title, share its image
  const imageByTitle = new Map<string, string>();
  for (const t of tasks) {
    const key = t.title.toLowerCase().trim();
    if (t.imageUrl) {
      imageByTitle.set(key, t.imageUrl);
    } else if (imageByTitle.has(key)) {
      t.imageUrl = imageByTitle.get(key);
    }
  }

  return { tasks, examples };
}

function detectTask2Type(prompt: string): string {
  const low = prompt.toLowerCase();
  if (/agree or disagree|support or oppose/.test(low)) return 'Opinion Essay';
  if (/discuss both/.test(low)) return 'Discussion Essay';
  if (/positive or negative/.test(low)) return 'Positive and Negative Essay';
  if (/advantages? and disadvantages?/.test(low)) return 'Advantages and Disadvantages Essay';
  if (/causes?.*solutions?|problems?.*solutions?/.test(low)) return 'Problem and Solution Essay';
  return 'IELTS Task 2 Essay';
}

function makeTask2Title(prompt: string, idx: number): string {
  const firstSentence = prompt.split(/(?<=[.?])\s+/)[0] || prompt;
  const trimmed = firstSentence
    .replace(/^Some people (?:think|believe|argue) that\s+/i, '')
    .replace(/\.$/, '')
    .trim();
  if (!trimmed) return `Writing Task 2 Topic #${idx}`;
  const cap = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return cap.length > 78 ? cap.slice(0, 75).trimEnd() + '…' : cap;
}

function detectFormatVariantLabel(
  questionType: string,
  introText: string,
  sameTypeIndex: number
): string {
  const low = introText.toLowerCase();
  if (/completely\s*\[?agree\/disagree\]?/.test(low)) {
    return 'Đồng ý / Phản đối hoàn toàn (One-sided)';
  }
  if (/only to some extent|partially agree|to some extent/.test(low)) {
    return 'Đồng ý một phần (Balanced / Partial)';
  }
  if (/ongoing debate|view\s*point of a/.test(low)) {
    return 'Thảo luận 2 quan điểm (Both Views + Opinion)';
  }
  if (/advantages\/disadvantages|benefits\/drawbacks|outweigh/.test(low)) {
    return 'So sánh Lợi ích & Bất lợi (Outweigh)';
  }
  if (/primarily driven by several key factors|key factors/.test(low)) {
    return 'Nguyên nhân + Đánh giá Tích cực / Tiêu cực';
  }
  if (/although i understand why some people view this as a negative/.test(low)) {
    return 'Phản biện + Khẳng định Tích cực (Concession)';
  }
  return `${questionType} — Khung #${sameTypeIndex}`;
}

function normalizeTask2FormatSections(
  rawSections: Array<{ part: string; text: string }>
): IeltsTask2Section[] {
  const hasOverview = rawSections.some((s) => /^overview$/i.test(s.part));
  const hasConclusion = rawSections.some((s) => /^conclusion$/i.test(s.part));
  const lastStartsWithConclusion =
    rawSections.length > 0 && /^in conclusion\b/i.test(rawSections[rawSections.length - 1].text);

  // If the Google Sheet reused the Task 1 Part dropdown (Introduction / Overview / Body 1 / Body 2)
  // for a 4-paragraph Task 2 essay template ending in "In conclusion, ...", map to Task 2 labels.
  if (rawSections.length === 4 && (hasOverview || (!hasConclusion && lastStartsWithConclusion))) {
    const standardLabels = ['Introduction', 'Body 1', 'Body 2', 'Conclusion'];
    return rawSections.map((s, idx) => ({
      part: standardLabels[idx],
      text: s.text,
    }));
  }

  return rawSections.map((s) => ({
    part: s.part || 'Paragraph',
    text: s.text,
  }));
}

function parseIeltsWritingTask2(
  rows: string[][],
  deck: string
): { prompts: IeltsTask2Prompt[]; formats: IeltsTask2Format[]; vocab: VocabItem[] } {
  const headerIdx = rows.findIndex((r) => /^Word$/i.test(r[0] || ''));
  if (headerIdx === -1) return { prompts: [], formats: [], vocab: [] };
  const header = rows[headerIdx] || [];

  const formatCol = header.findIndex((c) => /^format$/i.test(c));
  const leftLimit = formatCol >= 0 ? formatCol : header.length;

  const meaningCol = header.findIndex((c, idx) => idx < leftLimit && /meaning|nghĩa/i.test(c));
  const topicCol = header.findIndex((c, idx) => idx < leftLimit && /^(topic|prompt|chủ đề)/i.test(c));
  const partCol = header.findIndex((c, idx) => idx < leftLimit && /^part$/i.test(c));
  const qTypeCol = header.findIndex((c, idx) => idx < leftLimit && /^question\s*type$/i.test(c));

  const formatPartCol =
    formatCol >= 0 ? header.findIndex((c, idx) => idx > formatCol && /^part$/i.test(c)) : -1;
  const formatQTypeCol =
    formatCol >= 0
      ? header.findIndex((c, idx) => idx > formatCol && /^question\s*type$/i.test(c))
      : -1;

  const prompts: IeltsTask2Prompt[] = [];
  const vocab: VocabItem[] = [];
  let currentPrompt: IeltsTask2Prompt | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const phrase = (r[0] || '').trim();
    const meaning = meaningCol >= 0 ? (r[meaningCol] || '').trim() : (r[1] || '').trim();
    const topicText = topicCol >= 0 ? (r[topicCol] || '').trim() : '';
    const partText = partCol >= 0 ? (r[partCol] || '').trim() : '';
    const qTypeText = qTypeCol >= 0 ? (r[qTypeCol] || '').trim() : '';

    if (topicText) {
      currentPrompt = {
        id: `task2::${prompts.length + 1}`,
        title: makeTask2Title(topicText, prompts.length + 1),
        prompt: topicText,
        questionType: qTypeText || detectTask2Type(topicText),
        expressions: [],
        sampleSections: [],
        sampleEssays: [],
      };
      prompts.push(currentPrompt);
    } else if (qTypeText && currentPrompt && !currentPrompt.questionType) {
      currentPrompt.questionType = qTypeText;
    }

    if (!phrase) continue;
    if (!currentPrompt) {
      currentPrompt = {
        id: 'task2::general',
        title: 'General Writing Task 2 Expressions',
        prompt: 'General academic expressions for IELTS Writing Task 2',
        questionType: qTypeText || 'General',
        expressions: [],
        sampleSections: [],
        sampleEssays: [],
      };
      prompts.push(currentPrompt);
    }

    // If the row has a Part (Introduction / Body 1 / Body 2 / Conclusion) and looks like an essay paragraph
    // (no Vietnamese meaning or long paragraph), store as structured model essay instead of flashcard vocab.
    const wordCount = phrase.split(/\s+/).length;
    const isSampleParagraph = Boolean(partText) && (!meaning || wordCount >= 18);

    if (isSampleParagraph) {
      // Split into separate model essay variants if a new Introduction appears after other parts
      const activeEssay = currentPrompt.sampleEssays[currentPrompt.sampleEssays.length - 1];
      const startsNewEssay =
        !activeEssay ||
        (/^introduction$/i.test(partText) &&
          activeEssay.sections.some((s) => !/^introduction$/i.test(s.part)));

      if (startsNewEssay) {
        const nextNum = currentPrompt.sampleEssays.length + 1;
        currentPrompt.sampleEssays.push({
          id: `${currentPrompt.id}::essay-${nextNum}`,
          label: `Bài mẫu ${nextNum}`,
          sections: [{ part: partText, text: phrase }],
        });
      } else {
        activeEssay.sections.push({ part: partText, text: phrase });
      }
      if (currentPrompt.sampleEssays.length === 1) {
        currentPrompt.sampleSections.push({ part: partText, text: phrase });
      }
      continue;
    }

    currentPrompt.expressions.push({
      id: `t2-expr::${i}`,
      phrase,
      meaning,
      part: partText || undefined,
    });

    vocab.push({
      id: makeId(deck, phrase, i),
      word: phrase,
      deck,
      section: currentPrompt.title,
      subtopic: partText || currentPrompt.questionType,
      meaning,
      definitions: [],
      examples: [],
      collocations: [],
      synonyms: [],
      antonyms: [],
      wordFamily: {},
    });
  }

  // Parse side-by-side Format Templates table (Cols G..I)
  const formats: IeltsTask2Format[] = [];
  if (formatCol >= 0) {
    type RawFmtBlock = { questionType: string; rows: Array<{ part: string; text: string }> };
    const rawBlocks: RawFmtBlock[] = [];
    let activeBlock: RawFmtBlock | null = null;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const fText = (r[formatCol] || '').trim();
      const fPart = formatPartCol >= 0 ? (r[formatPartCol] || '').trim() : '';
      const fQType = formatQTypeCol >= 0 ? (r[formatQTypeCol] || '').trim() : '';

      if (!fText) {
        if (activeBlock && activeBlock.rows.length > 0) {
          rawBlocks.push(activeBlock);
          activeBlock = null;
        }
        continue;
      }

      // Split cleanly if a new Introduction starts while a previous block already has non-Intro rows
      if (
        /^introduction$/i.test(fPart) &&
        activeBlock &&
        activeBlock.rows.some((x) => !/^introduction$/i.test(x.part))
      ) {
        rawBlocks.push(activeBlock);
        activeBlock = null;
      }

      if (!activeBlock) {
        activeBlock = { questionType: fQType || 'IELTS Task 2 Essay', rows: [] };
      } else if (fQType && activeBlock.questionType === 'IELTS Task 2 Essay') {
        activeBlock.questionType = fQType;
      }

      activeBlock.rows.push({ part: fPart || 'Paragraph', text: fText });
    }
    if (activeBlock && activeBlock.rows.length > 0) {
      rawBlocks.push(activeBlock);
    }

    const typeCounts = new Map<string, number>();
    rawBlocks.forEach((blk, idx) => {
      const qType = blk.questionType || 'IELTS Task 2 Essay';
      const nextCount = (typeCounts.get(qType) || 0) + 1;
      typeCounts.set(qType, nextCount);

      const sections = normalizeTask2FormatSections(blk.rows);
      const introText = sections[0]?.text || '';
      formats.push({
        id: `t2-fmt::${idx + 1}`,
        questionType: qType,
        variantLabel: detectFormatVariantLabel(qType, introText, nextCount),
        sections,
      });
    });
  }

  return { prompts, formats, vocab };
}

function splitSpeakingSentences(answer: string): string[] {
  // Clean accidental doubled quotes between sentences (e.g. `well-trained.""Besides`)
  const normalized = answer
    .replace(/\r\n/g, '\n')
    .replace(/([.!?])["“”]{1,2}([A-Z])/g, '$1 $2')
    .replace(/\u2019/g, "'")
    .trim();
  if (!normalized) return [];

  const result: string[] = [];
  const paragraphs = normalized.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  for (const para of paragraphs) {
    // Split after sentence-ending '.', '!', or '?' followed by space/end, preserving common abbreviations
    const protectedPara = para.replace(
      /\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|e\.g|i\.e)\./gi,
      '$1__DOT__'
    );
    const matches = protectedPara.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [protectedPara];
    for (const m of matches) {
      const sentence = m.replace(/__DOT__/g, '.').replace(/\s+/g, ' ').trim();
      if (sentence) result.push(sentence);
    }
  }
  return result;
}

function parseIeltsSpeaking(rows: string[][]): IeltsSpeakingItem[] {
  const headerIdx = rows.findIndex((r) => /^Question$/i.test(r[0] || ''));
  if (headerIdx === -1) return [];
  const header = rows[headerIdx] || [];
  const answerCol = header.findIndex((c) => /^Answer$/i.test(c));
  const partCol = header.findIndex((c) => /^Part$/i.test(c));
  const topicCol = header.findIndex((c) => /^(Topic|Chủ đề)/i.test(c));

  const out: IeltsSpeakingItem[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const rawQuestion = (r[0] || '').trim();
    const answer = ((answerCol >= 0 ? r[answerCol] : r[1]) || '').trim();
    if (!rawQuestion && !answer) continue;

    // Separate optional Vietnamese translation appended after " - "
    let question = rawQuestion;
    let questionVi: string | undefined;
    const viSplit = rawQuestion.match(/^(.+?[?.!])\s*[-–—]\s*(.+)$/);
    if (viSplit) {
      question = viSplit[1].trim();
      questionVi = viSplit[2].trim();
    }

    const rawPart = partCol >= 0 ? (r[partCol] || '').trim() : '';
    let part: SpeakingPart;
    if (/^(?:part\s*)?1\b/i.test(rawPart)) {
      part = 'Part 1';
    } else if (/^(?:part\s*)?2\b/i.test(rawPart)) {
      part = 'Part 2';
    } else if (/^(?:part\s*)?3\b/i.test(rawPart)) {
      part = 'Part 3';
    } else if (/^describe\b/i.test(question)) {
      part = 'Part 2';
    } else {
      part = 'Chưa gắn Part';
    }

    out.push({
      id: `speaking::${out.length + 1}`,
      question,
      questionVi,
      answer,
      sentences: splitSpeakingSentences(answer),
      part,
      topic: topicCol >= 0 ? (r[topicCol] || '').trim() || undefined : undefined,
    });
  }
  return out;
}

function extractYoutubeVideoId(url: string): string | undefined {
  const s = url.trim();
  if (!s) return undefined;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return undefined;
}

function parseLyricsBreakdown(raw: string): LyricSection[] {
  const lines = splitLines(raw);
  if (lines.length === 0) return [];
  const sections: LyricSection[] = [];
  let current: LyricSection | null = null;

  for (const line of lines) {
    if (/^\[[^\]]+\]$/.test(line)) {
      current = { label: line, lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { label: '[Lyrics]', lines: [] };
      sections.push(current);
    }
    const [enAndVi, noteRaw] = line.split(/\s*\|\|\s*/);
    const [enRaw, viRaw] = (enAndVi || '').split(/\s*=>\s*/);
    const parsed: LyricLine = {
      en: (enRaw || '').trim(),
      vi: viRaw ? viRaw.trim() : undefined,
      note: noteRaw ? noteRaw.trim() : undefined,
    };
    if (parsed.en) current.lines.push(parsed);
  }
  return sections.filter((s) => s.lines.length > 0);
}

function parseLyricsVocab(raw: string): LyricVocabItem[] {
  const out: LyricVocabItem[] = [];
  for (const line of splitLines(raw)) {
    const cleaned = line.replace(/^[-•*\d.]+\s*/, '').trim();
    if (!cleaned) continue;
    const parts = cleaned.split(/\s*\|\s*/);
    const phrase = (parts[0] || '').trim();
    if (!phrase) continue;
    if (parts.length >= 3) {
      out.push({
        phrase,
        register: parts[1]?.trim() || undefined,
        meaning: parts[2]?.trim() || '',
        usage: parts[3]?.trim() || undefined,
        quote: parts[4]?.trim() || undefined,
      });
    } else {
      out.push({
        phrase,
        meaning: parts[1]?.trim() || '',
      });
    }
  }
  return out;
}

function parseLyricsSheet(rows: string[][]): SongLyricItem[] {
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => /youtube\s*link|song\s*title/i.test(c || ''))
  );
  if (headerIdx === -1) return [];
  const header = rows[headerIdx] || [];
  const col = (re: RegExp, fallback: number) => {
    const idx = header.findIndex((c) => re.test(c || ''));
    return idx >= 0 ? idx : fallback;
  };

  const urlCol = col(/youtube|link|url/i, 0);
  const titleCol = col(/song\s*title|title|tên bài/i, 1);
  const artistCol = col(/artist|ca sĩ/i, 2);
  const statusCol = col(/status|trạng thái/i, 3);
  const genreCol = col(/genre|vibe/i, 4);
  const contextCol = col(/context|story|bối cảnh/i, 5);
  const breakdownCol = col(/breakdown|lyrics/i, 6);
  const vocabCol = col(/slang|vocab/i, 7);
  const lrcCol = col(/lrc|synced/i, 8);
  const noteCol = col(/personal|note/i, 9);
  const albumCol = header.findIndex((c) => /album|playlist/i.test(c || ''));

  const out: SongLyricItem[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const youtubeUrl = (r[urlCol] || '').trim();
    const rawTitle = (r[titleCol] || '').trim();
    const artist = (r[artistCol] || '').trim();
    if (!youtubeUrl && !rawTitle) continue;

    const sections = parseLyricsBreakdown(r[breakdownCol] || '');
    const vocab = parseLyricsVocab(r[vocabCol] || '');
    const rawStatus = (r[statusCol] || '').trim();
    const status: 'Pending' | 'Done' =
      sections.length > 0 || vocab.length > 0 || /^done$/i.test(rawStatus)
        ? 'Done'
        : 'Pending';

    out.push({
      id: `lyric::${out.length + 1}`,
      youtubeUrl,
      videoId: extractYoutubeVideoId(youtubeUrl),
      title: rawTitle || `Bài hát #${out.length + 1} (Chờ AI lấy tên)`,
      artist: artist || (status === 'Pending' ? 'Chờ AI phân tích' : 'Unknown Artist'),
      album: albumCol >= 0 ? (r[albumCol] || '').trim() || undefined : undefined,
      status,
      genreVibe: (r[genreCol] || '').trim() || undefined,
      contextStory: (r[contextCol] || '').trim() || undefined,
      sections,
      vocab,
      syncedLrc: (r[lrcCol] || '').trim() || undefined,
      personalNote: (r[noteCol] || '').trim() || undefined,
    });
  }
  return out;
}

function parseNewsSheet(rows: string[][]): NewsArticleItem[] {
  const out: NewsArticleItem[] = [];
  if (rows.length < 2) return out;

  const headerIdx = rows.findIndex((r) =>
    r.some((c) => /article url|title|bilingual breakdown/i.test(c || ''))
  );
  if (headerIdx === -1) return out;

  const header = rows[headerIdx] || [];
  const colOf = (re: RegExp, fallback: number) => {
    const idx = header.findIndex((c) => re.test(c || ''));
    return idx >= 0 ? idx : fallback;
  };

  const urlCol = colOf(/article url|url|link/i, 0);
  const titleCol = colOf(/^title|tiêu đề/i, 1);
  const sourceCol = colOf(/source|nguồn/i, 2);
  const categoryCol = colOf(/category|chủ đề/i, 3);
  const statusCol = colOf(/status|trạng thái/i, 4);
  const dateCol = colOf(/published|date|ngày/i, 5);
  const summaryCol = colOf(/summary|takeaways|tóm tắt/i, 6);
  const breakdownCol = colOf(/bilingual|breakdown|song ngữ/i, 7);
  const vocabCol = colOf(/vocab|collocations|từ vựng/i, 8);
  const quizCol = colOf(/quiz|reading|câu hỏi/i, 9);
  const imageCol = colOf(/image|ảnh/i, 10);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const url = (r[urlCol] || '').trim();
    const rawTitle = (r[titleCol] || '').trim();
    if (!url && !rawTitle) continue;

    const summaryPoints = splitLines(r[summaryCol] || '').map((l) =>
      l.replace(/^[•\-*]\s*/, '').trim()
    );

    const paragraphs: NewsParagraph[] = [];
    for (const line of splitLines(r[breakdownCol] || '')) {
      const [enPart, rest] = line.split(/\s*=>\s*/);
      if (!enPart?.trim()) continue;
      if (rest !== undefined) {
        const [viPart, notePart] = rest.split(/\s*\|\|\s*/);
        paragraphs.push({
          en: enPart.trim(),
          vi: viPart?.trim() || undefined,
          note: notePart?.trim() || undefined,
        });
      } else {
        paragraphs.push({ en: enPart.trim() });
      }
    }

    const vocab: NewsVocabItem[] = [];
    for (const line of splitLines(r[vocabCol] || '')) {
      const parts = line
        .replace(/^[•\-*]\s*/, '')
        .split('|')
        .map((p) => p.trim());
      if (!parts[0]) continue;
      if (parts.length >= 3) {
        vocab.push({
          word: parts[0],
          level: parts[1] || undefined,
          meaning: parts[2] || '',
          usage: parts[3] || undefined,
          quote: parts[4] || undefined,
        });
      } else {
        vocab.push({
          word: parts[0],
          meaning: parts[1] || '',
        });
      }
    }

    const quiz: NewsQuizQuestion[] = [];
    for (const line of splitLines(r[quizCol] || '')) {
      const parts = line
        .replace(/^[•\-*\d.)]+\s*/, '')
        .split('|')
        .map((p) => p.trim());
      const kind = (parts[0] || '').toUpperCase();
      if (kind === 'TFNG' && parts.length >= 3) {
        quiz.push({
          type: 'TFNG',
          question: parts[1],
          options: ['TRUE', 'FALSE', 'NOT GIVEN'],
          answer: (parts[2] || '').toUpperCase(),
          explanation: parts[3] || '',
        });
      } else if (kind === 'MCQ' && parts.length >= 4) {
        const options = (parts[2] || '')
          .split(';;')
          .map((o) => o.trim())
          .filter(Boolean);
        quiz.push({
          type: 'MCQ',
          question: parts[1],
          options,
          answer: parts[3] || '',
          explanation: parts[4] || '',
        });
      }
    }

    const rawStatus = (r[statusCol] || '').trim().toLowerCase();
    const status: 'Pending' | 'Done' =
      rawStatus === 'done' || rawStatus === 'hoàn thành' || paragraphs.length > 0
        ? 'Done'
        : 'Pending';

    out.push({
      id: `news::${out.length + 1}`,
      url,
      title: rawTitle || `Bài báo #${out.length + 1} (Chờ AI phân tích)`,
      source: (r[sourceCol] || '').trim() || (status === 'Pending' ? 'Chờ AI lấy nguồn' : 'News'),
      category: (r[categoryCol] || '').trim() || 'General',
      status,
      publishedDate: (r[dateCol] || '').trim() || undefined,
      imageUrl: isUrl(r[imageCol] || '') ? r[imageCol].trim() : undefined,
      summaryPoints,
      paragraphs,
      vocab,
      quiz,
    });
  }

  return out;
}

const SKIP_SHEETS = new Set(['Template', 'Bookshelf']);

export function buildLibrary(): ParsedLibrary {
  const vocab: VocabItem[] = [];
  const decks: DeckInfo[] = [];
  const phrasalVerbs: PhrasalVerbItem[] = [];
  const prepositions: PrepositionItem[] = [];
  const idioms: IdiomItem[] = [];
  const collocations: CollocationItem[] = [];
  const ieltsTask1: IeltsTask1Item[] = [];
  const ieltsTask1Examples: IeltsTask1Example[] = [];
  const ieltsTask2: IeltsTask2Prompt[] = [];
  const ieltsTask2Formats: IeltsTask2Format[] = [];
  const ieltsSpeaking: IeltsSpeakingItem[] = [];
  const lyrics: SongLyricItem[] = [];
  const news: NewsArticleItem[] = [];

  const preferredOrder = [
    'Comprehensible Input',
    'Core Vocabulary',
    'Books',
    'IELTS Reading',
    'IELTS Speaking',
    'IELTS Writing Task 2',
    'IELTS Chart',
    'IELTS Map',
    'IELTS Process',
    'IELTS Listening',
    'Lyrics',
    'News',
    'News Vocab',
    'Book Vocab',
    'Video Vocab',
    'Adjective',
    'Verb',
    'Adjective Practice',
    'Phrasal Verbs Library',
    'Phrasal Verb',
    'Prepositions',
    'Idioms',
    'Collocations',
  ];

  const entries = Object.entries(rawSheets).sort(([a], [b]) => {
    const nameA = a.replace(/\.csv$/i, '');
    const nameB = b.replace(/\.csv$/i, '');
    const ia = preferredOrder.indexOf(nameA);
    const ib = preferredOrder.indexOf(nameB);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return nameA.localeCompare(nameB);
  });

  for (const [fileName, csvText] of entries) {
    const name = fileName.replace(/\.csv$/i, '');
    if (SKIP_SHEETS.has(name)) continue;
    const rows = parseCsvRows(csvText);

    if (name === 'IELTS Chart') {
      const { tasks, examples } = parseIeltsTask1Sheet(rows, name, 'chart', task1Images[name] || {});
      ieltsTask1.push(...tasks);
      ieltsTask1Examples.push(...examples);
      decks.push({
        name,
        fileName,
        count: tasks.length,
        hasImages: tasks.some((t) => Boolean(t.imageUrl)),
        kind: 'special',
      });
      continue;
    }
    if (name === 'IELTS Process') {
      const { tasks, examples } = parseIeltsTask1Sheet(rows, name, 'process', task1Images[name] || {});
      ieltsTask1.push(...tasks);
      ieltsTask1Examples.push(...examples);
      decks.push({
        name,
        fileName,
        count: tasks.length,
        hasImages: tasks.some((t) => Boolean(t.imageUrl)),
        kind: tasks.length || examples.length ? 'special' : 'empty',
      });
      continue;
    }
    if (name === 'IELTS Map') {
      const { tasks, examples } = parseIeltsTask1Sheet(rows, name, 'map', task1Images[name] || {});
      ieltsTask1.push(...tasks);
      ieltsTask1Examples.push(...examples);
      const parsedMapVocab = parseGenericVocab(rows, name);
      vocab.push(...parsedMapVocab);
      decks.push({
        name,
        fileName,
        count: parsedMapVocab.length,
        hasImages: tasks.some((t) => Boolean(t.imageUrl)),
        kind: parsedMapVocab.length > 0 ? 'vocab' : 'empty',
      });
      continue;
    }
    if (name === 'Lyrics') {
      const parsed = parseLyricsSheet(rows);
      lyrics.push(...parsed);
      decks.push({
        name,
        fileName,
        count: parsed.length,
        hasImages: false,
        kind: parsed.length > 0 ? 'special' : 'empty',
      });
      continue;
    }
    if (name === 'News') {
      const parsed = parseNewsSheet(rows);
      news.push(...parsed);
      decks.push({
        name,
        fileName,
        count: parsed.length,
        hasImages: parsed.some((n) => Boolean(n.imageUrl)),
        kind: parsed.length > 0 ? 'special' : 'empty',
      });
      continue;
    }
    if (name === 'IELTS Speaking') {
      const parsed = parseIeltsSpeaking(rows);
      ieltsSpeaking.push(...parsed);
      decks.push({
        name,
        fileName,
        count: parsed.length,
        hasImages: false,
        kind: parsed.length > 0 ? 'special' : 'empty',
      });
      continue;
    }
    if (name === 'IELTS Writing Task 2') {
      const { prompts, formats, vocab: t2Vocab } = parseIeltsWritingTask2(rows, name);
      ieltsTask2.push(...prompts);
      ieltsTask2Formats.push(...formats);
      vocab.push(...t2Vocab);
      decks.push({
        name,
        fileName,
        count: t2Vocab.length,
        hasImages: false,
        kind: t2Vocab.length > 0 ? 'vocab' : 'empty',
      });
      continue;
    }
    if (name === 'Phrasal Verbs Library') {
      const parsed = parsePhrasalVerbsLibrary(rows);
      phrasalVerbs.push(...parsed);
      decks.push({ name, fileName, count: parsed.length, hasImages: false, kind: 'special' });
      continue;
    }
    if (name === 'Prepositions') {
      const parsed = parsePrepositions(rows);
      prepositions.push(...parsed);
      decks.push({ name, fileName, count: parsed.length, hasImages: false, kind: 'special' });
      continue;
    }
    if (name === 'Idioms') {
      const parsed = parseIdioms(rows);
      idioms.push(...parsed);
      decks.push({ name, fileName, count: parsed.length, hasImages: false, kind: 'special' });
      continue;
    }
    if (name === 'Collocations') {
      const parsed = parseCollocations(rows);
      collocations.push(...parsed);
      decks.push({ name, fileName, count: parsed.length, hasImages: false, kind: 'special' });
      continue;
    }
    if (name === 'Phrasal Verb') {
      const parsed = parsePersonalPhrasalVerbs(rows);
      phrasalVerbs.push(...parsed);
      decks.push({
        name,
        fileName,
        count: parsed.length,
        hasImages: false,
        kind: parsed.length ? 'special' : 'empty',
      });
      continue;
    }

    let parsedVocab: VocabItem[] = [];
    if (name === 'Core Vocabulary') {
      parsedVocab = parseCoreVocabulary(rows, name);
    } else if (name === 'Comprehensible Input') {
      const ci = parseComprehensibleInput(rows, name);
      parsedVocab = ci.vocab;
      collocations.push(...ci.collocations);
    } else if (name === 'Books') {
      parsedVocab = parseBooks(rows, name);
    } else if (name === 'IELTS Reading') {
      parsedVocab = parseIeltsReading(rows, name);
    } else if (name === 'IELTS Listening') {
      parsedVocab = parseIeltsListening(rows, name);
    } else if (name === 'Adjective Practice') {
      parsedVocab = parseAdjectivePractice(rows, name);
    } else if (name === 'Adjective') {
      parsedVocab = parseAdjective(rows, name);
    } else {
      parsedVocab = parseGenericVocab(rows, name);
    }

    vocab.push(...parsedVocab);
    decks.push({
      name,
      fileName,
      count: parsedVocab.length,
      hasImages: parsedVocab.some((v) => Boolean(v.imageUrl)),
      kind: parsedVocab.length > 0 ? 'vocab' : 'empty',
    });
  }

  return {
    vocab,
    decks,
    phrasalVerbs,
    prepositions,
    idioms,
    collocations,
    ieltsTask1,
    ieltsTask1Examples,
    ieltsTask2,
    ieltsTask2Formats,
    ieltsSpeaking,
    lyrics,
    news,
    loadedAt,
  };
}
