'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import type { Role } from '@/lib/roles';

type BranchOption = { id: string; name: string };

export default function InviteForm({
  myRole,
  branches,
}: {
  myRole: Role;
  branches?: BranchOption[]; // 본사일 때만 — 지점 선택용
}) {
  const router = useRouter();
  const isHq = myRole === 'hq_admin';

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [role, setRole] = useState<string>('designer');
  const [branchId, setBranchId] = useState<string>(branches?.[0]?.id ?? '');
  const [link, setLink] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // 초대 가능 역할: 원장은 디자이너/인턴, 본사는 원장·본사 관리자도
  const roleOptions = isHq
    ? [
        { value: 'designer', label: '디자이너' },
        { value: 'intern', label: '인턴' },
        { value: 'branch_owner', label: '원장' },
        { value: 'hq_admin', label: '본사 관리자' },
      ]
    : [
        { value: 'designer', label: '디자이너' },
        { value: 'intern', label: '인턴' },
      ];

  // 본사 관리자 초대는 지점이 없다 (전 지점 접근)
  const needsBranch = isHq && role !== 'hq_admin';

  async function createInvite() {
    setError('');
    if (needsBranch && !branchId) {
      setError('지점을 선택해주세요');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invitee_name: name,
        invitee_contact: contact,
        role,
        ...(needsBranch ? { branch_id: branchId } : {}),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || '초대 생성에 실패했어요');
      return;
    }
    setLink(data.link);
    setSent(!!data.sent);
    router.refresh();
  }

  // 데스크탑 공유시트는 카톡/문자 전송이 안 돼서, 항상 링크를 복사해 준다.
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* 클립보드 실패해도 링크는 화면에 보임 */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          className="field md:flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
        />
        <input
          className="field md:flex-1"
          inputMode="tel"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="연락처 (카톡·문자)"
        />
        {isHq && (
          <select
            className="field md:w-40 disabled:opacity-50"
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
        <select className="field md:w-32" value={role} onChange={(e) => setRole(e.target.value)}>
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          className="rounded-2xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-ink transition active:scale-[0.99] disabled:opacity-50 md:w-32 md:shrink-0"
          onClick={createInvite}
          disabled={loading}
        >
          {loading ? '만드는 중…' : '초대 보내기'}
        </button>
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      {link && (
        <div className="space-y-2 rounded-2xl border border-line bg-canvas p-3">
          <div className="flex items-start gap-2 text-sm text-brand">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>
              {sent
                ? '입력한 번호로 카카오 초대장을 보냈어요 ✓ (혹시 안 왔으면 아래 링크를 복사해 보내주세요)'
                : '링크를 받은 사람만 가입할 수 있어요. 카톡·문자로 보내주세요.'}
            </span>
          </div>
          <div className="break-all rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-soft">
            {link}
          </div>
          <button
            className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink"
            onClick={copy}
          >
            {copied ? '복사됐어요 ✓ — 카톡·문자에 붙여넣어 보내세요' : '초대 링크 복사'}
          </button>
        </div>
      )}
    </div>
  );
}
