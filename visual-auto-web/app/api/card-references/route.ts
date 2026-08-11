import { NextResponse } from 'next/server';
import { requireHq } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { callAI, friendlyAIError, parseJsonResponse } from '@/lib/generation/ai-client';
import {
  aggregateDesign,
  aggregateEditorial,
  validateImageFile,
  MAX_IMAGES,
  type ReferenceDna,
  type ReferenceEditorial,
} from '@/lib/cardnews/styleExtract';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BUCKET = 'card-references';

// 디자인 DNA + 에디토리얼 패턴을 한 번에 추출 (erb design-references/analyze 프롬프트 각색).
const ANALYSIS_PROMPT = `당신은 인스타 카드뉴스/썸네일 디자인 분석 전문가입니다.
이 이미지를 분석해 아래 JSON 형식으로만 반환하세요. 설명·마크다운 없이 유효한 JSON만.

{
  "layout": "(bottom_title | diagonal_split | center_focus | big_number | top_bar 중 가장 유사한 것)",
  "style": {
    "bg_primary": "#hex (주 배경색, 어두운 쪽)",
    "bg_secondary": "#hex (보조 배경색, 밝은 쪽)",
    "bg_angle": 135,
    "title_color": "#hex (제목 텍스트 색)",
    "title_size": "(small | medium | large | xlarge)",
    "title_weight": 800,
    "title_shadow": true
  },
  "decorations": [
    { "type": "(circle_outline | circle_filled | glow | dots | line | corner_accent)", "position": "(top-right|top-left|bottom-right|bottom-left|center)", "color": "rgba(R,G,B,opacity)", "size": "(small|medium|large)", "opacity": 0.15 }
  ],
  "mood": "(bold | minimal | warm | professional | creative)",
  "description": "이 디자인의 특징을 한 줄로 (한국어)",
  "editorial": {
    "tone": "카드 문구의 말투·톤을 한 줄로 (한국어)",
    "hook_style": "표지 훅을 만드는 방식을 한 줄로 (한국어)",
    "cta_style": "행동 유도(CTA) 방식을 한 줄로 (한국어)",
    "sample_phrases": ["이미지에서 읽히는 실제 문구나 그 스타일의 예시 1~3개"]
  }
}`;

interface ParsedAnalysis extends ReferenceDna {
  editorial?: ReferenceEditorial;
}

/** 브랜드의 누적 이미지 전체로 프로필 재취합 후 upsert. */
async function reaggregate(admin: ReturnType<typeof getAdminSupabase>, branchId: string) {
  const { data: all } = await admin
    .from('card_reference_images')
    .select('dna, editorial')
    .eq('branch_id', branchId);
  const rows = all ?? [];
  const design = aggregateDesign(rows.map((r) => (r.dna ?? {}) as ReferenceDna));
  const editorial = aggregateEditorial(rows.map((r) => (r.editorial ?? {}) as ReferenceEditorial));
  await admin
    .from('card_style_profiles')
    .upsert({ branch_id: branchId, design, editorial, image_count: rows.length, updated_at: new Date().toISOString() });
  return { design, editorial, image_count: rows.length };
}

/**
 * 레퍼런스 이미지 학습 — 브랜드별 이미지를 Vision으로 분석해 누적 스타일 프로필 갱신.
 * POST multipart: { branch_id, images[] } (최대 5장). 본사만.
 */
export async function POST(request: Request) {
  const res = await requireHq();
  if ('error' in res) return res.error;
  const { member } = res;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: '이미지를 올려주세요' }, { status: 400 });
  const branchId = String(form.get('branch_id') || '').trim();
  if (!branchId) return NextResponse.json({ error: '브랜드를 골라주세요' }, { status: 400 });
  const files = form.getAll('images').filter((f): f is File => f instanceof File).slice(0, MAX_IMAGES);
  if (files.length === 0) return NextResponse.json({ error: '이미지를 올려주세요' }, { status: 400 });

  const admin = getAdminSupabase();
  let added = 0;
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const v = validateImageFile({ type: file.type, size: file.size });
    if (!v.ok) {
      errors.push(v.error || '파일 오류');
      continue;
    }
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || 'image/jpeg';
      const result = await callAI({
        system: ANALYSIS_PROMPT,
        userMessage: '이 카드뉴스/썸네일 이미지를 분석해 지정한 JSON만 반환하세요.',
        image: { base64: buf.toString('base64'), mimeType },
        json: true,
        temperature: 0.2,
        maxTokens: 1200,
      });
      const parsed = parseJsonResponse<ParsedAnalysis>(result.text);
      const dna: ReferenceDna = {
        layout: parsed.layout,
        style: parsed.style,
        decorations: parsed.decorations,
        mood: parsed.mood,
        description: parsed.description,
      };
      const editorial: ReferenceEditorial = parsed.editorial ?? {};

      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      const path = `${branchId}/${Date.now()}-${i}.${ext}`;
      const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: mimeType, upsert: false });
      if (up.error) throw new Error(up.error.message);

      const ins = await admin
        .from('card_reference_images')
        .insert({ branch_id: branchId, image_path: path, dna, editorial, created_by: member.userId });
      if (ins.error) throw new Error(ins.error.message);
      added += 1;
    } catch (e) {
      const { message } = friendlyAIError(e);
      errors.push(message);
    }
  }

  const profile = await reaggregate(admin, branchId);
  return NextResponse.json({ profile, added, errors });
}

/** 현재 프로필 + 이미지 수 조회. GET ?branch_id= */
export async function GET(request: Request) {
  const res = await requireHq();
  if ('error' in res) return res.error;
  const branchId = new URL(request.url).searchParams.get('branch_id')?.trim();
  if (!branchId) return NextResponse.json({ error: '브랜드를 골라주세요' }, { status: 400 });
  const admin = getAdminSupabase();
  const { data } = await admin
    .from('card_style_profiles')
    .select('design, editorial, image_count, updated_at')
    .eq('branch_id', branchId)
    .maybeSingle();
  return NextResponse.json({ profile: data ?? null });
}

/** 학습 리셋 — 브랜드의 레퍼런스 이미지·프로필 삭제. DELETE ?branch_id= */
export async function DELETE(request: Request) {
  const res = await requireHq();
  if ('error' in res) return res.error;
  const branchId = new URL(request.url).searchParams.get('branch_id')?.trim();
  if (!branchId) return NextResponse.json({ error: '브랜드를 골라주세요' }, { status: 400 });
  const admin = getAdminSupabase();

  const { data: imgs } = await admin.from('card_reference_images').select('image_path').eq('branch_id', branchId);
  const paths = (imgs ?? []).map((r) => r.image_path).filter(Boolean) as string[];
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  await admin.from('card_reference_images').delete().eq('branch_id', branchId);
  await admin.from('card_style_profiles').delete().eq('branch_id', branchId);
  return NextResponse.json({ ok: true });
}
