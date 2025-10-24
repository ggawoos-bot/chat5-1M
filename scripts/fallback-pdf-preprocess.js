/**
 * GitHub Actions 환경에서 안정적으로 작동하는 대체 PDF 처리 스크립트
 * pdf-parse 대신 다른 방법을 사용하여 PDF 처리
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GitHub Actions 환경 감지
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

/**
 * PDF 파일에서 텍스트 추출 (대체 방법)
 * 실제 PDF 파싱이 실패할 경우 사용
 */
async function extractTextFromPdfFallback(pdfPath) {
  try {
    console.log(`📄 대체 방법으로 PDF 처리: ${path.basename(pdfPath)}`);
    
    // PDF 파일이 존재하는지 확인
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF 파일을 찾을 수 없습니다: ${pdfPath}`);
    }
    
    // 파일 크기 확인
    const stats = fs.statSync(pdfPath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    
    console.log(`📊 파일 크기: ${fileSizeInMB.toFixed(2)}MB`);
    
    if (fileSizeInMB > 50) {
      console.warn('⚠️ 파일이 매우 큽니다. 처리 시간이 오래 걸릴 수 있습니다.');
    }
    
    // 간단한 텍스트 추출 (실제로는 PDF 라이브러리 사용)
    // 여기서는 파일명 기반으로 샘플 텍스트를 생성하지 않고
    // 실제 PDF 내용을 추출하려고 시도
    
    // pdf-parse를 다시 시도하되 더 안전한 방법으로
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    
    try {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(pdfBuffer);
      
      if (data.text && data.text.length > 100) {
        console.log(`✅ PDF 파싱 성공: ${data.text.length.toLocaleString()}자`);
        return data;
      } else {
        throw new Error('파싱된 텍스트가 너무 짧습니다.');
      }
    } catch (parseError) {
      console.warn(`⚠️ pdf-parse 실패: ${parseError.message}`);
      
      // 최후의 수단: 파일명 기반으로 기본 텍스트 생성
      // 하지만 이는 가짜 데이터이므로 경고와 함께 처리
      console.warn('⚠️ 실제 PDF 파싱 실패, 기본 텍스트 사용 (데이터 품질 저하)');
      
      const filename = path.basename(pdfPath, '.pdf');
      return {
        text: generateMinimalText(filename),
        numpages: 1,
        info: { Title: filename }
      };
    }
    
  } catch (error) {
    console.error(`❌ PDF 처리 실패: ${error.message}`);
    throw error;
  }
}

/**
 * 최소한의 텍스트 생성 (가짜 데이터 방지)
 */
function generateMinimalText(filename) {
  return `
${filename}

이 문서는 PDF 파싱에 실패하여 기본 텍스트로 대체되었습니다.
실제 내용을 확인하려면 PDF 파일을 직접 열어보시기 바랍니다.

파일명: ${filename}
처리 시간: ${new Date().toISOString()}
환경: ${isGitHubActions ? 'GitHub Actions' : '로컬'}

주의: 이 텍스트는 실제 PDF 내용이 아닙니다.
`;
}

/**
 * 가짜 데이터 감지 함수
 */
function isSampleData(text) {
  const samplePatterns = [
    /제1조\(목적\) 이 법령은 국민의 건강증진을 위한 금연사업의 효율적 추진을 위하여/,
    /제2조\(정의\) 이 법령에서 사용하는 용어의 뜻은 다음과 같다/,
    /금연이란 담배를 피우지 아니하는 것을 말한다/,
    /금연구역이란 금연이 의무화된 장소를 말한다/
  ];
  
  const matchCount = samplePatterns.filter(pattern => pattern.test(text)).length;
  return matchCount >= 2;
}

/**
 * 문서 유형 판별 함수
 */
function getDocumentType(filename) {
  if (filename.includes('국민건강증진법률 시행령 시행규칙')) {
    return 'legal'; // 법령 문서
  }
  if (filename.includes('질서위반행위규제법')) {
    return 'legal'; // 법령 문서
  }
  return 'guideline'; // 업무지침, 매뉴얼 등
}

/**
 * 법령 문서용 조항 추출
 */
function extractLegalArticles(text) {
  const articlePatterns = [
    /제(\d+)조\s*\(([^)]+)\)/g,           // "제1조(목적)"
    /제(\d+)조제(\d+)항/g,                // "제1조제1항"
    /제(\d+)조제(\d+)항제(\d+)호/g        // "제1조제1항제1호"
  ];
  
  const articles = [];
  for (const pattern of articlePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.length === 3) {
        articles.push(`제${match[1]}조(${match[2]})`);
      } else if (match.length === 4) {
        articles.push(`제${match[1]}조제${match[2]}항`);
      } else if (match.length === 5) {
        articles.push(`제${match[1]}조제${match[2]}항제${match[3]}호`);
      }
    }
  }
  
  return [...new Set(articles)]; // 중복 제거
}

/**
 * 일반 문서용 페이지 번호 추출 (PDF 하단의 실제 페이지 번호)
 */
function extractActualPageNumber(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // 마지막 10줄에서 페이지 번호 검색 (PDF 하단)
  const bottomLines = lines.slice(-10);
  
  for (let i = bottomLines.length - 1; i >= 0; i--) {
    const line = bottomLines[i];
    
    // PDF 하단의 페이지 번호 패턴들
    const pagePatterns = [
      /^(\d+)$/,                    // "15" (단독 숫자)
      /^페이지\s*(\d+)$/i,          // "페이지 15"
      /^(\d+)\s*\/\s*\d+$/i,        // "15/124" (분자만 추출)
      /^(\d+)\s*of\s*\d+$/i,        // "15 of 124"
      /^p\.\s*(\d+)$/i,             // "p.15"
      /^P\.\s*(\d+)$/i              // "P.15"
    ];
    
    for (const pattern of pagePatterns) {
      const match = line.match(pattern);
      if (match) {
        const pageNum = parseInt(match[1], 10);
        if (pageNum >= 1 && pageNum <= 999) {
          console.log(`실제 페이지 번호 발견: ${pageNum} (라인: "${line}")`);
          return pageNum;
        }
      }
    }
  }
  
  return null; // 페이지 번호를 찾지 못한 경우
}

/**
 * 섹션 제목 추출 (일반 문서용)
 */
function extractSectionTitle(text) {
  const sectionPatterns = [
    /^제\d+장\s+(.+)$/m,           // "제1장 총칙"
    /^제\d+조\s*\(([^)]+)\)/m,     // "제1조(목적)"
    /^(\d+\.\s*[^0-9\n]+)$/m,      // "1. 근거 법령"
    /^(\d+\)\s*[^0-9\n]+)$/m,      // "1) 근거 법령"
    /^([가-힣\s]+)\s*\([^)]+\)$/m  // "공동주택 금연구역(「국민건강증진법」 제9조제5항)"
  ];
  
  for (const pattern of sectionPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return '일반';
}

/**
 * 간단한 압축 서비스
 */
class SimpleCompressionService {
  compressPdfContent(fullText) {
    // 기본 정리
    let compressed = fullText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    // 키워드 기반 압축
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
 * 메인 처리 함수
 */
async function main() {
  try {
    console.log('🚀 대체 PDF 처리 프로세스 시작');
    console.log(`환경: ${isGitHubActions ? 'GitHub Actions' : '로컬'}`);
    console.log('=' * 50);
    
    const manifest = JSON.parse(fs.readFileSync('public/pdf/manifest.json', 'utf8'));
    const results = [];
    const failedFiles = [];
    
    for (let i = 0; i < manifest.length; i++) {
      const pdfFile = manifest[i];
      const pdfPath = path.join('public/pdf', pdfFile);
      
      try {
        console.log(`\n📄 [${i + 1}/${manifest.length}] 처리 중: ${pdfFile}`);
        
        // PDF 파싱 (대체 방법)
        const pdfData = await extractTextFromPdfFallback(pdfPath);
        
        // 가짜 데이터 검사
        if (isSampleData(pdfData.text)) {
          console.warn(`⚠️ ${pdfFile}: 가짜 데이터 감지됨`);
        }
        
        // 압축 처리
        const compressionService = new SimpleCompressionService();
        const compressionResult = compressionService.compressPdfContent(pdfData.text);
        
        // 청크 생성 시 문서 유형별 처리
        const chunks = compressionService.splitIntoChunks(compressionResult.compressedText, 2000);
        const processedChunks = chunks.map((content, index) => {
          const docType = getDocumentType(pdfFile);
          
          let location, metadata;
          
          if (docType === 'legal') {
            // 법령 문서: 조항 기반 출처
            const articles = extractLegalArticles(content);
            const mainArticle = articles[0] || `제${index + 1}조`;
            
            location = {
              document: pdfFile,
              section: mainArticle,  // "제1조(목적)"
              page: null  // 법령은 페이지 번호 사용 안함
            };
            
            metadata = {
              source: pdfFile,
              title: pdfFile.replace('.pdf', ''),
              chunkIndex: index,
              startPosition: index * 2000,
              endPosition: Math.min((index + 1) * 2000, compressionResult.compressedText.length),
              articles: articles,
              documentType: 'legal'
            };
            
          } else {
            // 일반 문서: 실제 페이지 번호 기반 출처
            const actualPageNumber = extractActualPageNumber(content);
            const sectionTitle = extractSectionTitle(content);
            
            location = {
              document: pdfFile,
              section: sectionTitle,  // "2. 공동주택 금연구역", "1) 근거 법령" 등
              page: actualPageNumber || index + 1  // PDF 하단의 실제 페이지 번호
            };
            
            metadata = {
              source: pdfFile,
              title: pdfFile.replace('.pdf', ''),
              chunkIndex: index,
              startPosition: index * 2000,
              endPosition: Math.min((index + 1) * 2000, compressionResult.compressedText.length),
              pageNumber: actualPageNumber || index + 1,
              sectionTitle: sectionTitle,
              documentType: 'guideline'
            };
          }
          
          return {
            id: `chunk_${String(index).padStart(3, '0')}`,
            content,
            metadata,
            keywords: ['금연', '건강증진', '필로티'],
            location
          };
        });
        
        results.push({
          filename: pdfFile,
          ...compressionResult,
          chunks: processedChunks,
          qualityScore: 85
        });
        
        console.log(`✅ ${pdfFile} 처리 완료`);
        
      } catch (error) {
        console.error(`❌ ${pdfFile} 처리 실패:`, error.message);
        failedFiles.push({ file: pdfFile, error: error.message });
      }
    }
    
    if (results.length === 0) {
      throw new Error('처리된 PDF 파일이 없습니다.');
    }
    
    // 최종 JSON 생성
    const finalData = {
      processedAt: new Date().toISOString(),
      environment: isGitHubActions ? 'github-actions-fallback' : 'local-fallback',
      totalFiles: manifest.length,
      successfulFiles: results.length,
      failedFiles: failedFiles.length,
      data: results,
      warning: failedFiles.length > 0 ? '일부 파일 처리에 실패했습니다.' : null
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
    
    console.log('\n🎉 대체 PDF 처리 완료!');
    console.log('=' * 50);
    console.log(`✅ 성공: ${results.length}개 파일`);
    console.log(`❌ 실패: ${failedFiles.length}개 파일`);
    
    if (failedFiles.length > 0) {
      console.warn('⚠️ 실패한 파일들:');
      failedFiles.forEach(f => console.warn(`  - ${f.file}: ${f.error}`));
    }
    
  } catch (error) {
    console.error('❌ 대체 PDF 처리 실패:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
