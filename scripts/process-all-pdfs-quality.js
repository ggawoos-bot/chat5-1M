/**
 * 전체 PDF 처리 프로세스를 통합 실행하는 스크립트
 * 1단계: PDF 파일을 청크로 분할 파싱
 * 2단계: 청크 파일들을 합쳐서 최종 JSON 생성
 * 3단계: 임시 파일들 정리
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 스크립트 실행 함수
function runScript(scriptPath, scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 ${scriptName} 실행 중...`);
    console.log(`📁 스크립트: ${scriptPath}`);
    
    // 환경변수 전달 (청크 크기와 오버랩 크기)
    const env = {
      ...process.env,
      CHUNK_SIZE: process.env.CHUNK_SIZE || '2000',
      OVERLAP_SIZE: process.env.OVERLAP_SIZE || '200'
    };
    
    console.log(`🔧 환경변수 설정:`);
    console.log(`   CHUNK_SIZE: ${env.CHUNK_SIZE}`);
    console.log(`   OVERLAP_SIZE: ${env.OVERLAP_SIZE}`);
    
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: __dirname,
      env: env
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptName} 완료!`);
        resolve();
      } else {
        console.error(`❌ ${scriptName} 실패! (종료 코드: ${code})`);
        reject(new Error(`${scriptName} 실행 실패`));
      }
    });
    
    child.on('error', (error) => {
      console.error(`❌ ${scriptName} 실행 오류:`, error);
      reject(error);
    });
  });
}

// 메인 실행 함수
async function main() {
  try {
    console.log('🎯 고품질 PDF 처리 프로세스 시작!');
    console.log('=' * 50);
    
    const startTime = Date.now();
    
    // 1단계: PDF 파일을 청크로 분할 파싱
    console.log('\n📋 1단계: PDF 파일 청크 분할 파싱');
    console.log('-' * 30);
    await runScript(
      path.join(__dirname, 'parse-pdf-with-chunking.js'),
      'PDF 청크 분할 파싱'
    );
    
    // 2단계: 청크 파일들을 합쳐서 최종 JSON 생성
    console.log('\n📋 2단계: 청크 파일들 합치기');
    console.log('-' * 30);
    await runScript(
      path.join(__dirname, 'merge-chunked-results.js'),
      '청크 파일 합치기'
    );
    
    // 3단계: 임시 파일들 정리
    console.log('\n📋 3단계: 임시 파일 정리');
    console.log('-' * 30);
    await runScript(
      path.join(__dirname, 'cleanup-chunk-files.js'),
      '임시 파일 정리'
    );
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n🎉 고품질 PDF 처리 프로세스 완료!');
    console.log('=' * 50);
    console.log(`⏱️ 총 소요 시간: ${duration}초`);
    console.log(`📁 출력 파일: public/data/processed-pdfs.json`);
    console.log(`📁 배포 파일: dist/data/processed-pdfs.json`);
    console.log('\n✨ 이제 품질 좋은 JSON 파일이 생성되었습니다!');
    console.log('🔍 반복 내용 없이 실제 PDF 내용만 포함되어 있습니다.');
    
  } catch (error) {
    console.error('\n❌ PDF 처리 프로세스 중 오류 발생:', error);
    console.log('\n🔧 문제 해결 방법:');
    console.log('1. 메모리 부족 시: Node.js 메모리 제한 증가 (--max-old-space-size=4096)');
    console.log('2. PDF 파일 확인: public/pdf/ 폴더에 PDF 파일들이 있는지 확인');
    console.log('3. 의존성 확인: npm install로 필요한 패키지 설치');
    process.exit(1);
  }
}

// 스크립트 실행
main();
