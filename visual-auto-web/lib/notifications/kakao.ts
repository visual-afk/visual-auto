import crypto from 'crypto';

// 카카오 알림톡 발송 (Solapi). 시크릿 키가 없으면 조용히 건너뛴다 →
// 키 없이도 앱이 동작하고, 나중에 키만 .env/Vercel 에 꽂으면 켜진다.
//
// 필요한 환경변수
//   SOLAPI_API_KEY     (필수) Solapi API Key
//   SOLAPI_API_SECRET  (필수) Solapi API Secret
//   KAKAO_SENDER_KEY   (선택) 발신프로필 pfId — 기본값은 비주얼살롱 채널
//   KAKAO_SENDER_PHONE (선택) 알림톡 실패 시 SMS 대체 발신번호

const SOLAPI_SEND_URL = 'https://api.solapi.com/messages/v4/send';

// 비밀 아님(공개해도 무방) → 기본값으로 둬서 키 누락에도 작동. env로 덮어쓸 수 있음.
const DEFAULT_PF_ID = 'KA01PF250715083245178fFicHtSst4m';

/** 알림톡 발송에 필요한 시크릿이 모두 있는지. 없으면 발송 skip. */
export function kakaoConfigured(): boolean {
  return Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET);
}

/** Solapi HMAC-SHA256 인증 헤더 (date+salt 를 secret 으로 서명). */
function authorizationHeader(): string {
  const apiKey = process.env.SOLAPI_API_KEY!;
  const apiSecret = process.env.SOLAPI_API_SECRET!;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export type AlimtalkResult = { sent: boolean; reason?: string };

/**
 * 카카오 알림톡 1건 발송. 키 미설정·수신번호 없음·템플릿 없음이면 조용히 { sent:false }.
 * 알림 실패가 본 작업(초대 생성 등)을 막지 않도록 절대 throw 하지 않는다.
 */
export async function sendAlimtalk(opts: {
  to: string;
  templateId: string;
  variables?: Record<string, string>;
}): Promise<AlimtalkResult> {
  const to = (opts.to || '').replace(/[^0-9]/g, '');
  if (!kakaoConfigured()) return { sent: false, reason: 'no_credentials' };
  if (!to) return { sent: false, reason: 'no_recipient' };
  if (!opts.templateId) return { sent: false, reason: 'no_template' };

  const pfId = process.env.KAKAO_SENDER_KEY || DEFAULT_PF_ID;
  const from = (process.env.KAKAO_SENDER_PHONE || '').replace(/[^0-9]/g, '');

  try {
    const res = await fetch(SOLAPI_SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorizationHeader(),
      },
      body: JSON.stringify({
        message: {
          to,
          from: from || undefined, // SMS 대체발송용(선택)
          type: 'ATA', // 알림톡
          kakaoOptions: {
            pfId,
            templateId: opts.templateId,
            variables: opts.variables || {},
          },
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[kakao] send failed', res.status, text);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('[kakao] send error', (e as Error).message);
    return { sent: false, reason: 'exception' };
  }
}
