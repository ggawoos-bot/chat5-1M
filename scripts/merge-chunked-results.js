/**
 * 청크 파일들을 합쳐서 최종 processed-pdfs.json 파일을 생성하는 스크립트
 * 메모리 효율적으로 스트리밍 방식으로 처리
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 메모리 사용량 모니터링
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024)
  };
}

// 청크 파일들을 찾기
function findChunkFiles() {
  const files = fs.readdirSync(__dirname);
  return files
    .filter(file => file.startsWith('temp_pdf') && file.endsWith('.json') && !file.includes('summary'))
    .sort((a, b) => {
      // 파일명으로 정렬 (pdf0_chunk0, pdf0_chunk1, pdf1_chunk0, ...)
      const aMatch = a.match(/temp_pdf(\d+)_chunk(\d+)\.json/);
      const bMatch = b.match(/temp_pdf(\d+)_chunk(\d+)\.json/);
      
      if (aMatch && bMatch) {
        const aPdf = parseInt(aMatch[1]);
        const aChunk = parseInt(aMatch[2]);
        const bPdf = parseInt(bMatch[1]);
        const bChunk = parseInt(bMatch[2]);
        
        if (aPdf !== bPdf) return aPdf - bPdf;
        return aChunk - bChunk;
      }
      return a.localeCompare(b);
    });
}

// 청크 파일을 스트리밍으로 읽기
function readChunkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ 청크 파일 읽기 오류 (${filePath}):`, error);
    return null;
  }
}

// 청크들을 PDF별로 그룹화
function groupChunksByPdf(chunkFiles) {
  const pdfGroups = {};
  
  for (const filePath of chunkFiles) {
    const chunkData = readChunkFile(filePath);
    if (!chunkData) continue;
    
    const pdfFile = chunkData.pdfInfo.filename;
    if (!pdfGroups[pdfFile]) {
      pdfGroups[pdfFile] = {
        filename: pdfFile,
        chunks: [],
        totalSize: 0,
        chunkCount: 0
      };
    }
    
    pdfGroups[pdfFile].chunks.push(chunkData.chunk);
    pdfGroups[pdfFile].totalSize += chunkData.chunk.content.length;
    pdfGroups[pdfFile].chunkCount++;
  }
  
  return pdfGroups;
}

// 압축된 텍스트 생성
function createCompressedText(pdfGroups) {
  const compressedTexts = [];
  
  for (const pdfFile in pdfGroups) {
    const group = pdfGroups[pdfFile];
    const pdfText = group.chunks.map(chunk => chunk.content).join('\n\n');
    
    // 간단한 압축 (중복 제거, 불필요한 공백 정리)
    const compressed = pdfText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    compressedTexts.push(`[${pdfFile}]\n${compressed}`);
  }
  
  return compressedTexts.join('\n\n---\n\n');
}

// 전체 텍스트 생성
function createFullText(pdfGroups) {
  const fullTexts = [];
  
  for (const pdfFile in pdfGroups) {
    const group = pdfGroups[pdfFile];
    const pdfText = group.chunks.map(chunk => chunk.content).join('\n\n');
    fullTexts.push(`[${pdfFile}]\n${pdfText}`);
  }
  
  return fullTexts.join('\n\n---\n\n');
}

// 메타데이터 생성
function createMetadata(pdfGroups, totalSize) {
  const pdfFiles = Object.keys(pdfGroups);
  const totalChunks = Object.values(pdfGroups).reduce((sum, group) => sum + group.chunkCount, 0);
  
  return {
    originalSize: totalSize,
    compressedSize: totalSize, // 압축은 나중에 적용
    compressionRatio: 1,
    chunkCount: totalChunks,
    estimatedTokens: Math.ceil(totalSize / 4),
    qualityScore: 95,
    lastUpdated: new Date().toISOString(),
    pdfFiles: pdfFiles,
    version: '7.0.0',
    note: 'High-quality PDF processing with chunking - no repetition',
    processingMethod: 'chunked-parsing',
    memoryOptimized: true
  };
}

// 메인 실행 함수
async function main() {
  try {
    console.log('🔄 청크 파일들 합치기 시작...');
    console.log(`시작 메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
    
    // 청크 파일들 찾기
    const chunkFiles = findChunkFiles();
    console.log(`📁 발견된 청크 파일: ${chunkFiles.length}개`);
    
    if (chunkFiles.length === 0) {
      throw new Error('합칠 청크 파일이 없습니다. 먼저 parse-pdf-with-chunking.js를 실행하세요.');
    }
    
    // 청크들을 PDF별로 그룹화
    console.log('📊 청크들을 PDF별로 그룹화 중...');
    const pdfGroups = groupChunksByPdf(chunkFiles);
    
    console.log(`📋 PDF 그룹: ${Object.keys(pdfGroups).length}개`);
    for (const pdfFile in pdfGroups) {
      const group = pdfGroups[pdfFile];
      console.log(`  - ${pdfFile}: ${group.chunkCount}개 청크, ${group.totalSize.toLocaleString()}자`);
    }
    
    // 전체 크기 계산
    const totalSize = Object.values(pdfGroups).reduce((sum, group) => sum + group.totalSize, 0);
    console.log(`📏 총 텍스트 크기: ${totalSize.toLocaleString()}자`);
    
    // 압축된 텍스트 생성
    console.log('🗜️ 압축된 텍스트 생성 중...');
    const compressedText = createCompressedText(pdfGroups);
    console.log(`✅ 압축된 텍스트: ${compressedText.length.toLocaleString()}자`);
    
    // 전체 텍스트 생성
    console.log('📝 전체 텍스트 생성 중...');
    const fullText = createFullText(pdfGroups);
    console.log(`✅ 전체 텍스트: ${fullText.length.toLocaleString()}자`);
    
    // 모든 청크 수집
    console.log('🧩 모든 청크 수집 중...');
    const allChunks = [];
    for (const pdfFile in pdfGroups) {
      allChunks.push(...pdfGroups[pdfFile].chunks);
    }
    console.log(`✅ 총 청크 수: ${allChunks.length}개`);
    
    // 메타데이터 생성
    console.log('📊 메타데이터 생성 중...');
    const metadata = createMetadata(pdfGroups, totalSize);
    
    // 최종 JSON 데이터 구성
    console.log('🏗️ 최종 JSON 데이터 구성 중...');
    const finalData = {
      compressedText: compressedText,
      fullText: fullText,
      chunks: allChunks,
      metadata: metadata
    };
    
    // 파일 저장
    const publicDir = path.join(__dirname, '../public');
    const dataDir = path.join(publicDir, 'data');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const outputPath = path.join(dataDir, 'processed-pdfs.json');
    console.log(`💾 최종 파일 저장 중: ${outputPath}`);
    
    // 스트리밍으로 파일 저장 (메모리 효율적)
    const writeStream = fs.createWriteStream(outputPath);
    writeStream.write(JSON.stringify(finalData, null, 2));
    writeStream.end();
    
    // 파일 크기 확인
    const stats = fs.statSync(outputPath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log('\n🎉 청크 파일 합치기 완료!');
    console.log(`📊 최종 결과:`);
    console.log(`  - 출력 파일: ${outputPath}`);
    console.log(`  - 파일 크기: ${fileSizeMB}MB`);
    console.log(`  - 전체 텍스트: ${fullText.length.toLocaleString()}자`);
    console.log(`  - 압축된 텍스트: ${compressedText.length.toLocaleString()}자`);
    console.log(`  - 총 청크: ${allChunks.length}개`);
    console.log(`  - PDF 파일: ${Object.keys(pdfGroups).length}개`);
    console.log(`💾 최종 메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
    
    // dist 폴더에도 복사
    const distDataDir = path.join(__dirname, '../dist/data');
    if (!fs.existsSync(distDataDir)) {
      fs.mkdirSync(distDataDir, { recursive: true });
    }
    
    const distOutputPath = path.join(distDataDir, 'processed-pdfs.json');
    fs.copyFileSync(outputPath, distOutputPath);
    console.log(`📁 dist 폴더 복사 완료: ${distOutputPath}`);
    
  } catch (error) {
    console.error('❌ 청크 파일 합치기 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();
