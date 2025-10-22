/**
 * PDF 사전 처리 스크립트
 * PDF 파일들을 파싱하고 압축하여 JSON 파일로 저장
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PDF.js를 동적으로 import (Node.js 환경에서 안전하게)
let pdfjsLib;
async function loadPdfJs() {
  if (!pdfjsLib) {
    try {
      // CommonJS 방식으로 import
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
      pdfjsLib = pdfjs.default || pdfjs;
      
      // Worker 설정
      pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js');
    } catch (error) {
      console.error('PDF.js 로드 실패:', error);
      throw error;
    }
  }
  return pdfjsLib;
}

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

// PDF 파싱 함수
async function parsePdfFromFile(filePath) {
  try {
    console.log(`파싱 중: ${filePath}`);
    const pdfData = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(pdfData);
    
    // PDF.js 동적 로드
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    console.log(`파싱 완료: ${filePath} (${fullText.length.toLocaleString()}자)`);
    return fullText;
  } catch (error) {
    console.error(`PDF 파싱 오류 (${filePath}):`, error);
    throw error;
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

// 메인 실행 함수
async function main() {
  try {
    console.log('PDF 사전 처리 시작...');
    
    const publicDir = path.join(__dirname, '../public');
    const pdfDir = path.join(publicDir, 'pdf');
    const dataDir = path.join(publicDir, 'data');
    
    // data 디렉토리 생성
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // manifest.json 읽기
    const manifestPath = path.join(pdfDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json 파일을 찾을 수 없습니다.');
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log('PDF 파일 목록:', manifest);
    
    // 모든 PDF 파일 파싱
    const pdfTexts = [];
    for (const pdfFile of manifest) {
      const pdfPath = path.join(pdfDir, pdfFile);
      if (fs.existsSync(pdfPath)) {
        const text = await parsePdfFromFile(pdfPath);
        pdfTexts.push({
          filename: pdfFile,
          text: text
        });
      } else {
        console.warn(`PDF 파일을 찾을 수 없습니다: ${pdfPath}`);
      }
    }
    
    if (pdfTexts.length === 0) {
      throw new Error('파싱할 PDF 파일이 없습니다.');
    }
    
    // 텍스트 결합
    const fullText = pdfTexts
      .map(item => `[${item.filename}]\n${item.text}`)
      .join('\n--- END OF DOCUMENT ---\n\n--- START OF DOCUMENT ---\n');
    
    console.log(`전체 텍스트 크기: ${fullText.length.toLocaleString()}자`);
    
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
        version: '1.0.0'
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
    
  } catch (error) {
    console.error('사전 처리 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
