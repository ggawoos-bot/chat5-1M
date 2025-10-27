/**
 * PDF 파일을 직접 읽어서 Firestore로 마이그레이션하는 스크립트
 * JSON 파일 의존성 없이 PDF를 직접 처리하여 Firestore에 저장
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, writeBatch, Timestamp, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ 동의어 사전 로드
let synonymDictionary = null;
try {
  const dictPath = path.join(__dirname, '..', 'data', 'comprehensive-synonym-dictionary.json');
  if (fs.existsSync(dictPath)) {
    const dictData = fs.readFileSync(dictPath, 'utf8');
    synonymDictionary = JSON.parse(dictData);
    console.log(`✅ 동의어 사전 로드 완료: ${dictData.length}자`);
  } else {
    console.log('⚠️ 동의어 사전 파일을 찾을 수 없습니다. 기본 키워드만 사용합니다.');
  }
} catch (error) {
  console.log(`⚠️ 동의어 사전 로드 실패: ${error.message}. 기본 키워드만 사용합니다.`);
}

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
    // pdf-parse 모듈에서 PDFParse 클래스를 가져와 사용
    const PDFParse = pdfParse.PDFParse || pdfParse;
    const instance = new PDFParse({ data: dataBuffer });
    const data = await instance.getText();
    
    return {
      text: data.text,
      pages: data.total,
      info: {}
    };
  } catch (error) {
    console.error(`PDF 파싱 실패: ${pdfPath}`, error);
    throw error;
  }
}

// 전체 기존 데이터 삭제 함수 (일괄 삭제)
async function clearAllExistingData() {
  try {
    console.log('🗑️ 전체 기존 데이터 삭제 시작...');
    const startTime = Date.now();
    
    // 1. 모든 청크 삭제
    console.log('📦 모든 청크 삭제 중...');
    const allChunksQuery = query(collection(db, 'pdf_chunks'));
    const allChunksSnapshot = await getDocs(allChunksQuery);
    
    if (allChunksSnapshot.empty) {
      console.log('  ✓ 기존 청크 없음');
    } else {
      console.log(`  📦 기존 청크 삭제 중: ${allChunksSnapshot.docs.length}개`);
      
      // WriteBatch로 일괄 삭제 (500개씩)
      const batchSize = 500;
      const chunks = allChunksSnapshot.docs;
      let deletedChunks = 0;
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchChunks = chunks.slice(i, i + batchSize);
        
        batchChunks.forEach(chunkDoc => {
          batch.delete(chunkDoc.ref);
        });
        
        await batch.commit();
        deletedChunks += batchChunks.length;
        
        const progress = ((deletedChunks / chunks.length) * 100).toFixed(1);
        console.log(`  ✓ 청크 삭제 완료: ${deletedChunks}/${chunks.length}개 (${progress}%)`);
        
        // 메모리 정리 (매 1000개마다)
        if (deletedChunks % 1000 === 0 && global.gc) {
          global.gc();
        }
      }
      
      console.log(`  ✅ 청크 삭제 완료: ${deletedChunks}개`);
    }
    
    // 2. 모든 문서 삭제
    console.log('📄 모든 문서 삭제 중...');
    const allDocsQuery = query(collection(db, 'pdf_documents'));
    const allDocsSnapshot = await getDocs(allDocsQuery);
    
    if (allDocsSnapshot.empty) {
      console.log('  ✓ 기존 문서 없음');
    } else {
      console.log(`  📄 기존 문서 삭제 중: ${allDocsSnapshot.docs.length}개`);
      
      const batch = writeBatch(db);
      allDocsSnapshot.docs.forEach(docSnapshot => {
        batch.delete(docSnapshot.ref);
      });
      
      await batch.commit();
      console.log(`  ✅ 문서 삭제 완료: ${allDocsSnapshot.docs.length}개`);
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`✅ 전체 데이터 삭제 완료 (${duration}초)`);
    return true;
  } catch (error) {
    console.error('❌ 전체 데이터 삭제 실패:', error);
    return false;
  }
}


// 개별 청크를 Firestore에 저장
async function saveChunkToFirestore(documentId, filename, chunk, index, position) {
  try {
    const keywords = extractKeywords(chunk);
    
    const chunkData = {
      documentId: documentId,
      filename: filename,
      content: chunk,
      keywords: keywords,
      metadata: {
        position: index,
        startPos: position,
        endPos: position + chunk.length,
        originalSize: chunk.length,
        source: 'Direct PDF Processing'
      },
      searchableText: chunk.toLowerCase(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    await addDoc(collection(db, 'pdf_chunks'), chunkData);
    return true;
  } catch (error) {
    console.error(`❌ 청크 ${index + 1} 저장 실패:`, error.message);
    return false;
  }
}

// 스트리밍 청크 처리 (WriteBatch 최적화) - 수정된 버전
async function processChunksStreaming(documentId, filename, text) {
  const chunkSize = 2000;
  const overlap = 200;
  let position = 0;
  let chunkIndex = 0;
  let successCount = 0;
  let lastPosition = -1; // 무한 루프 방지용
  let stuckCount = 0; // 같은 위치에서 멈춘 횟수
  
  // WriteBatch를 위한 청크 데이터 수집
  const chunkDataList = [];
  const batchSize = 2; // WriteBatch 크기 (메모리 안정성을 위해 2개)
  
  console.log(`📦 스트리밍 청크 처리 시작: ${text.length.toLocaleString()}자`);
  console.log(`🔧 배치 크기: ${batchSize}개 (메모리 안정적 모드)`);
  console.log(`💾 초기 메모리: ${JSON.stringify(getMemoryUsage())}MB`);
  
  while (position < text.length) {
    // 무한 루프 방지 체크
    if (position === lastPosition) {
      stuckCount++;
      if (stuckCount > 3) {
        console.error(`❌ 무한 루프 감지! position이 ${position}에서 멈춤. 처리 중단.`);
        break;
      }
    } else {
      stuckCount = 0;
      lastPosition = position;
    }
    
    const end = Math.min(position + chunkSize, text.length);
    let chunk = text.slice(position, end);
    
    // 문장 경계에서 자르기 (개선된 로직)
    if (end < text.length) {
      const lastSentenceEnd = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const lastSpace = chunk.lastIndexOf(' ');
      
      // 더 나은 자르기 지점 찾기
      let cutPoint = Math.max(lastSentenceEnd, lastNewline, lastSpace);
      
      // 최소 50% 이상은 유지
      if (cutPoint > position + chunkSize * 0.5) {
        chunk = chunk.slice(0, cutPoint + 1);
      }
    }
    
    // 청크 데이터 수집
    const keywords = extractKeywords(chunk.trim());
    chunkDataList.push({
      documentId: documentId,
      filename: filename,
      content: chunk.trim(),
      keywords: keywords,
      metadata: {
        position: chunkIndex,
        startPos: position,
        endPos: position + chunk.length,
        originalSize: chunk.length,
        source: 'Direct PDF Processing'
      },
      searchableText: chunk.trim().toLowerCase(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    // WriteBatch 크기에 도달하면 저장
    if (chunkDataList.length >= batchSize) {
      const saved = await saveChunksBatch(chunkDataList);
      successCount += saved;
      chunkDataList.length = 0; // 배열 초기화
      
      // 메모리 상태 주기적 표시 (매 10개 배치마다)
      if (successCount % 20 === 0) {
        console.log(`  💾 현재 메모리: ${JSON.stringify(getMemoryUsage())}MB`);
      }
    }
    
    // ✅ 올바른 position 업데이트 로직
    if (end >= text.length) {
      // 마지막 청크인 경우 루프 종료
      position = text.length;
    } else {
      // 다음 청크를 위해 오버랩 적용
      position = end - overlap;
      if (position < 0) position = 0;
    }
    chunkIndex++;
    
    // 진행률 표시 (청크 크기도 함께 표시)
    const progress = ((position / text.length) * 100).toFixed(1);
    console.log(`  ✓ 청크 ${chunkIndex} 처리 완료 (${progress}%) - 크기: ${chunk.length}자`);
    
    // 메모리 정리 (매 20개마다 - 2개 배치에 맞춰 조정)
    if (chunkIndex % 20 === 0 && global.gc) {
      global.gc();
      console.log(`  🧹 메모리 정리 완료 (${chunkIndex}개 처리 후)`);
    }
  }
  
  // 남은 청크 데이터 저장
  if (chunkDataList.length > 0) {
    const saved = await saveChunksBatch(chunkDataList);
    successCount += saved;
  }
  
  console.log(`✅ 스트리밍 청크 처리 완료: ${successCount}/${chunkIndex}개 성공`);
  return successCount;
}

// WriteBatch로 청크들을 일괄 저장
async function saveChunksBatch(chunkDataList) {
  try {
    const batch = writeBatch(db);
    
    chunkDataList.forEach(chunkData => {
      const docRef = doc(collection(db, 'pdf_chunks'));
      batch.set(docRef, chunkData);
    });
    
    await batch.commit();
    console.log(`  📦 청크 배치 저장 완료: ${chunkDataList.length}개 (메모리 안정적)`);
    return chunkDataList.length;
  } catch (error) {
    console.error(`❌ 청크 배치 저장 실패:`, error.message);
    return 0;
  }
}

// ✅ 범용적 키워드 추출: 모든 한글 단어 자동 추출 + 동의어 확장
function extractKeywords(text) {
  const keywords = new Set();
  
  // 1. 모든 한글 단어 자동 추출 (2-10글자)
  const koreanWords = text.match(/[가-힣]{2,10}/g) || [];
  koreanWords.forEach(word => {
    // 일반적인 조사, 보조사 제외
    if (!isCommonWord(word) && word.length >= 2 && word.length <= 10) {
      keywords.add(word);
    }
  });
  
  // 2. 영어 단어 추출 (시설명, 법령명 등)
  const englishWords = text.match(/[A-Z][a-z]+/g) || [];
  englishWords.forEach(word => {
    if (word.length >= 3 && word.length <= 20) {
      keywords.add(word);
    }
  });
  
  // 3. 법령 조항 패턴 (제X조, 제X항 등)
  const lawPatterns = text.match(/제[0-9]+조|제[0-9]+항|제[0-9]+호/g) || [];
  lawPatterns.forEach(pattern => {
    keywords.add(pattern);
  });
  
  // 4. 동의어 사전 확장 (역방향 매핑)
  if (synonymDictionary && typeof synonymDictionary === 'object') {
    // synonymMappings에서 역방향 검색
    if (synonymDictionary.synonymMappings && typeof synonymDictionary.synonymMappings === 'object') {
      Object.keys(synonymDictionary.synonymMappings).forEach(baseKeyword => {
        const synonyms = synonymDictionary.synonymMappings[baseKeyword];
        if (Array.isArray(synonyms)) {
          // 텍스트에 동의어가 있으면 기본 키워드와 동의어 모두 추가
          const matchedSynonyms = synonyms.filter(syn => text.includes(syn));
          if (matchedSynonyms.length > 0) {
            keywords.add(baseKeyword);
            matchedSynonyms.forEach(syn => keywords.add(syn));
          }
        }
      });
    }
    
    // keywords 배열에서도 검색
    if (synonymDictionary.keywords && Array.isArray(synonymDictionary.keywords)) {
      synonymDictionary.keywords.forEach(dictKeyword => {
        if (typeof dictKeyword === 'string' && text.includes(dictKeyword)) {
          keywords.add(dictKeyword);
        }
      });
    }
  }
  
  return Array.from(keywords);
}

// 일반적인 단어 필터
function isCommonWord(word) {
  const commonWords = [
    '은', '는', '이', '가', '을', '를', '의', '과', '와', '에', '로', '에서',
    '및', '또는', '이다', '것', '등', '밖', '까지', '부터', '만', '도',
    '것을', '것이', '것이', '것에', '것을', '것으로', '것에서는',
    '년', '월', '일', '시', '분', '초'
  ];
  return commonWords.includes(word);
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

// 기존 함수들 제거됨 - 스트리밍 처리로 교체

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
    console.log(`[1/3] PDF 파싱 시도: ${pdfFile}`);
    const pdfData = await parsePdfFile(pdfPath);
    console.log(`✔ PDF 파싱 성공: ${pdfData.text.length.toLocaleString()}자`);
    
    // Firestore에 문서 추가 (청크 없이)
    console.log(`[2/3] 문서 메타데이터 저장 중...`);
    const documentId = await addDocumentToFirestore(pdfFile, pdfData, []);
    
    // 스트리밍 청크 처리
    console.log(`[3/3] 스트리밍 청크 처리 중...`);
    const addedChunks = await processChunksStreaming(documentId, pdfFile, pdfData.text);
    
    console.log(`[4/4] 메모리 정리 중...`);
    
    // 즉시 메모리 정리
    pdfData.text = null;
    
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

// 메인 마이그레이션 함수 (스트리밍 처리)
async function migrateToFirestore() {
  try {
    console.log('🚀 Firestore PDF 스트리밍 처리 시작...');
    console.log(`💾 초기 메모리 사용량: ${JSON.stringify(getMemoryUsage())}MB`);
    
    // 🔥 전체 기존 데이터 일괄 삭제 (한 번만 실행)
    console.log('🗑️ 전체 기존 데이터 삭제 중...');
    const clearSuccess = await clearAllExistingData();
    if (!clearSuccess) {
      console.error('❌ 데이터 삭제 실패로 인해 처리 중단');
      return;
    }
    
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