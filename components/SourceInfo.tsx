import React from 'react';
import { SourceInfo as SourceInfoType } from '../types';

interface SourceInfoProps {
  sources: SourceInfoType[];
  onDocumentClick?: (source: SourceInfoType) => void;
}

const SourceInfo: React.FC<SourceInfoProps> = ({ sources, onDocumentClick }) => {
  if (!sources || sources.length === 0) return null;

  // PDF 파일명에서 확장자 제거하는 함수
  const removeFileExtension = (filename: string) => {
    return filename.replace(/\.pdf$/i, '');
  };

  return (
    <div className="mt-4 p-4 bg-brand-surface border border-brand-secondary rounded-lg">
      <h4 className="text-sm font-semibold text-brand-text-primary mb-2">참조 소스</h4>
      <div className="space-y-2">
        {sources.map((source) => (
          <div 
            key={source.id} 
            className={`text-sm ${onDocumentClick ? 'cursor-pointer hover:bg-brand-secondary/50 p-2 rounded transition-colors group' : ''}`}
            onClick={() => onDocumentClick?.(source)}
            title={onDocumentClick ? '클릭하여 PDF 보기' : ''}
          >
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-brand-secondary text-brand-text-secondary rounded text-xs">
                {source.type.toUpperCase()}
              </span>
              <span className="text-brand-text-primary font-medium flex-1">
                {removeFileExtension(source.title)}
              </span>
              {onDocumentClick && (
                <svg 
                  className="w-4 h-4 text-brand-primary ml-auto opacity-0 group-hover:opacity-100 transition-opacity" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* 설정 링크 */}
      <div className="mt-3 pt-3 border-t border-brand-secondary">
        <a 
          href="/chat5M/admin.html" 
          className="inline-flex items-center gap-2 text-brand-primary hover:text-brand-text-primary transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          설정
        </a>
      </div>
    </div>
  );
};

export default SourceInfo;
