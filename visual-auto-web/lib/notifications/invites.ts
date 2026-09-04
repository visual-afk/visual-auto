import { sendAlimtalk, type AlimtalkResult } from './kakao';

// 초대 관련 카카오 알림톡. 템플릿 코드는 Solapi 콘솔에 등록한 값.
// (비밀 아님 → 기본값으로 두고, 바뀌면 env로 덮어쓰기)

// 가입 초대장(가입 링크 버튼) — 등록·심사 완료된 템플릿
const TMPL_INVITE_SENT = process.env.KAKAO_TMPL_INVITE_SENT || 'KA01TP2606300823371182bYxtGoDzgS';

/**
 * 초대받는 사람에게 "가입 초대장" 알림톡 발송.
 * 템플릿 버튼 웹링크가 `https://도메인/invite/#{초대코드}` 이므로 변수에 토큰을 넣는다.
 */
export function sendInviteAlimtalk(p: {
  toPhone: string;
  inviteeName: string;
  branchName: string;
  token: string;
}): Promise<AlimtalkResult> {
  return sendAlimtalk({
    to: p.toPhone,
    templateId: TMPL_INVITE_SENT,
    variables: {
      '#{이름}': p.inviteeName || '디자이너',
      '#{지점}': p.branchName || '비주얼살롱',
      '#{초대코드}': p.token,
    },
  });
}

/**
 * 가입이 완료되면 초대한 사람(원장/본사)에게 "가입 완료" 알림톡.
 * 전용 템플릿(KAKAO_TMPL_INVITE_ACCEPTED)이 등록돼 있을 때만 발송, 없으면 skip.
 */
export function sendInviteAcceptedAlimtalk(p: {
  toPhone: string;
  newMemberName: string;
  branchName: string;
}): Promise<AlimtalkResult> {
  const templateId = process.env.KAKAO_TMPL_INVITE_ACCEPTED;
  if (!templateId) return Promise.resolve({ sent: false, reason: 'no_template' });
  return sendAlimtalk({
    to: p.toPhone,
    templateId,
    variables: {
      '#{이름}': p.newMemberName || '신규 멤버',
      '#{지점}': p.branchName || '비주얼살롱',
    },
  });
}
