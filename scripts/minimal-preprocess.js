/**
 * 최소한의 PDF 사전 처리 스크립트
 * 간단한 샘플 데이터로 JSON 파일 생성
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 간단한 텍스트 압축
function compressText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

// 청크 생성 (간단한 버전)
function createSimpleChunks(text, chunkSize = 1000) {
  const chunks = [];
  let startPos = 0;
  let chunkIndex = 0;

  while (startPos < text.length) {
    const endPos = Math.min(startPos + chunkSize, text.length);
    const chunkContent = text.substring(startPos, endPos).trim();
    
    if (chunkContent) {
      chunks.push({
        id: `chunk_${chunkIndex.toString().padStart(3, '0')}`,
        content: chunkContent,
        metadata: {
          source: 'PDF Document',
          title: 'PDF Document',
          chunkIndex,
          startPosition: startPos,
          endPosition: endPos
        },
        keywords: ['금연', '건강증진', '시행령'],
        location: {
          document: 'PDF Document',
          section: '일반',
          subsection: undefined
        }
      });
      chunkIndex++;
    }
    
    startPos = endPos;
  }

  return chunks;
}

// 메인 실행 함수
async function main() {
  try {
    console.log('최소한의 PDF 사전 처리 시작...');
    
    const publicDir = path.join(__dirname, '../public');
    const dataDir = path.join(publicDir, 'data');
    
    // data 디렉토리 생성
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // 간단한 샘플 텍스트
    const sampleText = `
국민건강증진법률 시행령 시행규칙

제1조 (목적) 이 법령은 국민의 건강증진을 위한 금연사업의 효율적 추진을 위하여 필요한 사항을 규정함을 목적으로 한다.

제2조 (정의) 이 법령에서 사용하는 용어의 뜻은 다음과 같다.
1. "금연"이란 담배를 피우지 아니하는 것을 말한다.
2. "금연구역"이란 금연이 의무화된 장소를 말한다.
3. "건강증진"이란 국민의 건강을 향상시키는 것을 말한다.

제3조 (금연구역의 지정) 보건복지부장관은 다음 각 호의 어느 하나에 해당하는 장소를 금연구역으로 지정할 수 있다.
1. 의료기관
2. 학교
3. 공공기관
4. 대중교통수단

제4조 (금연구역의 관리) 금연구역의 관리자는 해당 구역에서 금연을 위반하는 자에 대하여 금연을 요구할 수 있다.

제5조 (금연지원서비스) 국가와 지방자치단체는 금연을 원하는 자에 대하여 상담, 치료 등의 지원서비스를 제공할 수 있다.

금연구역 지정 관리 업무지침

제1장 총칙

제1조 (목적) 이 지침은 금연구역의 지정 및 관리에 관한 업무를 효율적으로 수행하기 위하여 필요한 사항을 규정함을 목적으로 한다.

제2조 (적용 범위) 이 지침은 보건복지부, 시도, 시군구, 지역사회 통합건강증진사업 수행기관에 적용한다.

제2장 금연구역 지정

제3조 (지정 절차) 금연구역 지정 신청은 해당 기관의 장이 보건복지부장관에게 제출한다.

제4조 (심사 기준) 금연구역 지정 심사는 공중보건상의 필요성, 관리의 실현가능성, 지역주민의 의견을 기준으로 실시한다.

제3장 금연구역 관리

제5조 (관리 책임) 금연구역의 관리자는 해당 구역의 금연을 위반하는 자를 발견한 경우 즉시 금연을 요구하여야 한다.

제6조 (점검 및 모니터링) 금연구역의 관리자는 정기적으로 해당 구역을 점검하여야 한다.

금연지원서비스 통합시스템 사용자매뉴얼

제1장 시스템 개요

제1조 (시스템 목적) 금연지원서비스 통합시스템은 금연을 원하는 국민에게 종합적인 지원서비스를 제공하기 위한 시스템이다.

제2조 (주요 기능) 이 시스템의 주요 기능은 금연 상담 서비스, 금연 치료 프로그램 관리, 금연 성공률 통계 관리, 지역사회 통합건강증진사업 연계이다.

제2장 사용자 관리

제3조 (사용자 등록) 시스템 사용자는 먼저 사용자 등록을 완료하여야 한다.

제4조 (권한 관리) 시스템 사용자 권한은 일반 사용자, 상담사, 관리자로 구분한다.

제3장 서비스 이용

제5조 (금연 상담) 금연 상담은 전화, 온라인, 방문 상담으로 제공된다.

제6조 (금연 치료) 금연 치료는 의료기관에서 제공된다.

제4장 통계 및 보고

제7조 (성공률 통계) 금연 성공률은 월별, 분기별, 연도별로 집계된다.

제8조 (보고서 작성) 각 기관은 분기별로 금연지원서비스 실적을 보고하여야 한다.
`.trim();

    console.log(`샘플 텍스트 크기: ${sampleText.length.toLocaleString()}자`);
    
    // 텍스트 압축
    const compressedText = compressText(sampleText);
    console.log(`압축된 텍스트 크기: ${compressedText.length.toLocaleString()}자`);
    
    // 청크 생성
    const chunks = createSimpleChunks(compressedText, 800);
    console.log(`청크 생성 완료: ${chunks.length}개`);
    
    // 결과 데이터 구성
    const result = {
      compressedText: compressedText,
      fullText: sampleText,
      chunks: chunks,
      metadata: {
        originalSize: sampleText.length,
        compressedSize: compressedText.length,
        compressionRatio: compressedText.length / sampleText.length,
        chunkCount: chunks.length,
        estimatedTokens: Math.ceil(compressedText.length / 4),
        qualityScore: 80,
        lastUpdated: new Date().toISOString(),
        pdfFiles: [
          '국민건강증진법률 시행령 시행규칙(202508).pdf',
          '금연구역 지정 관리 업무지침_2025개정판.pdf',
          '금연지원서비스 통합시스템 사용자매뉴얼_지역사회 통합건강증진사업 안내.pdf'
        ],
        version: '1.0.0',
        note: 'This is sample data for testing. Replace with actual PDF parsing results.'
      }
    };
    
    // JSON 파일 저장
    const outputPath = path.join(dataDir, 'processed-pdfs.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    
    console.log('사전 처리 완료!');
    console.log(`출력 파일: ${outputPath}`);
    console.log(`압축률: ${(result.metadata.compressionRatio * 100).toFixed(1)}%`);
    console.log(`청크 수: ${chunks.length}개`);
    console.log(`예상 토큰: ${result.metadata.estimatedTokens.toLocaleString()}개`);
    console.log('주의: 이는 샘플 데이터입니다. 실제 PDF 파싱 결과로 교체하세요.');
    
  } catch (error) {
    console.error('사전 처리 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
