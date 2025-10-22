/**
 * 질문별 관련 컨텍스트 선택 서비스
 * AI 기반 질문 분석과 의미적 유사도를 통한 정확한 컨텍스트 선택
 */

import { GoogleGenAI } from '@google/genai';
import { Chunk, QuestionAnalysis } from '../types';

// API 키는 런타임에 동적으로 로딩 (브라우저 로딩 타이밍 문제 해결)

export class QuestionAnalyzer {
  private static currentKeyIndex: number = 0; // API 키 로테이션을 위한 인덱스
  private ai: GoogleGenAI | null = null;

  constructor() {
    console.log('QuestionAnalyzer 초기화 중...');
    
    // 런타임에 API 키 확인
    const apiKeys = this.getApiKeys();
    console.log(`사용 가능한 API 키 개수: ${apiKeys.length}`);
    
    if (apiKeys.length > 0) {
      console.log('API 키 로테이션 시스템 활성화');
      console.log('매 질문 분석마다 다른 API 키를 사용합니다.');
      // 하이브리드 방식에서는 초기화 시 AI 인스턴스를 생성하지 않음
      // 매 질문 분석마다 새로운 키로 인스턴스 생성
    } else {
      console.warn('사용 가능한 API 키가 없습니다.');
      console.log('환경변수 확인:');
      console.log('VITE_GEMINI_API_KEY:', import.meta.env.VITE_GEMINI_API_KEY ? '설정됨' : '설정되지 않음');
      console.log('VITE_GEMINI_API_KEY_1:', import.meta.env.VITE_GEMINI_API_KEY_1 ? '설정됨' : '설정되지 않음');
      console.log('VITE_GEMINI_API_KEY_2:', import.meta.env.VITE_GEMINI_API_KEY_2 ? '설정됨' : '설정되지 않음');
    }
  }

  // ✅ 런타임에 API 키를 동적으로 가져오는 메서드 (폴백 메커니즘 포함)
  private getApiKeys(): string[] {
    const keys = [
      import.meta.env.VITE_GEMINI_API_KEY || '',
      import.meta.env.VITE_GEMINI_API_KEY_1 || '',
      import.meta.env.VITE_GEMINI_API_KEY_2 || '',
    ].filter(key => key && key !== 'YOUR_GEMINI_API_KEY_HERE' && key !== '');
    
    console.log('QuestionAnalyzer 런타임 API 키 로딩:', keys.map(k => k ? k.substring(0, 10) + '...' : 'undefined'));
    console.log(`QuestionAnalyzer: 총 ${keys.length}개의 유효한 API 키 발견`);
    return keys;
  }

  // 다음 사용 가능한 API 키를 가져오는 메서드 (런타임 동적 로딩)
  private getNextAvailableKey(): string | null {
    const API_KEYS = this.getApiKeys(); // 런타임에 동적 로딩
    
    if (API_KEYS.length === 0) {
      console.warn('런타임에 API 키를 찾을 수 없습니다.');
      return null;
    }
    
    // currentKeyIndex 초기화 체크
    if (isNaN(QuestionAnalyzer.currentKeyIndex)) {
      QuestionAnalyzer.currentKeyIndex = 0;
    }
    
    const selectedKey = API_KEYS[QuestionAnalyzer.currentKeyIndex % API_KEYS.length];
    const keyIndex = QuestionAnalyzer.currentKeyIndex % API_KEYS.length;
    
    // 다음 호출을 위해 인덱스 증가
    QuestionAnalyzer.currentKeyIndex = (QuestionAnalyzer.currentKeyIndex + 1) % API_KEYS.length;
    
    console.log(`QuestionAnalyzer API 키 선택: ${selectedKey.substring(0, 10)}... (인덱스: ${keyIndex})`);
    
    return selectedKey;
  }

  /**
   * AI를 사용한 질문 분석 (하이브리드 방식: 매번 새로운 API 키 사용)
   */
  async analyzeQuestion(question: string): Promise<QuestionAnalysis> {
    // 매 질문 분석마다 새로운 API 키 선택
    const selectedApiKey = this.getNextAvailableKey();
    if (!selectedApiKey) {
      console.warn('사용 가능한 API 키가 없습니다. 기본 분석을 사용합니다.');
      return this.basicAnalysis(question);
    }

    console.log(`질문 분석 - API 키: ${selectedApiKey.substring(0, 10)}...`);

    try {
      // 새로운 AI 인스턴스 생성 (선택된 키로)
      const ai = new GoogleGenAI({ apiKey: selectedApiKey });
      const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const analysisPrompt = `
다음 질문을 분석하여 JSON 형태로 답변해주세요:

질문: "${question}"

다음 형식으로 분석해주세요:
{
  "intent": "질문의 의도 (예: 금연구역 지정 절차 문의, 규정 내용 확인 등)",
  "keywords": ["핵심 키워드 배열"],
  "category": "질문 카테고리 (definition/procedure/regulation/comparison/analysis/general)",
  "complexity": "복잡도 (simple/medium/complex)",
  "entities": ["질문에서 언급된 구체적 개체들"],
  "context": "질문의 맥락 설명"
}

분석 기준:
- category: definition(정의), procedure(절차), regulation(규정), comparison(비교), analysis(분석), general(일반)
- complexity: simple(단순), medium(중간), complex(복잡)
- keywords: 질문의 핵심을 나타내는 중요한 단어들
- entities: 구체적인 명사, 기관명, 법령명 등
`;

      // 새로운 AI 인스턴스로 API 호출
      const result = await model.generateContent(analysisPrompt);
      const response = await result.response;
      const text = response.text();
      
      console.log(`질문 분석 완료 - 사용된 키: ${selectedApiKey.substring(0, 10)}...`);
      
      // JSON 파싱 시도
      try {
        const analysis = JSON.parse(text);
        return {
          intent: analysis.intent || '일반 문의',
          keywords: analysis.keywords || [],
          category: (analysis.category as QuestionAnalysis['category']) || 'general',
          complexity: (analysis.complexity as QuestionAnalysis['complexity']) || 'simple',
          entities: analysis.entities || [],
          context: analysis.context || ''
        };
      } catch (parseError) {
        console.warn('JSON 파싱 실패, 기본 분석 사용:', parseError);
        return this.basicAnalysis(question);
      }
      
    } catch (error) {
      console.error('질문 분석 중 오류:', error);
      return this.basicAnalysis(question);
    }
  }

  /**
   * 기본 질문 분석 (AI 없이)
   */
  private basicAnalysis(question: string): QuestionAnalysis {
    const keywords = this.extractKeywords(question);
    const category = this.classifyCategory(question);
    const complexity = this.assessComplexity(question);
    const entities = this.extractEntities(question);

    return {
      intent: this.generateIntent(question, keywords),
      keywords,
      category,
      complexity,
      entities,
      context: question
    };
  }

  /**
   * AI 응답 파싱
   */
  private parseAnalysisResponse(responseText: string): QuestionAnalysis {
    try {
      // JSON 파싱 시도
      const analysis = JSON.parse(responseText);
        return {
        intent: analysis.intent || '일반 문의',
          keywords: analysis.keywords || [],
          category: analysis.category || 'general',
        complexity: analysis.complexity || 'simple',
          entities: analysis.entities || [],
          context: analysis.context || ''
        };
    } catch (error) {
      console.warn('AI 응답 파싱 실패, 기본 분석 사용:', error);
      return this.basicAnalysis('');
    }
  }

  /**
   * 키워드 추출 (하이브리드 방식: 하드코딩 + 동적)
   */
  private extractKeywords(question: string): string[] {
    // 1. 하드코딩된 핵심 키워드 (chat4 방식)
    const hardcodedKeywords = [
      '금연', '금연구역', '건강증진', '시행령', '시행규칙', '지정', '관리', '업무', '지침',
      '서비스', '통합', '사업', '지원', '규정', '법률', '조항', '항목', '절차', '방법',
      '기준', '요건', '조건', '제한', '신고', '신청', '처리', '심사', '승인', '허가',
      '등록', '변경', '취소', '정지', '폐지', '해제', '위반', '과태료', '벌금', '처벌',
      '제재', '조치', '시설', '장소', '구역', '지역', '범위', '대상', '기관', '단체',
      '조직', '협회', '연합', '연합회', '담당', '책임', '의무', '권한', '기능', '역할',
      '교육', '홍보', '점검', '통계', '분석', '개선', '지원', '협력', '평가', '운영',
      '개발', '보안', '업데이트', '장애', '대응', '보고', '제출', '접수', '심의', '검토',
      // 어린이 관련 키워드 추가
      '어린이집', '유치원', '학교', '초등학교', '중학교', '고등학교', '대학교',
      '보육', '교육', '학생', '어린이', '청소년', '아동', '영유아'
    ];

    // 2. 하드코딩된 키워드에서 매칭되는 것들
    const matchedHardcoded = hardcodedKeywords.filter(keyword => 
      question.toLowerCase().includes(keyword.toLowerCase())
    );

    // 3. 동적 키워드 추출 (기존 방식 유지)
    const dynamicKeywords = question
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1)
      .filter(word => !this.isStopWord(word));

    // 4. 하이브리드 결과 반환
    return [...new Set([...matchedHardcoded, ...dynamicKeywords])];
  }

  /**
   * 불용어 체크
   */
  private isStopWord(word: string): boolean {
    const stopWords = [
      '은', '는', '이', '가', '을', '를', '에', '의', '로', '으로', '와', '과',
      '에서', '부터', '까지', '에게', '한테', '께', '도', '만', '조차', '마저',
      '또한', '그리고', '하지만', '그런데', '그러나', '따라서', '그래서',
      '어떻게', '무엇', '언제', '어디', '왜', '누구', '어느', '몇',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
    ];
    return stopWords.includes(word);
  }

  /**
   * 카테고리 분류
   */
  private classifyCategory(question: string): string {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('무엇') || lowerQuestion.includes('정의') || lowerQuestion.includes('의미')) {
      return 'definition';
    }
    if (lowerQuestion.includes('어떻게') || lowerQuestion.includes('절차') || lowerQuestion.includes('방법')) {
      return 'procedure';
    }
    if (lowerQuestion.includes('규정') || lowerQuestion.includes('법령') || lowerQuestion.includes('조항')) {
      return 'regulation';
    }
    if (lowerQuestion.includes('비교') || lowerQuestion.includes('차이') || lowerQuestion.includes('vs')) {
      return 'comparison';
    }
    if (lowerQuestion.includes('분석') || lowerQuestion.includes('검토') || lowerQuestion.includes('평가')) {
      return 'analysis';
    }

    return 'general';
  }

  /**
   * 복잡도 평가
   */
  private assessComplexity(question: string): string {
    const wordCount = question.split(/\s+/).length;
    const hasMultipleQuestions = (question.match(/\?/g) || []).length > 1;
    const hasComplexTerms = /법령|규정|절차|기준|요건|조건/.test(question);
    
    if (wordCount > 20 || hasMultipleQuestions || hasComplexTerms) {
      return 'complex';
    } else if (wordCount > 10) {
      return 'medium';
    } else {
      return 'simple';
    }
  }

  /**
   * 개체 추출 (확장된 패턴)
   */
  private extractEntities(question: string): string[] {
    const entities: string[] = [];
    
    // 확장된 법령명 패턴
    const lawPatterns = [
      /국민건강증진법률/gi,
      /시행령/gi,
      /시행규칙/gi,
      /질서위반행위규제법/gi,
      /영유아보육법/gi,
      /유아교육법/gi,
      /초중등교육법/gi,
      /고등교육법/gi
    ];
    
    // 확장된 기관명 패턴
    const orgPatterns = [
      /보건복지부/gi,
      /시도/gi,
      /시군구/gi,
      /지역사회/gi,
      /보건소/gi,
      /보건의료원/gi,
      /보건지소/gi
    ];
    
    // 시설명 패턴 추가
    const facilityPatterns = [
      /어린이집/gi,
      /유치원/gi,
      /초등학교/gi,
      /중학교/gi,
      /고등학교/gi,
      /대학교/gi,
      /의료기관/gi,
      /학교/gi
    ];
    
    // 모든 패턴 적용
    [...lawPatterns, ...orgPatterns, ...facilityPatterns].forEach(pattern => {
      const matches = question.match(pattern);
      if (matches) {
        entities.push(...matches);
      }
    });

    // 기존 방식도 유지 (추가적인 개체 추출)
    const institutions = question.match(/[가-힣]+(청|부|원|소|센터|기관|단체|협회)/g);
    if (institutions) entities.push(...institutions);
    
    const laws = question.match(/[가-힣]+(법|령|규칙|지침|가이드라인|매뉴얼)/g);
    if (laws) entities.push(...laws);
    
    const numbers = question.match(/\d+(m|km|미터|킬로미터|%|퍼센트|원|만원|억원)/g);
    if (numbers) entities.push(...numbers);
    
    return [...new Set(entities)]; // 중복 제거
  }

  /**
   * 의도 생성
   */
  private generateIntent(question: string, keywords: string[]): string {
    const keyTerms = keywords.slice(0, 3).join(', ');
    return `${keyTerms}에 대한 문의`;
  }
}

/**
 * 컨텍스트 선택기
 */
export class ContextSelector {
  private static chunks: Chunk[] = [];
  
  // 한국어 동의어 사전 (chat4 방식)
  private static readonly KOREAN_SYNONYMS: Record<string, string[]> = {
    '금연': ['금연사업', '담배금지', '흡연금지', '금연정책', '금연운동', '금연지원'],
    '지정': ['선정', '고시', '공시', '발표', '선정', '지정고시'],
    '관리': ['운영', '관할', '담당', '처리', '관리운영', '관리업무'],
    '절차': ['방법', '과정', '순서', '단계', '절차방법', '처리절차'],
    '신청': ['접수', '제출', '등록', '신고', '신청접수', '제출신청'],
    '심사': ['검토', '심의', '평가', '심사검토', '심의평가'],
    '승인': ['허가', '인가', '승인허가', '인가승인'],
    '규정': ['법령', '규칙', '지침', '규정사항', '법규'],
    '지침': ['가이드', '매뉴얼', '지침서', '운영지침'],
    '서비스': ['지원', '제공', '서비스지원', '지원서비스'],
    '건강증진': ['건강향상', '건강증진사업', '건강관리'],
    '시설': ['장소', '시설물', '건물', '공간'],
    '위반': ['위반행위', '위반사항', '위반처리'],
    '과태료': ['벌금', '과금', '처벌', '제재'],
    '보고': ['제출', '보고서', '보고사항', '보고제출'],
    '교육': ['훈련', '교육프로그램', '교육과정', '연수'],
    '홍보': ['선전', '홍보활동', '홍보사업', '홍보물'],
    '점검': ['검사', '점검사항', '점검업무', '모니터링'],
    '통계': ['통계자료', '통계분석', '통계수집', '데이터'],
    '분석': ['검토', '분석자료', '분석결과', '연구'],
    '개선': ['향상', '개선사항', '개선방안', '개선계획'],
    '지원': ['도움', '지원사업', '지원활동', '지원정책'],
    '협력': ['협조', '협력사업', '협력활동', '연계'],
    '평가': ['검증', '평가사항', '평가결과', '성과평가'],
    '운영': ['관리', '운영방법', '운영계획', '운영지침'],
    '개발': ['구축', '개발사업', '개발계획', '시스템개발'],
    '보안': ['안전', '보안관리', '보안사항', '정보보안'],
    '업데이트': ['갱신', '수정', '변경', '개선'],
    '장애': ['문제', '오류', '장애처리', '문제해결'],
    '대응': ['처리', '대응방안', '대응절차', '대응계획'],
    // 어린이 관련 동의어 추가
    '어린이집': ['보육시설', '어린이보육시설', '보육원'],
    '유치원': ['유아교육기관', '유치원시설'],
    '학교': ['교육기관', '학원', '교실']
  };

  /**
   * 청크 설정
   */
  static setChunks(chunks: Chunk[]): void {
    this.chunks = chunks;
    console.log(`ContextSelector에 ${chunks.length}개 청크 설정 완료`);
  }

  /**
   * 저장된 청크 가져오기
   */
  static getChunks(): Chunk[] {
    return this.chunks;
  }

  /**
   * 동의어 확장 검색
   */
  private static expandWithSynonyms(keywords: string[]): string[] {
    const expandedKeywords = [...keywords];
    
    keywords.forEach(keyword => {
      if (this.KOREAN_SYNONYMS[keyword]) {
        expandedKeywords.push(...this.KOREAN_SYNONYMS[keyword]);
      }
    });
    
    return [...new Set(expandedKeywords)];
  }

  /**
   * 부분 매칭 점수 계산
   */
  private static calculatePartialMatches(chunk: Chunk, keywords: string[]): number {
    let partialScore = 0;
    
    keywords.forEach(keyword => {
      // 키워드의 일부가 포함되어도 점수 부여
      if (keyword.length > 2 && chunk.content.toLowerCase().includes(keyword.substring(0, 2))) {
        partialScore += 0.5;
      }
    });
    
    return partialScore;
  }

  /**
   * 질문 분석 결과를 바탕으로 관련 컨텍스트 선택 (개선된 버전)
   */
  static selectRelevantContexts(
    questionAnalysis: QuestionAnalysis,
    allChunks: Chunk[],
    maxChunks: number = 5
  ): Chunk[] {
    if (!questionAnalysis || allChunks.length === 0) {
      return [];
    }

    // 키워드 기반 점수 계산 (개선된 버전)
    const scoredChunks = allChunks.map(chunk => {
      let score = 0;

      // 1. 키워드 매칭 점수 (기본)
      const keywordMatches = questionAnalysis.keywords.filter(keyword =>
        chunk.content.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      score += keywordMatches * 2;

      // 2. 동의어 확장 검색 점수 (새로 추가)
      const expandedKeywords = this.expandWithSynonyms(questionAnalysis.keywords);
      const synonymMatches = expandedKeywords.filter(keyword =>
        chunk.content.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      score += synonymMatches * 1.5; // 동의어는 낮은 가중치

      // 3. 개체 매칭 점수
      const entityMatches = questionAnalysis.entities.filter(entity =>
        chunk.content.includes(entity)
      ).length;
      score += entityMatches * 3;

      // 4. 부분 매칭 점수 (새로 추가)
      const partialMatches = this.calculatePartialMatches(chunk, questionAnalysis.keywords);
      score += partialMatches;

      // 5. 카테고리별 가중치 (chat4 방식)
      if (questionAnalysis.category === 'definition' && 
          (chunk.content.includes('정의') || chunk.content.includes('의미'))) {
        score += 2;
      }
      
      if (questionAnalysis.category === 'procedure' && 
          (chunk.content.includes('절차') || chunk.content.includes('방법') || chunk.content.includes('단계'))) {
        score += 2;
      }
      
      if (questionAnalysis.category === 'regulation' && 
          (chunk.content.includes('규정') || chunk.content.includes('법령') || chunk.content.includes('조항'))) {
        score += 2;
      }
      
      // 6. 복잡도에 따른 가중치
      if (questionAnalysis.complexity === 'complex') {
        score += 1; // 복잡한 질문은 더 많은 컨텍스트 필요
      }
      
      return { ...chunk, score };
    });

    // 점수순으로 정렬하고 상위 N개 선택
    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(({ score, ...chunk }) => chunk); // score 제거
  }

  /**
   * 질문과 청크 간의 의미적 유사도 계산 (간단한 버전)
   */
  private static calculateSemanticSimilarity(question: string, chunk: Chunk): number {
    const questionWords = question.toLowerCase().split(/\s+/);
    const chunkWords = chunk.content.toLowerCase().split(/\s+/);
    
    const intersection = questionWords.filter(word => chunkWords.includes(word));
    const union = [...new Set([...questionWords, ...chunkWords])];
    
    return intersection.length / union.length; // Jaccard 유사도
  }

  /**
   * 질문을 분석하고 관련 컨텍스트를 선택하는 통합 메서드
   */
  static async selectRelevantContext(
    question: string, 
    questionAnalysis: QuestionAnalysis
  ): Promise<Chunk[]> {
    const allChunks = this.getChunks();
    if (allChunks.length === 0) {
      console.warn('ContextSelector에 설정된 청크가 없습니다.');
      return [];
    }
    
    return this.selectRelevantContexts(questionAnalysis, allChunks);
  }
}

// 싱글톤 인스턴스 생성
export const questionAnalyzer = new QuestionAnalyzer();
export const contextSelector = ContextSelector;