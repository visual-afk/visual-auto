import type { CSSProperties } from 'react';
import type { CardNewsMode, InfoCard, ImageCard } from '@/lib/cardnews/cards';
import type { CardFrameTokens } from '@/lib/cardnews/frames';

/**
 * 카드 1장 (1080×1350, 4:5) — 서버 PNG 렌더(satori)와 브라우저 미리보기가 공유하는 단일 소스.
 *
 * ⚠️ satori 제약을 지킬 것: 인라인 스타일만, flexbox만(grid 금지),
 * 자식이 있는 div는 전부 display:flex, Tailwind 클래스 금지.
 * 미리보기는 부모에서 transform: scale() 로 줄여 쓴다.
 */

export const CARD_W = 1080;
export const CARD_H = 1350;

const FONT = 'Pretendard';

/** #RRGGBB → 상대 휘도(0~1). 파싱 실패 시 null. */
function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * 배경과 대비가 낮으면 검정/흰색으로 자동 보정한 글자색.
 * 브랜드 프레임이 이미지형(ink=흰색)인데 정보형 카드(밝은 배경)로 쓰이면
 * 흰 글자가 흰 배경에 묻히는 걸 막는다.
 */
function readable(bg: string | undefined, ink: string | undefined): string {
  const lb = bg ? luminance(bg) : null;
  const li = ink ? luminance(ink) : null;
  if (lb === null) return ink || '#1C1C1E';
  if (li !== null) {
    const contrast = (Math.max(lb, li) + 0.05) / (Math.min(lb, li) + 0.05);
    if (contrast >= 3) return ink!; // 충분히 대비됨 → 원래 색 유지
  }
  return lb > 0.5 ? '#1C1C1E' : '#FFFFFF'; // 밝은 배경엔 검정, 어두운 배경엔 흰색
}

function Dots({ index, count, color }: { index: number; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            width: i === index ? 44 : 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: color,
            opacity: i === index ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}

function Logo({ text, color }: { text: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: FONT,
        fontSize: 34,
        fontWeight: 800,
        letterSpacing: 8,
        color,
      }}
    >
      {text}
    </div>
  );
}

/**
 * 사진 표지 (tokens.coverStyle === 'photo') — 밈뉴스 커버 문법.
 * 실사 배경(없으면 "사진 자리" placeholder) + 말풍선 + 하단 흰 헤드라인(검정 그림자).
 * satori 제약: 인라인 스타일 · flex만 · pseudo 요소 금지(말풍선 꼬리는 rotate 한 div).
 */
function PhotoCoverView({
  card,
  tokens,
  logo,
  photoSrc,
  pageIndex,
  pageCount,
}: {
  card: InfoCard;
  tokens: CardFrameTokens;
  logo: string;
  photoSrc?: string | null;
  pageIndex: number;
  pageCount: number;
}) {
  const point = tokens.point || '#B8865B';
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        backgroundColor: '#2A2A2E',
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      {photoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoSrc}
          alt=""
          width={CARD_W}
          height={CARD_H}
          style={{ position: 'absolute', top: 0, left: 0, width: CARD_W, height: CARD_H, objectFit: 'cover' }}
        />
      ) : (
        // 사진 자리 — 예진매니저가 스튜디오에서 교체한다
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width: CARD_W,
            height: CARD_H,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 120,
            background: 'linear-gradient(160deg, #3A3A40 0%, #232327 100%)',
          }}
        >
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: 6, color: point }}>사진 자리</div>
          <div
            style={{
              display: 'flex',
              marginTop: 24,
              fontSize: 38,
              fontWeight: 600,
              lineHeight: 1.45,
              color: '#FFFFFF',
              opacity: 0.62,
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
            }}
          >
            {card.photo_hint || '표지 사진을 넣어주세요'}
          </div>
        </div>
      )}

      {/* 하단 헤드라인 가독용 스크림 */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: CARD_W,
          height: 680,
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      {/* 말풍선 — 컷아웃의 1인칭 대사 */}
      {card.bubble ? (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 150,
            right: 72,
            flexDirection: 'column',
            alignItems: 'flex-end',
            maxWidth: 640,
          }}
        >
          <div
            style={{
              display: 'flex',
              padding: '26px 40px',
              borderRadius: 40,
              backgroundColor: '#FFFFFF',
              fontSize: 42,
              fontWeight: 800,
              lineHeight: 1.3,
              color: '#1C1C1E',
              whiteSpace: 'pre-wrap',
            }}
          >
            {card.bubble}
          </div>
          {/* 꼬리 (pseudo 대신 회전 사각형) */}
          <div
            style={{
              display: 'flex',
              width: 40,
              height: 40,
              marginTop: -18,
              marginRight: 64,
              backgroundColor: '#FFFFFF',
              transform: 'rotate(45deg)',
            }}
          />
        </div>
      ) : null}

      {/* 하단: 로고 배지 + 헤드라인 */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 96,
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            marginBottom: 28,
            padding: '14px 32px',
            borderRadius: 14,
            backgroundColor: point,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: 6,
            color: '#FFFFFF',
          }}
        >
          {logo}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1.26,
            color: '#FFFFFF',
            // 밝은 사진 위에서도 흰 글씨가 살도록 3겹 (satori textShadow 지원 확인됨)
            textShadow: '0 0 4px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.85), 0 8px 32px rgba(0,0,0,0.55)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {card.title}
        </div>
        <div style={{ display: 'flex', marginTop: 36 }}>
          <Dots index={pageIndex} count={pageCount} color="#FFFFFF" />
        </div>
      </div>
    </div>
  );
}

function InfoCardView({
  card,
  tokens,
  logo,
  photoSrc,
  pageIndex,
  pageCount,
}: {
  card: InfoCard;
  tokens: CardFrameTokens;
  logo: string;
  photoSrc?: string | null;
  pageIndex: number;
  pageCount: number;
}) {
  const base: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: CARD_W,
    height: CARD_H,
    padding: 96,
    fontFamily: FONT,
  };

  if (card.kind === 'cover') {
    if (tokens.coverStyle === 'photo') {
      return (
        <PhotoCoverView
          card={card}
          tokens={tokens}
          logo={logo}
          photoSrc={photoSrc}
          pageIndex={pageIndex}
          pageCount={pageCount}
        />
      );
    }
    const bg = tokens.bg ?? '#FFFFFF';
    const ink = readable(bg, tokens.ink);
    return (
      <div style={{ ...base, backgroundColor: bg }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: 96, height: 10, borderRadius: 5, backgroundColor: tokens.point, marginBottom: 32 }} />
          <Logo text={logo} color={tokens.point} />
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 100,
            fontWeight: 800,
            lineHeight: 1.28,
            color: ink,
            whiteSpace: 'pre-wrap',
          }}
        >
          {card.title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: ink, opacity: 0.55 }}>넘겨보기 →</div>
          <Dots index={pageIndex} count={pageCount} color={ink} />
        </div>
      </div>
    );
  }

  if (card.kind === 'cta') {
    const bg = tokens.ctaBg ?? '#1C1C1E';
    const ink = readable(bg, tokens.ctaInk ?? '#FFFFFF');
    return (
      <div style={{ ...base, backgroundColor: bg }}>
        <Logo text={logo} color={tokens.point} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.3,
              color: ink,
              whiteSpace: 'pre-wrap',
            }}
          >
            {card.title}
          </div>
          {card.body ? (
            <div
              style={{
                display: 'flex',
                marginTop: 56,
                padding: '20px 44px',
                borderRadius: 999,
                backgroundColor: tokens.point,
                fontSize: 36,
                fontWeight: 800,
                color: tokens.ctaBg ?? '#1C1C1E',
              }}
            >
              {card.body}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Dots index={pageIndex} count={pageCount} color={ink} />
        </div>
      </div>
    );
  }

  // point 카드
  const bg = tokens.surface ?? tokens.bg ?? '#F7F4F0';
  const ink = readable(bg, tokens.ink);
  return (
    <div style={{ ...base, backgroundColor: bg }}>
      <div
        style={{
          display: 'flex',
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: 4,
          color: tokens.point,
        }}
      >
        {String(card.idx).padStart(2, '0')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.3,
            color: ink,
            whiteSpace: 'pre-wrap',
          }}
        >
          {card.title}
        </div>
        {card.body ? (
          <div
            style={{
              display: 'flex',
              marginTop: 40,
              fontSize: 44,
              fontWeight: 600,
              lineHeight: 1.5,
              color: ink,
              opacity: 0.72,
              whiteSpace: 'pre-wrap',
            }}
          >
            {card.body}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Dots index={pageIndex} count={pageCount} color={ink} />
      </div>
    </div>
  );
}

function ImageCardView({
  card,
  tokens,
  logo,
  photoSrc,
  pageIndex,
  pageCount,
}: {
  card: ImageCard;
  tokens: CardFrameTokens;
  logo: string;
  photoSrc?: string | null;
  pageIndex: number;
  pageCount: number;
}) {
  const ink = tokens.ink || '#FFFFFF';
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        backgroundColor: '#111111',
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      {photoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoSrc}
          alt=""
          width={CARD_W}
          height={CARD_H}
          style={{ position: 'absolute', top: 0, left: 0, width: CARD_W, height: CARD_H, objectFit: 'cover' }}
        />
      ) : null}
      {/* 상단 로고 가독용 옅은 그라데이션 */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: CARD_W,
          height: 240,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 100%)',
        }}
      />
      {/* 하단 문구용 그라데이션 */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: CARD_W,
          height: 620,
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%)',
        }}
      />
      <div style={{ display: 'flex', position: 'absolute', top: 72, left: 72 }}>
        <Logo text={logo} color={tokens.point} />
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 84,
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        {card.idx === 0 ? (
          <div style={{ display: 'flex', width: 96, height: 10, borderRadius: 5, backgroundColor: tokens.point, marginBottom: 32 }} />
        ) : null}
        {card.is_cta ? (
          <div
            style={{
              display: 'flex',
              marginBottom: 28,
              padding: '18px 40px',
              borderRadius: 999,
              backgroundColor: tokens.point,
              fontSize: 36,
              fontWeight: 800,
              color: '#111111',
            }}
          >
            예약 · 프로필 링크
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.3,
            color: ink,
            whiteSpace: 'pre-wrap',
          }}
        >
          {card.phrase}
        </div>
        <div style={{ display: 'flex', marginTop: 36 }}>
          <Dots index={pageIndex} count={pageCount} color={ink} />
        </div>
      </div>
    </div>
  );
}

export default function CardCanvas({
  mode,
  card,
  tokens,
  branchName,
  photoSrc,
  pageIndex,
  pageCount,
}: {
  mode: CardNewsMode;
  card: InfoCard | ImageCard;
  tokens: CardFrameTokens;
  branchName: string; // logoText 비었을 때 폴백
  photoSrc?: string | null;
  pageIndex: number;
  pageCount: number;
}) {
  const logo = tokens.logoText || branchName;
  if (mode === 'image') {
    return (
      <ImageCardView
        card={card as ImageCard}
        tokens={tokens}
        logo={logo}
        photoSrc={photoSrc}
        pageIndex={pageIndex}
        pageCount={pageCount}
      />
    );
  }
  return (
    <InfoCardView
      card={card as InfoCard}
      tokens={tokens}
      logo={logo}
      photoSrc={photoSrc}
      pageIndex={pageIndex}
      pageCount={pageCount}
    />
  );
}
