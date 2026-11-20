export type Accent = 'en-GB' | 'en-US';

export type AppMode =
  | 'dashboard'
  | 'browse'
  | 'flashcard'
  | 'quiz'
  | 'syn-ant-quiz'
  | 'spelling'
  | 'today'
  | 'prepositions'
  | 'phrasal-verbs'
  | 'idioms'
  | 'collocations';

export interface WordPair {
  word: string;
  meaning?: string;
}

export interface WordDefinition {
  partOfSpeech?: string;
  definition: string;
  example?: string;
}

export interface VocabItem {
  id: string;
  word: string;
  deck: string;
  section?: string;
  subtopic?: string;
  meaning: string;
  partOfSpeech?: string;
  level?: string;
  phoneticUk?: string;
  phoneticUs?: string;
  imageUrl?: string;
  cambridgeUrl?: string;
  definitions: WordDefinition[];
  examples: string[];
  collocations: string[];
  memoryTip?: string;
  synonyms: WordPair[];
  antonyms: WordPair[];
  wordFamily: Record<string, WordPair[]>;
  paraphrase?: string;
}

export interface PhrasalVerbItem {
  id: string;
  verb: string;
  type: string;
  difficulty: string;
  particles: string[];
  meaningsVi: string[];
  definitions: string[];
  examples: Array<{ sentence: string; translation?: string }>;
  commonForms: Record<string, string>;
  usage?: string;
  synonyms: string[];
  source?: string;
}

export interface PrepositionUse {
  usage: string;
  description: string;
  examples: Array<{ sentence: string; translation?: string }>;
}

export interface PrepositionMistake {
  incorrect: string;
  correct: string;
  explanation: string;
}

export interface PrepositionItem {
  id: string;
  preposition: string;
  meaning: string;
  category: string;
  uses: PrepositionUse[];
  commonMistakes: PrepositionMistake[];
  relatedPrepositions: string[];
}

export interface IdiomItem {
  id: string;
  idiom: string;
  vietnamese: string;
  meaning: string;
  category: string;
  difficulty: string;
  formality: string;
  frequency: string;
  origin?: string;
  examples: Array<{ sentence: string; translation?: string; context?: string }>;
  usage?: string;
  synonyms: string[];
  relatedIdioms: string[];
}

export interface CollocationItem {
  id: string;
  phrase: string;
  meaning: string;
  example?: string;
  exampleTranslation?: string;
  sourceDeck: string;
  topic: string;
  subtopic?: string;
  relatedWord?: string;
}

export interface DeckInfo {
  name: string;
  fileName: string;
  count: number;
  hasImages: boolean;
  kind: 'vocab' | 'special' | 'empty';
}

export interface ParsedLibrary {
  vocab: VocabItem[];
  decks: DeckInfo[];
  phrasalVerbs: PhrasalVerbItem[];
  prepositions: PrepositionItem[];
  idioms: IdiomItem[];
  collocations: CollocationItem[];
  loadedAt: string;
}
