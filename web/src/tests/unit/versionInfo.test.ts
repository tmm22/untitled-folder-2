import { describe, expect, it } from 'vitest';

import packageJson from '../../../package.json';

import { formatAppVersion, getAppVersionInfo } from '@/lib/utils/version';

const PACKAGE_VERSION = packageJson.version ?? '0.0.0';

describe('getAppVersionInfo', () => {
  it('extracts semantic version and commit hash when env is provided', () => {
    const env = {
      NEXT_PUBLIC_APP_VERSION: '1.2.3',
      NEXT_PUBLIC_APP_BUILD: '1.2.3+commit.abcdef0',
    } as NodeJS.ProcessEnv;

    const info = getAppVersionInfo(env);

    expect(info).toEqual({
      version: '1.2.3',
      build: '1.2.3+commit.abcdef0',
      commitHash: 'abcdef0',
      isFallback: false,
    });
  });

  it('falls back to default metadata when env variables are missing', () => {
    const env = {} as NodeJS.ProcessEnv;

    const info = getAppVersionInfo(env);

    expect(info.version).toBe(PACKAGE_VERSION);
    expect(info.build).toBe(`${PACKAGE_VERSION}+dev.local`);
    expect(info.commitHash).toBeUndefined();
    expect(info.isFallback).toBe(true);
  });
});

describe('formatAppVersion', () => {
  it('adds commit hash when available', () => {
    const readable = formatAppVersion({
      version: '2.0.0',
      build: '2.0.0+commit.abc1234',
      commitHash: 'abc1234',
      isFallback: false,
    });

    expect(readable).toBe('2.0.0 (abc1234)');
  });

  it('returns semantic version when commit hash is missing', () => {
    const readable = formatAppVersion({
      version: '2.0.1',
      build: '2.0.1+dev.local',
      isFallback: true,
    });

    expect(readable).toBe('2.0.1');
  });
});
