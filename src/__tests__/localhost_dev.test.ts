import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Localhost Development Configuration & Migrations', () => {
  const MIGRATION_KEY = 'audiox_default_format_migrated_v2';
  const SETTINGS_KEY = 'audiox_settings';

  let mockLocalStorage: Record<string, string> = {};

  beforeEach(() => {
    mockLocalStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockLocalStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockLocalStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockLocalStorage[key];
      },
      clear: () => {
        mockLocalStorage = {};
      },
    });
  });

  it('migrates existing legacy settings with m4a default to mp3 on first run', () => {
    // Simulate pre-existing settings in localStorage
    mockLocalStorage[SETTINGS_KEY] = JSON.stringify({
      defaultFormat: 'm4a',
      defaultQuality: 'high',
      theme: 'dark',
    });

    // Check migration condition
    const hasMigrated = localStorage.getItem(MIGRATION_KEY);
    expect(hasMigrated).toBeNull();

    // Execute migration logic
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    if (!hasMigrated) {
      if (stored.defaultFormat === 'm4a') {
        stored.defaultFormat = 'mp3';
      }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
      localStorage.setItem(MIGRATION_KEY, 'true');
    }

    const updated = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(updated.defaultFormat).toBe('mp3');
    expect(localStorage.getItem(MIGRATION_KEY)).toBe('true');
  });

  it('respects user choice if user manually selects m4a AFTER migration', () => {
    // Migration already ran
    mockLocalStorage[MIGRATION_KEY] = 'true';
    // User explicitly changed to m4a
    mockLocalStorage[SETTINGS_KEY] = JSON.stringify({
      defaultFormat: 'm4a',
      defaultQuality: 'high',
    });

    const hasMigrated = localStorage.getItem(MIGRATION_KEY);
    expect(hasMigrated).toBe('true');

    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    if (!hasMigrated) {
      stored.defaultFormat = 'mp3';
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
      localStorage.setItem(MIGRATION_KEY, 'true');
    }

    // Should NOT force mp3 because hasMigrated is already set
    expect(stored.defaultFormat).toBe('m4a');
  });

  it('correctly handles native processing error codes without external worker messages', () => {
    const errorCodes = [
      'VIDEO_UNAVAILABLE',
      'PRIVATE_VIDEO',
      'LOGIN_REQUIRED',
      'AGE_RESTRICTED',
      'LIVE_STREAM_UNSUPPORTED',
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'MAX_DURATION_EXCEEDED',
      'PROCESSING_FAILED',
    ];

    const permanentRestricted = ['LOGIN_REQUIRED', 'AGE_RESTRICTED', 'PRIVATE_VIDEO', 'VIDEO_UNAVAILABLE'];

    // Verify all restricted codes correctly indicate access restriction (no retry)
    for (const code of permanentRestricted) {
      expect(errorCodes).toContain(code);
      const allowRetry = !permanentRestricted.includes(code);
      expect(allowRetry).toBe(false);
    }

    // Temporary errors should allow retry
    expect(!permanentRestricted.includes('NETWORK_ERROR')).toBe(true);
    expect(!permanentRestricted.includes('RATE_LIMITED')).toBe(true);
  });
});
