'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import type { Role } from '@/lib/roles';

type BranchOption = { id: string; name: string };

/** 본사/원장이 회원을 즉시 추가 (초대 링크 없이 계정 발급). */
export default function DirectMemberForm({
  myRole,
  branches,
}: {
  myRole: Role;
  branches?: BranchOption[]; // 본사일 때만 — 지점 선택용
}) {
  const router = useRouter();
  const isHq = myRole === 'hq_admin';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('visual1234');
  const [role, setRole] = useState<string>('designer');
  const [branchId, setBranchId] = useState<string>(branches?.[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ login_id: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // 본사는 지점 선택이 필요한 역할일 때만 (hq_admin은 불필요)
  const needsBranch = isHq && role !== 'hq_admin';

  const roleOptions = isHq
    ? [
        { value: 'designer', label: '디자이너' },
        { value: 'intern', label: '인턴' },
        { value: 'branch_owner', label: '원장' },
        { value: 'hq_admin', label: '본사' },
      ]
    : [
        { value: 'designer', label: '디자이너' },
        { value: 'intern', label: '인턴' },
      ];

  async function add() {
    setError('');
    setDone(null);
    if (!name.trim() || !phone.trim()) {
      setError('이름·휴대폰을 입력해주세요');
      return;
    }
    if (needsBranch && !branchId) {
      setError('지점을 선택해주세요');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: name,
        phone,
        password,
        role,
        ...(needsBranch ? { branch_id: branchId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || '추가에 실패했어요');
      return;
    }
    setDone({ login_id: data.login_id, password: data.password });
    setName('');
    setPhone('');
    router.refresh();
  }

  async function copyCreds() {
    if (!done) return;
    await navigator.clipboard.writeText(`아이디: ${done.login_id} / 비번: ${done.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <input className="field md:flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
        <input
          className="field md:flex-1"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="휴대폰 (아이디로 사용)"
        />
        <input
          className="field md:w-36"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="임시 비번"
        />
        {isHq && (
          <select
            className="field md:w-36 disabled:opacity-50"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={!needsBranch}
          >
            <option value="">{needsBranch ? '지점 선택' : '지점 없음(본사)'}</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select className="field md:w-28" value={role} onChange={(e) => setRole(e.target.value)}>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          className="rounded-2xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-ink transition active:scale-[0.99] disabled:opacity-50 md:w-28 md:shrink-0"
          onClick={add}
          disabled={loading}
        >
          {loading ? '추가 중…' : '바로 추가'}
        </button>
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      {done && (
        <div className="space-y-2 rounded-2xl border border-line bg-canvas p-3">
          <div className="flex items-start gap-2 text-sm text-brand">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>계정이 만들어졌어요. 아래 아이디·비번을 본인에게 전달하세요.</span>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            아이디 <b>{done.login_id}</b> · 비번 <b>{done.password}</b>
          </div>
          <button
            className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold"
            onClick={copyCreds}
          >
            {copied ? '복사됐어요 ✓' : '아이디·비번 복사'}
          </button>
        </div>
      )}
    </div>
  );
}
