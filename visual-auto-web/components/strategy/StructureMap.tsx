'use client';

import { C, STATUS_COLOR } from './theme';
import type { ResolvedArea } from '@/lib/strategy/model';

/**
 * 기본표 — 사업 구조도 SVG. 참고 시안의 노드 배치·연결선 규약(5.3)을 따른다.
 * 굵은 회색=확정 공급, 가는 회색=공급, 점선=가설/Feedback, 주황=순환 고리, 빨강=경고.
 */

type Pt = { x: number; y: number };
type Geom = { x: number; y: number; r: number };

const VB_W = 1700;
const VB_H = 1230;

const NODES: Record<string, Geom> = {
  staff: { x: 370, y: 195, r: 88 },
  trifield: { x: 878, y: 212, r: 82 },
  hq: { x: 648, y: 582, r: 158 },
  branch: { x: 1058, y: 580, r: 98 },
  customer: { x: 1352, y: 576, r: 85 },
  reputation: { x: 1336, y: 896, r: 88 },
  academy: { x: 1122, y: 1086, r: 88 },
  nuhye: { x: 832, y: 992, r: 88 },
};
// 불안 = 사각 박스
const ANX = { x: 1100, y: 52, w: 384, h: 196 };

/** from 원 경계에서 to 방향으로 나가는 점 */
function edge(from: Geom, to: Pt, pad = 0): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const r = from.r + pad;
  return { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r };
}
/** 사각 박스에서 to 방향으로 가장 가까운 변의 점(근사) */
function boxEdge(to: Pt): Pt {
  const cx = ANX.x + ANX.w / 2;
  const cy = ANX.y + ANX.h / 2;
  const dx = to.x - cx;
  const dy = to.y - cy;
  const sx = dx === 0 ? Infinity : ANX.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : ANX.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export default function StructureMap({
  areas,
  selectedId,
  onSelect,
}: {
  areas: ResolvedArea[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const byId = new Map(areas.map((a) => [a.id, a]));
  const repMetric = (id: string) => {
    const a = byId.get(id);
    const mt = a?.metrics.find((x) => x.display != null) ?? a?.metrics[0];
    return mt ? `${mt.name}: ${mt.display ?? '?'}` : '';
  };

  // 연결선 좌표
  const hq = NODES.hq, branch = NODES.branch, customer = NODES.customer;
  const staff = NODES.staff, trifield = NODES.trifield, reputation = NODES.reputation;
  const academy = NODES.academy, nuhye = NODES.nuhye;

  const hqToBranchA = edge(hq, branch), hqToBranchB = edge(branch, hq);
  const branchToCustA = edge(branch, customer), branchToCustB = edge(customer, branch);
  const hqToTriA = edge(hq, trifield), hqToTriB = edge(trifield, hq);
  const hqToNuhyeA = edge(hq, nuhye), hqToNuhyeB = edge(nuhye, hq);
  const staffToHqA = edge(staff, hq), staffToHqB = edge(hq, staff);
  const custToRepA = edge(customer, reputation), custToRepB = edge(reputation, customer);
  const repToAcaA = edge(reputation, academy), repToAcaB = edge(academy, reputation);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-auto w-full min-w-[680px]"
        role="img"
        aria-label="비주얼그룹 사업 구조도"
      >
        <defs>
          {arrow('arr-supply', C.supply)}
          {arrow('arr-cycle', C.cycle)}
          {arrow('arr-danger', C.danger)}
        </defs>

        {/* ── 순환 고리 (주황, 가장 굵게): 고객→평판→아카데미→(하단 스윕)→좋은직원→본사 ── */}
        <path d={line(custToRepA, custToRepB)} stroke={C.cycle} strokeWidth={9} fill="none" markerEnd="url(#arr-cycle)" strokeLinecap="round" />
        <path d={line(repToAcaA, repToAcaB)} stroke={C.cycle} strokeWidth={9} fill="none" markerEnd="url(#arr-cycle)" strokeLinecap="round" />
        {/* 아카데미 → 좋은직원 : 왼쪽 아래로 크게 스윕 */}
        <path
          d={`M ${edge(academy, { x: 300, y: 1150 }).x} ${edge(academy, { x: 300, y: 1150 }).y} C 340 1180, 150 780, ${edge(staff, { x: 250, y: 700 }).x} ${edge(staff, { x: 250, y: 700 }).y}`}
          stroke={C.cycle}
          strokeWidth={9}
          fill="none"
          markerEnd="url(#arr-cycle)"
          strokeLinecap="round"
        />
        {/* 좋은직원 → 본사 (주황 화살표) */}
        <path d={line(staffToHqA, staffToHqB)} stroke={C.cycle} strokeWidth={7} fill="none" markerEnd="url(#arr-cycle)" strokeLinecap="round" />

        {/* ── 공급 흐름 (회색) ── */}
        {/* 본사 → 지점 (굵은 실선) */}
        <path d={line(hqToBranchA, hqToBranchB)} stroke={C.supply} strokeWidth={11} fill="none" markerEnd="url(#arr-supply)" strokeLinecap="round" />
        {/* 지점 → 고객 */}
        <path d={line(branchToCustA, branchToCustB)} stroke={C.supply} strokeWidth={6} fill="none" markerEnd="url(#arr-supply)" strokeLinecap="round" />
        {/* 본사 → 타지점 (교육·약제) */}
        <path d={line(hqToTriA, hqToTriB)} stroke={C.supply} strokeWidth={5} fill="none" markerEnd="url(#arr-supply)" strokeLinecap="round" />
        {/* 본사 → 누혜 (이미지) */}
        <path d={line(hqToNuhyeA, hqToNuhyeB)} stroke={C.supply} strokeWidth={4} fill="none" markerEnd="url(#arr-supply)" strokeLinecap="round" />

        {/* ── Feedback (점선 회색) : 지점→본사, 타지점→본사 ── */}
        <path
          d={`M ${edge(branch, hq).x} ${edge(branch, hq).y} Q 900 470 ${edge(hq, { x: 950, y: 470 }).x} ${edge(hq, { x: 950, y: 470 }).y}`}
          stroke={C.supply} strokeWidth={3} fill="none" strokeDasharray="10 9" markerEnd="url(#arr-supply)"
        />
        <path
          d={`M ${edge(trifield, { x: 780, y: 470 }).x} ${edge(trifield, { x: 780, y: 470 }).y} Q 820 460 ${edge(hq, { x: 840, y: 460 }).x} ${edge(hq, { x: 840, y: 460 }).y}`}
          stroke={C.supply} strokeWidth={3} fill="none" strokeDasharray="10 9" markerEnd="url(#arr-supply)"
        />

        {/* ── 전환? (점선) 타지점→지점 ── */}
        <path
          d={line(edge(trifield, branch), edge(branch, trifield))}
          stroke={C.cycle} strokeWidth={3} fill="none" strokeDasharray="9 8"
        />
        {/* ── 경고선 (빨강) Feedback → 불안 박스 ── */}
        <path
          d={`M 980 470 L ${boxEdge({ x: 980, y: 470 }).x} ${boxEdge({ x: 980, y: 470 }).y}`}
          stroke={C.danger} strokeWidth={3} fill="none" markerEnd="url(#arr-danger)"
        />

        {/* ── 라벨 ── */}
        {label(mid(hqToBranchA, hqToBranchB).x, mid(hqToBranchA, hqToBranchB).y - 14, '직원 제공', C.cycle, true)}
        {label(mid(hqToBranchA, hqToBranchB).x, mid(hqToBranchA, hqToBranchB).y + 26, 'System 제공', C.textDim)}
        {label(mid(branchToCustA, branchToCustB).x, mid(branchToCustA, branchToCustB).y - 16, '서비스', C.text)}
        {label(mid(branchToCustA, branchToCustB).x, mid(branchToCustA, branchToCustB).y + 24, '균일함', C.cycle)}
        {label(mid(hqToTriA, hqToTriB).x - 10, mid(hqToTriA, hqToTriB).y - 12, '교육·약제', C.textDim)}
        {label(mid(hqToNuhyeA, hqToNuhyeB).x - 30, mid(hqToNuhyeA, hqToNuhyeB).y, '이미지', C.textDim)}
        {label(905, 452, 'Feedback', C.textDim)}
        {label(1010, 372, '전환 ?', C.cycle)}

        {/* ── 불안 박스 ── */}
        <g onClick={() => onSelect('anxiety')} className="cursor-pointer">
          <rect
            x={ANX.x} y={ANX.y} width={ANX.w} height={ANX.h} rx={18}
            fill={C.dangerBg}
            stroke={selectedId === 'anxiety' ? C.accent : C.danger}
            strokeWidth={selectedId === 'anxiety' ? 4 : 2.5}
          />
          <text x={ANX.x + ANX.w / 2} y={ANX.y + 58} textAnchor="middle" fontSize={30} fontWeight={700} fill={C.danger}>
            Feedback서 나온
          </text>
          <text x={ANX.x + ANX.w / 2} y={ANX.y + 96} textAnchor="middle" fontSize={30} fontWeight={700} fill={C.danger}>
            &quot;불안&quot;
          </text>
          <text x={ANX.x + ANX.w / 2} y={ANX.y + 140} textAnchor="middle" fontSize={22} fill={C.textDim}>
            System으로 해결 가능한지
          </text>
          <text x={ANX.x + ANX.w / 2} y={ANX.y + 170} textAnchor="middle" fontSize={22} fill={C.textDim}>
            아닌지 파악 필요
          </text>
          {statusDot(ANX.x + ANX.w - 20, ANX.y + 20, byId.get('anxiety')?.status)}
        </g>

        {/* ── 원 노드 ── */}
        {Object.entries(NODES).map(([id, g]) => {
          const a = byId.get(id);
          if (!a) return null;
          const sel = selectedId === id;
          const big = id === 'hq';
          return (
            <g key={id} onClick={() => onSelect(id)} className="cursor-pointer">
              <title>{repMetric(id)}</title>
              <circle
                cx={g.x} cy={g.y} r={g.r}
                fill={sel ? C.nodeStrong : C.node}
                stroke={sel ? C.accent : id === 'nuhye' ? C.accent : C.line}
                strokeWidth={sel ? 5 : id === 'nuhye' ? 3 : 1.5}
              />
              <text x={g.x} y={a.subtitle ? g.y - 4 : g.y + 8} textAnchor="middle" fontSize={big ? 34 : 27} fontWeight={700} fill={C.text}>
                {a.name}
              </text>
              {a.subtitle && (
                <text x={g.x} y={g.y + (big ? 34 : 30)} textAnchor="middle" fontSize={big ? 21 : 18} fill={C.textDim}>
                  {a.subtitle}
                </text>
              )}
              {statusDot(g.x + g.r * 0.72, g.y - g.r * 0.72, a.status)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── helpers ──
function line(a: Pt, b: Pt): string {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}
function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function label(x: number, y: number, text: string, fill: string, pill = false) {
  if (pill) {
    const w = text.length * 20 + 24;
    return (
      <g>
        <rect x={x - w / 2} y={y - 22} width={w} height={32} rx={8} fill="#3a2a18" />
        <text x={x} y={y} textAnchor="middle" fontSize={21} fontWeight={600} fill={fill}>
          {text}
        </text>
      </g>
    );
  }
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={22} fontWeight={500} fill={fill}>
      {text}
    </text>
  );
}
function statusDot(x: number, y: number, status?: '양호' | '주의' | '미확보') {
  if (!status) return null;
  return <circle cx={x} cy={y} r={12} fill={STATUS_COLOR[status]} stroke={C.bg} strokeWidth={3} />;
}
function arrow(id: string, color: string) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
    </marker>
  );
}
