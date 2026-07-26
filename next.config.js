/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    // 개발 모드일 때 Windows 디스크 파일 락(EPERM) 및 CSS 청크 꼬임 해결을 위해 웹팩 캐시 타입을 메모리로 전환
    if (dev) {
      config.cache = {
        type: 'memory'
      }
    }
    return config;
  }
}

module.exports = nextConfig
