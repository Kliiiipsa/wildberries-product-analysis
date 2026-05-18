import type { NextConfig } from 'next';

// Фикс: Windows возвращает путь то e:\ то E:\, webpack видит дубли React → ломается App Router
if (process.platform === 'win32') {
  const cwd = process.cwd();
  const normalized = cwd.replace(/^[a-z]:/, (m) => m.toUpperCase());
  if (cwd !== normalized) process.chdir(normalized);
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 'basket-01.wbbasket.ru' },
      { hostname: 'basket-02.wbbasket.ru' },
      { hostname: 'basket-03.wbbasket.ru' },
      { hostname: 'basket-04.wbbasket.ru' },
      { hostname: 'basket-05.wbbasket.ru' },
      { hostname: 'basket-06.wbbasket.ru' },
      { hostname: 'basket-07.wbbasket.ru' },
      { hostname: 'basket-08.wbbasket.ru' },
      { hostname: 'basket-09.wbbasket.ru' },
      { hostname: 'basket-10.wbbasket.ru' },
      { hostname: 'basket-11.wbbasket.ru' },
      { hostname: 'basket-12.wbbasket.ru' },
      { hostname: 'basket-13.wbbasket.ru' },
      { hostname: 'basket-14.wbbasket.ru' },
      { hostname: 'basket-15.wbbasket.ru' },
      { hostname: 'basket-16.wbbasket.ru' },
      { hostname: 'basket-17.wbbasket.ru' },
      { hostname: 'basket-18.wbbasket.ru' },
      { hostname: 'basket-19.wbbasket.ru' },
      { hostname: 'basket-20.wbbasket.ru' },
      { hostname: 'basket-21.wbbasket.ru' },
      { hostname: 'basket-22.wbbasket.ru' },
      { hostname: 'basket-23.wbbasket.ru' },
      { hostname: 'basket-24.wbbasket.ru' },
      { hostname: 'basket-25.wbbasket.ru' },
      { hostname: 'basket-26.wbbasket.ru' },
      { hostname: 'basket-27.wbbasket.ru' },
      { hostname: 'basket-28.wbbasket.ru' },
      { hostname: 'basket-29.wbbasket.ru' },
      { hostname: 'basket-30.wbbasket.ru' },
      { hostname: 'basket-31.wbbasket.ru' },
      { hostname: 'basket-32.wbbasket.ru' },
      { hostname: 'basket-33.wbbasket.ru' },
      { hostname: 'basket-34.wbbasket.ru' },
      { hostname: 'basket-35.wbbasket.ru' },
      { hostname: 'basket-36.wbbasket.ru' },
      { hostname: 'basket-37.wbbasket.ru' },
      { hostname: 'basket-38.wbbasket.ru' },
      { hostname: 'basket-39.wbbasket.ru' },
      { hostname: 'basket-40.wbbasket.ru' },
    ],
  },
};

export default nextConfig;
