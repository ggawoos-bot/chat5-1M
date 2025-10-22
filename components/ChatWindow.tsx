import React, { useState, useRef, useEffect } from 'react';
import { Message as MessageType, Role } from '../types';
import Message from './Message';
import MessageInput from './MessageInput';

interface ChatWindowProps {
  onSendMessage: (message: string) => Promise<string>;
  onStreamingMessage?: (message: string) => Promise<AsyncGenerator<string, void, unknown>>;
  onResetMessages?: () => void;
  isLoading?: boolean;
  placeholder?: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  onSendMessage, 
  onStreamingMessage,
  onResetMessages,
  isLoading = false, 
  placeholder 
}) => {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
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

  const handleSendMessage = async (content: string) => {
    if (isProcessing) return;

    const userMessage: MessageType = {
      id: Date.now().toString(),
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
          id: (Date.now() + 1).toString(),
          role: Role.MODEL,
          content: '',
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, modelMessage]);

        const stream = await onStreamingMessage(content);
        let fullResponse = '';

        for await (const chunk of stream) {
          fullResponse += chunk;
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage.role === Role.MODEL) {
              lastMessage.content = fullResponse;
            }
            return newMessages;
          });
        }
      } else {
        // 일반 응답
        const response = await onSendMessage(content);
        
        const modelMessage: MessageType = {
          id: (Date.now() + 1).toString(),
          role: Role.MODEL,
          content: response,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, modelMessage]);
      }
    } catch (error) {
      const errorMessage: MessageType = {
        id: (Date.now() + 1).toString(),
        role: Role.MODEL,
        content: `오류가 발생했습니다: ${(error as Error).message}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
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
                <p className="text-brand-text-secondary text-sm md:text-base">답변을 생성하고 있습니다...</p>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <MessageInput
        onSendMessage={handleSendMessage}
        disabled={isProcessing || isLoading}
        placeholder={placeholder}
      />
    </div>
  );
};

export default ChatWindow;