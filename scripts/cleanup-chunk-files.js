/**
 * 임시 청크 파일들을 정리하는 스크립트
 * temp_*.json 파일들과 요약 파일을 삭제
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 임시 파일들 찾기
function findTempFiles() {
  const files = fs.readdirSync(__dirname);
  return files.filter(file => 
    file.startsWith('temp_') && 
    (file.endsWith('.json') || file.endsWith('.txt') || file.endsWith('.log'))
  );
}

// 파일 삭제
function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ 파일 삭제 오류 (${filePath}):`, error);
    return false;
  }
}

// 메인 실행 함수
async function main() {
  try {
    console.log('🧹 임시 파일 정리 시작...');
    
    // 임시 파일들 찾기
    const tempFiles = findTempFiles();
    console.log(`📁 발견된 임시 파일: ${tempFiles.length}개`);
    
    if (tempFiles.length === 0) {
      console.log('✅ 정리할 임시 파일이 없습니다.');
      return;
    }
    
    // 파일 목록 출력
    console.log('📋 삭제할 파일 목록:');
    tempFiles.forEach(file => {
      const filePath = path.join(__dirname, file);
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`  - ${file} (${sizeKB}KB)`);
    });
    
    // 파일들 삭제
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const file of tempFiles) {
      const filePath = path.join(__dirname, file);
      if (deleteFile(filePath)) {
        console.log(`✅ 삭제됨: ${file}`);
        deletedCount++;
      } else {
        console.log(`❌ 삭제 실패: ${file}`);
        errorCount++;
      }
    }
    
    console.log('\n🎉 임시 파일 정리 완료!');
    console.log(`📊 정리 결과:`);
    console.log(`  - 삭제된 파일: ${deletedCount}개`);
    console.log(`  - 삭제 실패: ${errorCount}개`);
    console.log(`  - 총 파일: ${tempFiles.length}개`);
    
    if (errorCount > 0) {
      console.log('⚠️ 일부 파일 삭제에 실패했습니다. 수동으로 확인해주세요.');
    }
    
  } catch (error) {
    console.error('❌ 임시 파일 정리 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
