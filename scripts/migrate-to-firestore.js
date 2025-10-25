/**
 * PDF 파일을 직접 읽어서 Firestore로 마이그레이션하는 스크립트
 * JSON 파일 의존성 없이 PDF를 직접 처리하여 Firestore에 저장
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase configuration (환경변수 우선)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAvdOyBT1Zk9rZ79nP2RvdhpfpIQjGfw8Q",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "chat-4c3a7.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "chat-4c3a7",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "chat-4c3a7.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "995636644973",
  appId: process.env.FIREBASE_APP_ID || "1:995636644973:web:59554144cbaad5d1444364",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-9T5TLP4SF1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// GitHub Actions 환경 감지
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const forceReprocess = process.env.FORCE_REPROCESS === 'true';

console.log(`🔧 환경 설정:`);
console.log(`  GitHub Actions: ${isGitHubActions}`);
console.log(`  강제 재처리: ${forceReprocess}`);
console.log(`  Node.js 환경: ${process.env.NODE_ENV || 'development'}`);

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

// PDF 파일 목록 가져오기
function getPdfFiles() {
  const manifestPath = path.join(__dirname, '..', 'public', 'pdf', 'manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json 파일을 찾을 수 없습니다.');
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest;
}

// PDF 파일 파싱
async function parsePdfFile(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info
    };
  } catch (error) {
    console.error(`PDF 파싱 실패: ${pdfPath}`, error);
    throw error;
  }
}

// 텍스트를 청크로 분할 (메모리 효율적)
function splitIntoChunks(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);
    
    // 문장 경계에서 자르기
    if (end < text.length) {
      const lastSentenceEnd = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const cutPoint = Math.max(lastSentenceEnd, lastNewline);
      
      if (cutPoint > start + chunkSize * 0.5) {
        chunk = chunk.slice(0, cutPoint + 1);
      }
    }
    
    chunks.push({
      content: chunk.trim(),
      startPos: start,
      endPos: start + chunk.length,
      originalSize: chunk.length
    });
    
    start += chunk.length - overlap;
    
    // 메모리 정리
    if (chunks.length % 100 === 0) {
      if (global.gc) {
        global.gc();
      }
    }
  }
  
  return chunks;
}

// 키워드 추출 (간단한 버전)
function extractKeywords(text) {
  const keywords = [];
  
  // 금연 관련 키워드
  const smokingKeywords = ['금연', '담배', '니코틴', '흡연', '금연구역', '건강증진', '필로티', '공동주택'];
  smokingKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      keywords.push(keyword);
    }
  });
  
  // 법령 관련 키워드
  const legalKeywords = ['법령', '시행령', '시행규칙', '지침', '가이드라인', '규정', '조항'];
  legalKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      keywords.push(keyword);
    }
  });
  
  return [...new Set(keywords)]; // 중복 제거
}

// 문서 타입 분류
function getDocumentType(filename) {
  const legalKeywords = ['법률', '시행령', '시행규칙', '규정'];
  const guidelineKeywords = ['지침', '가이드라인', '매뉴얼', '안내'];
  
  const isLegal = legalKeywords.some(keyword => filename.includes(keyword));
  const isGuideline = guidelineKeywords.some(keyword => filename.includes(keyword));
  
  if (isLegal) return '법령';
  if (isGuideline) return '지침';
  return '기타';
}

// PDF 문서를 Firestore에 추가
async function addDocumentToFirestore(filename, pdfData, chunks) {
  try {
    const documentData = {
      filename: filename,
      title: filename.replace('.pdf', ''),
      type: getDocumentType(filename),
      totalPages: pdfData.pages || 0,  // undefined 방지
      totalChunks: chunks.length || 0,
      totalSize: pdfData.text ? pdfData.text.length : 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      environment: isGitHubActions ? 'github-actions' : 'local'
    };
    
    const docRef = await addDoc(collection(db, 'pdf_documents'), documentData);
    console.log(`✅ 문서 추가 완료: ${filename} (ID: ${docRef.id})`);
    
    return docRef.id;
  } catch (error) {
    console.error(`❌ 문서 추가 실패: ${filename}`, error);
    throw error;
  }
}

// 동적 배치 크기 계산 - 항상 1개로 고정
function calculateDynamicBatchSize() {
  // 메모리 사용량에 관계없이 항상 1개씩 처리
  return 1;
}

// 청크들을 Firestore에 추가 (1개씩 처리)
async function addChunksToFirestore(documentId, filename, chunks) {
  try {
    let addedCount = 0;
    
    console.log(`📦 1개씩 처리 시작: ${chunks.length}개 청크`);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const keywords = extractKeywords(chunk.content);
      
      const chunkData = {
        documentId: documentId,
        filename: filename,
        content: chunk.content,
        keywords: keywords,
        metadata: {
          position: i,
          startPos: chunk.startPos,
          endPos: chunk.endPos,
          originalSize: chunk.originalSize,
          source: 'Direct PDF Processing'
        },
        searchableText: chunk.content.toLowerCase(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      // 1개씩 개별 저장
      await addDoc(collection(db, 'pdf_chunks'), chunkData);
      addedCount++;
      
      // 진행률 표시
      const progress = (((i + 1) / chunks.length) * 100).toFixed(1);
      console.log(`  ✓ 청크 ${i + 1}/${chunks.length} 저장 완료 (${progress}%)`);
      
      // 메모리 정리 (매 10개마다)
      if ((i + 1) % 10 === 0 && global.gc) {
        global.gc();
        console.log(`  🧹 메모리 정리 완료 (${i + 1}개 처리 후)`);
      }
    }
    
    console.log(`✅ 청크 추가 완료: ${chunks.length}개`);
    return chunks.length;
  } catch (error) {
    console.error(`❌ 청크 추가 실패: ${filename}`, error);
    throw error;
  }
}

// 스트리밍 PDF 처리 함수
async function processPdfStreaming(pdfFile, pdfPath, index, totalFiles) {
  try {
    console.log(`\n📄 [${index + 1}/${totalFiles}] 처리 중: ${pdfFile}`);
    console.log(`💾 메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
    
    // PDF 파일 존재 확인
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF 파일을 찾을 수 없습니다: ${pdfPath}`);
    }
    
    // PDF 파싱
    console.log(`[1/4] PDF 파싱 시도: ${pdfFile}`);
    const pdfData = await parsePdfFile(pdfPath);
    console.log(`✔ PDF 파싱 성공: ${pdfData.text.length.toLocaleString()}자`);
    
    // Firestore에 문서 추가 (청크 없이)
    console.log(`[2/4] 문서 메타데이터 저장 중...`);
    const documentId = await addDocumentToFirestore(pdfFile, pdfData, []);
    
    // 스트리밍 청크 처리
    console.log(`[3/4] 스트리밍 청크 처리 중...`);
    const chunks = splitIntoChunks(pdfData.text);
    console.log(`✔ 청크 분할 완료: ${chunks.length}개`);
    
    // 청크들을 스트리밍으로 처리
    const addedChunks = await addChunksToFirestore(documentId, pdfFile, chunks);
    
    console.log(`[4/4] 메모리 정리 중...`);
    
    // 즉시 메모리 정리
    pdfData.text = null;
    chunks.length = 0;
    
    if (global.gc) {
      global.gc();
    }
    
    console.log(`✅ ${pdfFile} 처리 완료 (품질: 100)`);
    return { success: true, chunks: addedChunks };
    
  } catch (error) {
    console.error(`❌ ${pdfFile} 처리 실패:`, error.message);
    return { success: false, error: error.message };
  }
}

// 메인 마이그레이션 함수 (1개씩 처리)
async function migrateToFirestore() {
  try {
    console.log('🚀 Firestore PDF 1개씩 처리 시작...');
    console.log(`💾 초기 메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
    
    // PDF 파일 목록 가져오기
    const pdfFiles = getPdfFiles();
    console.log(`📄 처리할 PDF 파일: ${pdfFiles.length}개`);
    
    let totalDocuments = 0;
    let totalChunks = 0;
    let failedFiles = [];
    
    // 순차적으로 PDF 파일 처리 (메모리 안정성)
    for (let i = 0; i < pdfFiles.length; i++) {
      const pdfFile = pdfFiles[i];
      const pdfPath = path.join(__dirname, '..', 'public', 'pdf', pdfFile);
      
      const result = await processPdfStreaming(pdfFile, pdfPath, i, pdfFiles.length);
      
      if (result.success) {
        totalDocuments++;
        totalChunks += result.chunks;
      } else {
        failedFiles.push({ file: pdfFile, error: result.error });
      }
      
      // 파일 간 메모리 정리
      if (global.gc) {
        global.gc();
      }
      
      // 진행률 표시
      const progress = (((i + 1) / pdfFiles.length) * 100).toFixed(1);
      console.log(`\n📊 전체 진행률: ${progress}% (${i + 1}/${pdfFiles.length})`);
      console.log(`💾 현재 메모리: ${JSON.stringify(getMemoryUsage())}MB`);
    }
    
    const endTime = Date.now();
    const duration = ((endTime - Date.now()) / 1000).toFixed(2);
    
    console.log('\n🎉 Firestore PDF 직접 처리 완료!');
    console.log('=' * 50);
    console.log(`📊 처리 결과:`);
    console.log(`  - PDF 문서: ${totalDocuments}개`);
    console.log(`  - 청크 데이터: ${totalChunks}개`);
    console.log(`⏱️ 소요 시간: ${duration}초`);
    console.log(`💾 최종 메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
    
    if (isGitHubActions) {
      console.log('\n🎉 GitHub Actions에서 Firestore PDF 직접 처리 완료!');
      console.log('✅ 이제 Firestore에서 데이터를 사용할 수 있습니다!');
    } else {
      console.log('\n✨ 이제 Firestore에서 데이터를 사용할 수 있습니다!');
    }
    
    if (failedFiles.length > 0) {
      console.log(`\n⚠️ 실패한 파일들: ${failedFiles.length}개`);
      failedFiles.forEach(f => console.log(`  - ${f.file}: ${f.error}`));
    }
    
  } catch (error) {
    console.error('\n❌ Firestore PDF 직접 처리 중 오류 발생:', error);
    console.log('\n🔧 문제 해결 방법:');
    console.log('1. Firebase 프로젝트 설정 확인');
    console.log('2. Firestore 규칙 확인 (읽기/쓰기 권한)');
    console.log('3. 네트워크 연결 확인');
    console.log('4. PDF 파일 존재 여부 확인');
    process.exit(1);
  }
}

// 스크립트 실행
migrateToFirestore();