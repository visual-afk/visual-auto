import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 라이트 모드 팔레트 — 따뜻한 화이트 배경 + 코너플라워 블루 액센트
        canvas: '#f7f6f4', // 앱 배경 (따뜻한 오프화이트)
        surface: '#ffffff', // 카드
        ink: {
          DEFAULT: '#1d1d22', // 본문 텍스트
          soft: '#5b5b63', // 보조 텍스트
          faint: '#9a9aa2', // 플레이스홀더
        },
        line: '#e8e6e1', // 보더
        brand: {
          DEFAULT: '#5b7fd4', // 코너플라워 블루 (주요 버튼)
          soft: '#8aa9e6',
          ink: '#ffffff', // 버튼 위 텍스트
          wash: '#eef2fb', // 연한 블루 배경
        },
        ok: '#3f9d6a', // 성공(복사완료 등)
        warn: '#c98a2b', // 입력대기 등
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,20,30,0.04), 0 8px 24px rgba(20,20,30,0.05)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        phone: '30rem', // 모바일 퍼스트 컨테이너 (데스크톱은 중앙정렬)
      },
    },
  },
  plugins: [],
};

export default config;
