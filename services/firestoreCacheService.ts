/**
 * Firestore 데이터 전용 캐싱 서비스
 * - 문서 메타데이터, 청크 데이터, 검색 결과만 캐싱
 * - AI 답변이나 동적 분석 결과는 캐싱하지 않음
 */

export interface PDFDocument {
  id: string;
  title: string;
  totalPages: number;
  processedAt: Date;
  documentType?: 'legal' | 'guideline';
}

export interface PDFChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    title: string;
    page: number;
    section: string;
    position: number;
    startPosition: number;
    endPosition: number;
    originalSize: number;
    documentType?: 'legal' | 'guideline';
  };
  keywords: string[];
  location: {
    document: string;
    section: string;
    page: number;
  };
  relevanceScore?: number;
}

export class FirestoreCacheService {
  private static readonly CACHE_PREFIX = 'firestore_cache_';
  private static readonly CACHE_VERSION = 'v1.0';
  private static readonly CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30일

  /**
   * 문서 목록 캐싱 조회
   */
  static async getCachedDocuments(): Promise<PDFDocument[] | null> {
    const cacheKey = `${this.CACHE_PREFIX}documents_all`;
    return this.getCache(cacheKey);
  }

  /**
   * 문서 목록 캐싱 저장
   */
  static async setCachedDocuments(documents: PDFDocument[]): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}documents_all`;
    await this.setCache(cacheKey, documents);
    console.log(`✅ 문서 목록 캐시 저장: ${documents.length}개`);
  }

  /**
   * 청크 데이터 캐싱 조회
   */
  static async getCachedChunks(documentId: string): Promise<PDFChunk[] | null> {
    const cacheKey = `${this.CACHE_PREFIX}chunks_${documentId}`;
    return this.getCache(cacheKey);
  }

  /**
   * 청크 데이터 캐싱 저장
   */
  static async setCachedChunks(documentId: string, chunks: PDFChunk[]): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}chunks_${documentId}`;
    await this.setCache(cacheKey, chunks);
    console.log(`✅ 청크 데이터 캐시 저장: ${documentId} (${chunks.length}개)`);
  }

  /**
   * 검색 결과 캐싱 조회 (키워드 기반)
   */
  static async getCachedSearchResults(
    keywords: string[], 
    documentId?: string
  ): Promise<PDFChunk[] | null> {
    const searchKey = this.generateSearchKey(keywords, documentId);
    const cacheKey = `${this.CACHE_PREFIX}search_${searchKey}`;
    return this.getCache(cacheKey);
  }

  /**
   * 검색 결과 캐싱 저장
   */
  static async setCachedSearchResults(
    keywords: string[], 
    documentId: string | undefined,
    chunks: PDFChunk[]
  ): Promise<void> {
    const searchKey = this.generateSearchKey(keywords, documentId);
    const cacheKey = `${this.CACHE_PREFIX}search_${searchKey}`;
    await this.setCache(cacheKey, chunks);
    console.log(`✅ 검색 결과 캐시 저장: ${searchKey} (${chunks.length}개)`);
  }

  /**
   * 텍스트 검색 결과 캐싱 조회
   */
  static async getCachedTextSearchResults(
    searchText: string,
    documentId?: string
  ): Promise<PDFChunk[] | null> {
    const searchKey = this.generateTextSearchKey(searchText, documentId);
    const cacheKey = `${this.CACHE_PREFIX}text_search_${searchKey}`;
    return this.getCache(cacheKey);
  }

  /**
   * 텍스트 검색 결과 캐싱 저장
   */
  static async setCachedTextSearchResults(
    searchText: string,
    documentId: string | undefined,
    chunks: PDFChunk[]
  ): Promise<void> {
    const searchKey = this.generateTextSearchKey(searchText, documentId);
    const cacheKey = `${this.CACHE_PREFIX}text_search_${searchKey}`;
    await this.setCache(cacheKey, chunks);
    console.log(`✅ 텍스트 검색 결과 캐시 저장: ${searchKey} (${chunks.length}개)`);
  }

  /**
   * 캐시 키 생성 (키워드 기반)
   */
  private static generateSearchKey(keywords: string[], documentId?: string): string {
    const sortedKeywords = keywords.sort().join('_');
    return `${sortedKeywords}_${documentId || 'all'}`;
  }

  /**
   * 캐시 키 생성 (텍스트 기반)
   */
  private static generateTextSearchKey(searchText: string, documentId?: string): string {
    const normalizedText = searchText.toLowerCase().replace(/\s+/g, '_');
    return `${normalizedText}_${documentId || 'all'}`;
  }

  /**
   * 기본 캐시 조회 메서드
   */
  private static async getCache(key: string): Promise<any | null> {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const data = JSON.parse(cached);
      
      // 버전 체크
      if (data.version !== this.CACHE_VERSION) {
        localStorage.removeItem(key);
        console.log(`🗑️ 버전 불일치로 캐시 삭제: ${key}`);
        return null;
      }
      
      // 만료 체크
      if (Date.now() - data.timestamp > this.CACHE_EXPIRY) {
        localStorage.removeItem(key);
        console.log(`🗑️ 만료로 캐시 삭제: ${key}`);
        return null;
      }
      
      console.log(`📦 캐시 조회: ${key}`);
      return data.content;
    } catch (error) {
      console.warn('캐시 조회 실패:', error);
      localStorage.removeItem(key); // 손상된 캐시 삭제
      return null;
    }
  }

  /**
   * 기본 캐시 저장 메서드
   */
  private static async setCache(key: string, content: any): Promise<void> {
    try {
      const data = {
        content: content,
        timestamp: Date.now(),
        version: this.CACHE_VERSION
      };
      
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.warn('캐시 저장 실패:', error);
      // 캐시 공간 부족 시 오래된 캐시 정리
      this.cleanupOldCache();
      
      // 다시 시도
      try {
        const data = {
          content: content,
          timestamp: Date.now(),
          version: this.CACHE_VERSION
        };
        localStorage.setItem(key, JSON.stringify(data));
      } catch (retryError) {
        console.error('캐시 저장 재시도 실패:', retryError);
      }
    }
  }

  /**
   * 오래된 캐시 정리
   */
  private static cleanupOldCache(): void {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
    
    // 오래된 캐시부터 삭제
    let cleanedCount = 0;
    cacheKeys.forEach(key => {
      const item = localStorage.getItem(key);
      if (item) {
        try {
          const data = JSON.parse(item);
          if (Date.now() - data.timestamp > this.CACHE_EXPIRY) {
            localStorage.removeItem(key);
            cleanedCount++;
          }
        } catch (error) {
          // 손상된 캐시 삭제
          localStorage.removeItem(key);
          cleanedCount++;
        }
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`🗑️ 오래된 캐시 ${cleanedCount}개 정리 완료`);
    }
  }

  /**
   * 전체 Firestore 캐시 삭제
   */
  static clearAllFirestoreCache(): void {
    const keys = Object.keys(localStorage);
    let deletedCount = 0;
    
    keys.forEach(key => {
      if (key.startsWith(this.CACHE_PREFIX)) {
        localStorage.removeItem(key);
        deletedCount++;
      }
    });
    
    console.log(`🗑️ Firestore 캐시 전체 삭제 완료: ${deletedCount}개`);
  }

  /**
   * 특정 문서 캐시 삭제
   */
  static clearDocumentCache(documentId: string): void {
    const keys = Object.keys(localStorage);
    let deletedCount = 0;
    
    keys.forEach(key => {
      if (key.includes(`chunks_${documentId}`) || key.includes(`search_`) || key.includes(`text_search_`)) {
        localStorage.removeItem(key);
        deletedCount++;
      }
    });
    
    console.log(`🗑️ 문서 캐시 삭제 완료: ${documentId} (${deletedCount}개)`);
  }

  /**
   * 캐시 상태 확인
   */
  static getCacheStatus(): any {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
    
    let totalSize = 0;
    let documentCaches = 0;
    let chunkCaches = 0;
    let searchCaches = 0;
    let textSearchCaches = 0;
    let validCaches = 0;
    
    cacheKeys.forEach(key => {
      const item = localStorage.getItem(key);
      if (item) {
        totalSize += item.length;
        
        if (key.includes('documents_')) documentCaches++;
        else if (key.includes('chunks_')) chunkCaches++;
        else if (key.includes('search_')) searchCaches++;
        else if (key.includes('text_search_')) textSearchCaches++;
        
        // 유효한 캐시인지 확인
        try {
          const data = JSON.parse(item);
          if (data.version === this.CACHE_VERSION && 
              Date.now() - data.timestamp <= this.CACHE_EXPIRY) {
            validCaches++;
          }
        } catch (error) {
          // 손상된 캐시는 무효로 간주
        }
      }
    });
    
    return {
      totalCaches: cacheKeys.length,
      validCaches: validCaches,
      documentCaches: documentCaches,
      chunkCaches: chunkCaches,
      searchCaches: searchCaches,
      textSearchCaches: textSearchCaches,
      totalSize: `${(totalSize / 1024 / 1024).toFixed(2)}MB`,
      cacheExpiry: `${(this.CACHE_EXPIRY / 24 / 60 / 60 / 1000).toFixed(0)}일`
    };
  }

  /**
   * 캐시 히트율 계산
   */
  static getCacheHitRate(): { hits: number; misses: number; hitRate: string } {
    // 실제 구현에서는 히트/미스 카운터를 유지해야 함
    return {
      hits: 0,
      misses: 0,
      hitRate: '0.00%'
    };
  }
}
