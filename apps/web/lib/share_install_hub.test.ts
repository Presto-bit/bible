import { describe, expect, it } from 'vitest';
import {
  buildShareInstallHubUrl,
  sanitizeShareInstallNext,
} from './share_install_hub';

describe('share_install_hub', () => {
  it('sanitizeShareInstallNext allows share deep links only', () => {
    expect(sanitizeShareInstallNext('/share/daily-verse')).toBe('/share/daily-verse');
    expect(sanitizeShareInstallNext('//evil.test')).toBeNull();
    expect(sanitizeShareInstallNext('/share/start')).toBeNull();
    expect(sanitizeShareInstallNext('https://x')).toBeNull();
  });

  it('buildShareInstallHubUrl encodes next', () => {
    expect(buildShareInstallHubUrl('/share/campaign')).toBe(
      '/share/start?next=%2Fshare%2Fcampaign',
    );
  });
});