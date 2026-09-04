import { NextResponse } from 'next/server';
import { syncProductSheet } from '@/lib/product-sheet/sync';
import { isProductSheetConfigured } from '@/lib/product-sheet/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Vercel Cron — 매일 06:30 KST(30 21 * * * UTC) 제품 브랜드 매출 구글시트 동기화.
 * 누혜(시트: 퓨어모션)·트리필드·아카데미의 주문데이터를 집계해
 * products / product_sales_daily 를 full refresh 한다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  if (!isProductSheetConfigured()) {
    return NextResponse.json({ error: 'PRODUCT_SHEET_ID 미설정' }, { status: 400 });
  }

  try {
    const s = await syncProductSheet();
    console.log(
      `[cron sync-product-sheet] ${s.brands.join(',')} — products ${s.products}, sales ${s.salesRows}행 (환불 ${s.refundRows}, 중복 ${s.exactDups})`,
    );
    return NextResponse.json({ ok: true, ...s });
  } catch (e) {
    console.error('[cron sync-product-sheet]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
