import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      '.vercel/**',
      'convex/_generated/**',
    ],
  },
  ...nextCoreWebVitals,
];

export default config;
