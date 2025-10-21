'use strict';

const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
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
  ...compat.config({
    extends: ['next/core-web-vitals'],
  }),
];
