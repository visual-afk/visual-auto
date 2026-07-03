export type Role = 'hq_admin' | 'branch_owner' | 'designer' | 'intern';

export interface PhotoGuideItem {
  position: number;
  label: string;
  종류?: string;
  구도?: string;
  포인트?: string;
  alt?: string;
  required?: boolean;
}

export interface PostPhoto {
  slot: number;
  storage_path: string;
  url?: string;
}

export interface Post {
  id: string;
  branch_id: string;
  author_id: string;
  treatment_chips: string[];
  user_notes: string | null;
  recommended_topic: string | null;
  status: 'draft' | 'published';
  title: string | null;
  meta_description: string | null;
  tags: string[];
  content: string | null;
  photo_guide: PhotoGuideItem[];
  photos: PostPhoto[];
  seo_score: number | null;
  publish_target: 'naver' | 'imweb' | null;
  published_url: string | null;
  views: number | null;
  views_updated_at: string | null;
  next_check_at: string | null;
  created_at: string;
  published_at: string | null;
}

/** 생성 파이프라인 출력 */
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
  seo_score: number | null;
}
