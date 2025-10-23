import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message as MessageType } from '../types';
import UserIcon from './icons/UserIcon';
import BotIcon from './icons/BotIcon';
import CopyIcon from './icons/CopyIcon';

interface MessageProps {
  message: MessageType;
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const Icon = isUser ? UserIcon : BotIcon;
  const [isCopied, setIsCopied] = useState(false);

  // 디버깅을 위한 로그
  if (!isUser) {
    console.log('AI Message content:', message.content);
    console.log('Contains table markdown:', message.content.includes('|'));
    console.log('Contains table headers:', message.content.includes('---'));
  }

  // 클립보드 복사 함수
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // 2초 후 복사 상태 초기화
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
      // 폴백: 텍스트 영역을 사용한 복사
      const textArea = document.createElement('textarea');
      textArea.value = message.content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className={`flex gap-2 md:gap-3 mb-3 md:mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-brand-primary' : 'bg-brand-secondary'
      }`}>
        <Icon className="w-3 h-3 md:w-5 md:h-5 text-white" />
      </div>
      <div className={`flex-1 max-w-[85%] md:max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div className={`message-container relative inline-block p-2 md:p-3 rounded-lg text-sm md:text-base ${
          isUser 
            ? 'bg-brand-primary text-white' 
            : 'bg-brand-surface text-brand-text-primary border border-brand-secondary'
        }`}>
          {/* 복사 버튼 (AI 메시지에만 표시) */}
          {!isUser && (
            <button
              onClick={handleCopyToClipboard}
              className={`copy-button absolute top-2 right-2 p-1.5 rounded-md transition-all duration-200 ${
                isCopied 
                  ? 'bg-green-600 text-white' 
                  : 'bg-brand-secondary text-brand-text-secondary hover:bg-brand-primary hover:text-white'
              }`}
              title={isCopied ? '복사됨!' : '클립보드에 복사'}
            >
              {isCopied ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <CopyIcon className="w-4 h-4" />
              )}
            </button>
          )}
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="prose prose-invert max-w-none [&_table]:border-collapse [&_table]:w-full [&_table]:my-4 [&_table]:border [&_table]:border-brand-secondary">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children, ...props }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full border-collapse border border-brand-secondary" {...props}>
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children, ...props }) => (
                    <thead className="bg-brand-secondary" {...props}>
                      {children}
                    </thead>
                  ),
                  tbody: ({ children, ...props }) => (
                    <tbody className="bg-brand-surface" {...props}>
                      {children}
                    </tbody>
                  ),
                  tr: ({ children, ...props }) => (
                    <tr className="border-b border-brand-secondary" {...props}>
                      {children}
                    </tr>
                  ),
                  th: ({ children, ...props }) => (
                    <th className="px-4 py-2 text-left text-brand-text-primary font-semibold border-r border-brand-secondary" {...props}>
                      {children}
                    </th>
                  ),
                  td: ({ children, ...props }) => (
                    <td className="px-4 py-2 text-brand-text-primary border-r border-brand-secondary" {...props}>
                      {children}
                    </td>
                  ),
                  p: ({ children, ...props }) => (
                    <p className="mb-2 last:mb-0" {...props}>
                      {children}
                    </p>
                  ),
                  ul: ({ children, ...props }) => (
                    <ul className="list-disc list-inside mb-2 space-y-1" {...props}>
                      {children}
                    </ul>
                  ),
                  ol: ({ children, ...props }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>
                      {children}
                    </ol>
                  ),
                  li: ({ children, ...props }) => (
                    <li className="text-brand-text-primary" {...props}>
                      {children}
                    </li>
                  ),
                  strong: ({ children, ...props }) => (
                    <strong className="font-semibold text-brand-primary" {...props}>
                      {children}
                    </strong>
                  ),
                  code: ({ children, ...props }) => (
                    <code className="bg-brand-bg px-1 py-0.5 rounded text-sm font-mono text-brand-primary" {...props}>
                      {children}
                    </code>
                  ),
                  pre: ({ children, ...props }) => (
                    <pre className="bg-brand-bg p-3 rounded-lg overflow-x-auto text-sm" {...props}>
                      {children}
                    </pre>
                  ),
                  h1: ({ children, ...props }) => (
                    <h1 className="text-2xl font-bold text-brand-primary mb-4 mt-6 first:mt-0" {...props}>
                      {children}
                    </h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2 className="text-xl font-semibold text-brand-primary mb-3 mt-5 first:mt-0" {...props}>
                      {children}
                    </h2>
                  ),
                  h3: ({ children, ...props }) => (
                    <h3 className="text-lg font-medium text-brand-primary mb-2 mt-4 first:mt-0" {...props}>
                      {children}
                    </h3>
                  ),
                  blockquote: ({ children, ...props }) => (
                    <blockquote className="border-l-4 border-brand-primary pl-4 py-2 my-4 bg-brand-bg/50 italic" {...props}>
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <div className={`text-xs text-brand-text-secondary mt-1 ${
          isUser ? 'text-right' : 'text-left'
        }`}>
          {message.timestamp.toLocaleTimeString()}
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-brand-text-secondary mb-1">참조 소스:</p>
            <div className="flex flex-wrap gap-1">
              {message.sources.map((source, index) => (
                <span
                  key={index}
                  className="text-xs bg-brand-secondary text-brand-text-secondary px-2 py-1 rounded"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;