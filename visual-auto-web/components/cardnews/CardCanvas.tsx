import type { CSSProperties, ReactNode } from 'react';
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

// ── 레퍼런스 학습 토큰 반영 헬퍼 (없으면 현행 값으로 폴백) ──
const TITLE_SCALE: Record<string, number> = { small: 0.85, medium: 1, large: 1.14, xlarge: 1.28 };

/** 배경: bgAngle+surface 가 있으면 gradient, 아니면 단색. */
function bgOf(tokens: CardFrameTokens, solid: string): CSSProperties {
  if (tokens.bgAngle != null && tokens.surface) {
    return { background: `linear-gradient(${tokens.bgAngle}deg, ${solid}, ${tokens.surface})` };
  }
  return { backgroundColor: solid };
}

/** 타이틀: titleSize/Weight/Shadow 반영. */
function titleStyle(tokens: CardFrameTokens, baseSize: number, color: string): CSSProperties {
  const scale = tokens.titleSize ? TITLE_SCALE[tokens.titleSize] ?? 1 : 1;
  const s: CSSProperties = {
    display: 'flex',
    fontSize: Math.round(baseSize * scale),
    fontWeight: tokens.titleWeight ?? 800,
    lineHeight: 1.28,
    color,
    whiteSpace: 'pre-wrap',
  };
  if (tokens.titleShadow) s.textShadow = '0 6px 30px rgba(0,0,0,0.35)';
  return s;
}

const DECO_SIZE: Record<string, number> = { small: 180, medium: 340, large: 560 };

/** 학습된 장식(decorations) — satori 안전 화이트리스트. 콘텐츠 뒤에 절대배치. */
function Decorations({ items }: { items?: CardFrameTokens['decorations'] }) {
  if (!items || items.length === 0) return null;
  return (
    <>
      {items.slice(0, 3).map((d, i) => {
        const size = DECO_SIZE[d.size ?? 'medium'] ?? 340;
        const color = d.color || 'rgba(255,255,255,0.12)';
        const opacity = typeof d.opacity === 'number' ? d.opacity : 0.16;
        const off = -Math.round(size * 0.28);
        const pos: CSSProperties =
          d.position === 'top-left'
            ? { top: off, left: off }
            : d.position === 'top-right'
              ? { top: off, right: off }
              : d.position === 'bottom-left'
                ? { bottom: off, left: off }
                : d.position === 'bottom-right'
                  ? { bottom: off, right: off }
                  : { top: Math.round(CARD_H / 2 - size / 2), left: Math.round(CARD_W / 2 - size / 2) };
        const common: CSSProperties = { display: 'flex', position: 'absolute', width: size, height: size, opacity, ...pos };
        if (d.type === 'circle_outline') {
          return <div key={i} style={{ ...common, borderRadius: size / 2, border: `6px solid ${color}` }} />;
        }
        if (d.type === 'glow') {
          return <div key={i} style={{ ...common, borderRadius: size / 2, background: `radial-gradient(circle, ${color} 0%, rgba(0,0,0,0) 70%)` }} />;
        }
        if (d.type === 'line') {
          return <div key={i} style={{ ...common, height: 10, borderRadius: 5, backgroundColor: color }} />;
        }
        // circle_filled · dots · corner_accent · 기타 → 소프트 원으로 근사
        return <div key={i} style={{ ...common, borderRadius: size / 2, backgroundColor: color }} />;
      })}
    </>
  );
}

/** 배경 + 장식 레이어 + 콘텐츠(절대배치, space-between)로 감싸는 카드 프레임. */
function Frame({ bg, decorations, children }: { bg: CSSProperties; decorations?: CardFrameTokens['decorations']; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', position: 'relative', width: CARD_W, height: CARD_H, overflow: 'hidden', fontFamily: FONT, ...bg }}>
      <Decorations items={decorations} />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          padding: 96,
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {children}
      </div>
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
  if (card.kind === 'cover') {
    return (
      <Frame bg={bgOf(tokens, tokens.bg ?? '#FFFFFF')} decorations={tokens.decorations}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: 96, height: 10, borderRadius: 5, backgroundColor: tokens.point, marginBottom: 32 }} />
          <Logo text={logo} color={tokens.point} />
        </div>
        <div style={titleStyle(tokens, 100, tokens.ink)}>{card.title}</div>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: tokens.ink, opacity: 0.55 }}>넘겨보기 →</div>
          <Dots index={pageIndex} count={pageCount} color={tokens.ink} />
        </div>
      </Frame>
    );
  }

  if (card.kind === 'cta') {
    const ctaBg = tokens.ctaBg ?? '#1C1C1E';
    return (
      <Frame bg={{ backgroundColor: ctaBg }} decorations={tokens.decorations}>
        <Logo text={logo} color={tokens.point} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={titleStyle(tokens, 88, tokens.ctaInk ?? '#FFFFFF')}>{card.title}</div>
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
                color: ctaBg,
              }}
            >
              {card.body}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Dots index={pageIndex} count={pageCount} color={tokens.ctaInk ?? '#FFFFFF'} />
        </div>
      </Frame>
    );
  }

  // point 카드 (장식은 표지·CTA에만 — 포인트는 가독성 우선)
  return (
    <Frame bg={{ backgroundColor: tokens.surface ?? tokens.bg ?? '#F7F4F0' }}>
      <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, letterSpacing: 4, color: tokens.point }}>
        {String(card.idx).padStart(2, '0')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={titleStyle(tokens, 76, tokens.ink)}>{card.title}</div>
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
    </Frame>
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
