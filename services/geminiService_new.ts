import { GoogleGenAI } from '@google/genai';
import { SourceInfo, Chunk, QuestionAnalysis } from '../types';
import { pdfCompressionService, CompressionResult } from './pdfCompressionService';
import { questionAnalyzer, contextSelector } from './questionBasedContextService';
import { rpdService } from './rpdService';
import { log } from './loggingService';
import { progressiveLoadingService, LoadingProgress } from './progressiveLoadingService';
import { memoryOptimizationService, MemoryStats } from './memoryOptimizationService';
import { cachingService, CachedPDF } from './cachingService';

// API 키는 런타임에 동적으로 로딩 (브라우저 로딩 타이밍 문제 해결)

// API 키 로테이션을 위한 인덱스 (전역 변수 제거)

const SYSTEM_INSTRUCTION_TEMPLATE = `You are an expert assistant specialized in Korean legal and administrative documents. Your name is NotebookLM Assistant. 

CRITICAL INSTRUCTIONS FOR ACCURATE RAG SYSTEM:
1. **PRIMARY SOURCE**: Answer questions based EXCLUSIVELY on the provided source material
2. **DIRECT QUOTATION**: When possible, use direct quotes from the source material with quotation marks
3. **CITATION FORMAT**: Always cite the exact source with specific page/article references
4. **NO EXTERNAL KNOWLEDGE**: Do NOT use external knowledge or pre-trained information
5. **EXPLICIT SOURCE REFERENCE**: If information is not found in the source, clearly state "제공된 자료에서 해당 정보를 찾을 수 없습니다"
6. **VERBATIM QUOTES**: For critical information, use exact quotes from the source material
7. **STRUCTURED RESPONSE**: Use this format:
   - **Direct Quote**: "원문 인용"
   - **Explanation**: 상세 설명
   - **Source**: 정확한 출처 (문서명, 페이지/조항)
8. **MULTIPLE SOURCES**: When information appears in multiple sources, cite all relevant sources
9. **PRECISION**: Prioritize accuracy over completeness - better to be precise than comprehensive
10. **KOREAN LEGAL TERMINOLOGY**: Use exact terminology from the source documents

Here is the source material:
----START OF SOURCE---
{sourceText}
----END OF SOURCE---`;

// PDF.js를 전역으로 선언
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

export class GeminiService {
  private sources: SourceInfo[] = [];
  private ai: GoogleGenAI | null = null;
  private currentChatSession: any = null;
  private cachedSourceText: string | null = null;

  /**
   * 문서 유형 판별 함수
   */
  private getDocumentType(filename: string): 'legal' | 'guideline' {
    if (filename.includes('국민건강증진법률 시행령 시행규칙')) {
      return 'legal'; // 법령 문서
    }
    if (filename.includes('질서위반행위규제법')) {
      return 'legal'; // 법령 문서
    }
    return 'guideline'; // 업무지침, 매뉴얼 등
  }

  /**
   * 청크에서 출처 정보 생성 (문서 유형별 처리)
   */
  private generateSourceInfoFromChunks(chunks: Chunk[]): SourceInfo[] {
    const sourceMap = new Map<string, SourceInfo>();
    
    chunks.forEach(chunk => {
      const docType = chunk.metadata?.documentType || 'guideline';
      const filename = chunk.metadata?.source || chunk.location?.document || 'unknown';
      
      if (docType === 'legal') {
        // 법령 문서: 조항 기반 출처
        const articles = chunk.metadata?.articles || [];
        const mainArticle = articles[0] || chunk.location?.section || '일반';
        const sourceKey = `${filename}-${mainArticle}`;
        
        if (!sourceMap.has(sourceKey)) {
          sourceMap.set(sourceKey, {
            id: sourceKey,
            title: filename.replace('.pdf', ''),
            content: '',
            type: 'pdf',
            section: mainArticle,
            page: null,
            documentType: 'legal'
          });
        }
      } else {
        // 일반 문서: 페이지 기반 출처
        const pageNumber = chunk.metadata?.pageNumber || chunk.location?.page;
        const section = chunk.location?.section || '일반';
        const sourceKey = `${filename}-${pageNumber}-${section}`;
        
        if (!sourceMap.has(sourceKey)) {
          sourceMap.set(sourceKey, {
            id: sourceKey,
            title: filename.replace('.pdf', ''),
            content: '',
            type: 'pdf',
            section: section,
            page: pageNumber,
            documentType: 'guideline'
          });
        }
      }
    });
    
    return Array.from(sourceMap.values());
  }

  /**
   * 런타임에 API 키를 동적으로 가져오는 메서드 (폴백 메커니즘 포함)
   */
  private getApiKeys(): string[] {
    const keys = [
      import.meta.env.VITE_GEMINI_API_KEY || '',
      import.meta.env.VITE_GEMINI_API_KEY_1 || '',
      import.meta.env.VITE_GEMINI_API_KEY_2 || '',
    ].filter(key => key && key !== 'YOUR_GEMINI_API_KEY_HERE' && key !== '');
    
    console.log('GeminiService 런타임 API 키 로딩:', keys.map(k => k ? k.substring(0, 10) + '...' : 'undefined'));
    console.log(`GeminiService: 총 ${keys.length}개의 유효한 API 키 발견`);
    return keys;
  }

  /**
   * 다음 사용 가능한 API 키를 가져오는 메서드 (런타임 동적 로딩)
   */
  private getNextAvailableKey(): string | null {
    const API_KEYS = this.getApiKeys(); // 런타임에 동적 로딩
    
    if (API_KEYS.length === 0) {
      console.warn('런타임에 API 키를 찾을 수 없습니다.');
      return null;
    }
    
    // 간단한 로테이션을 위한 랜덤 선택
    const selectedKey = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
    const keyIndex = API_KEYS.indexOf(selectedKey);
    
    console.log(`GeminiService API 키 선택: ${selectedKey.substring(0, 10)}... (인덱스: ${keyIndex})`);
    
    return selectedKey;
  }

  /**
   * PDF 파일들을 초기화하고 소스 정보를 설정
   */
  async initializeWithPdfSources(pdfFiles: string[]): Promise<void> {
    console.log('PDF 소스 초기화 시작...');
    
    // PDF 파일들을 SourceInfo로 변환
    this.sources = pdfFiles.map((fileName, index) => {
      const docType = this.getDocumentType(fileName);
      return {
        id: (index + 1).toString(),
        title: fileName,
        content: '',
        type: 'pdf' as const,
        documentType: docType
      };
    });
    
    console.log(`PDF 소스 초기화 완료: ${this.sources.length}개 파일`);
  }

  /**
   * PDF 데이터를 로드하고 캐시
   */
  async loadPdfData(): Promise<void> {
    try {
      console.log('PDF 데이터 로딩 시작...');
      
      // processed-pdfs.json 파일에서 데이터 로드
      const response = await fetch('/data/processed-pdfs.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('PDF 데이터 로드 완료:', data);
      
      // 모든 청크의 텍스트를 결합하여 캐시
      this.cachedSourceText = data.chunks
        .map((chunk: any) => chunk.content)
        .join('\n\n---\n\n');
      
      console.log(`캐시된 소스 텍스트 길이: ${this.cachedSourceText.length}자`);
      
    } catch (error) {
      console.error('PDF 데이터 로딩 실패:', error);
      throw error;
    }
  }

  /**
   * 질문 분석 및 컨텍스트 선택을 통한 응답 생성
   */
  async generateResponseWithSources(message: string): Promise<{ content: string; sources: SourceInfo[] }> {
    try {
      // API 키 확인
      const apiKey = this.getNextAvailableKey();
      if (!apiKey) {
        throw new Error('사용 가능한 API 키가 없습니다.');
      }

      // AI 인스턴스 초기화
      if (!this.ai) {
        this.ai = new GoogleGenAI({ apiKey });
      }

      // PDF 데이터가 없으면 로드
      if (!this.cachedSourceText) {
        await this.loadPdfData();
      }

      // 질문 분석
      const questionAnalysis = await questionAnalyzer.analyzeQuestion(message);
      console.log('질문 분석 결과:', questionAnalysis);

      // 컨텍스트 선택
      const relevantChunks = await contextSelector.selectRelevantContext(message, questionAnalysis);
      console.log(`관련 청크 선택: ${relevantChunks.length}개`);

      // 2.5. 청크에서 출처 정보 생성 (문서 유형별 처리)
      const sourceInfo = this.generateSourceInfoFromChunks(relevantChunks);

      // 선택된 컨텍스트를 새로운 형식으로 구성
      const sourceMaterial = relevantChunks
        .map((chunk, index) => {
          const relevanceScore = (chunk as any).relevanceScore || 0;
          const pageInfo = chunk.metadata.pageNumber ? `p.${chunk.metadata.pageNumber}` : '';
          const articleInfo = chunk.metadata.articles?.length ? chunk.metadata.articles.join(', ') : '';
          const sourceRef = pageInfo || articleInfo || '일반';

          return `[청크 ${chunk.id}]
출처: ${chunk.metadata.source}
페이지/조항: ${sourceRef}
관련도: ${relevanceScore.toFixed(2)}
내용: ${chunk.content}`;
        })
        .join('\n\n---\n\n');

      // 새로운 시스템 지시사항과 소스 텍스트 결합
      const systemInstruction = `${SYSTEM_INSTRUCTION_TEMPLATE}

### SOURCE MATERIAL:
${sourceMaterial}

### USER QUESTION:
${message}

Please provide your answer following the mandatory response format.`;

      // 모델 생성
      const model = this.ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // 응답 생성
      const result = await model.generateContent(systemInstruction);
      const response = await result.response;
      const text = response.text();

      console.log('응답 생성 완료');
      return { content: text, sources: sourceInfo };

    } catch (error) {
      console.error('응답 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 기본 응답 생성 (소스 정보 없이)
   */
  async generateResponse(message: string): Promise<string> {
    try {
      // API 키 확인
      const apiKey = this.getNextAvailableKey();
      if (!apiKey) {
        throw new Error('사용 가능한 API 키가 없습니다.');
      }

      // AI 인스턴스 초기화
      if (!this.ai) {
        this.ai = new GoogleGenAI({ apiKey });
      }

      // PDF 데이터가 없으면 로드
      if (!this.cachedSourceText) {
        await this.loadPdfData();
      }

      // 시스템 지시사항과 소스 텍스트 결합
      const systemInstruction = `${SYSTEM_INSTRUCTION_TEMPLATE}

### SOURCE MATERIAL:
${this.cachedSourceText}

### USER QUESTION:
${message}

Please provide your answer following the mandatory response format.`;

      // 모델 생성
      const model = this.ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // 응답 생성
      const result = await model.generateContent(systemInstruction);
      const response = await result.response;
      const text = response.text();

      console.log('응답 생성 완료');
      return text;

    } catch (error) {
      console.error('응답 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 스트리밍 응답 생성
   */
  async generateStreamingResponse(message: string, onChunk: (chunk: string) => void): Promise<{ content: string; sources: SourceInfo[] }> {
    try {
      // API 키 확인
      const apiKey = this.getNextAvailableKey();
      if (!apiKey) {
        throw new Error('사용 가능한 API 키가 없습니다.');
      }

      // AI 인스턴스 초기화
      if (!this.ai) {
        this.ai = new GoogleGenAI({ apiKey });
      }

      // PDF 데이터가 없으면 로드
      if (!this.cachedSourceText) {
        await this.loadPdfData();
      }

      // 질문 분석
      const questionAnalysis = await questionAnalyzer.analyzeQuestion(message);
      console.log('질문 분석 결과:', questionAnalysis);

      // 컨텍스트 선택
      const relevantChunks = await contextSelector.selectRelevantContext(message, questionAnalysis);
      console.log(`관련 청크 선택: ${relevantChunks.length}개`);

      // 2.5. 청크에서 출처 정보 생성 (문서 유형별 처리)
      const sourceInfo = this.generateSourceInfoFromChunks(relevantChunks);

      // 선택된 컨텍스트를 새로운 형식으로 구성
      const sourceMaterial = relevantChunks
        .map((chunk, index) => {
          const relevanceScore = (chunk as any).relevanceScore || 0;
          const pageInfo = chunk.metadata.pageNumber ? `p.${chunk.metadata.pageNumber}` : '';
          const articleInfo = chunk.metadata.articles?.length ? chunk.metadata.articles.join(', ') : '';
          const sourceRef = pageInfo || articleInfo || '일반';

          return `[청크 ${chunk.id}]
출처: ${chunk.metadata.source}
페이지/조항: ${sourceRef}
관련도: ${relevanceScore.toFixed(2)}
내용: ${chunk.content}`;
        })
        .join('\n\n---\n\n');

      // 새로운 시스템 지시사항과 소스 텍스트 결합
      const systemInstruction = `${SYSTEM_INSTRUCTION_TEMPLATE}

### SOURCE MATERIAL:
${sourceMaterial}

### USER QUESTION:
${message}

Please provide your answer following the mandatory response format.`;

      // 모델 생성
      const model = this.ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // 스트리밍 응답 생성
      const result = await model.generateContentStream(systemInstruction);
      let fullText = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullText += chunkText;
        onChunk(chunkText);
      }

      console.log('스트리밍 응답 생성 완료');
      return { content: fullText, sources: sourceInfo };

    } catch (error) {
      console.error('스트리밍 응답 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 소스 정보 가져오기
   */
  getSources(): SourceInfo[] {
    return this.sources;
  }

  /**
   * 캐시된 소스 텍스트 가져오기
   */
  getCachedSourceText(): string | null {
    return this.cachedSourceText;
  }

  /**
   * 메모리 사용량 확인
   */
  getMemoryStats(): MemoryStats {
    return memoryOptimizationService.getMemoryStats();
  }

  /**
   * 캐시 정리
   */
  clearCache(): void {
    this.cachedSourceText = null;
    cachingService.clearCache();
    console.log('캐시 정리 완료');
  }
}

// 싱글톤 인스턴스 생성
export const geminiService = new GeminiService();
