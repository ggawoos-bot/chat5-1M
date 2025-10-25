/**
 * 처리된 PDF 데이터 품질 검증 스크립트
 * 가짜 데이터 감지, 키워드 보존 확인, 압축률 검증 등을 수행
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 가짜 데이터 패턴 검사
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
 * 데이터 품질 검증
 */
function validateProcessedData(processedData) {
  const issues = [];
  const warnings = [];
  const recommendations = [];
  
  console.log('🔍 데이터 품질 검증 시작...');
  
  // 1. 기본 구조 검증
  if (!processedData.data || !Array.isArray(processedData.data)) {
    issues.push('데이터 구조가 올바르지 않습니다.');
    return { isValid: false, issues, warnings, recommendations };
  }
  
  // 2. 가짜 데이터 검사
  let fakeDataCount = 0;
  processedData.data.forEach((item, index) => {
    if (isSampleData(item.compressedText)) {
      fakeDataCount++;
      issues.push(`파일 ${index + 1}에서 가짜 데이터 감지: ${item.filename || '알 수 없음'}`);
    }
  });
  
  if (fakeDataCount > 0) {
    console.warn(`⚠️ 가짜 데이터 감지: ${fakeDataCount}개 파일`);
  } else {
    console.log('✅ 가짜 데이터 없음');
  }
  
  // 3. 필로티 검색 가능성 확인
  const hasPiloti = processedData.data.some(item => 
    item.compressedText && item.compressedText.includes('필로티')
  );
  
  if (hasPiloti) {
    console.log('✅ 필로티 검색 가능');
  } else {
    warnings.push('필로티 검색 불가능 - 키워드 목록에 포함되지 않았을 수 있습니다.');
  }
  
  // 4. 압축률 검증
  const validItems = processedData.data.filter(item => item.compressionRatio !== undefined);
  if (validItems.length > 0) {
    const avgCompressionRatio = validItems.reduce((sum, item) => 
      sum + item.compressionRatio, 0) / validItems.length;
    
    console.log(`📊 평균 압축률: ${(avgCompressionRatio * 100).toFixed(1)}%`);
    
    if (avgCompressionRatio < 0.05) {
      issues.push(`압축률이 너무 높습니다: ${(avgCompressionRatio * 100).toFixed(1)}%`);
      recommendations.push('중요한 정보가 손실될 수 있습니다. 압축률을 조정하세요.');
    } else if (avgCompressionRatio > 0.8) {
      warnings.push(`압축률이 낮습니다: ${(avgCompressionRatio * 100).toFixed(1)}%`);
      recommendations.push('더 많은 압축이 가능합니다.');
    }
  }
  
  // 5. 토큰 수 검증
  const totalTokens = processedData.data.reduce((sum, item) => 
    sum + (item.estimatedTokens || 0), 0);
  
  console.log(`📊 총 토큰 수: ${totalTokens.toLocaleString()}개`);
  
  if (totalTokens > 200000) {
    warnings.push(`토큰 수가 많습니다: ${totalTokens.toLocaleString()}개`);
    recommendations.push('토큰 제한을 초과할 수 있습니다.');
  }
  
  // 6. 청크 품질 검증
  const totalChunks = processedData.data.reduce((sum, item) => 
    sum + (item.chunks ? item.chunks.length : 0), 0);
  
  console.log(`📊 총 청크 수: ${totalChunks}개`);
  
  if (totalChunks === 0) {
    issues.push('청크가 생성되지 않았습니다.');
  }
  
  // 7. 키워드 보존 검증
  const importantKeywords = ['금연', '금연구역', '건강증진', '필로티'];
  const missingKeywords = [];
  
  importantKeywords.forEach(keyword => {
    const hasKeyword = processedData.data.some(item => 
      item.compressedText && item.compressedText.includes(keyword)
    );
    
    if (!hasKeyword) {
      missingKeywords.push(keyword);
    }
  });
  
  if (missingKeywords.length > 0) {
    warnings.push(`중요 키워드가 누락되었습니다: ${missingKeywords.join(', ')}`);
  } else {
    console.log('✅ 중요 키워드 보존 확인');
  }
  
  // 8. 파일 처리 결과 검증
  const successfulFiles = processedData.successfulFiles || processedData.data.length;
  const totalFiles = processedData.totalFiles || processedData.data.length;
  const failedFiles = totalFiles - successfulFiles;
  
  console.log(`📊 파일 처리 결과: 성공 ${successfulFiles}개, 실패 ${failedFiles}개`);
  
  if (failedFiles > 0) {
    const failureRate = (failedFiles / totalFiles) * 100;
    if (failureRate > 50) {
      issues.push(`파일 처리 실패율이 높습니다: ${failureRate.toFixed(1)}%`);
    } else {
      warnings.push(`일부 파일 처리 실패: ${failedFiles}개`);
    }
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    recommendations,
    stats: {
      totalFiles,
      successfulFiles,
      failedFiles,
      fakeDataCount,
      hasPiloti,
      totalTokens,
      totalChunks,
      avgCompressionRatio: validItems.length > 0 ? 
        validItems.reduce((sum, item) => sum + item.compressionRatio, 0) / validItems.length : 0
    }
  };
}

/**
 * 메인 검증 함수
 */
function main() {
  try {
    console.log('🚀 PDF 데이터 품질 검증 시작');
    console.log('=' * 50);
    
    const dataPath = path.join(__dirname, '../public/data/processed-pdfs.json');
    
    if (!fs.existsSync(dataPath)) {
      console.error('❌ processed-pdfs.json 파일을 찾을 수 없습니다.');
      process.exit(1);
    }
    
    const processedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const validation = validateProcessedData(processedData);
    
    console.log('\n📋 검증 결과:');
    console.log('=' * 30);
    
    if (validation.isValid) {
      console.log('✅ 데이터 품질 검증 통과');
    } else {
      console.log('❌ 데이터 품질 검증 실패');
    }
    
    if (validation.issues.length > 0) {
      console.log('\n🚨 심각한 문제:');
      validation.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    }
    
    if (validation.warnings.length > 0) {
      console.log('\n⚠️ 경고사항:');
      validation.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }
    
    if (validation.recommendations.length > 0) {
      console.log('\n💡 개선 권장사항:');
      validation.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n📊 통계:');
    console.log(`  총 파일: ${validation.stats.totalFiles}개`);
    console.log(`  성공: ${validation.stats.successfulFiles}개`);
    console.log(`  실패: ${validation.stats.failedFiles}개`);
    console.log(`  가짜 데이터: ${validation.stats.fakeDataCount}개`);
    console.log(`  필로티 검색: ${validation.stats.hasPiloti ? '가능' : '불가능'}`);
    console.log(`  총 토큰: ${validation.stats.totalTokens.toLocaleString()}개`);
    console.log(`  총 청크: ${validation.stats.totalChunks}개`);
    console.log(`  평균 압축률: ${(validation.stats.avgCompressionRatio * 100).toFixed(1)}%`);
    
    if (!validation.isValid) {
      console.log('\n❌ 검증 실패로 인해 프로세스를 중단합니다.');
      process.exit(1);
    }
    
    console.log('\n🎉 데이터 품질 검증 완료!');
    
  } catch (error) {
    console.error('❌ 검증 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 스크립트 실행
main();
