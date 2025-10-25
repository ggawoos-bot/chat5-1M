export const Role = {
  USER: 'user',
  MODEL: 'model',
} as const;

export type Role = typeof Role[keyof typeof Role];

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  sources?: string[];
}

export interface SourceInfo {
  id: string;
  title: string;
  content: string;
  type: 'pdf' | 'text' | 'url';
  section?: string;
  page?: number;
  documentType?: 'legal' | 'guideline';
}

export interface Chunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    title: string;
    pageNumber?: number;
    chunkIndex: number;
    startPosition: number;
    endPosition: number;
    articles?: string[];
    sectionTitle?: string;
    documentType?: 'legal' | 'guideline';
  };
  keywords: string[];
  location: {
    document: string;
    section?: string;
    subsection?: string;
    page?: number;
  };
  relevanceScore?: number;
}

export interface QuestionAnalysis {
  intent: string;
  keywords: string[];
  category: 'definition' | 'procedure' | 'regulation' | 'comparison' | 'analysis' | 'general';
  complexity: 'simple' | 'medium' | 'complex';
  entities: string[];
  context: string;
}