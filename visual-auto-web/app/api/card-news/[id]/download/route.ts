import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { requireMember } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';
import { getFrameFor } from '@/lib/cardnews/frames';
import { photoDataUri, renderCardBuffer, type CardNewsCard } from '@/lib/cardnews/render';

export const runtime = 'nodejs';
export const maxDuration = 60; // 10장 satori 렌더 + 사진 다운로드 여유

/**
 * 카드 전체를 ZIP 하나로 내려준다.
 *
 * 낱장 PNG를 카드 수만큼 연속 다운로드하면 크롬이 "자동 다운로드 여러 개"로 보고
 * 두 번째부터 차단해서 표지만 저장되는 문제가 있었다. 응답을 1개로 만들어 원천 차단한다.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMember();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  // RLS로 접근 제어 (본사 전체 / 같은 지점)
  const supabase = await getServerSupabase();
  const { data: row } = await supabase
    .from('card_news')
    .select('id, branch_id, mode, cards, branches(name)')
    .eq('id', id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: '카드뉴스를 찾지 못했어요' }, { status: 404 });

  const cards = (row.cards ?? []) as CardNewsCard[];
  if (!cards.length) return NextResponse.json({ error: '카드가 없어요' }, { status: 404 });

  const branchName = (row.branches as unknown as { name: string } | null)?.name ?? '';
  const mode = row.mode as 'info' | 'image';
  const frame = await getFrameFor(row.branch_id);
  const photoCache = new Map<string, string | null>();
  const baseName = ['카드뉴스', branchName].filter(Boolean).join('-');

  // 메모리가 튀지 않게 순차 렌더. 같은 사진은 photoCache로 한 번만 받는다.
  const pngs: Buffer[] = [];
  for (let i = 0; i < cards.length; i++) {
    pngs.push(
      await renderCardBuffer({
        mode,
        card: cards[i],
        tokens: frame.tokens,
        branchName,
        photoSrc: await photoDataUri(cards[i], photoCache),
        pageIndex: i,
        pageCount: cards.length,
      }),
    );
  }

  // 1장뿐이면 굳이 압축하지 않고 PNG 그대로
  if (pngs.length === 1) {
    return new NextResponse(new Uint8Array(pngs[0]), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': contentDisposition(`${baseName}.png`),
        'Cache-Control': 'no-store',
      },
    });
  }

  const zip = new JSZip();
  pngs.forEach((png, i) => {
    // 01, 02 … 로 붙여야 인스타에 올릴 때 순서가 섞이지 않는다
    zip.file(`${baseName}-${String(i + 1).padStart(2, '0')}.png`, png);
  });
  // PNG는 이미 압축돼 있어 재압축 이득이 없다 → STORE로 빠르게
  const body = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition(`${baseName}.zip`),
      'Cache-Control': 'no-store',
    },
  });
}

/** 한글 파일명은 RFC 5987(filename*)로 — ASCII 폴백도 같이 준다. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
