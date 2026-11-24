import Papa from 'papaparse';
import { loadedAt, rawSheets, task1Images } from 'virtual:vocab-sheets';
import type {
  CollocationItem,
  DeckInfo,
  IdiomItem,
  IeltsTask1Item,
  IeltsTask1Section,
  IeltsTask2Prompt,
  ParsedLibrary,
  PhrasalVerbItem,
  PrepositionItem,
  PrepositionMistake,
  PrepositionUse,
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
    const partOfSpeech = rawPos || (rawForms ? `verb · ${rawForms}` : undefined);

    items.push({
      id: makeId(deck, word, i),
      word,
      deck,
      section: topicCol >= 0 ? r[topicCol] || undefined : undefined,
      subtopic: subtopicCol >= 0 ? r[subtopicCol] || undefined : undefined,
      meaning,
      partOfSpeech,
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
): IeltsTask1Item[] {
  const headerIdx = rows.findIndex((r) => /^Word$/i.test(r[0] || ''));
  if (headerIdx === -1) return [];
  const header = rows[headerIdx] || [];
  const meaningCol = header.findIndex((c) => /meaning|nghĩa/i.test(c));
  const partCol = header.findIndex((c) => /^part$/i.test(c));
  const imgCol = header.findIndex((c) => /image|ảnh/i.test(c));

  type RawEntry = { rowNum: number; text: string; meaning?: string; part: string; img?: string };
  const blocks: RawEntry[][] = [];
  let current: RawEntry[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const text = (r[0] || '').trim();
    if (!text) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    const rowNum = i + 1; // 1-based Google Sheet row number
    const meaning = meaningCol >= 0 ? (r[meaningCol] || '').trim() || undefined : undefined;
    const part = (partCol >= 0 ? (r[partCol] || '').trim() : '') || 'Sample';
    const rawImg = imgCol >= 0 ? (r[imgCol] || '').trim() : '';
    const img = isUrl(rawImg) ? rawImg : embeddedMap[String(rowNum)];

    // If a brand new Introduction starts after Body 1/Body 2 without a blank separator, split cleanly
    if (
      /^Introduction$/i.test(part) &&
      current.some((e) => !/^Introduction$/i.test(e.part))
    ) {
      blocks.push(current);
      current = [];
    }
    current.push({ rowNum, text, meaning, part, img });
  }
  if (current.length > 0) blocks.push(current);

  const partOrder = ['Introduction', 'Overview', 'Body 1', 'Body 2'];
  const fallbackLabel =
    taskType === 'map' ? 'Map' : taskType === 'process' ? 'Process' : 'Chart';

  return blocks.map((block, idx) => {
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

    return {
      id: `task1::${sheetName}::${idx + 1}`,
      title: makeTask1Title(firstIntro, idx + 1),
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
    };
  });
}

function detectTask2Type(prompt: string): string {
  const low = prompt.toLowerCase();
  if (/agree or disagree|support or oppose/.test(low)) return 'Opinion (Agree / Disagree)';
  if (/discuss both/.test(low)) return 'Discussion (Both Views)';
  if (/positive or negative/.test(low)) return 'Positive / Negative';
  if (/advantages? and disadvantages?/.test(low)) return 'Advantages / Disadvantages';
  if (/causes?.*solutions?|problems?.*solutions?/.test(low)) return 'Problem / Solution';
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

function parseIeltsWritingTask2(
  rows: string[][],
  deck: string
): { prompts: IeltsTask2Prompt[]; vocab: VocabItem[] } {
  const headerIdx = rows.findIndex((r) => /^Word$/i.test(r[0] || ''));
  if (headerIdx === -1) return { prompts: [], vocab: [] };
  const header = rows[headerIdx] || [];
  const meaningCol = header.findIndex((c) => /meaning|nghĩa/i.test(c));
  const topicCol = header.findIndex((c) => /^(topic|prompt|chủ đề)/i.test(c));

  const prompts: IeltsTask2Prompt[] = [];
  const vocab: VocabItem[] = [];
  let currentPrompt: IeltsTask2Prompt | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const phrase = (r[0] || '').trim();
    const meaning = meaningCol >= 0 ? (r[meaningCol] || '').trim() : (r[1] || '').trim();
    const topicText = topicCol >= 0 ? (r[topicCol] || '').trim() : '';

    if (topicText) {
      currentPrompt = {
        id: `task2::${prompts.length + 1}`,
        title: makeTask2Title(topicText, prompts.length + 1),
        prompt: topicText,
        questionType: detectTask2Type(topicText),
        expressions: [],
      };
      prompts.push(currentPrompt);
    }

    if (!phrase) continue;
    if (!currentPrompt) {
      currentPrompt = {
        id: 'task2::general',
        title: 'General Writing Task 2 Expressions',
        prompt: 'General academic expressions for IELTS Writing Task 2',
        questionType: 'General',
        expressions: [],
      };
      prompts.push(currentPrompt);
    }

    currentPrompt.expressions.push({
      id: `t2-expr::${i}`,
      phrase,
      meaning,
    });

    vocab.push({
      id: makeId(deck, phrase, i),
      word: phrase,
      deck,
      section: currentPrompt.title,
      meaning,
      definitions: [],
      examples: [],
      collocations: [],
      synonyms: [],
      antonyms: [],
      wordFamily: {},
    });
  }

  return { prompts, vocab };
}

const SKIP_SHEETS = new Set(['Template']);

export function buildLibrary(): ParsedLibrary {
  const vocab: VocabItem[] = [];
  const decks: DeckInfo[] = [];
  const phrasalVerbs: PhrasalVerbItem[] = [];
  const prepositions: PrepositionItem[] = [];
  const idioms: IdiomItem[] = [];
  const collocations: CollocationItem[] = [];
  const ieltsTask1: IeltsTask1Item[] = [];
  const ieltsTask2: IeltsTask2Prompt[] = [];

  const preferredOrder = [
    'Comprehensible Input',
    'Core Vocabulary',
    'Books',
    'IELTS Reading',
    'IELTS Writing Task 2',
    'IELTS Chart',
    'IELTS Map',
    'IELTS Process',
    'IELTS Listening',
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
      const parsed = parseIeltsTask1Sheet(rows, name, 'chart', task1Images[name] || {});
      ieltsTask1.push(...parsed);
      decks.push({
        name,
        fileName,
        count: parsed.length,
        hasImages: parsed.some((t) => Boolean(t.imageUrl)),
        kind: 'special',
      });
      continue;
    }
    if (name === 'IELTS Process') {
      const parsed = parseIeltsTask1Sheet(rows, name, 'process', task1Images[name] || {});
      ieltsTask1.push(...parsed);
      decks.push({
        name,
        fileName,
        count: parsed.length,
        hasImages: parsed.some((t) => Boolean(t.imageUrl)),
        kind: parsed.length ? 'special' : 'empty',
      });
      continue;
    }
    if (name === 'IELTS Map') {
      const parsedTasks = parseIeltsTask1Sheet(rows, name, 'map', task1Images[name] || {});
      ieltsTask1.push(...parsedTasks);
      const parsedMapVocab = parseGenericVocab(rows, name);
      vocab.push(...parsedMapVocab);
      decks.push({
        name,
        fileName,
        count: parsedMapVocab.length,
        hasImages: parsedTasks.some((t) => Boolean(t.imageUrl)),
        kind: parsedMapVocab.length > 0 ? 'vocab' : 'empty',
      });
      continue;
    }
    if (name === 'IELTS Writing Task 2') {
      const { prompts, vocab: t2Vocab } = parseIeltsWritingTask2(rows, name);
      ieltsTask2.push(...prompts);
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
    ieltsTask2,
    loadedAt,
  };
}
