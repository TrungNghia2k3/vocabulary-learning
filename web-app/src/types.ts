export type Accent = 'en-GB' | 'en-US';

export type AppMode =
  | 'dashboard'
  | 'browse'
  | 'flashcard'
  | 'quiz'
  | 'image-quiz'
  | 'syn-ant-quiz'
  | 'spelling'
  | 'today'
  | 'prepositions'
  | 'phrasal-verbs'
  | 'idioms'
  | 'collocations'
  | 'ielts-task1'
  | 'ielts-task2'
  | 'ielts-speaking';

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

export interface IeltsTask1Sentence {
  text: string;
  meaning?: string;
}

export interface IeltsTask1Section {
  part: string;
  sentences: IeltsTask1Sentence[];
}

export interface IeltsTask1EssayVariant {
  id: string;
  label: string;
  sections: IeltsTask1Section[];
}

export interface IeltsTask1Item {
  id: string;
  title: string;
  sourceSheet: string;
  taskType: 'chart' | 'map' | 'process';
  chartType: string;
  imageUrl?: string;
  sections: IeltsTask1Section[];
  essays: IeltsTask1EssayVariant[];
}

export interface IeltsTask1Example {
  id: string;
  taskType: 'chart' | 'map' | 'process';
  sourceSheet: string;
  part: string;
  basePart: string;
  text: string;
  meaning?: string;
}

export interface IeltsTask2Expression {
  id: string;
  phrase: string;
  meaning: string;
  part?: string;
}

export interface IeltsTask2Section {
  part: string;
  text: string;
}

export interface IeltsTask2EssayVariant {
  id: string;
  label: string;
  sections: IeltsTask2Section[];
}

export interface IeltsTask2Format {
  id: string;
  questionType: string;
  variantLabel: string;
  sections: IeltsTask2Section[];
}

export interface IeltsTask2Prompt {
  id: string;
  title: string;
  prompt: string;
  questionType: string;
  expressions: IeltsTask2Expression[];
  sampleSections: IeltsTask2Section[];
  sampleEssays: IeltsTask2EssayVariant[];
}

export type SpeakingPart = 'Part 1' | 'Part 2' | 'Part 3' | 'Chưa gắn Part';

export interface IeltsSpeakingItem {
  id: string;
  question: string;
  questionVi?: string;
  answer: string;
  sentences: string[];
  part: SpeakingPart;
  topic?: string;
}

export interface ParsedLibrary {
  vocab: VocabItem[];
  decks: DeckInfo[];
  phrasalVerbs: PhrasalVerbItem[];
  prepositions: PrepositionItem[];
  idioms: IdiomItem[];
  collocations: CollocationItem[];
  ieltsTask1: IeltsTask1Item[];
  ieltsTask1Examples: IeltsTask1Example[];
  ieltsTask2: IeltsTask2Prompt[];
  ieltsTask2Formats: IeltsTask2Format[];
  ieltsSpeaking: IeltsSpeakingItem[];
  loadedAt: string;
}
