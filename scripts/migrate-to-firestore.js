/**
 * processed-pdfs.json 데이터를 Firestore로 마이그레이션하는 스크립트
 * 기존 JSON 파일의 데이터를 Firestore 컬렉션으로 변환
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, writeBatch, Timestamp } from 'firebase/firestore';

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

// PDF 문서별로 청크 그룹화
function groupChunksByDocument(chunks) {
  const documentGroups = {};
  
  chunks.forEach(chunk => {
    const source = chunk.metadata?.source || chunk.location?.document || 'unknown';
    const documentId = source.replace('.pdf', '').replace(/[^a-zA-Z0-9가-힣]/g, '_');
    
    if (!documentGroups[documentId]) {
      documentGroups[documentId] = {
        documentId: documentId,
        filename: source,
        title: chunk.metadata?.title || source.replace('.pdf', ''),
        chunks: [],
        totalSize: 0
      };
    }
    
    documentGroups[documentId].chunks.push(chunk);
    documentGroups[documentId].totalSize += chunk.content.length;
  });
  
  return documentGroups;
}

// 청크 데이터를 Firestore 형식으로 변환
function transformChunkForFirestore(chunk, documentId, position) {
  return {
    documentId: documentId,
    content: chunk.content,
    keywords: chunk.keywords || [],
    metadata: {
      page: chunk.metadata?.page || Math.floor(position / 10) + 1,
      section: chunk.location?.section || chunk.metadata?.section || '일반',
      position: position,
      startPos: chunk.metadata?.startPosition || 0,
      endPos: chunk.metadata?.endPosition || chunk.content.length,
      originalSize: chunk.metadata?.originalSize || chunk.content.length
    },
    searchableText: chunk.content.toLowerCase().replace(/\s+/g, ' ').trim(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };
}

// PDF 문서 메타데이터 변환
function transformDocumentForFirestore(documentGroup) {
  return {
    id: documentGroup.documentId,
    title: documentGroup.title,
    filename: documentGroup.filename,
    totalChunks: documentGroup.chunks.length,
    totalSize: documentGroup.totalSize,
    processedAt: Timestamp.now(),
    version: '1.0.0',
    metadata: {
      source: documentGroup.filename,
      title: documentGroup.title
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };
}

// 배치로 청크 데이터 추가
async function addChunksInBatches(chunks, batchSize = 50) {
  console.log(`📝 청크 데이터 추가 시작: ${chunks.length}개 (배치 크기: ${batchSize})`);
  
  let addedCount = 0;
  const totalBatches = Math.ceil(chunks.length / batchSize);
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchChunks = chunks.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    
    console.log(`📦 배치 ${currentBatch}/${totalBatches} 처리 중... (${batchChunks.length}개 청크)`);
    
    try {
      // 각 청크를 개별적으로 추가
      for (const chunk of batchChunks) {
        await addDoc(collection(db, 'pdf_chunks'), chunk);
        addedCount++;
      }
      
      console.log(`✅ 배치 ${currentBatch} 완료: ${addedCount}/${chunks.length}개 청크 추가됨`);
      
      // 메모리 정리
      if (global.gc) {
        global.gc();
      }
      
      // 배치 간 잠시 대기 (Firestore 제한 방지)
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`❌ 배치 ${currentBatch} 실패:`, error);
      throw error;
    }
  }
  
  console.log(`✅ 모든 청크 추가 완료: ${addedCount}개`);
  return addedCount;
}

// PDF 문서 메타데이터 추가
async function addDocuments(documents) {
  console.log(`📄 PDF 문서 메타데이터 추가: ${documents.length}개`);
  
  try {
    // 각 문서를 개별적으로 추가
    for (const doc of documents) {
      await addDoc(collection(db, 'pdf_documents'), doc);
    }
    
    console.log(`✅ PDF 문서 메타데이터 추가 완료: ${documents.length}개`);
    return true;
  } catch (error) {
    console.error('❌ PDF 문서 메타데이터 추가 실패:', error);
    throw error;
  }
}

// 메인 마이그레이션 함수
async function migrateToFirestore() {
  try {
    console.log('🚀 Firestore 마이그레이션 시작...');
    console.log(`시작 메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
    
    // processed-pdfs.json 파일 읽기
    const jsonPath = path.join(__dirname, '../public/data/processed-pdfs.json');
    
    if (!fs.existsSync(jsonPath)) {
      throw new Error('processed-pdfs.json 파일을 찾을 수 없습니다.');
    }
    
    console.log('📖 JSON 파일 읽기 중...');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // JSON 구조 확인 및 chunks 데이터 추출
    let allChunks = [];
    if (jsonData.chunks && Array.isArray(jsonData.chunks)) {
      // 단일 chunks 배열인 경우
      allChunks = jsonData.chunks;
    } else if (jsonData.data && Array.isArray(jsonData.data)) {
      // data 배열 안에 각 PDF별로 chunks가 있는 경우
      jsonData.data.forEach(pdfData => {
        if (pdfData.chunks && Array.isArray(pdfData.chunks)) {
          allChunks = allChunks.concat(pdfData.chunks);
        }
      });
    } else {
      throw new Error('JSON 파일에서 chunks 데이터를 찾을 수 없습니다.');
    }
    
    if (allChunks.length === 0) {
      throw new Error('처리할 청크 데이터가 없습니다.');
    }
    
    console.log(`📊 JSON 데이터: ${allChunks.length}개 청크, ${jsonData.data?.length || 0}개 PDF`);
    
    // 청크를 PDF 문서별로 그룹화
    console.log('📋 청크를 PDF 문서별로 그룹화 중...');
    const documentGroups = groupChunksByDocument(allChunks);
    
    console.log(`📁 PDF 문서 그룹: ${Object.keys(documentGroups).length}개`);
    Object.keys(documentGroups).forEach(docId => {
      const group = documentGroups[docId];
      console.log(`  - ${group.filename}: ${group.chunks.length}개 청크, ${group.totalSize.toLocaleString()}자`);
    });
    
    // PDF 문서 메타데이터 변환
    console.log('📄 PDF 문서 메타데이터 변환 중...');
    const documents = Object.values(documentGroups).map(transformDocumentForFirestore);
    
    // 모든 청크를 Firestore 형식으로 변환
    console.log('🔄 청크 데이터 변환 중...');
    const firestoreChunks = [];
    let position = 0;
    
    Object.values(documentGroups).forEach(group => {
      group.chunks.forEach(chunk => {
        firestoreChunks.push(transformChunkForFirestore(chunk, group.documentId, position++));
      });
    });
    
    console.log(`✅ 변환 완료: ${firestoreChunks.length}개 청크, ${documents.length}개 문서`);
    
    // Firestore에 데이터 추가
    console.log('🔥 Firestore에 데이터 추가 중...');
    
    // 1. PDF 문서 메타데이터 추가
    await addDocuments(documents);
    
    // 2. 청크 데이터 배치 추가
    const addedChunks = await addChunksInBatches(firestoreChunks, 50); // 작은 배치 크기로 안정성 확보
    
    const endTime = Date.now();
    const duration = ((endTime - Date.now()) / 1000).toFixed(2);
    
    console.log('\n🎉 Firestore 마이그레이션 완료!');
    console.log('=' * 50);
    console.log(`📊 마이그레이션 결과:`);
    console.log(`  - PDF 문서: ${documents.length}개`);
    console.log(`  - 청크 데이터: ${addedChunks}개`);
    console.log(`  - 총 크기: ${Object.values(documentGroups).reduce((sum, group) => sum + group.totalSize, 0).toLocaleString()}자`);
    console.log(`⏱️ 소요 시간: ${duration}초`);
    console.log(`💾 최종 메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
    
    if (isGitHubActions) {
      console.log('\n🎉 GitHub Actions에서 Firestore 마이그레이션 완료!');
      console.log('✅ 이제 Firestore에서 데이터를 사용할 수 있습니다!');
    } else {
      console.log('\n✨ 이제 Firestore에서 데이터를 사용할 수 있습니다!');
    }
    
  } catch (error) {
    console.error('\n❌ Firestore 마이그레이션 중 오류 발생:', error);
    console.log('\n🔧 문제 해결 방법:');
    console.log('1. Firebase 프로젝트 설정 확인');
    console.log('2. Firestore 규칙 확인 (읽기/쓰기 권한)');
    console.log('3. 네트워크 연결 확인');
    console.log('4. processed-pdfs.json 파일 존재 여부 확인');
    process.exit(1);
  }
}

// 스크립트 실행
migrateToFirestore();
