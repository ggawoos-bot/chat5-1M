/**
 * 통합 검색 엔진
 * 중복을 제거하고 성능을 최적화한 단일 검색 시스템
 */

import { Chunk, QuestionAnalysis } from '../types';
import { FirestoreService, PDFChunk } from './firestoreService';
import { ContextQualityOptimizer, EnhancedChunk } from './contextQualityOptimizer';
import { UnifiedSynonymService } from './unifiedSynonymService';
import { ComprehensiveSynonymExpansion } from './comprehensiveSynonymExpansion';
import { LocalEmbeddingService } from './localEmbeddingService';

export interface UnifiedSearchResult {
  chunks: EnhancedChunk[];
  searchMetrics: {
    totalProcessed: number;
    uniqueResults: number;
    averageRelevance: number;
    executionTime: number;
    scoreBreakdown: {
      keyword: number;
      synonym: number;
      semantic: number;
    };
  };
}

export interface ScoredChunk {
  chunk: PDFChunk | Chunk;
  score: number;
  breakdown: {
    keyword: number;
    synonym: number;
    semantic: number;
  };
}

export class UnifiedSearchEngine {
  private firestoreService: FirestoreService;
  private unifiedSynonymService: UnifiedSynonymService;
  private comprehensiveSynonymExpansion: ComprehensiveSynonymExpansion;
  private localEmbeddingService: LocalEmbeddingService;
  
  constructor() {
    this.firestoreService = FirestoreService.getInstance();
    this.unifiedSynonymService = UnifiedSynonymService.getInstance();
    this.comprehensiveSynonymExpansion = ComprehensiveSynonymExpansion.getInstance();
    this.localEmbeddingService = new LocalEmbeddingService();
  }

  /**
   * 통합 검색 실행 (중복 제거 + 성능 최적화)
   */
  async executeUnifiedSearch(
    questionAnalysis: QuestionAnalysis,
    maxChunks: number = 20
  ): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    console.log(`🚀 통합 검색 시작: "${questionAnalysis.context}"`);
    
    try {
      // 1단계: 단일 Firestore 쿼리로 대량 데이터 로드
      console.log('🔍 Firestore 대량 데이터 로드...');
      const allChunks = await this.fetchChunksInBulk(
        questionAnalysis.keywords,
        questionAnalysis.expandedKeywords || [],
        500
      );
      
      console.log(`✅ 대량 데이터 로드 완료: ${allChunks.length}개 청크`);
      
      // 2단계: 다양한 스코어링 방식 적용
      console.log('📊 다중 전략 스코어링 시작...');
      const scoredChunks = await this.scoreChunksByMultipleStrategies(
        allChunks,
        questionAnalysis
      );
      
      console.log(`✅ 스코어링 완료: ${scoredChunks.length}개 청크`);
      
      // 3단계: 결과 정렬 및 중복 제거
      const uniqueChunks = this.removeDuplicatesAndRank(
        scoredChunks,
        maxChunks
      );
      
      console.log(`✅ 중복 제거 완료: ${uniqueChunks.length}개 최종 결과`);
      
      // 4단계: 컨텍스트 품질 최적화
      const chunks = uniqueChunks.map(scored => {
        const chunk: EnhancedChunk = {
          ...(scored.chunk as Chunk),
          relevanceScore: scored.score,
          qualityScore: scored.score
        };
        return chunk;
      });
      
      const optimizedChunks = ContextQualityOptimizer.optimizeContextQuality(
        chunks,
        questionAnalysis,
        maxChunks
      );
      
      const executionTime = Date.now() - startTime;
      
      // 점수 통계 계산
      const scoreBreakdown = this.calculateScoreBreakdown(scoredChunks);
      
      const result: UnifiedSearchResult = {
        chunks: optimizedChunks,
        searchMetrics: {
          totalProcessed: allChunks.length,
          uniqueResults: optimizedChunks.length,
          averageRelevance: this.calculateAverageRelevance(optimizedChunks),
          executionTime,
          scoreBreakdown
        }
      };
      
      console.log(`🎉 통합 검색 완료: ${optimizedChunks.length}개 최종 결과, ${executionTime}ms`);
      console.log(`📊 평균 관련성: ${result.searchMetrics.averageRelevance.toFixed(3)}`);
      console.log(`📊 점수 분포: 키워드 ${scoreBreakdown.keyword.toFixed(2)}, 동의어 ${scoreBreakdown.synonym.toFixed(2)}, 의미 ${scoreBreakdown.semantic.toFixed(2)}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ 통합 검색 오류:', error);
      throw error;
    }
  }
  
  /**
   * 단일 Firestore 쿼리로 대량 데이터 로드
   */
  private async fetchChunksInBulk(
    keywords: string[],
    expandedKeywords: string[],
    limit: number = 500
  ): Promise<PDFChunk[]> {
    try {
      // 키워드 통합 (중복 제거)
      const allKeywords = [...new Set([...keywords, ...expandedKeywords])];
      
      console.log(`🔍 통합 키워드: ${allKeywords.length}개 (원본: ${keywords.length}, 확장: ${expandedKeywords.length})`);
      
      // Firestore에서 모든 청크 가져오기
      const allDocuments = await this.firestoreService.getAllDocuments();
      const allChunks: PDFChunk[] = [];
      
      for (const doc of allDocuments) {
        const chunks = await this.firestoreService.getChunksByDocument(doc.id);
        allChunks.push(...chunks);
      }
      
      console.log(`📦 총 ${allChunks.length}개 청크 로드됨`);
      
      return allChunks;
      
    } catch (error) {
      console.error('❌ 대량 데이터 로드 실패:', error);
      return [];
    }
  }
  
  /**
   * 다중 전략 스코어링 (중복 없음)
   */
  private async scoreChunksByMultipleStrategies(
    chunks: PDFChunk[],
    questionAnalysis: QuestionAnalysis
  ): Promise<Array<{ chunk: Chunk; score: number; breakdown: any }>> {
    // ✅ PDFChunk를 Chunk로 변환
    const convertedChunks = await this.convertPDFChunksToChunks(chunks);
    
    const results: Array<{ chunk: Chunk; score: number; breakdown: any }> = [];
    
    // 질문 임베딩 사전 계산 (벡터 검색에만 사용)
    let questionEmbedding: number[] | null = null;
    try {
      await this.localEmbeddingService.initialize();
      const embedding = await this.localEmbeddingService.embedText(questionAnalysis.context);
      questionEmbedding = embedding;
      console.log(`✅ 질문 임베딩 생성 완료: ${embedding.length}차원`);
    } catch (error) {
      console.warn('⚠️ 질문 임베딩 생성 실패, 벡터 스코어링 제외:', error);
    }
    
    console.log('📊 청크 스코어링 시작...');
    
    // 병렬 처리로 성능 최적화 (배치 처리)
    const BATCH_SIZE = 100;
    for (let i = 0; i < convertedChunks.length; i += BATCH_SIZE) {
      const batch = convertedChunks.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (chunk, index) => {
        const originalChunk = chunks[i + index];
        
        const keywordScore = this.calculateKeywordScore(
          questionAnalysis.keywords,
          originalChunk
        );
        
        const synonymScore = this.calculateSynonymScore(
          questionAnalysis.expandedKeywords || [],
          originalChunk
        );
        
        let semanticScore = 0;
        if (questionEmbedding && originalChunk.embedding) {
          semanticScore = this.calculateSemanticSimilarity(
            questionEmbedding,
            originalChunk.embedding
          );
        }
        
        const totalScore = 
          keywordScore * 0.4 + 
          synonymScore * 0.3 + 
          semanticScore * 0.3;
        
        return {
          chunk,
          score: totalScore,
          breakdown: {
            keyword: keywordScore,
            synonym: synonymScore,
            semantic: semanticScore
          }
        };
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      if (i % 500 === 0) {
        console.log(`  진행률: ${Math.min(i + BATCH_SIZE, convertedChunks.length)}/${convertedChunks.length}`);
      }
    }
    
    return results;
  }
  
  /**
   * 키워드 점수 계산 (0~1)
   */
  private calculateKeywordScore(keywords: string[], chunk: PDFChunk): number {
    let score = 0;
    let matches = 0;
    
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      const contentLower = (chunk.content || '').toLowerCase();
      const keywordsLower = (chunk.keywords || []).map(k => k.toLowerCase());
      
      // keywords 배열에서 정확히 매칭
      if (keywordsLower.includes(keywordLower)) {
        score += 10;
        matches++;
      }
      // content에서 포함 여부
      else if (contentLower.includes(keywordLower)) {
        const count = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
        score += Math.min(count * 2, 10);
        matches++;
      }
    });
    
    if (matches === 0) return 0;
    
    return Math.min(score / (keywords.length * 10), 1.0);
  }
  
  /**
   * 동의어 점수 계산 (0~1)
   */
  private calculateSynonymScore(expandedKeywords: string[], chunk: PDFChunk): number {
    if (expandedKeywords.length === 0) return 0;
    
    let score = 0;
    const contentLower = (chunk.content || '').toLowerCase();
    
    expandedKeywords.forEach(synonym => {
      const synonymLower = synonym.toLowerCase();
      
      if (contentLower.includes(synonymLower)) {
        const count = (contentLower.match(new RegExp(synonymLower, 'g')) || []).length;
        score += Math.min(count, 5);
      }
    });
    
    return Math.min(score / (expandedKeywords.length * 5), 1.0);
  }
  
  /**
   * 의미적 유사도 계산 (코사인 유사도)
   */
  private calculateSemanticSimilarity(vector1: number[], vector2: number[]): number {
    try {
      // 벡터 길이 맞추기
      const maxLength = Math.max(vector1.length, vector2.length);
      const v1 = this.padVector(vector1, maxLength);
      const v2 = this.padVector(vector2, maxLength);
      
      // 내적 계산
      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;
      
      for (let i = 0; i < maxLength; i++) {
        dotProduct += v1[i] * v2[i];
        magnitude1 += v1[i] * v1[i];
        magnitude2 += v2[i] * v2[i];
      }
      
      magnitude1 = Math.sqrt(magnitude1);
      magnitude2 = Math.sqrt(magnitude2);
      
      if (magnitude1 === 0 || magnitude2 === 0) return 0;
      
      return dotProduct / (magnitude1 * magnitude2);
    } catch (error) {
      console.warn('⚠️ 의미적 유사도 계산 실패:', error);
      return 0;
    }
  }
  
  /**
   * 벡터 길이 맞추기
   */
  private padVector(vector: number[], targetLength: number): number[] {
    if (vector.length >= targetLength) {
      return vector.slice(0, targetLength);
    }
    
    const padded = [...vector];
    while (padded.length < targetLength) {
      padded.push(0);
    }
    return padded;
  }
  
  /**
   * PDFChunk를 Chunk로 변환
   */
  private async convertPDFChunksToChunks(pdfChunks: PDFChunk[]): Promise<Chunk[]> {
    // documentId별로 그룹화하여 중복 조회 방지
    const documentIds = [...new Set(pdfChunks.map(p => p.documentId))];
    
    // 모든 문서 정보 조회
    const documents = await Promise.all(
      documentIds.map(id => this.firestoreService.getDocumentById(id))
    );
    
    // documentId -> PDFDocument 맵 생성
    const docMap = new Map(documents.filter(d => d !== null).map(d => [d.id, d]));
    
    return pdfChunks.map(pdfChunk => {
      const doc = docMap.get(pdfChunk.documentId);
      
      return {
        id: pdfChunk.id || '',
        content: pdfChunk.content,
        metadata: {
          source: pdfChunk.metadata.source || doc?.filename || 'Firestore',
          title: pdfChunk.metadata.title || doc?.title || 'Unknown',
          page: pdfChunk.metadata.page || 0,
          section: pdfChunk.metadata.section || 'general',
          position: pdfChunk.metadata.position || 0,
          startPosition: pdfChunk.metadata.startPos || 0,
          endPosition: pdfChunk.metadata.endPos || 0,
          originalSize: pdfChunk.metadata.originalSize || 0,
          documentType: pdfChunk.metadata.documentType
        },
        keywords: pdfChunk.keywords || [],
        location: {
          document: pdfChunk.location?.document || doc?.title || pdfChunk.documentId || 'Unknown',
          section: pdfChunk.location?.section || pdfChunk.metadata.section || 'general',
          page: pdfChunk.location?.page || pdfChunk.metadata.page || 0
        }
      };
    });
  }
  
  /**
   * 중복 제거 및 랭킹
   */
  private removeDuplicatesAndRank(
    scoredChunks: Array<{ chunk: Chunk; score: number; breakdown: any }>,
    maxChunks: number
  ): Array<{ chunk: Chunk; score: number; breakdown: any }> {
    // 중복 제거 (동일한 ID)
    const uniqueMap = new Map<string, { chunk: Chunk; score: number; breakdown: any }>();
    
    scoredChunks.forEach(scored => {
      const existing = uniqueMap.get(scored.chunk.id || '');
      
      if (!existing || existing.score < scored.score) {
        uniqueMap.set(scored.chunk.id || '', scored);
      }
    });
    
    // 점수 순으로 정렬
    const uniqueChunks = Array.from(uniqueMap.values());
    uniqueChunks.sort((a, b) => b.score - a.score);
    
    // 최대 개수 제한
    return uniqueChunks.slice(0, maxChunks);
  }
  
  /**
   * 평균 관련성 계산
   */
  private calculateAverageRelevance(chunks: EnhancedChunk[]): number {
    if (chunks.length === 0) return 0;
    
    const sum = chunks.reduce((acc, chunk) => acc + (chunk.relevanceScore || 0), 0);
    return sum / chunks.length;
  }
  
  /**
   * 점수 분포 계산
   */
  private calculateScoreBreakdown(scoredChunks: ScoredChunk[]): {
    keyword: number;
    synonym: number;
    semantic: number;
  } {
    if (scoredChunks.length === 0) {
      return { keyword: 0, synonym: 0, semantic: 0 };
    }
    
    const sums = scoredChunks.reduce(
      (acc, scored) => ({
        keyword: acc.keyword + scored.breakdown.keyword,
        synonym: acc.synonym + scored.breakdown.synonym,
        semantic: acc.semantic + scored.breakdown.semantic
      }),
      { keyword: 0, synonym: 0, semantic: 0 }
    );
    
    return {
      keyword: sums.keyword / scoredChunks.length,
      synonym: sums.synonym / scoredChunks.length,
      semantic: sums.semantic / scoredChunks.length
    };
  }
}
