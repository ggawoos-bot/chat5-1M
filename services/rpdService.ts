// RPD (Requests Per Day) 관리 서비스 - 보안 강화 버전
export interface ApiKeyRpdInfo {
  keyId: string;
  keyName: string;
  maskedKey: string; // 마스킹된 키 (보안)
  usedToday: number;
  maxPerDay: number;
  lastResetDate: string;
  isActive: boolean;
}

export interface RpdStats {
  totalUsed: number;
  totalMax: number;
  remaining: number;
  resetTime: string;
  apiKeys: ApiKeyRpdInfo[];
}

class RpdService {
  private readonly STORAGE_KEY = 'gemini_rpd_stats';
  private readonly MAX_RPD_PER_KEY = 250; // 각 키당 250회
  private readonly TOTAL_MAX_RPD = 750; // 250 * 3 = 750 (3개 키 합계)

  // API 키를 마스킹하는 함수 (보안)
  private maskApiKey(key: string): string {
    if (!key || key.length < 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  }

  // 오늘 날짜를 YYYY-MM-DD 형식으로 반환
  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  // 로컬 스토리지에서 RPD 데이터 로드
  private loadRpdData(): RpdStats {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // 날짜가 바뀌었으면 리셋
        if (data.resetTime !== this.getTodayString()) {
          return this.resetRpdData();
        }
        return data;
      }
    } catch (error) {
      console.error('RPD 데이터 로드 실패:', error);
    }
    return this.resetRpdData();
  }

  // RPD 데이터 리셋 (새로운 날)
  private resetRpdData(): RpdStats {
    const today = this.getTodayString();
    const data: RpdStats = {
      totalUsed: 0,
      totalMax: this.TOTAL_MAX_RPD,
      remaining: this.TOTAL_MAX_RPD,
      resetTime: today,
      apiKeys: [
        {
          keyId: 'key1',
          keyName: 'API Key #1',
          maskedKey: 'AIza****O0',
          usedToday: 0,
          maxPerDay: this.MAX_RPD_PER_KEY,
          lastResetDate: today,
          isActive: true
        },
        {
          keyId: 'key2',
          keyName: 'API Key #2',
          maskedKey: 'AIza****U4',
          usedToday: 0,
          maxPerDay: this.MAX_RPD_PER_KEY,
          lastResetDate: today,
          isActive: true
        },
        {
          keyId: 'key3',
          keyName: 'API Key #3',
          maskedKey: 'AIza****3I',
          usedToday: 0,
          maxPerDay: this.MAX_RPD_PER_KEY,
          lastResetDate: today,
          isActive: true
        }
      ]
    };
    this.saveRpdData(data);
    console.log('RPD 데이터 리셋 완료:', data);
    return data;
  }

  // RPD 데이터 저장
  private saveRpdData(data: RpdStats): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('RPD 데이터 저장 실패:', error);
    }
  }

  // API 키 사용 기록
  recordApiCall(keyId: string): boolean {
    try {
      // keyId 유효성 검증
      if (!keyId || typeof keyId !== 'string') {
        console.warn(`유효하지 않은 키 ID: ${keyId}`);
        return false;
      }

      const data = this.loadRpdData();
      
      // 데이터 유효성 검증
      if (!data || !Array.isArray(data.apiKeys)) {
        console.warn('RPD 데이터가 유효하지 않습니다.');
        return false;
      }

      const keyInfo = data.apiKeys.find(key => key && key.keyId === keyId);
      
      if (!keyInfo) {
        console.warn(`API 키 ${keyId}를 찾을 수 없습니다.`);
        return false;
      }

      if (!keyInfo.isActive) {
        console.warn(`API 키 ${keyId}가 비활성화되었습니다.`);
        return false;
      }

      if (keyInfo.usedToday >= keyInfo.maxPerDay) {
        console.warn(`API 키 ${keyId}의 일일 한도를 초과했습니다. (${keyInfo.usedToday}/${keyInfo.maxPerDay})`);
        return false;
      }

      // 사용 횟수 증가
      keyInfo.usedToday++;
      data.totalUsed++;
      data.remaining = data.totalMax - data.totalUsed;

      this.saveRpdData(data);
      console.log(`API 키 ${keyId} 사용 기록: ${keyInfo.usedToday}/${keyInfo.maxPerDay}`);
      return true;
    } catch (error) {
      console.error('RPD 기록 중 오류 발생:', error);
      return false;
    }
  }

  // RPD 통계 조회
  getRpdStats(): RpdStats {
    return this.loadRpdData();
  }

  // 특정 키 비활성화/활성화
  toggleKeyStatus(keyId: string): boolean {
    const data = this.loadRpdData();
    const keyInfo = data.apiKeys.find(key => key.keyId === keyId);
    
    if (keyInfo) {
      keyInfo.isActive = !keyInfo.isActive;
      this.saveRpdData(data);
      return true;
    }
    return false;
  }

  // 다음 사용 가능한 키 조회
  getNextAvailableKey(): string | null {
    try {
      const data = this.loadRpdData();
      
      // 데이터 유효성 검증
      if (!data || !Array.isArray(data.apiKeys) || data.apiKeys.length === 0) {
        console.warn('RPD 데이터가 유효하지 않습니다. 기본 키를 사용합니다.');
        return 'key1';
      }
      
      const availableKey = data.apiKeys.find(key => 
        key && key.isActive && key.usedToday < key.maxPerDay
      );
      
      if (!availableKey) {
        console.warn('사용 가능한 RPD 키가 없습니다. 기본 키를 사용합니다.');
        return 'key1';
      }
      
      return availableKey.keyId;
    } catch (error) {
      console.error('RPD 키 조회 중 오류 발생:', error);
      return 'key1'; // 오류 발생 시 기본 키 반환
    }
  }

  // 리셋까지 남은 시간 계산
  getTimeUntilReset(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const diff = tomorrow.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}시간 ${minutes}분`;
  }

  // 사용량 백분율 계산
  getUsagePercentage(used: number, max: number): number {
    return Math.min(100, (used / max) * 100);
  }

  // 사용량 상태 색상 반환
  getUsageStatusColor(percentage: number): string {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  // 사용량 상태 텍스트 반환
  getUsageStatusText(percentage: number): string {
    if (percentage >= 90) return '위험';
    if (percentage >= 70) return '주의';
    return '정상';
  }

  // RPD 데이터 강제 리셋 (디버깅용)
  forceResetRpdData(): void {
    console.log('RPD 데이터 강제 리셋 중...');
    localStorage.removeItem(this.STORAGE_KEY);
    this.resetRpdData();
  }
}

export const rpdService = new RpdService();
