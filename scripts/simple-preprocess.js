/**
 * 간단한 PDF 사전 처리 스크립트 (PDF.js 없이)
 * 기존에 파싱된 데이터를 기반으로 JSON 파일 생성
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PDF 압축 서비스 (간단한 버전)
class SimplePDFCompressionService {
  cleanPdfText(text) {
    return text
      .replace(/^\s*\d+\s*$/gm, '') // 페이지 번호 제거
      .replace(/^.*(페이지|Page|page)\s*\d+.*$/gm, '') // 헤더/푸터 제거
      .replace(/^.*\d+\s*\/\s*\d+.*$/gm, '')
      .replace(/[^\w\s가-힣.,;:!?()[\]{}'"-]/g, ' ') // 특수 문자 정리
      .replace(/\s+/g, ' ') // 연속된 공백 정리
      .replace(/\b(그|이|저|것|수|등|및|또|또한|그리고|하지만|그러나|따라서|그런데|그러므로)\b/g, '') // 불필요한 단어 제거
      .replace(/\n\s*\n/g, '\n') // 빈 라인 정리
      .trim();
  }

  extractImportantSections(text, keywords) {
    const sections = text.split(/\n\s*제\d+[장조항]|\n\s*[가-힣]{2,}.*규정|\n\s*[가-힣]{2,}.*지침|\n\s*[가-힣]{2,}.*업무/g);
    
    const importantSections = sections.filter(section => {
      if (section.trim().length < 100) return false;
      
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (section.match(new RegExp(keyword, 'gi')) || []).length;
        score += matches * 2;
      });
      
      if (section.length > 500 && section.length < 5000) {
        score += 1;
      }
      
      return score > 0;
    });
    
    return importantSections.join('\n\n---\n\n');
  }

  splitIntoChunks(text, maxChunkSize = 2000) {
    const chunks = [];
    const sentences = text.split(/[.!?]\s+/);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;
      
      if (currentChunk.length + trimmedSentence.length > maxChunkSize && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedSentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  selectImportantChunks(chunks, keywords, maxChunks = 50) {
    const scoredChunks = chunks.map((chunk, index) => {
      let score = 0;
      
      // 키워드 매칭 점수
      keywords.forEach(keyword => {
        const matches = (chunk.match(new RegExp(keyword, 'gi')) || []).length;
        score += matches * 3;
      });
      
      // 길이 점수
      if (chunk.length > 500 && chunk.length < 3000) {
        score += 3;
      } else if (chunk.length > 200 && chunk.length < 5000) {
        score += 2;
      }
      
      // 구조적 요소 점수
      if (chunk.includes('제') && chunk.includes('조')) {
        score += 4; // 법조문
      }
      if (chunk.includes('규정') || chunk.includes('지침')) {
        score += 2;
      }
      
      return { chunk, score: Math.max(0, score), index };
    });
    
    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(item => item.chunk);
  }

  compressPdfContent(fullText) {
    const keywords = [
      '금연', '금연구역', '건강증진', '시행령', '시행규칙', '지정', '관리', '업무', '지침',
      '서비스', '통합', '사업', '지원', '규정', '법률', '조항', '항목', '절차', '방법',
      '기준', '요건', '조건', '제한', '신고', '신청', '처리', '심사', '승인', '허가'
    ];

    console.log('PDF 압축 시작...');
    console.log(`원본 크기: ${fullText.length.toLocaleString()}자`);
    
    // 1단계: 기본 정리
    let compressed = this.cleanPdfText(fullText);
    console.log(`1단계 (기본 정리) 완료: ${compressed.length.toLocaleString()}자`);
    
    // 2단계: 구조적 압축
    const structured = this.extractImportantSections(compressed, keywords);
    if (structured.length < compressed.length && structured.length > 0) {
      compressed = structured;
      console.log(`2단계 (구조적 압축) 완료: ${compressed.length.toLocaleString()}자`);
    }
    
    // 3단계: 청크 분할 및 선택
    const chunks = this.splitIntoChunks(compressed, 10000);
    const selectedChunks = this.selectImportantChunks(chunks, keywords, 50);
    compressed = selectedChunks.join('\n\n---\n\n');
    console.log(`3단계 (청크 선택) 완료: ${compressed.length.toLocaleString()}자`);
    
    return {
      compressedText: compressed,
      originalLength: fullText.length,
      compressedLength: compressed.length,
      compressionRatio: compressed.length / fullText.length,
      estimatedTokens: Math.ceil(compressed.length / 4),
      qualityScore: 85
    };
  }
}

// 청크 생성 함수
function createChunks(fullText, sourceTitle = 'PDF Document') {
  const chunks = [];
  const chunkSize = 1000;
  const overlap = 150;

  let startPos = 0;
  let chunkIndex = 0;

  while (startPos < fullText.length) {
    const endPos = Math.min(startPos + chunkSize, fullText.length);
    let chunkContent = fullText.substring(startPos, endPos);

    // 문장 경계에서 자르기
    if (endPos < fullText.length) {
      const lastSentenceEnd = chunkContent.lastIndexOf('.');
      if (lastSentenceEnd > chunkSize * 0.7) {
        chunkContent = chunkContent.substring(0, lastSentenceEnd + 1);
      }
    }

    const chunk = {
      id: `chunk_${chunkIndex.toString().padStart(3, '0')}`,
      content: chunkContent.trim(),
      metadata: {
        source: sourceTitle,
        title: sourceTitle,
        chunkIndex,
        startPosition: startPos,
        endPosition: startPos + chunkContent.length
      },
      keywords: extractChunkKeywords(chunkContent),
      location: {
        document: sourceTitle,
        section: extractSection(chunkContent),
        subsection: extractSubsection(chunkContent)
      }
    };

    chunks.push(chunk);
    chunkIndex++;

    startPos += chunkContent.length - overlap;
  }

  return chunks;
}

function extractChunkKeywords(content) {
  const keywords = [
    '금연', '금연구역', '건강증진', '시행령', '시행규칙', '지정', '관리', '업무', '지침',
    '서비스', '통합', '사업', '지원', '규정', '법률', '조항', '항목', '절차', '방법',
    '기준', '요건', '조건', '제한', '신고', '신청', '처리', '심사', '승인', '허가'
  ];

  return keywords.filter(keyword => 
    content.toLowerCase().includes(keyword.toLowerCase())
  );
}

function extractSection(content) {
  const sectionPatterns = [
    /제\d+장\s*([^\.\n]+)/g,
    /제\d+절\s*([^\.\n]+)/g,
    /([가-힣]{2,})\s*규정/g,
    /([가-힣]{2,})\s*지침/g
  ];

  for (const pattern of sectionPatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return undefined;
}

function extractSubsection(content) {
  const subsectionPatterns = [
    /제\d+조\s*([^\.\n]+)/g,
    /제\d+항\s*([^\.\n]+)/g,
    /\([가-힣]+\)\s*([^\.\n]+)/g
  ];

  for (const pattern of subsectionPatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return undefined;
}

// 샘플 PDF 텍스트 (실제 PDF 내용을 시뮬레이션)
function generateSamplePdfText() {
  return `
국민건강증진법률 시행령 시행규칙

제1조 (목적) 이 법령은 국민의 건강증진을 위한 금연사업의 효율적 추진을 위하여 필요한 사항을 규정함을 목적으로 한다.

제2조 (정의) 이 법령에서 사용하는 용어의 뜻은 다음과 같다.
1. "금연"이란 담배를 피우지 아니하는 것을 말한다.
2. "금연구역"이란 금연이 의무화된 장소를 말한다.
3. "건강증진"이란 국민의 건강을 향상시키는 것을 말한다.

제3조 (금연구역의 지정) ① 보건복지부장관은 다음 각 호의 어느 하나에 해당하는 장소를 금연구역으로 지정할 수 있다.
1. 의료기관
2. 학교
3. 공공기관
4. 대중교통수단

제4조 (금연구역의 관리) ① 금연구역의 관리자는 해당 구역에서 금연을 위반하는 자에 대하여 금연을 요구할 수 있다.
② 금연 위반자에 대하여는 과태료를 부과할 수 있다.

제5조 (금연지원서비스) ① 국가와 지방자치단체는 금연을 원하는 자에 대하여 상담, 치료 등의 지원서비스를 제공할 수 있다.
② 금연지원서비스는 지역사회 통합건강증진사업의 일환으로 추진한다.

금연구역 지정 관리 업무지침

제1장 총칙

제1조 (목적) 이 지침은 금연구역의 지정 및 관리에 관한 업무를 효율적으로 수행하기 위하여 필요한 사항을 규정함을 목적으로 한다.

제2조 (적용 범위) 이 지침은 다음 각 호의 기관에 적용한다.
1. 보건복지부
2. 시도
3. 시군구
4. 지역사회 통합건강증진사업 수행기관

제2장 금연구역 지정

제3조 (지정 절차) ① 금연구역 지정 신청은 해당 기관의 장이 보건복지부장관에게 제출한다.
② 신청서에는 다음 각 호의 사항이 포함되어야 한다.
1. 지정을 요청하는 장소의 위치
2. 지정 사유
3. 관리 계획

제4조 (심사 기준) 금연구역 지정 심사는 다음 각 호의 기준에 따라 실시한다.
1. 공중보건상의 필요성
2. 관리의 실현가능성
3. 지역주민의 의견

제3장 금연구역 관리

제5조 (관리 책임) ① 금연구역의 관리자는 해당 구역의 금연을 위반하는 자를 발견한 경우 즉시 금연을 요구하여야 한다.
② 금연 위반자에 대하여는 관련 법령에 따라 과태료를 부과할 수 있다.

제6조 (점검 및 모니터링) ① 금연구역의 관리자는 정기적으로 해당 구역을 점검하여야 한다.
② 점검 결과는 매분기별로 보건복지부장관에게 보고하여야 한다.

금연지원서비스 통합시스템 사용자매뉴얼

제1장 시스템 개요

제1조 (시스템 목적) 금연지원서비스 통합시스템은 금연을 원하는 국민에게 종합적인 지원서비스를 제공하기 위한 시스템이다.

제2조 (주요 기능) 이 시스템의 주요 기능은 다음과 같다.
1. 금연 상담 서비스
2. 금연 치료 프로그램 관리
3. 금연 성공률 통계 관리
4. 지역사회 통합건강증진사업 연계

제2장 사용자 관리

제3조 (사용자 등록) ① 시스템 사용자는 먼저 사용자 등록을 완료하여야 한다.
② 사용자 등록 시 다음 정보를 입력하여야 한다.
1. 성명
2. 연락처
3. 희망 금연 시작일
4. 흡연 이력

제4조 (권한 관리) ① 시스템 사용자 권한은 다음과 같이 구분한다.
1. 일반 사용자: 금연 상담 및 치료 서비스 이용
2. 상담사: 상담 서비스 제공 및 관리
3. 관리자: 시스템 전체 관리

제3장 서비스 이용

제5조 (금연 상담) ① 금연 상담은 전화, 온라인, 방문 상담으로 제공된다.
② 상담 내용은 개인정보보호법에 따라 보호된다.

제6조 (금연 치료) ① 금연 치료는 의료기관에서 제공된다.
② 치료 비용은 건강보험에 따라 지원될 수 있다.

제4장 통계 및 보고

제7조 (성공률 통계) ① 금연 성공률은 월별, 분기별, 연도별로 집계된다.
② 통계 자료는 지역사회 통합건강증진사업의 효과 측정에 활용된다.

제8조 (보고서 작성) ① 각 기관은 분기별로 금연지원서비스 실적을 보고하여야 한다.
② 보고서에는 다음 사항이 포함되어야 한다.
1. 서비스 이용 현황
2. 금연 성공률
3. 개선 사항
`.trim();
}

// 메인 실행 함수
async function main() {
  try {
    console.log('PDF 사전 처리 시작 (샘플 데이터)...');
    
    const publicDir = path.join(__dirname, '../public');
    const dataDir = path.join(publicDir, 'data');
    
    // data 디렉토리 생성
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // manifest.json 읽기
    const manifestPath = path.join(publicDir, 'pdf', 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json 파일을 찾을 수 없습니다.');
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log('PDF 파일 목록:', manifest);
    
    // 샘플 PDF 텍스트 생성 (실제로는 PDF 파싱 결과)
    const fullText = generateSamplePdfText();
    console.log(`샘플 텍스트 크기: ${fullText.length.toLocaleString()}자`);
    
    // 압축 처리
    const compressionService = new SimplePDFCompressionService();
    const compressionResult = compressionService.compressPdfContent(fullText);
    
    // 청크 생성
    const chunks = createChunks(fullText, 'PDF Document');
    console.log(`청크 생성 완료: ${chunks.length}개`);
    
    // 결과 데이터 구성
    const result = {
      compressedText: compressionResult.compressedText,
      fullText: fullText,
      chunks: chunks,
      metadata: {
        originalSize: compressionResult.originalLength,
        compressedSize: compressionResult.compressedLength,
        compressionRatio: compressionResult.compressionRatio,
        chunkCount: chunks.length,
        estimatedTokens: compressionResult.estimatedTokens,
        qualityScore: compressionResult.qualityScore,
        lastUpdated: new Date().toISOString(),
        pdfFiles: manifest,
        version: '1.0.0',
        note: 'This is sample data for testing. Replace with actual PDF parsing results.'
      }
    };
    
    // JSON 파일 저장
    const outputPath = path.join(dataDir, 'processed-pdfs.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    
    console.log('사전 처리 완료!');
    console.log(`출력 파일: ${outputPath}`);
    console.log(`압축률: ${(compressionResult.compressionRatio * 100).toFixed(1)}%`);
    console.log(`청크 수: ${chunks.length}개`);
    console.log(`예상 토큰: ${compressionResult.estimatedTokens.toLocaleString()}개`);
    console.log('주의: 이는 샘플 데이터입니다. 실제 PDF 파싱 결과로 교체하세요.');
    
  } catch (error) {
    console.error('사전 처리 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
