/** @type {import('next').NextConfig} */
const nextConfig = {
  // knowledge/ · prompts/ · templates/ 를 서버 런타임에서 fs로 읽으므로
  // Vercel 서버리스 번들에 포함되도록 강제한다.
  outputFileTracingIncludes: {
    '/api/**': ['./knowledge/**/*', './prompts/**/*', './templates/**/*'],
  },
};

export default nextConfig;
