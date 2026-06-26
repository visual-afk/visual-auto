'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SquarePen, Eye, EyeOff } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { loginIdToEmail } from '@/lib/login-email';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(loginId),
      password: pw,
    });
    if (error || !data.user) {
      setLoading(false);
      setError('아이디 또는 비밀번호를 확인해주세요');
      return;
    }
    // 퇴출(비활성)된 계정은 접근 차단 (본인 행은 RLS로 읽기 허용됨)
    const { data: me } = await supabase
      .from('branch_users')
      .select('is_active')
      .eq('user_id', data.user.id)
      .maybeSingle();
    if (me && me.is_active === false) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('비활성화된 계정이에요. 원장님 또는 본사에 문의해주세요.');
      return;
    }
    setLoading(false);
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="app-shell flex flex-col justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-brand-ink">
          <SquarePen size={30} />
        </div>
        <h1 className="text-xl font-bold">비주얼 블로그</h1>
        <p className="mt-1 text-sm text-ink-soft">승인받은 분만 쓸 수 있어요</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">아이디</label>
          <input
            className="field"
            inputMode="tel"
            placeholder="휴대폰 번호를 입력해요"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div>
          <label className="label">비밀번호</label>
          <div className="relative">
            <input
              className="field pr-12"
              type={showPw ? 'text' : 'password'}
              placeholder="비밀번호를 입력해요"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
              aria-label="비밀번호 표시"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-warn">{error}</p>}

        <button className="btn-primary" disabled={loading}>
          {loading ? '로그인 중…' : '로그인'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        초대받았는데 가입이 안 되나요?{' '}
        <span className="font-medium text-brand">원장님께 링크를 다시 받아보세요</span>
      </p>
    </main>
  );
}
