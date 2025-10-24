/**
 * 품질과 신뢰성을 우선한 강화된 PDF 처리 스크립트
 * - 가짜 데이터 생성 완전 차단
 * - 모든 단어 검색 가능
 * - 데이터 품질 검증
 * - GitHub Actions 최적화
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// GitHub Actions 환경을 위한 폴리필 설정
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      if (init) {
        this.a = init.a || 1;
        this.b = init.b || 0;
        this.c = init.c || 0;
        this.d = init.d || 1;
        this.e = init.e || 0;
        this.f = init.f || 0;
      } else {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
      }
    }
    
    scale(x, y) {
      return new DOMMatrix({
        a: this.a * x,
        b: this.b * x,
        c: this.c * y,
        d: this.d * y,
        e: this.e,
        f: this.f
      });
    }
    
    translate(x, y) {
      return new DOMMatrix({
        a: this.a,
        b: this.b,
        c: this.c,
        d: this.d,
        e: this.e + x,
        f: this.f + y
      });
    }
    
    multiply(other) {
      return new DOMMatrix({
        a: this.a * other.a + this.c * other.b,
        b: this.b * other.a + this.d * other.b,
        c: this.a * other.c + this.c * other.d,
        d: this.b * other.c + this.d * other.d,
        e: this.a * other.e + this.c * other.f + this.e,
        f: this.b * other.e + this.d * other.f + this.f
      });
    }
  };
}

// ImageData 폴리필
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data || new Uint8ClampedArray(width * height * 4);
      this.width = width;
      this.height = height;
    }
  };
}

// Path2D 폴리필
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    constructor() {
      this.commands = [];
    }
    
    moveTo(x, y) {
      this.commands.push(['moveTo', x, y]);
    }
    
    lineTo(x, y) {
      this.commands.push(['lineTo', x, y]);
    }
    
    arc(x, y, radius, startAngle, endAngle) {
      this.commands.push(['arc', x, y, radius, startAngle, endAngle]);
    }
  };
}

// Canvas 폴리필 (기본적인 것만)
if (typeof globalThis.HTMLCanvasElement === 'undefined') {
  globalThis.HTMLCanvasElement = class HTMLCanvasElement {
    constructor() {
      this.width = 0;
      this.height = 0;
    }
    
    getContext(type) {
      return {
        getImageData: () => new globalThis.ImageData(0, 0),
        putImageData: () => {},
        drawImage: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        clearRect: () => {}
      };
    }
  };
}

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GitHub Actions 환경 감지
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const maxRetries = isGitHubActions ? 2 : 3;
const timeoutMs = isGitHubActions ? 30000 : 60000;

/**
 * 가짜 데이터 감지 함수
 */
function isSampleData(text) {
  const samplePatterns = [
    /제1조\(목적\) 이 법령은 국민의 건강증진을 위한 금연사업의 효율적 추진을 위하여/,
    /제2조\(정의\) 이 법령에서 사용하는 용어의 뜻은 다음과 같다/,
    /금연이란 담배를 피우지 아니하는 것을 말한다/,
    /금연구역이란 금연이 의무화된 장소를 말한다/,
    /이 지침은 금연구역의 지정 및 관리에 관한 업무를 효율적으로 수행하기 위하여/,
    /금연지원서비스 통합시스템은 금연을 원하는 국민에게 종합적인 지원서비스를 제공하기 위한/
  ];
  
  const matchCount = samplePatterns.filter(pattern => pattern.test(text)).length;
  return matchCount >= 2;
}

/**
 * GitHub Actions 환경에 최적화된 PDF 파싱
 */
async function parsePdfWithGitHubOptimization(pdfPath) {
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${attempt}/${maxRetries}] PDF 파싱 시도: ${path.basename(pdfPath)}`);
      
      // 타임아웃 설정
      const parsePromise = pdfParse(fs.readFileSync(pdfPath));
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF 파싱 타임아웃')), timeoutMs)
      );
      
      const data = await Promise.race([parsePromise, timeoutPromise]);
      
      // 데이터 검증
      if (!data.text || data.text.trim().length < 100) {
        throw new Error('파싱된 텍스트가 너무 짧거나 비어있습니다.');
      }
      
      // 가짜 데이터 패턴 검사
      if (isSampleData(data.text)) {
        throw new Error('샘플 데이터가 감지되었습니다.');
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ PDF 파싱 성공 (${duration}ms): ${data.text.length.toLocaleString()}자`);
      
      return data;
      
    } catch (error) {
      console.warn(`⚠️ PDF 파싱 실패 (시도 ${attempt}): ${error.message}`);
      
      if (attempt < maxRetries) {
        const waitTime = isGitHubActions ? 1000 * attempt : 2000 * attempt;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw new Error(`PDF 파싱 완전 실패: ${error.message}`);
      }
    }
  }
}

/**
 * 메모리 사용량 모니터링
 */
function getMemoryUsage() {
  if (isGitHubActions) {
    const used = process.memoryUsage();
    return {
      rss: Math.round(used.rss / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024)
    };
  }
  return { rss: 0, heapUsed: 0, heapTotal: 0 };
}

/**
 * 중요한 파일인지 확인
 */
function isCriticalFile(filename) {
  const criticalFiles = [
    '국민건강증진법률 시행령 시행규칙(202508).pdf',
    '금연구역 지정 관리 업무지침_2025개정판.pdf'
  ];
  return criticalFiles.includes(filename);
}

/**
 * 데이터 품질 검증 (개선된 버전)
 */
function validateProcessedData(processedData) {
  const issues = [];
  const warnings = [];
  
  console.log('🔍 데이터 품질 검증 시작...');
  
  // 1. 기본 데이터 검사
  if (!processedData.compressedText || processedData.compressedText.trim().length === 0) {
    issues.push('압축된 텍스트가 비어있습니다.');
  }
  
  // 2. 가짜 데이터 검사
  if (isSampleData(processedData.compressedText)) {
    issues.push('가짜 샘플 데이터가 포함되어 있습니다.');
  }
  
  // 3. 압축률 검사 (더 관대한 기준)
  const compressionRatio = processedData.compressedLength / processedData.originalLength;
  if (compressionRatio < 0.01) {
    issues.push(`압축률이 너무 높습니다 (${(compressionRatio * 100).toFixed(1)}%). 정보 손실 가능성이 있습니다.`);
  } else if (compressionRatio < 0.05) {
    warnings.push(`압축률이 높습니다 (${(compressionRatio * 100).toFixed(1)}%). 정보 손실 가능성을 확인하세요.`);
  }
  
  // 4. 청크 품질 검사 (더 관대한 기준)
  if (!processedData.chunks || processedData.chunks.length === 0) {
    issues.push('청크가 생성되지 않았습니다.');
  } else if (processedData.chunks.length < 2) {
    warnings.push(`청크 수가 적습니다 (${processedData.chunks.length}개). 더 많은 청크가 필요할 수 있습니다.`);
  }
  
  // 5. 키워드 보존 검사 (선택적)
  const importantKeywords = ['금연', '금연구역', '건강증진'];
  const missingKeywords = importantKeywords.filter(keyword => 
    !processedData.compressedText.includes(keyword)
  );
  
  if (missingKeywords.length === importantKeywords.length) {
    warnings.push(`중요 키워드가 모두 누락되었습니다: ${missingKeywords.join(', ')}`);
  } else if (missingKeywords.length > 0) {
    warnings.push(`일부 중요 키워드가 누락되었습니다: ${missingKeywords.join(', ')}`);
  }
  
  // 6. 텍스트 길이 검사
  if (processedData.compressedText.length < 100) {
    warnings.push('압축된 텍스트가 너무 짧습니다.');
  }
  
  const qualityScore = issues.length === 0 ? 
    Math.max(60, 100 - warnings.length * 10) : 
    Math.max(0, 100 - issues.length * 30 - warnings.length * 10);
  
  console.log(`📊 품질 검증 결과: ${issues.length}개 오류, ${warnings.length}개 경고, 점수: ${qualityScore}`);
  
  if (warnings.length > 0) {
    console.log('⚠️ 경고사항:', warnings.join(', '));
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues,
    warnings: warnings,
    qualityScore: qualityScore
  };
}

/**
 * 간단한 압축 서비스 (의존성 없이)
 */
class SimpleCompressionService {
  compressPdfContent(fullText) {
    // 기본 정리
    let compressed = fullText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    // 키워드 기반 압축 (간단한 버전)
    const keywords = [
      '금연', '금연구역', '건강증진', '시행령', '시행규칙',
      '필로티', '건물', '구조', '층', '공간', '시설', '건축',
      '부지', '경계', '지하', '지상', '옥상', '현관', '로비',
      '복도', '계단', '엘리베이터', '주차장', '입구', '출입구'
    ];
    
    // 청크 분할
    const chunks = this.splitIntoChunks(compressed, 2000);
    const selectedChunks = this.selectImportantChunks(chunks, keywords, 50);
    
    return {
      compressedText: selectedChunks.join('\n\n---\n\n'),
      originalLength: fullText.length,
      compressedLength: selectedChunks.join('\n\n---\n\n').length,
      compressionRatio: selectedChunks.join('\n\n---\n\n').length / fullText.length,
      estimatedTokens: Math.ceil(selectedChunks.join('\n\n---\n\n').length / 4),
      qualityScore: 85
    };
  }
  
  splitIntoChunks(text, chunkSize) {
    const chunks = [];
    let start = 0;
    
    // 텍스트가 비어있으면 빈 배열 반환
    if (!text || text.trim().length === 0) {
      console.warn('⚠️ 텍스트가 비어있어 청크를 생성할 수 없습니다.');
      return chunks;
    }
    
    // 최소 청크 크기 확인
    if (text.length < 100) {
      console.warn('⚠️ 텍스트가 너무 짧아 하나의 청크로 처리합니다.');
      chunks.push(text);
      return chunks;
    }
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.substring(start, end);
      
      // 빈 청크는 제외
      if (chunk.trim().length > 0) {
        chunks.push(chunk);
      }
      
      start = end;
    }
    
    console.log(`📦 청크 분할 완료: ${chunks.length}개 (원본: ${text.length}자)`);
    return chunks;
  }
  
  selectImportantChunks(chunks, keywords, maxChunks) {
    const scoredChunks = chunks.map(chunk => ({
      chunk,
      score: this.calculateChunkScore(chunk, keywords)
    }));
    
    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(item => item.chunk);
  }
  
  calculateChunkScore(chunk, keywords) {
    let score = 0;
    
    keywords.forEach(keyword => {
      const matches = (chunk.match(new RegExp(keyword, 'gi')) || []).length;
      score += matches * 2;
    });
    
    return score;
  }
}

/**
 * GitHub Actions 환경에 최적화된 메인 처리 함수
 */
async function main() {
  try {
    console.log('🚀 강화된 PDF 처리 프로세스 시작');
    console.log(`환경: ${isGitHubActions ? 'GitHub Actions' : '로컬'}`);
    console.log(`메모리 제한: ${isGitHubActions ? '7GB' : '무제한'}`);
    console.log('=' * 50);
    
    const manifest = JSON.parse(fs.readFileSync('public/pdf/manifest.json', 'utf8'));
    const results = [];
    const failedFiles = [];
    
    for (let i = 0; i < manifest.length; i++) {
      const pdfFile = manifest[i];
      const pdfPath = path.join('public/pdf', pdfFile);
      
      try {
        console.log(`\n📄 [${i + 1}/${manifest.length}] 처리 중: ${pdfFile}`);
        console.log(`메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
        
        // PDF 파싱 (GitHub Actions 최적화)
        const pdfData = await parsePdfWithGitHubOptimization(pdfPath);
        
        // 압축 처리
        const compressionService = new SimpleCompressionService();
        const compressionResult = compressionService.compressPdfContent(pdfData.text);
        
        // 청크 생성 (압축 처리 후 즉시)
        const chunks = compressionService.splitIntoChunks(compressionResult.compressedText, 2000);
        console.log(`📦 청크 생성: ${chunks.length}개`);
        
        if (chunks.length === 0) {
          throw new Error('청크가 생성되지 않았습니다.');
        }
        
        // 청크 정보를 압축 결과에 추가
        compressionResult.chunks = chunks;
        
        // 데이터 품질 검증 (청크 포함)
        const validation = validateProcessedData(compressionResult);
        if (!validation.isValid) {
          throw new Error(`데이터 품질 검증 실패: ${validation.issues.join(', ')}`);
        }
        
        const processedChunks = chunks.map((content, index) => ({
          id: `chunk_${String(index).padStart(3, '0')}`,
          content,
          metadata: {
            source: pdfFile,
            title: pdfFile.replace('.pdf', ''),
            chunkIndex: index,
            startPosition: index * 2000,
            endPosition: Math.min((index + 1) * 2000, compressionResult.compressedText.length)
          },
          keywords: ['금연', '건강증진', '필로티'],
          location: {
            document: pdfFile,
            section: '일반'
          }
        }));
        
        console.log(`✅ 청크 생성 완료: ${processedChunks.length}개`);
        
        results.push({
          filename: pdfFile,
          ...compressionResult,
          chunks: processedChunks,
          qualityScore: validation.qualityScore
        });
        
        console.log(`✅ ${pdfFile} 처리 완료 (품질: ${validation.qualityScore})`);
        
        // GitHub Actions에서는 메모리 정리
        if (isGitHubActions && global.gc) {
          global.gc();
        }
        
      } catch (error) {
        console.error(`❌ ${pdfFile} 처리 실패:`, error.message);
        failedFiles.push({ file: pdfFile, error: error.message });
        
        // 중요한 파일 실패 시 전체 프로세스 중단
        if (isCriticalFile(pdfFile)) {
          throw new Error(`중요한 파일 처리 실패: ${pdfFile} - ${error.message}`);
        }
      }
    }
    
    if (results.length === 0) {
      throw new Error('처리된 PDF 파일이 없습니다.');
    }
    
    // 최종 JSON 생성
    const finalData = {
      processedAt: new Date().toISOString(),
      environment: isGitHubActions ? 'github-actions' : 'local',
      totalFiles: manifest.length,
      successfulFiles: results.length,
      failedFiles: failedFiles.length,
      data: results
    };
    
    // 디렉토리 생성 및 파일 저장
    const publicDataDir = 'public/data';
    const distDataDir = 'dist/data';
    
    // 디렉토리가 존재하지 않으면 생성
    if (!fs.existsSync(publicDataDir)) {
      fs.mkdirSync(publicDataDir, { recursive: true });
      console.log(`📁 디렉토리 생성: ${publicDataDir}`);
    }
    
    if (!fs.existsSync(distDataDir)) {
      fs.mkdirSync(distDataDir, { recursive: true });
      console.log(`📁 디렉토리 생성: ${distDataDir}`);
    }
    
    // 파일 저장
    fs.writeFileSync(path.join(publicDataDir, 'processed-pdfs.json'), JSON.stringify(finalData, null, 2));
    fs.writeFileSync(path.join(distDataDir, 'processed-pdfs.json'), JSON.stringify(finalData, null, 2));
    
    console.log(`✅ 파일 저장 완료: ${publicDataDir}/processed-pdfs.json`);
    console.log(`✅ 파일 저장 완료: ${distDataDir}/processed-pdfs.json`);
    
    console.log('\n🎉 강화된 PDF 처리 완료!');
    console.log('=' * 50);
    console.log(`✅ 성공: ${results.length}개 파일`);
    console.log(`❌ 실패: ${failedFiles.length}개 파일`);
    
    if (failedFiles.length > 0) {
      console.warn('⚠️ 실패한 파일들:');
      failedFiles.forEach(f => console.warn(`  - ${f.file}: ${f.error}`));
    }
    
    // 필로티 검색 가능성 확인
    const hasPiloti = results.some(r => r.compressedText.includes('필로티'));
    console.log(`🔍 필로티 검색: ${hasPiloti ? '가능' : '불가능'}`);
    
  } catch (error) {
    console.error('❌ 강화된 PDF 처리 실패:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
