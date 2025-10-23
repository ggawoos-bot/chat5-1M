import React, { useState, useRef, useEffect } from 'react';

interface PdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  initialPage?: number;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ 
  isOpen, 
  onClose, 
  documentName, 
  initialPage = 1 
}) => {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // PDF 로드
  useEffect(() => {
    if (isOpen && documentName) {
      loadPdf(documentName);
    }
  }, [isOpen, documentName]);

  // 페이지 변경 시 렌더링
  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPage(pdfDoc, currentPage);
    }
  }, [pdfDoc, currentPage]);

  const loadPdf = async (filename: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // PDF.js가 로드되었는지 확인
      if (!window.pdfjsLib) {
        throw new Error('PDF.js가 로드되지 않았습니다.');
      }

      const pdf = await window.pdfjsLib.getDocument(`/pdf/${filename}`).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(initialPage);
      
      console.log(`PDF 로드 완료: ${filename}, 총 ${pdf.numPages}페이지`);
    } catch (error) {
      console.error('PDF 로드 실패:', error);
      setError(error instanceof Error ? error.message : 'PDF 로드에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderPage = async (pdf: any, pageNum: number) => {
    try {
      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;
      
      // 뷰포트 설정 (스케일 조정)
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // 페이지 렌더링
      await page.render({ 
        canvasContext: context, 
        viewport: viewport 
      }).promise;
      
      console.log(`페이지 ${pageNum} 렌더링 완료`);
    } catch (error) {
      console.error('페이지 렌더링 실패:', error);
      setError('페이지 렌더링에 실패했습니다.');
    }
  };

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    }
  };

  const goToPreviousPage = () => {
    goToPage(currentPage - 1);
  };

  const goToNextPage = () => {
    goToPage(currentPage + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowLeft') {
      goToPreviousPage();
    } else if (e.key === 'ArrowRight') {
      goToNextPage();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="bg-brand-surface rounded-lg w-full max-w-6xl h-full max-h-[95vh] flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex justify-between items-center p-4 border-b border-brand-secondary">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-brand-text-primary">
              {documentName.replace('.pdf', '')}
            </h3>
            {totalPages > 0 && (
              <span className="text-sm text-brand-text-secondary">
                ({currentPage} / {totalPages})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-brand-secondary rounded-lg transition-colors"
            title="닫기 (ESC)"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* PDF 캔버스 영역 */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-brand-text-primary">PDF 로딩 중...</p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-red-400">
                <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-lg font-medium mb-2">PDF 로드 실패</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}
          
          {!isLoading && !error && (
            <div className="flex justify-center">
              <canvas 
                ref={canvasRef} 
                className="shadow-lg rounded-lg bg-white"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
          )}
        </div>

        {/* 페이지 네비게이션 */}
        {!isLoading && !error && totalPages > 0 && (
          <div className="flex justify-between items-center p-4 border-t border-brand-secondary bg-brand-surface">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage <= 1}
              className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              이전
            </button>
            
            <div className="flex items-center gap-4">
              <span className="text-brand-text-primary font-medium">
                페이지 {currentPage} / {totalPages}
              </span>
              
              {/* 페이지 입력 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-brand-text-secondary">이동:</label>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= totalPages) {
                      setCurrentPage(page);
                    }
                  }}
                  className="w-16 px-2 py-1 bg-brand-bg border border-brand-secondary rounded text-brand-text-primary text-center"
                />
              </div>
            </div>
            
            <button
              onClick={goToNextPage}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
            >
              다음
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* 키보드 단축키 안내 */}
        <div className="px-4 pb-2">
          <p className="text-xs text-brand-text-secondary text-center">
            키보드 단축키: ← → (페이지 이동), ESC (닫기)
          </p>
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;
