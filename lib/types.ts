export interface SheetRow {
  rowIndex: number; // 시트에서의 실제 행 번호 (1-indexed, 헤더 제외)
  month: string;
  week: string;
  topic: string;
  keywords: string;
  postType: PostType;
  status: PostStatus;
  scheduledDate: string;
  generatedAt: string;
  docUrl: string;
  imwebUrl: string;
  naverUrl: string;
  views: string;
  conversions: string;
}

export type PostType = '정보형' | '스토리형' | '시즌형';
export type PostStatus = 'planned' | 'generating' | 'draft_ready' | 'reviewing' | 'published' | 'tracking';

export interface GeneratedPost {
  title: string;
  meta_description: string;
  tags: string[];
  content: string;
  image_suggestions: string[];
}

export interface SeoOptimizedPost {
  optimized_title: string;
  optimized_meta_description: string;
  optimized_tags: string[];
  optimized_content: string;
  changes_made: string[];
  seo_score: number;
}

export interface PipelineLogEntry {
  timestamp: string;
  topic: string;
  status: 'started' | 'completed' | 'failed';
  doc_url?: string;
  tokens_used?: number;
  duration_ms?: number;
  error?: string;
}

export interface CalendarEvent {
  summary: string;
  description: string;
  date: string; // YYYY-MM-DD
  eventId?: string;
}
