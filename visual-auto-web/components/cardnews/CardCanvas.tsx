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

function InfoCardView({
  card,
  tokens,
  logo,
  pageIndex,
  pageCount,
}: {
  card: InfoCard;
  tokens: CardFrameTokens;
  logo: string;
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
    return (
      <div style={{ ...base, backgroundColor: tokens.bg ?? '#FFFFFF' }}>
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
            color: tokens.ink,
            whiteSpace: 'pre-wrap',
          }}
        >
          {card.title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: tokens.ink, opacity: 0.55 }}>넘겨보기 →</div>
          <Dots index={pageIndex} count={pageCount} color={tokens.ink} />
        </div>
      </div>
    );
  }

  if (card.kind === 'cta') {
    return (
      <div style={{ ...base, backgroundColor: tokens.ctaBg ?? '#1C1C1E' }}>
        <Logo text={logo} color={tokens.point} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.3,
              color: tokens.ctaInk ?? '#FFFFFF',
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
          <Dots index={pageIndex} count={pageCount} color={tokens.ctaInk ?? '#FFFFFF'} />
        </div>
      </div>
    );
  }

  // point 카드
  return (
    <div style={{ ...base, backgroundColor: tokens.surface ?? tokens.bg ?? '#F7F4F0' }}>
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
            color: tokens.ink,
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
              color: tokens.ink,
              opacity: 0.72,
              whiteSpace: 'pre-wrap',
            }}
          >
            {card.body}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Dots index={pageIndex} count={pageCount} color={tokens.ink} />
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
    <InfoCardView card={card as InfoCard} tokens={tokens} logo={logo} pageIndex={pageIndex} pageCount={pageCount} />
  );
}
