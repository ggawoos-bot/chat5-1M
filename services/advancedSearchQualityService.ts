/**
 * 고급 검색 품질 향상 통합 서비스
 * 모든 새로운 검색 시스템을 통합하여 사용
 */

import { Chunk, QuestionAnalysis } from '../types';
import { ContextQualityOptimizer, EnhancedChunk } from './contextQualityOptimizer';
import { MultiStageSearchSystem } from './multiStageSearchSystem';
import { SemanticSearchEngine } from './semanticSearchEngine';
import { AnswerValidationSystem } from './answerValidationSystem';
import { PromptEngineeringSystem } from './promptEngineeringSystem';

export interface AdvancedSearchResult {
  chunks: EnhancedChunk[];
  searchMetrics: {
    totalStages: number;
    successfulStages: number;
    averageRelevance: number;
    searchCoverage: number;
    resultDiversity: number;
    executionTime: number;
  };
  qualityMetrics: {
    totalChunks: number;
    averageRelevance: number;
    averageCompleteness: number;
    averageAccuracy: number;
    averageClarity: number;
    averageOverall: number;
    highQualityChunks: number;
    mediumQualityChunks: number;
    lowQualityChunks: number;
  };
}

export interface AnswerValidationResult {
  isValid: boolean;
  metrics: any;
  issues: any[];
  suggestions: string[];
  confidence: number;
}

export class AdvancedSearchQualityService {
  private multiStageSearch: MultiStageSearchSystem;
  private semanticSearch: SemanticSearchEngine;
  private static readonly DEFAULT_MAX_CHUNKS = 15;
  private static readonly MAX_CONTEXT_LENGTH = 50000;

  constructor() {
    this.multiStageSearch = new MultiStageSearchSystem();
    this.semanticSearch = new SemanticSearchEngine();
  }

  /**
   * 고급 검색 실행 (다단계 + 의미적 검색 통합)
   */
  async executeAdvancedSearch(
    questionAnalysis: QuestionAnalysis,
    maxChunks: number = this.DEFAULT_MAX_CHUNKS
  ): Promise<AdvancedSearchResult> {
    const startTime = Date.now();
    console.log(`🚀 고급 검색 시작: "${questionAnalysis.context}"`);
    
    try {
      // 1. 다단계 검색 실행
      const multiStageResult = await this.multiStageSearch.executeMultiStageSearch(
        questionAnalysis,
        maxChunks
      );

      console.log(`✅ 다단계 검색 완료: ${multiStageResult.finalResults.length}개 결과`);

      // 2. 의미적 검색으로 추가 보완 (결과가 부족한 경우)
      let semanticResults: Chunk[] = [];
      if (multiStageResult.finalResults.length < maxChunks) {
        try {
          const semanticResult = await this.semanticSearch.executeSemanticSearch(
            questionAnalysis,
            maxChunks - multiStageResult.finalResults.length
          );
          semanticResults = semanticResult.chunks;
          console.log(`✅ 의미적 검색 완료: ${semanticResults.length}개 추가 결과`);
        } catch (error) {
          console.warn('⚠️ 의미적 검색 실패:', error);
        }
      }

      // 3. 결과 통합
      const allResults = [...multiStageResult.finalResults, ...semanticResults];
      
      // 중복 제거
      const uniqueResults = this.removeDuplicateChunks(allResults);

      // 4. 컨텍스트 품질 최적화
      const optimizedResults = ContextQualityOptimizer.optimizeContextQuality(
        uniqueResults,
        questionAnalysis,
        maxChunks
      );

      // 5. 컨텍스트 길이 제한 적용
      const finalResults = this.applyContextLengthLimit(optimizedResults);

      const executionTime = Date.now() - startTime;

      const result: AdvancedSearchResult = {
        chunks: finalResults,
        searchMetrics: {
          totalStages: multiStageResult.stages.length,
          successfulStages: multiStageResult.stages.filter(s => s.success).length,
          averageRelevance: multiStageResult.qualityMetrics.averageRelevance,
          searchCoverage: multiStageResult.qualityMetrics.searchCoverage,
          resultDiversity: multiStageResult.qualityMetrics.resultDiversity,
          executionTime
        },
        qualityMetrics: ContextQualityOptimizer.generateQualitySummary(finalResults)
      };

      console.log(`🎉 고급 검색 완료: ${finalResults.length}개 최종 결과, ${executionTime}ms`);
      console.log(`📊 검색 품질: 평균 관련성 ${result.searchMetrics.averageRelevance.toFixed(3)}`);
      console.log(`📊 컨텍스트 품질: 평균 점수 ${result.qualityMetrics.averageOverall.toFixed(3)}`);

      return result;

    } catch (error) {
      console.error('❌ 고급 검색 오류:', error);
      throw error;
    }
  }

  /**
   * 동적 프롬프트 생성
   */
  generateDynamicPrompt(
    questionAnalysis: QuestionAnalysis,
    contextText: string,
    customInstructions?: string[]
  ): any {
    console.log(`🔄 동적 프롬프트 생성: ${questionAnalysis.category}/${questionAnalysis.complexity}`);
    
    return PromptEngineeringSystem.generateDynamicPrompt(
      questionAnalysis,
      contextText,
      customInstructions
    );
  }

  /**
   * 답변 검증 실행
   */
  validateAnswer(
    answer: string,
    question: string,
    sources: Chunk[],
    questionAnalysis?: QuestionAnalysis
  ): AnswerValidationResult {
    console.log(`🔍 답변 검증 시작: "${question}"`);
    
    const validationResult = AnswerValidationSystem.validateAnswer(
      answer,
      question,
      sources,
      questionAnalysis
    );

    console.log(`✅ 답변 검증 완료: ${validationResult.isValid ? '유효' : '무효'} (신뢰도: ${validationResult.confidence.toFixed(3)})`);

    return validationResult;
  }

  /**
   * 중복 청크 제거
   */
  private removeDuplicateChunks(chunks: Chunk[]): Chunk[] {
    const seen = new Set<string>();
    return chunks.filter(chunk => {
      const key = chunk.content.substring(0, 100); // 첫 100자로 중복 판단
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * 컨텍스트 길이 제한 적용
   */
  private applyContextLengthLimit(chunks: EnhancedChunk[]): EnhancedChunk[] {
    let totalLength = 0;
    const limitedChunks: EnhancedChunk[] = [];

    for (const chunk of chunks) {
      // ✅ 핵심 수정: chunk.content가 undefined인 경우 대응
      const chunkLength = chunk.content?.length || 0;
      
      if (totalLength + chunkLength > this.MAX_CONTEXT_LENGTH) {
        break;
      }
      limitedChunks.push(chunk);
      totalLength += chunkLength;
    }

    // ✅ 안전한 로그 출력
    const safeTotalLength = totalLength || 0;
    const safeMaxLength = this.MAX_CONTEXT_LENGTH || 0;
    
    console.log(`📏 컨텍스트 길이 제한 적용: ${safeTotalLength.toLocaleString()}자 (최대: ${safeMaxLength.toLocaleString()}자)`);
    
    return limitedChunks;
  }

  /**
   * 검색 성능 통계 생성
   */
  generateSearchStatistics(result: AdvancedSearchResult): {
    totalExecutionTime: number;
    searchEfficiency: number;
    qualityBreakdown: any;
    performanceMetrics: any;
  } {
    const searchEfficiency = result.chunks.length / result.searchMetrics.totalStages;
    
    return {
      totalExecutionTime: result.searchMetrics.executionTime,
      searchEfficiency: Number(searchEfficiency.toFixed(4)),
      qualityBreakdown: result.qualityMetrics,
      performanceMetrics: {
        stagesExecuted: result.searchMetrics.totalStages,
        stagesSuccessful: result.searchMetrics.successfulStages,
        averageRelevance: result.searchMetrics.averageRelevance,
        searchCoverage: result.searchMetrics.searchCoverage,
        resultDiversity: result.searchMetrics.resultDiversity
      }
    };
  }

  /**
   * 검색 품질 리포트 생성
   */
  generateQualityReport(result: AdvancedSearchResult): {
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  } {
    const overallScore = result.qualityMetrics.averageOverall;
    
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // 강점 분석
    if (result.qualityMetrics.averageRelevance >= 0.8) {
      strengths.push('높은 관련성 점수');
    }
    if (result.qualityMetrics.averageCompleteness >= 0.8) {
      strengths.push('완성도 높은 결과');
    }
    if (result.qualityMetrics.averageAccuracy >= 0.8) {
      strengths.push('정확한 정보 제공');
    }
    if (result.searchMetrics.searchCoverage >= 0.8) {
      strengths.push('포괄적인 검색 범위');
    }

    // 약점 분석
    if (result.qualityMetrics.averageRelevance < 0.6) {
      weaknesses.push('낮은 관련성');
      recommendations.push('키워드 확장 및 동의어 사전 개선');
    }
    if (result.qualityMetrics.averageCompleteness < 0.6) {
      weaknesses.push('불완전한 정보');
      recommendations.push('검색 범위 확대 및 컨텍스트 품질 향상');
    }
    if (result.qualityMetrics.averageAccuracy < 0.6) {
      weaknesses.push('정확성 부족');
      recommendations.push('출처 검증 및 사실 확인 강화');
    }
    if (result.searchMetrics.searchCoverage < 0.6) {
      weaknesses.push('제한적인 검색 범위');
      recommendations.push('다단계 검색 시스템 개선');
    }

    // 일반적 권장사항
    if (overallScore < 0.7) {
      recommendations.push('전체적인 검색 품질 향상 필요');
    }
    if (result.qualityMetrics.lowQualityChunks > result.qualityMetrics.highQualityChunks) {
      recommendations.push('저품질 청크 필터링 강화');
    }

    return {
      overallScore: Number(overallScore.toFixed(3)),
      strengths,
      weaknesses,
      recommendations
    };
  }
}
