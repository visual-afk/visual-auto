'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, MapPin } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { loginIdToEmail } from '@/lib/login-email';

export default function AcceptForm({ token, branchName }: { token: string; branchName: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, display_name: name, phone, password: pw }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error || '가입에 실패했어요');
      return;
    }

    // 바로 로그인
    const supabase = getBrowserSupabase();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(data.login_id),
      password: pw,
    });
    setLoading(false);
    if (signErr) {
      router.replace('/login');
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">이름</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
      </div>
      <div>
        <label className="label">휴대폰 번호</label>
        <input
          className="field"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-0000-0000"
        />
        <p className="mt-1 text-xs text-ink-faint">같은 이름이 있어도 번호로 구분돼요. 로그인 아이디로도 써요.</p>
      </div>
      <div>
        <label className="label">비밀번호</label>
        <div className="relative">
          <input
            className="field pr-12"
            type={showPw ? 'text' : 'password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호를 정해요"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
          >
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl bg-brand-wash px-4 py-3 text-sm text-brand">
        <MapPin size={16} className="shrink-0" />
        <span>
          지점은 <b>{branchName}</b>으로 자동 설정돼요
        </span>
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      <button className="btn-primary" disabled={loading}>
        {loading ? '가입 중…' : '가입하고 시작하기'}
      </button>
    </form>
  );
}
