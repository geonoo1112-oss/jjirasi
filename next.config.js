/** @type {import('next').NextConfig} */
const nextConfig = {
  // 백엔드 API에서 SQLite와 스케줄러 사용을 위해 서버 사이드 모듈 허용
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'better-sqlite3']
    }
    return config
  },
}

module.exports = nextConfig
