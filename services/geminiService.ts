import { GoogleGenAI } from '@google/genai';
import { SourceInfo, Chunk, QuestionAnalysis } from '../types';
import { pdfCompressionService, CompressionResult } from './pdfCompressionService';
import { questionAnalyzer, contextSelector } from './questionBasedContextService';
import { rpdService } from './rpdService';
import { log } from './loggingService';

// API 키는 런타임에 동적으로 로딩 (브라우저 로딩 타이밍 문제 해결)

// API 키 로테이션을 위한 인덱스 (전역 변수 제거)

const SYSTEM_INSTRUCTION_TEMPLATE = `You are an expert assistant specialized in Korean legal and administrative documents. Your name is NotebookLM Assistant. 

IMPORTANT INSTRUCTIONS:
1. Answer questions based ONLY on the provided source material
2. Do NOT use external knowledge or pre-trained information
3. If information is not found in the source, clearly state "제공된 자료에서 해당 정보를 찾을 수 없습니다"
4. Always cite specific documents and sections when possible
5. For Korean legal/administrative terms, use the exact terminology from the source
6. Provide comprehensive answers by combining information from multiple relevant sections
7. If multiple documents contain related information, synthesize them coherently
8. Pay special attention to procedural steps, definitions, and regulatory requirements
9. Use formal Korean language appropriate for official documents
10. When presenting structured data (lists, comparisons, procedures, criteria), ALWAYS use Markdown tables for better readability
11. Use Markdown formatting for better presentation (bold, lists, tables, headings, etc.)
12. For tabular data, use proper Markdown table syntax with headers and aligned columns
13. IMPORTANT: When asked to create a table or present data in table format, use this exact Markdown table syntax:
    | Column 1 | Column 2 | Column 3 |
    |----------|----------|----------|
    | Data 1   | Data 2   | Data 3   |
14. Always include the separator row (---) between header and data rows
15. For source citations in tables, use abbreviated document names with page references:
    - "건강증진법(p.3)" for 국민건강증진법률 시행령 시행규칙
    - "업무지침(p.7)" for 금연구역 지정 관리 업무지침
    - "가이드라인(p.2)" for 유치원 어린이집 가이드라인
    - "매뉴얼(p.7)" for 금연지원서비스 통합시스템 매뉴얼
    - IMPORTANT PAGE CITATION RULES:
      * When information appears on multiple pages, include ALL relevant page numbers
      * Use actual PDF page numbers as they appear in [PAGE_X] markers in the source text
      * For multiple pages: "업무지침(p.7, 9, 12)" instead of just "업무지침(p.7)"
      * For consecutive pages: "업무지침(p.7-9)" 
      * For scattered pages: "업무지침(p.4, 7, 9, 12)"
      * Group page numbers by document and separate different documents with commas
      * Example: "건강증진법(p.3, 5), 업무지침(p.7, 9, 12), 매뉴얼(p.15)"
16. If the table already includes a "출처" or "관련 출처" column, do NOT add a separate 참조문서 section below
17. If the table does NOT have a source column, then add a "참조문서" section below with full document names and page numbers
18. IMPORTANT: If sources are already cited inline within the main text (e.g., "(건강증진법, p.6, 7; 업무지침, p.9)"), do NOT add a separate 참조문서 section below
19. Only add 참조문서 section when sources are NOT already mentioned in the main content
20. When citing sources, include page numbers or section references when available
21. BEFORE FINALIZING YOUR RESPONSE - VERIFICATION STEPS:
    * Check if the information you're citing appears on multiple pages
    * Scan through ALL [PAGE_X] markers in the source text
    * Include ALL relevant page numbers where the information appears
    * Verify that each cited page actually contains the mentioned information
    * If unsure, include more pages rather than fewer
22. Format the 참조문서 section (only when needed) as follows:
    ### 참조문서
    - **건강증진법**: 국민건강증진법률 시행령 시행규칙(202508) - p.3, 5, 8
    - **업무지침**: 금연구역 지정 관리 업무지침_2025개정판 - p.2, 4, 6, 60, 105, 108
    - **가이드라인**: 유치원, 어린이집 경계 10m 금연구역 관리 가이드라인 - p.1, 2, 3
    - **매뉴얼**: 금연지원서비스 통합시스템 사용자매뉴얼 - p.7, 9
    - Group all page numbers for each document in ascending order

23. EXAMPLES OF PROPER PAGE CITATIONS:
    - Single page: "업무지침(p.7)"
    - Multiple pages: "업무지침(p.7, 9, 12)"
    - Page range: "업무지침(p.7-9)"
    - Mixed: "업무지침(p.4, 7-9, 12)"
    - Multiple documents: "건강증진법(p.3, 5), 업무지침(p.7, 9, 12)"
    
    WRONG EXAMPLES TO AVOID:
    - "업무지침(p.7)" when information also appears on page 9
    - "업무지침(p.7-12)" when information is only on pages 7, 9, 12
    - Missing page numbers when information spans multiple pages

Here is the source material:
---START OF SOURCE---
{sourceText}
---END OF SOURCE---`;

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
  private isInitialized: boolean = false;
  private compressionResult: CompressionResult | null = null;
  private allChunks: Chunk[] = [];
  private fullPdfText: string = '';
  private currentAbortController: AbortController | null = null;
  private apiKeyFailures: Map<string, number> = new Map(); // API 키별 실패 횟수 추적
  private static currentKeyIndex: number = 0; // API 키 로테이션을 위한 인덱스 (static으로 변경)

  constructor() {
    this.initializeAI();
    // 비동기 로딩은 initializeWithPdfSources에서 처리
  }

  private initializeAI() {
    console.log('GeminiService AI 초기화 중...');
    
    try {
      // 런타임에 API 키 확인
      const apiKeys = this.getApiKeys();
      console.log(`사용 가능한 API 키 개수: ${apiKeys.length}`);
      
      if (apiKeys.length > 0) {
        console.log('API 키 로테이션 시스템 활성화');
        console.log('매 질문마다 다른 API 키를 사용합니다.');
        // 하이브리드 방식에서는 초기화 시 AI 인스턴스를 생성하지 않음
        // 매 질문마다 새로운 키로 인스턴스 생성
      } else {
        console.warn("API_KEY가 설정되지 않았습니다. 채팅 기능이 제한됩니다.");
        console.log('환경변수 확인:');
        console.log('VITE_GEMINI_API_KEY:', import.meta.env.VITE_GEMINI_API_KEY ? '설정됨' : '설정되지 않음');
        console.log('VITE_GEMINI_API_KEY_1:', import.meta.env.VITE_GEMINI_API_KEY_1 ? '설정됨' : '설정되지 않음');
        console.log('VITE_GEMINI_API_KEY_2:', import.meta.env.VITE_GEMINI_API_KEY_2 ? '설정됨' : '설정되지 않음');
      }
    } catch (error) {
      console.error('AI 초기화 중 오류 발생:', error);
    }
  }

  // ✅ 런타임에 API 키를 동적으로 가져오는 메서드 (폴백 메커니즘 포함)
  private getApiKeys(): string[] {
    try {
      const keys = [
        import.meta.env.VITE_GEMINI_API_KEY || '',
        import.meta.env.VITE_GEMINI_API_KEY_1 || '',
        import.meta.env.VITE_GEMINI_API_KEY_2 || '',
      ].filter(key => key && key !== 'YOUR_GEMINI_API_KEY_HERE' && key !== '');
      
      console.log('런타임 API 키 로딩:', keys.map(k => k ? k.substring(0, 10) + '...' : 'undefined'));
      console.log(`총 ${keys.length}개의 유효한 API 키 발견`);
      return keys;
    } catch (error) {
      console.error('API 키 로딩 중 오류 발생:', error);
      return [];
    }
  }

  // 다음 사용 가능한 API 키를 가져오는 메서드 (런타임 동적 로딩)
  private getNextAvailableKey(): string | null {
    const API_KEYS = this.getApiKeys(); // 런타임에 동적 로딩
    
    if (API_KEYS.length === 0) {
      log.warn('런타임에 API 키를 찾을 수 없습니다.');
      return null;
    }
    
    // 실패한 키들을 제외하고 사용 가능한 키 찾기
    const availableKeys = API_KEYS.filter(key => {
      const failures = this.apiKeyFailures.get(key) || 0;
      return failures < 3; // 3번 이상 실패한 키는 제외
    });
    
    if (availableKeys.length === 0) {
      log.warn('모든 API 키가 실패했습니다. 첫 번째 키로 재시도합니다.');
      // 모든 키가 실패했으면 실패 카운트를 리셋하고 첫 번째 키 사용
      this.apiKeyFailures.clear();
      return API_KEYS[0];
    }
    
    // currentKeyIndex 초기화 체크 (더 안전한 검증)
    if (isNaN(GeminiService.currentKeyIndex) || GeminiService.currentKeyIndex < 0) {
      GeminiService.currentKeyIndex = 0;
    }
    
    // 로테이션 방식으로 다음 키 선택 (매번 다른 키 사용)
    const selectedKey = availableKeys[GeminiService.currentKeyIndex % availableKeys.length];
    const keyIndex = GeminiService.currentKeyIndex % availableKeys.length;
    
    // 다음 호출을 위해 인덱스 증가
    GeminiService.currentKeyIndex = (GeminiService.currentKeyIndex + 1) % availableKeys.length;
    
    log.info(`API 키 선택`, {
      selectedKey: selectedKey.substring(0, 10) + '...',
      keyIndex,
      totalKeys: availableKeys.length,
      availableKeys: availableKeys.map(k => k.substring(0, 10) + '...')
    });
    
    // API 키 유효성 검증
    if (!this.isValidApiKey(selectedKey)) {
      log.warn(`API 키가 유효하지 않습니다`, { key: selectedKey.substring(0, 10) + '...' });
      this.apiKeyFailures.set(selectedKey, (this.apiKeyFailures.get(selectedKey) || 0) + 1);
      return this.getNextAvailableKey(); // 다음 키 시도
    }
    
    return selectedKey;
  }

  // API 키 유효성 검증
  private isValidApiKey(key: string): boolean {
    if (!key || key.length < 20) return false;
    if (!key.startsWith('AIza')) return false;
    return true;
  }

  // API 키를 교체하는 메서드
  private switchToNextKey(): boolean {
    const newKey = this.getNextAvailableKey();
    if (newKey && this.ai) {
      try {
        this.ai = new GoogleGenAI({ apiKey: newKey });
        console.log('API 키 교체 성공');
        return true;
      } catch (error) {
        console.error('API 키 교체 실패:', error);
        return false;
      }
    }
    return false;
  }

  // API 호출 실패 시 키 교체 로직 (개선된 할당량 관리)
  private handleApiKeyFailure(usedKey: string, error: any): boolean {
    const failures = this.apiKeyFailures.get(usedKey) || 0;
    this.apiKeyFailures.set(usedKey, failures + 1);
    
    console.warn(`API 키 실패 (${failures + 1}/3): ${usedKey.substring(0, 10)}...`);
    console.error('오류 상세:', error);
    
    // 429 오류 (분당 제한)인 경우 특별 처리
    if (error.message && (error.message.includes('429') || error.message.includes('RATE_LIMIT_EXCEEDED'))) {
      console.log('분당 제한 초과 감지, 다음 키로 전환...');
      // 분당 제한은 키 교체로 해결 가능
      return this.switchToNextKey();
    }
    
    // 할당량 초과 오류 처리
    if (error.message && (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED'))) {
      console.warn('API 할당량 초과 감지, 다음 키로 전환...');
      
      // RPD에서 해당 키 비활성화
      const keyIndex = this.getApiKeys().findIndex(key => key === usedKey);
      if (keyIndex >= 0) {
        const keyId = `key${keyIndex + 1}`;
        rpdService.toggleKeyStatus(keyId);
        console.log(`RPD에서 키 ${keyId} 비활성화`);
      }
      
      return this.switchToNextKey();
    }
    
    // quota_limit_value가 0인 경우 (키가 유효하지 않음)
    if (error.message && error.message.includes('quota_limit_value') && error.message.includes('"0"')) {
      console.warn('API 키 할당량이 0입니다. 다음 키로 전환...');
      return this.switchToNextKey();
    }
    
    // 인증 오류 (API 키가 잘못된 경우)
    if (error.message && (error.message.includes('401') || error.message.includes('UNAUTHENTICATED'))) {
      console.warn('API 키 인증 실패, 다음 키로 전환...');
      return this.switchToNextKey();
    }
    
    // 키 교체 시도
    return this.switchToNextKey();
  }

  // API 호출 시 RPD 기록
  private recordApiCall(keyId: string): boolean {
    console.log(`RPD 기록 시도: ${keyId}`);
    const result = rpdService.recordApiCall(keyId);
    console.log(`RPD 기록 결과: ${result ? '성공' : '실패'}`);
    return result;
  }

  // 재시도 로직이 포함된 API 호출 래퍼
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`API 호출 실패 (시도 ${attempt}/${maxRetries}):`, error);
        
        // 429 오류나 할당량 초과인 경우 지연 후 재시도
        if (error.message && (
          error.message.includes('429') || 
          error.message.includes('RATE_LIMIT_EXCEEDED') ||
          error.message.includes('quota') ||
          error.message.includes('RESOURCE_EXHAUSTED')
        )) {
          if (attempt < maxRetries) {
            const delay = retryDelay * Math.pow(2, attempt - 1); // 지수 백오프
            console.log(`${delay}ms 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // 키 교체 시도
        const apiKeys = this.getApiKeys();
        const currentKeyIndex = (GeminiService.currentKeyIndex - 1 + apiKeys.length) % apiKeys.length;
        if (this.handleApiKeyFailure(apiKeys[currentKeyIndex], error)) {
          if (attempt < maxRetries) {
            console.log('API 키 교체 후 재시도...');
            continue;
          }
        }
        
        // 마지막 시도가 아니면 계속
        if (attempt < maxRetries) {
          continue;
        }
      }
    }
    
    throw lastError;
  }

  // 다음 사용 가능한 키 조회 (RPD 고려)
  private getNextAvailableKeyWithRpd(): string | null {
    // RPD에서 사용 가능한 키 확인
    const rpdAvailableKey = rpdService.getNextAvailableKey();
    if (rpdAvailableKey) {
      return rpdAvailableKey;
    }

    // RPD에서 사용 불가능하면 기존 로직 사용
    return this.getNextAvailableKey();
  }

  private async loadDefaultSources() {
    try {
      // manifest.json에서 PDF 파일 목록을 동적으로 로드
      const manifestUrl = './pdf/manifest.json';
      console.log('Loading PDF sources from manifest:', manifestUrl);
      
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        console.warn(`Manifest not found (${response.status}), using empty sources`);
        this.sources = [];
        return;
      }
      
      const pdfFiles = await response.json();
      console.log('Found PDF files in manifest:', pdfFiles);
      
      if (!Array.isArray(pdfFiles) || pdfFiles.length === 0) {
        console.warn('No PDF files found in manifest.json');
        this.sources = [];
        return;
      }

      // PDF 파일명을 SourceInfo 객체로 변환
      this.sources = pdfFiles.map((fileName, index) => ({
        id: (index + 1).toString(),
        title: fileName,
        content: '', // 실제 내용은 PDF 파싱 시에 로드됨
        type: 'pdf' as const
      }));

      console.log('Dynamic sources loaded:', this.sources);
    } catch (error) {
      console.error('Failed to load sources from manifest:', error);
      this.sources = [];
    }
  }

  addSource(source: SourceInfo) {
    this.sources.push(source);
  }

  getSources(): SourceInfo[] {
    return this.sources;
  }

  // PDF.js를 로컬 파일에서 로드하는 함수 (최적화)
  private async loadPdfJs(): Promise<any> {
    if (window.pdfjsLib) {
      console.log('PDF.js already loaded');
      return window.pdfjsLib;
    }

    // HTML에서 미리 로드된 경우 대기 (로컬 파일 우선)
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50; // 5초 대기 (100ms * 50)
      
      const checkPdfJs = () => {
        attempts++;
        
        if (window.pdfjsLib) {
          console.log('PDF.js loaded from pre-loaded local script');
          // Worker 경로는 이미 HTML에서 설정됨
          resolve(window.pdfjsLib);
          return;
        }
        
        if (attempts >= maxAttempts) {
          // 로컬 파일이 없으면 CDN으로 폴백
          console.log('PDF.js not pre-loaded, falling back to CDN...');
          this.loadPdfJsFromCDN().then(resolve).catch(reject);
          return;
        }
        
        setTimeout(checkPdfJs, 100);
      };
      
      checkPdfJs();
    });
  }

  // CDN에서 PDF.js 로딩 (폴백)
  private async loadPdfJsFromCDN(): Promise<any> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      script.async = true;
      script.defer = true;
      
      // 타임아웃 설정 (10초)
      const timeout = setTimeout(() => {
        reject(new Error('PDF.js loading timeout'));
      }, 10000);
      
      script.onload = () => {
        clearTimeout(timeout);
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          reject(new Error('Failed to load PDF.js'));
        }
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load PDF.js script'));
      };
      document.head.appendChild(script);
    });
  }

  // PDF 파싱 함수 (CDN에서 로드된 PDF.js 사용)
  async parsePdfFromUrl(url: string): Promise<string> {
    try {
      const pdfData = await fetch(url).then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
        }
        return res.arrayBuffer();
      });
      
      // PDF.js를 CDN에서 로드
      const pdfjsLib = await this.loadPdfJs();
      
      // useWorkerFetch 파라미터를 추가하여 CMapReaderFactory 초기화
      const pdf = await pdfjsLib.getDocument({ 
        data: new Uint8Array(pdfData),
        useWorkerFetch: true,
        verbosity: 0 // 경고 메시지 줄이기
      }).promise;
      
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        // 실제 PDF 페이지 번호를 주석으로 추가
        fullText += `[PAGE_${i}] ${pageText}\n\n`;
      }
      
      return fullText;
    } catch (err) {
      console.error(`Error parsing PDF from ${url}:`, err);
      throw new Error(`Failed to parse ${url.split('/').pop()}: ${(err as Error).message}`);
    }
  }

  // PDF 내용을 한 번만 로드하고 압축하여 캐시 (사전 처리 데이터 우선)
  async initializeWithPdfSources(): Promise<void> {
    if (this.isInitialized && this.cachedSourceText) {
      console.log('PDF sources already initialized');
      return;
    }

    try {
      console.log('Initializing PDF sources...');
      
      // 0. 소스 목록을 동적으로 로드
      await this.loadDefaultSources();
      
      // 1. 사전 처리된 데이터 로드 시도 (최우선)
      const preprocessedText = await this.loadPreprocessedData();
      if (preprocessedText) {
        console.log('사전 처리된 데이터 사용 완료');
        return;
      }
      
      // 2. 사전 처리된 데이터가 없으면 실시간 파싱
      console.log('사전 처리된 데이터 없음, 실시간 파싱 시작...');
      
      // PDF 내용 로드 (병렬 처리로 최적화)
      const fullText = await this.loadPdfSourcesOptimized();
      if (!fullText || fullText.trim().length === 0) {
        throw new Error('PDF 내용을 로드할 수 없습니다.');
      }
      console.log(`Original PDF text loaded: ${fullText.length.toLocaleString()} characters`);
      
      // 전체 PDF 텍스트 저장
      this.fullPdfText = fullText;
      
      // PDF를 청크로 분할 (비동기 처리)
      console.log('Splitting PDF into chunks...');
      this.allChunks = pdfCompressionService.splitIntoChunks(fullText, 'PDF Document');
      console.log(`PDF split into ${this.allChunks.length} chunks`);
      
      // 컨텍스트 선택기에 청크 설정
      contextSelector.setChunks(this.allChunks);
      
      // PDF 내용 압축 (비동기 처리)
      console.log('Compressing PDF content...');
      this.compressionResult = await pdfCompressionService.compressPdfContent(fullText);
      this.cachedSourceText = this.compressionResult.compressedText;
      this.isInitialized = true;
      
      // 압축 결과 검증
      const validation = pdfCompressionService.validateCompression(this.compressionResult);
      if (!validation.isValid) {
        console.warn('Compression validation warnings:', validation.warnings);
        console.log('Recommendations:', validation.recommendations);
      }
      
      console.log('PDF sources initialized, chunked, and compressed successfully');
    } catch (error) {
      console.error('Failed to initialize PDF sources:', error);
      
      // 폴백: 기본 소스 사용
      console.log('Falling back to default sources...');
      this.cachedSourceText = this.sources.length > 0 
        ? this.sources.map(source => `[${source.title}]\n${source.content}`).join('\n\n')
        : 'PDF 로딩에 실패했습니다. 기본 모드로 실행됩니다.';
      this.isInitialized = true;
      
      // 기본 압축 결과 생성
      this.compressionResult = {
        compressedText: this.cachedSourceText,
        originalLength: this.cachedSourceText.length,
        compressedLength: this.cachedSourceText.length,
        compressionRatio: 1.0,
        estimatedTokens: Math.ceil(this.cachedSourceText.length / 4),
        qualityScore: 60
      };
      
      console.log('Fallback initialization completed');
    }
  }

  // 사전 처리된 데이터 로드 (최우선)
  async loadPreprocessedData(): Promise<string | null> {
    try {
      console.log('사전 처리된 데이터 로드 시도...');
      // 상대 경로 사용 (GitHub Pages 호환)
      const response = await fetch('./data/processed-pdfs.json');
      
      if (!response.ok) {
        throw new Error(`사전 처리된 데이터를 찾을 수 없습니다: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.compressedText || !data.chunks) {
        throw new Error('사전 처리된 데이터 형식이 올바르지 않습니다.');
      }
      
      // 사전 처리된 데이터 설정
      this.cachedSourceText = data.compressedText;
      this.fullPdfText = data.fullText || data.compressedText;
      this.allChunks = data.chunks || [];
      this.isInitialized = true;
      
      // 압축 결과 설정
      this.compressionResult = {
        compressedText: data.compressedText,
        originalLength: data.metadata?.originalSize || data.compressedText.length,
        compressedLength: data.compressedText.length,
        compressionRatio: data.metadata?.compressionRatio || 1.0,
        estimatedTokens: data.metadata?.estimatedTokens || Math.ceil(data.compressedText.length / 4),
        qualityScore: data.metadata?.qualityScore || 85
      };
      
      // 컨텍스트 선택기에 청크 설정
      contextSelector.setChunks(this.allChunks);
      
      console.log(`사전 처리된 데이터 로드 완료: ${data.compressedText.length.toLocaleString()}자, ${this.allChunks.length}개 청크`);
      console.log(`압축률: ${(this.compressionResult.compressionRatio * 100).toFixed(1)}%`);
      
      return data.compressedText;
    } catch (error) {
      console.warn('사전 처리된 데이터 로드 실패, 실시간 파싱으로 폴백:', error);
      console.log('폴백 원인:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  // 실제 PDF 파일들을 파싱하여 소스 텍스트 생성 (최적화된 버전)
  async loadPdfSourcesOptimized(): Promise<string> {
    // public 폴더에서 PDF 파일들 로드
    const PDF_BASE_URL = './pdf/';
    
    try {
      console.log('Attempting to load PDF sources from:', PDF_BASE_URL);
      
      // manifest.json에서 PDF 파일 목록 가져오기
      const manifestUrl = `${PDF_BASE_URL}manifest.json`;
      console.log('Fetching manifest from:', manifestUrl);
      
      const manifestResponse = await fetch(manifestUrl);
      
      if (!manifestResponse.ok) {
        console.warn(`Manifest not found (${manifestResponse.status}), falling back to default sources`);
        throw new Error(`Could not load file list (manifest.json). Status: ${manifestResponse.statusText}`);
      }
      
      const pdfFiles = await manifestResponse.json();
      console.log('Found PDF files:', pdfFiles);
      
      if (!Array.isArray(pdfFiles) || pdfFiles.length === 0) {
        throw new Error("No PDF files found in manifest.json or the file is invalid.");
      }

      // PDF.js 미리 로드
      console.log('Pre-loading PDF.js...');
      await this.loadPdfJs();

      // 모든 PDF 파일을 병렬로 파싱 (최대 3개 동시 처리)
      const BATCH_SIZE = 3;
      const texts: string[] = [];
      
      for (let i = 0; i < pdfFiles.length; i += BATCH_SIZE) {
        const batch = pdfFiles.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pdfFiles.length / BATCH_SIZE)}`);
        
        const batchPromises = batch.map(file => this.parsePdfFromUrl(PDF_BASE_URL + file));
        const batchTexts = await Promise.all(batchPromises);
        texts.push(...batchTexts);
      }
      
      const combinedText = texts.join('\n--- END OF DOCUMENT ---\n\n--- START OF DOCUMENT ---\n');
      
      console.log('Successfully loaded PDF sources');
      return combinedText;
    } catch (err) {
      console.warn("Error loading PDFs, using default sources:", err);
      // PDF 로딩 실패 시 기본 소스 사용
      return this.sources
        .map(source => `[${source.title}]\n${source.content}`)
        .join('\n\n');
    }
  }

  // 기존 메서드 유지 (호환성)
  async loadPdfSources(): Promise<string> {
    return this.loadPdfSourcesOptimized();
  }

  // 채팅 세션 생성 (하이브리드 방식: 매번 새로운 API 키 사용)
  async createNotebookChatSession(sourceText?: string): Promise<any> {
    // 매번 새로운 API 키 선택
    const selectedApiKey = this.getNextAvailableKey();
    if (!selectedApiKey) {
      throw new Error('사용 가능한 API 키가 없습니다.');
    }

    console.log(`채팅 세션 생성 - API 키: ${selectedApiKey.substring(0, 10)}...`);

    // PDF 내용이 아직 초기화되지 않았다면 초기화
    if (!this.isInitialized) {
      await this.initializeWithPdfSources();
    }

    // 압축된 PDF 내용 사용 (캐시된 내용)
    const actualSourceText = sourceText || this.cachedSourceText || '';
    const systemInstruction = SYSTEM_INSTRUCTION_TEMPLATE.replace('{sourceText}', actualSourceText);

    console.log(`Creating chat session with compressed text: ${actualSourceText.length.toLocaleString()} characters`);

    try {
      // 새로운 AI 인스턴스 생성 (선택된 키로)
      const ai = new GoogleGenAI({ apiKey: selectedApiKey });
      
      // chat_index.html과 정확히 동일한 방식
      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: systemInstruction,
        },
        history: [],
      });

      // RPD 기록 - 안전한 인덱스 계산
      const apiKeys = this.getApiKeys();
      
      // currentKeyIndex가 NaN이거나 유효하지 않은 경우 0으로 초기화
      if (isNaN(GeminiService.currentKeyIndex) || GeminiService.currentKeyIndex < 0) {
        GeminiService.currentKeyIndex = 0;
      }
      
      // 선택된 키의 인덱스 계산 (현재 키가 아닌 선택된 키 기준)
      const selectedKeyIndex = apiKeys.findIndex(key => key === selectedApiKey);
      const actualKeyIndex = selectedKeyIndex >= 0 ? selectedKeyIndex : 0;
      const currentKeyId = `key${actualKeyIndex + 1}`;
      
      console.log(`API 키 상태 - currentKeyIndex: ${GeminiService.currentKeyIndex}, selectedKeyIndex: ${selectedKeyIndex}`);
      console.log(`사용된 키 인덱스: ${actualKeyIndex}, RPD 키 ID: ${currentKeyId}`);
      this.recordApiCall(currentKeyId);

      this.currentChatSession = chat;
      return chat;
    } catch (error) {
      console.error('채팅 세션 생성 실패:', error);
      
      // API 키 교체 시도
      const failedKeyIndex = (this.currentKeyIndex - 1 + 3) % 3;
      if (this.handleApiKeyFailure(API_KEYS[failedKeyIndex], error)) {
        // 키 교체 후 재시도
        return this.createNotebookChatSession(sourceText);
      }
      
      throw error;
    }
  }

  // 스트리밍 응답 생성 (질문별 컨텍스트 선택 사용 + 재시도 로직)
  async generateStreamingResponse(message: string): Promise<AsyncGenerator<string, void, unknown>> {
    return log.monitor(async () => {
      return this.executeWithRetry(async () => {
        try {
          // 1. 질문 분석
          log.debug('질문 분석 시작', { messageLength: message.length });
          const questionAnalysis = await questionAnalyzer.analyzeQuestion(message);
          log.info('질문 분석 완료', { analysis: questionAnalysis });

          // 2. 관련 컨텍스트 선택
          log.debug('관련 컨텍스트 선택 시작');
          const relevantChunks = await contextSelector.selectRelevantContext(message, questionAnalysis);
          log.info(`관련 컨텍스트 선택 완료`, { 
            selectedChunks: relevantChunks.length,
            chunks: relevantChunks.map(c => ({ title: c.metadata.title, section: c.location.section }))
          });

          // 3. 선택된 컨텍스트로 새 세션 생성 (개선된 포맷팅)
          const contextText = relevantChunks
            .map((chunk, index) => {
              const relevanceScore = (chunk as any).relevanceScore || 0;
              return `[문서 ${index + 1}: ${chunk.metadata.title} - ${chunk.location.section || '일반'}]\n관련도: ${relevanceScore.toFixed(2)}\n${chunk.content}`;
            })
            .join('\n\n---\n\n');

          log.info(`컨텍스트 기반 세션 생성`, { 
            contextLength: contextText.length,
            selectedChunks: relevantChunks.length
          });

          // 4. 새 채팅 세션 생성 (선택된 컨텍스트 사용)
          const newSession = await this.createNotebookChatSession(contextText);

          // 5. 스트리밍 응답 생성
          const stream = await newSession.sendMessageStream({ message: message });
          
          return (async function* () {
            for await (const chunk of stream) {
              if (chunk.text) {
                yield chunk.text;
              }
            }
          })();
        } catch (error) {
          log.error('컨텍스트 기반 응답 생성 실패, 전체 컨텍스트로 폴백', { error: error.message });
          
          // 폴백: 전체 컨텍스트 사용
          if (!this.currentChatSession) {
            await this.createNotebookChatSession();
          }

          const stream = await this.currentChatSession.sendMessageStream({ message: message });
          
          return (async function* () {
            for await (const chunk of stream) {
              if (chunk.text) {
                yield chunk.text;
              }
            }
          })();
        }
      }, 3, 1000).catch(error => {
        log.error('모든 재시도 시도 실패', { error: error.message });
        
        // 사용자 친화적인 오류 메시지 제공
        return (async function* () {
          if (error.message && (
            error.message.includes('429') || 
            error.message.includes('RESOURCE_EXHAUSTED') ||
            error.message.includes('quota') ||
            error.message.includes('Quota') ||
            error.message.includes('rate limit')
          )) {
            yield '답변 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
          } else {
            yield '죄송합니다. 현재 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
          }
        })();
      });
    }, '스트리밍 응답 생성', { messageLength: message.length });
  }

  // 하이브리드 방식: 매 질문마다 새로운 API 키로 AI 인스턴스 생성 + 재시도 로직
  async generateResponse(message: string): Promise<string> {
    return this.executeWithRetry(async () => {
      // 매 질문마다 새로운 API 키 선택
      const selectedApiKey = this.getNextAvailableKey();
      if (!selectedApiKey) {
        throw new Error('사용 가능한 API 키가 없습니다.');
      }

      console.log(`질문 처리 - API 키: ${selectedApiKey.substring(0, 10)}...`);

      // 새로운 AI 인스턴스 생성 (선택된 키로)
      const ai = new GoogleGenAI({ apiKey: selectedApiKey });
      
      // PDF 소스 텍스트 로드
      if (!this.cachedSourceText) {
        await this.initializeWithPdfSources();
      }

      if (!this.cachedSourceText) {
        throw new Error('PDF 소스를 로드할 수 없습니다.');
      }

      // 시스템 지시사항과 소스 텍스트 결합
      const systemInstruction = this.SYSTEM_INSTRUCTION_TEMPLATE.replace('{sourceText}', this.cachedSourceText);
      
      // Gemini API 호출
      const model = ai.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        systemInstruction: systemInstruction
      });

      const result = await model.generateContent(message);
      const response = await result.response;
      const text = response.text();
      
      console.log(`응답 생성 완료 - 사용된 키: ${selectedApiKey.substring(0, 10)}...`);
      return text;
    }, 3, 1000).catch(error => {
      console.error('All retry attempts failed:', error);
      
      // 사용자 친화적인 오류 메시지 제공
      if (error.message && (
        error.message.includes('429') || 
        error.message.includes('RESOURCE_EXHAUSTED') ||
        error.message.includes('quota') ||
        error.message.includes('Quota') ||
        error.message.includes('rate limit')
      )) {
        return '답변 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
      }
      
      return `API 호출 중 오류가 발생했습니다: ${error.message}`;
    });
  }

  // 채팅 세션 초기화
  async resetChatSession(): Promise<void> {
    try {
      console.log('Resetting chat session...');
      
      // 현재 진행 중인 요청이 있다면 취소
      this.cancelCurrentRequest();
      
      // 현재 채팅 세션 초기화
      this.currentChatSession = null;
      
      // PDF 내용은 다시 압축하지 않고 기존 캐시 사용
      await this.createNotebookChatSession();
      
      console.log('Chat session reset successfully');
    } catch (error) {
      console.error('Failed to reset chat session:', error);
      throw error;
    }
  }

  // 현재 요청 취소
  cancelCurrentRequest(): void {
    if (this.currentAbortController) {
      console.log('Cancelling current request...');
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  // 압축 통계 정보 가져오기
  getCompressionStats(): CompressionResult | null {
    return this.compressionResult;
  }

  // PDF 내용 재압축 (필요시)
  async recompressPdfSources(): Promise<void> {
    this.isInitialized = false;
    this.cachedSourceText = null;
    this.compressionResult = null;
    await this.initializeWithPdfSources();
  }

  // RPD 통계 조회
  getRpdStats() {
    return rpdService.getRpdStats();
  }
}

export const geminiService = new GeminiService();