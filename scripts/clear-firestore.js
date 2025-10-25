/**
 * Firestore 데이터 초기화 스크립트
 * 기존 pdf_documents와 pdf_chunks 컬렉션의 모든 데이터를 삭제
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAvdOyBT1Zk9rZ79nP2RvdhpfpIQjGfw8Q",
  authDomain: "chat-4c3a7.firebaseapp.com",
  projectId: "chat-4c3a7",
  storageBucket: "chat-4c3a7.firebasestorage.app",
  messagingSenderId: "995636644973",
  appId: "1:995636644973:web:59554144cbaad5d1444364",
  measurementId: "G-9T5TLP4SF1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearFirestore() {
  try {
    console.log('🗑️ Firestore 데이터 초기화 시작...');
    
    // pdf_documents 컬렉션 삭제
    console.log('📄 pdf_documents 컬렉션 삭제 중...');
    const documentsSnapshot = await getDocs(collection(db, 'pdf_documents'));
    let deletedDocs = 0;
    
    for (const docSnapshot of documentsSnapshot.docs) {
      await deleteDoc(doc(db, 'pdf_documents', docSnapshot.id));
      deletedDocs++;
      console.log(`  ✓ 문서 삭제: ${docSnapshot.id}`);
    }
    console.log(`✅ pdf_documents 삭제 완료: ${deletedDocs}개`);
    
    // pdf_chunks 컬렉션 삭제
    console.log('📦 pdf_chunks 컬렉션 삭제 중...');
    const chunksSnapshot = await getDocs(collection(db, 'pdf_chunks'));
    let deletedChunks = 0;
    
    for (const chunkSnapshot of chunksSnapshot.docs) {
      await deleteDoc(doc(db, 'pdf_chunks', chunkSnapshot.id));
      deletedChunks++;
      
      // 진행률 표시 (매 100개마다)
      if (deletedChunks % 100 === 0) {
        console.log(`  📊 청크 삭제 진행: ${deletedChunks}개`);
      }
    }
    console.log(`✅ pdf_chunks 삭제 완료: ${deletedChunks}개`);
    
    console.log('\n🎉 Firestore 데이터 초기화 완료!');
    console.log(`📊 삭제된 데이터:`);
    console.log(`  - 문서: ${deletedDocs}개`);
    console.log(`  - 청크: ${deletedChunks}개`);
    
  } catch (error) {
    console.error('❌ 초기화 실패:', error);
    process.exit(1);
  }
}

// 스크립트 실행
clearFirestore();
