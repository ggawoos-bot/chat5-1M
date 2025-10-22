import React, { useState, useRef, useEffect } from 'react';
import { Message as MessageType, Role } from '../types';
import Message from './Message';
import MessageInput from './MessageInput';
import { geminiService } from '../services/geminiService';

interface ChatWindowProps {
  onSendMessage: (message: string) => Promise<string>;
  onStreamingMessage?: (message: string) => Promise<AsyncGenerator<string, void, unknown>>;
  onResetMessages?: () => void;
  resetTrigger?: number; // 리셋 트리거 (키 값)
  isLoading?: boolean;
  placeholder?: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  onSendMessage, 
  onStreamingMessage,
  onResetMessages,
  resetTrigger,
  isLoading = false, 
  placeholder 
}) => {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 외부에서 메시지 초기화 요청 시 처리
  useEffect(() => {
    if (onResetMessages) {
      setMessages([]);
      setIsProcessing(false);
    }
  }, [onResetMessages]);

  // resetTrigger가 변경되면 메시지 초기화
  useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      setMessages([]);
      setIsProcessing(false);
      setIsCancelling(false);
    }
  }, [resetTrigger]);

  // 답변 중지 함수
  const handleCancelResponse = () => {
    setIsCancelling(true);
    geminiService.cancelCurrentRequest();
    
    // 불완전한 메시지 제거
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      
      // 마지막 메시지가 MODEL이고 비어있거나 매우 짧으면 제거
      if (lastMessage && 
          lastMessage.role === Role.MODEL && 
          (lastMessage.content === '' || lastMessage.content.length < 10)) {
        newMessages.pop();
        console.log('불완전한 메시지를 제거했습니다.');
      }
      
      return newMessages;
    });
    
    setIsProcessing(false);
    setIsCancelling(false);
  };

  // ESC 키로 답변 중지
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isProcessing) {
        handleCancelResponse();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing]);

  const handleSendMessage = async (content: string) => {
    if (isProcessing) return;

    // 고유한 요청 ID 생성
    const requestId = Date.now().toString();
    
    const userMessage: MessageType = {
      id: requestId,
      role: Role.USER,
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);

    try {
      // 스트리밍 응답이 지원되는 경우 스트리밍 사용
      if (onStreamingMessage) {
        const modelMessage: MessageType = {
          id: `${requestId}-model`,
          role: Role.MODEL,
          content: '',
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, modelMessage]);

        const stream = await onStreamingMessage(content);
        let fullResponse = '';

        for await (const chunk of stream) {
          // 중지 요청이 있으면 루프 종료
          if (isCancelling) {
            console.log('사용자에 의해 스트리밍이 중단되었습니다.');
            break;
          }
          
          fullResponse += chunk;
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            // 요청 ID가 일치하는 메시지만 업데이트
            if (lastMessage.role === Role.MODEL && lastMessage.id === `${requestId}-model`) {
              lastMessage.content = fullResponse;
            }
            return newMessages;
          });
        }
      } else {
        // 일반 응답
        const response = await onSendMessage(content);
        
        const modelMessage: MessageType = {
          id: `${requestId}-model`,
          role: Role.MODEL,
          content: response,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, modelMessage]);
      }
    } catch (error) {
      // AbortError는 정상적인 취소로 처리
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('사용자에 의해 요청이 취소되었습니다.');
        // 중지된 경우 메시지 추가하지 않음
      } else {
        const errorMessage: MessageType = {
          id: `${requestId}-error`,
          role: Role.MODEL,
          content: `오류가 발생했습니다: ${(error as Error).message}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsProcessing(false);
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-brand-bg">
      <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3 md:space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-brand-text-secondary py-6 md:py-8 px-4">
            <p className="text-sm md:text-base">안녕하세요! 궁금한 사업 문의사항을 물어보세요.</p>
            <p className="text-xs md:text-sm mt-2">실제 PDF 문서를 기반으로 답변해드립니다.</p>
          </div>
        )}
        
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        
        {isProcessing && (
          <div className="flex gap-2 md:gap-3 mb-4">
            <div className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full bg-brand-secondary flex items-center justify-center">
              <div className="w-3 h-3 md:w-5 md:h-5 border-2 border-brand-text-secondary border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="flex-1">
              <div className="bg-brand-surface border border-brand-secondary rounded-lg p-2 md:p-3">
                <div className="flex justify-between items-center">
                  <p className="text-brand-text-secondary text-sm md:text-base">
                    답변을 생성하고 있습니다...
                  </p>
                  <button
                    onClick={handleCancelResponse}
                    className="px-3 py-1 bg-brand-secondary text-brand-text-primary rounded text-xs hover:bg-opacity-80 transition-colors"
                    title="ESC 키로도 중지할 수 있습니다"
                  >
                    중지 (ESC)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <MessageInput
        onSendMessage={handleSendMessage}
        onCancelMessage={handleCancelResponse}
        disabled={isProcessing || isLoading}
        isProcessing={isProcessing}
        placeholder={placeholder}
      />
    </div>
  );
};

export default ChatWindow;