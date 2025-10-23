/**
 * 인용 텍스트 파싱 유틸리티
 * AI 답변에서 인용된 문서와 페이지/조항을 추출하여 PDF 뷰어에서 열 수 있도록 변환
 */

export interface ParsedCitation {
  documentName: string;
  page?: number;
  article?: string;
  type: 'legal' | 'general';
}

/**
 * 인용 텍스트를 파싱하여 문서명과 페이지/조항 정보를 추출
 */
export const parseCitation = (citation: string): ParsedCitation => {
  // 법령 문서 파싱: "국민건강증진법 제1조", "질서위반행위규제법 제16조제1항"
  const legalMatch = citation.match(/(국민건강증진법|질서위반행위규제법)(?:\s+(시행령|시행규칙))?\s+(제\d+조[^,]*)/);
  if (legalMatch) {
    return {
      documentName: getDocumentFilename(legalMatch[1], legalMatch[2]),
      article: legalMatch[3],
      type: 'legal'
    };
  }

  // 일반 문서 파싱: "금연구역 지정 관리 업무지침, p.7", "금연지원서비스 매뉴얼, p.9"
  const generalMatch = citation.match(/(금연구역 지정 관리 업무지침|금연지원서비스 매뉴얼|유치원 어린이집 가이드라인|니코틴보조제 가이드라인|지역사회 통합건강증진사업 안내서)[^,]*,\s*p\.(\d+)/);
  if (generalMatch) {
    return {
      documentName: getDocumentFilename(generalMatch[1]),
      page: parseInt(generalMatch[2]),
      type: 'general'
    };
  }

  // 기본값 반환
  return { documentName: '', type: 'general' };
};

/**
 * 문서명을 실제 PDF 파일명으로 변환
 */
const getDocumentFilename = (docName: string, subType?: string): string => {
  const filenameMap: Record<string, string> = {
    '국민건강증진법': '국민건강증진법률 시행령 시행규칙(202508).pdf',
    '질서위반행위규제법': '질서위반행위규제법 및 시행령(20210101).pdf',
    '금연구역 지정 관리 업무지침': '금연구역 지정 관리 업무지침_2025개정판.pdf',
    '금연지원서비스 매뉴얼': '금연지원서비스 통합시스템 사용자매뉴얼_지역사회 통합건강증진사업 안내.pdf',
    '유치원 어린이집 가이드라인': '유치원, 어린이집 경계 10m 금연구역 관리 가이드라인.pdf',
    '니코틴보조제 가이드라인': '니코틴보조제 이용방법 가이드라인_230320.pdf',
    '지역사회 통합건강증진사업 안내서': '2025년 지역사회 통합건강증진사업 안내서(금연).pdf'
  };
  
  return filenameMap[docName] || '';
};

/**
 * 텍스트에서 모든 인용을 찾아서 파싱
 */
export const extractAllCitations = (text: string): ParsedCitation[] => {
  const citations: ParsedCitation[] = [];
  
  // 법령 문서 인용 패턴
  const legalPattern = /(국민건강증진법|질서위반행위규제법)(?:\s+(시행령|시행규칙))?\s+(제\d+조[^,]*)/g;
  let match;
  
  while ((match = legalPattern.exec(text)) !== null) {
    const citation = parseCitation(match[0]);
    if (citation.documentName) {
      citations.push(citation);
    }
  }
  
  // 일반 문서 인용 패턴
  const generalPattern = /(금연구역 지정 관리 업무지침|금연지원서비스 매뉴얼|유치원 어린이집 가이드라인|니코틴보조제 가이드라인|지역사회 통합건강증진사업 안내서)[^,]*,\s*p\.\d+/g;
  
  while ((match = generalPattern.exec(text)) !== null) {
    const citation = parseCitation(match[0]);
    if (citation.documentName) {
      citations.push(citation);
    }
  }
  
  return citations;
};

/**
 * 인용 텍스트를 클릭 가능한 링크로 변환
 */
export const convertCitationsToLinks = (text: string, onCitationClick: (citation: ParsedCitation) => void): string => {
  let result = text;
  
  // 법령 문서 인용을 링크로 변환
  result = result.replace(
    /(국민건강증진법|질서위반행위규제법)(?:\s+(시행령|시행규칙))?\s+(제\d+조[^,]*)/g,
    (match) => {
      const citation = parseCitation(match);
      return `<span class="citation-link text-brand-primary hover:text-brand-text-primary underline cursor-pointer" data-citation='${JSON.stringify(citation)}'>${match}</span>`;
    }
  );
  
  // 일반 문서 인용을 링크로 변환
  result = result.replace(
    /(금연구역 지정 관리 업무지침|금연지원서비스 매뉴얼|유치원 어린이집 가이드라인|니코틴보조제 가이드라인|지역사회 통합건강증진사업 안내서)[^,]*,\s*p\.\d+/g,
    (match) => {
      const citation = parseCitation(match);
      return `<span class="citation-link text-brand-primary hover:text-brand-text-primary underline cursor-pointer" data-citation='${JSON.stringify(citation)}'>${match}</span>`;
    }
  );
  
  return result;
};

/**
 * 인용 링크 클릭 이벤트 핸들러
 */
export const handleCitationClick = (event: Event, onCitationClick: (citation: ParsedCitation) => void) => {
  const target = event.target as HTMLElement;
  if (target.classList.contains('citation-link')) {
    const citationData = target.getAttribute('data-citation');
    if (citationData) {
      try {
        const citation: ParsedCitation = JSON.parse(citationData);
        onCitationClick(citation);
      } catch (error) {
        console.error('인용 데이터 파싱 실패:', error);
      }
    }
  }
};
