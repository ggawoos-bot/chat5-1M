import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import SourceInfo from './components/SourceInfo';
import CompressionStats from './components/CompressionStats';
import ConfirmDialog from './components/ConfirmDialog';
import { geminiService } from './services/geminiService';
import { SourceInfo as SourceInfoType } from './types';

function App() {
  const [sources, setSources] = useState<SourceInfoType[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showCompressionStats, setShowCompressionStats] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);

  // 앱 시작 시 PDF 소스 로드 (압축 기능 포함 + 진행률 표시)
  useEffect(() => {
    const initializeSources = async () => {
      try {
        console.log('Starting PDF initialization...');
        
        // PDF 내용을 압축하여 초기화 (비동기 처리)
        const initPromise = geminiService.initializeWithPdfSources();
        
        // 채팅 세션 생성 (PDF 초기화와 병렬 처리)
        const chatPromise = geminiService.createNotebookChatSession();
        
        // 두 작업을 병렬로 실행
        await Promise.all([initPromise, chatPromise]);
        
        // 소스 목록 업데이트
        setSources(geminiService.getSources());
        
        console.log('Initialization completed successfully');
        setIsInitializing(false);
      } catch (error) {
        console.error('Failed to initialize chat session:', error);
        // 초기화 실패 시에도 앱을 계속 실행
        console.warn('초기화에 실패했지만 앱을 계속 실행합니다.');
        setIsInitializing(false);
      }
    };

    // 초기화를 비동기로 실행하여 UI 블로킹 방지
    initializeSources();
  }, []);

  const handleSendMessage = async (message: string): Promise<string> => {
    return await geminiService.generateResponse(message);
  };

  const handleStreamingMessage = async (message: string): Promise<AsyncGenerator<string, void, unknown>> => {
    return await geminiService.generateStreamingResponse(message);
  };


  const handleResetChat = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    try {
      setShowResetConfirm(false);
      
      // 1. 현재 채팅 세션 초기화
      await geminiService.resetChatSession();
      
      // 2. 메시지 목록 초기화 (ChatWindow에서 관리하는 메시지들)
      setMessages([]);
      
      // 3. 소스 목록을 다시 로드하여 최신 상태 유지
      await geminiService.initializeWithPdfSources();
      setSources(geminiService.getSources());
      
      console.log('새 대화가 시작되었습니다.');
    } catch (error) {
      console.error('Failed to reset chat session:', error);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-brand-bg text-brand-text-primary flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-brand-secondary rounded-full mx-auto"></div>
            <div className="w-16 h-16 border-4 border-brand-primary border-t-transparent rounded-full animate-spin absolute top-0 left-1/2 transform -translate-x-1/2"></div>
          </div>
          <h2 className="text-2xl font-bold text-brand-text-primary mb-3">AI 사업문의 지원 Chatbot4</h2>
          <p className="text-brand-text-secondary mb-4">문서를 준비하고 있습니다...</p>
          <div className="space-y-2 text-sm text-brand-text-secondary">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse"></div>
              <span>사전 처리된 데이터 로딩 중...</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <span>PDF 문서 파싱 중 (폴백 모드)</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
              <span>AI 모델 준비 중...</span>
            </div>
          </div>
          <div className="mt-6 text-xs text-brand-text-secondary">
            잠시만 기다려주세요. 첫 로딩은 시간이 걸릴 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text-primary">
      <div className="max-w-7xl mx-auto h-screen flex flex-col">
        <header className="bg-brand-surface border-b border-brand-secondary p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              {/* 모바일 메뉴 버튼 */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 rounded-lg bg-brand-secondary hover:bg-opacity-80 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-brand-primary">
                  AI 사업문의 지원 Chatbot4
                </h1>
                <p className="text-brand-text-secondary text-xs md:text-sm mt-1">
                  금연사업 관련 문의사항을 AI가 도와드립니다
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowCompressionStats(true)}
                className="px-3 py-2 bg-brand-secondary text-brand-text-primary rounded-lg hover:bg-opacity-80 transition-colors text-xs md:text-sm"
              >
                사용량 통계
              </button>
              <button
                onClick={handleResetChat}
                className="px-3 py-2 bg-brand-secondary text-brand-text-primary rounded-lg hover:bg-opacity-80 transition-colors text-xs md:text-sm"
              >
                새 대화 시작
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          {/* 모바일 오버레이 */}
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* 사이드바 - 소스 관리 */}
          <div className={`
            fixed md:relative z-50 md:z-auto
            w-80 h-full bg-brand-surface border-r border-brand-secondary p-4 overflow-y-auto
            transform transition-transform duration-300 ease-in-out
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0 md:block
          `}>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold text-brand-text-primary">자료 출처</h2>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="md:hidden p-1 rounded-lg hover:bg-brand-secondary"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-md font-medium text-brand-text-primary">현재 자료</h3>
              <SourceInfo sources={sources} />
            </div>
          </div>

          {/* 메인 채팅 영역 */}
          <div className="flex-1 flex flex-col min-w-0">
            <ChatWindow
              onSendMessage={handleSendMessage}
              onStreamingMessage={handleStreamingMessage}
              onResetMessages={() => setMessages([])}
              placeholder="금연사업 관련 문의사항을 입력하세요..."
            />
          </div>
        </div>
      </div>

      {/* 압축 통계 모달 */}
      <CompressionStats
        compressionResult={geminiService.getCompressionStats()}
        isVisible={showCompressionStats}
        onClose={() => setShowCompressionStats(false)}
      />

      {/* 새 대화 시작 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="새 대화 시작"
        message="현재 대화 내용이 모두 삭제됩니다. 계속하시겠습니까?"
        confirmText="새 대화 시작"
        cancelText="취소"
        onConfirm={confirmReset}
        onCancel={() => setShowResetConfirm(false)}
        isDestructive={true}
      />
    </div>
  );
}

export default App;