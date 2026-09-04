import type { PhotoGuideItem } from '../types';

/**
 * 본문의 [IMAGE] 블록을 촬영 가이드(PhotoGuideItem[])로 파싱하고,
 * 본문에서는 그 자리를 `[사진N] 라벨` 마커로 치환한다.
 *
 * [IMAGE] 블록 예시:
 *   [IMAGE]
 *   - 종류: 시술 전/후 옆모습 2장
 *   - 구도: 정면 살짝 측면, 얼굴 안 나오게
 *   - 포인트: 결 윤기 차이가 보이게 측면광
 *   - alt 텍스트: 결마지 전후 비교
 */
export function parsePhotoGuide(content: string): { body: string; guide: PhotoGuideItem[] } {
  const lines = content.split('\n');
  const guide: PhotoGuideItem[] = [];
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\[IMAGE\]/i.test(line)) {
      out.push(line);
      continue;
    }

    // [IMAGE] 발견 → 이어지는 '-' 라인들을 가이드 필드로 수집
    const fields: Record<string, string> = {};
    let j = i + 1;
    while (j < lines.length && lines[j].trim().startsWith('-')) {
      const raw = lines[j].trim().replace(/^-\s*/, '');
      const m = raw.match(/^([^:：]+)[:：]\s*(.+)$/);
      if (m) fields[m[1].trim()] = m[2].trim();
      else fields[`기타${Object.keys(fields).length}`] = raw;
      j++;
    }
    i = j - 1; // 소비한 라인만큼 건너뜀

    const position = guide.length + 1;
    const label = fields['종류'] || fields['라벨'] || '사진';
    guide.push({
      position,
      label,
      종류: fields['종류'],
      구도: fields['구도'],
      포인트: fields['포인트'],
      alt: fields['alt 텍스트'] || fields['alt'] || fields['ALT'],
      required: position === 1, // 첫 사진은 필수, 나머지는 권장
    });

    out.push(`[사진${position}] ${label}`);
  }

  return { body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), guide };
}
