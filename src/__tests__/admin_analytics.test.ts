import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from '../lib/security/admin';
import {
  upsertVisitor,
  recordDownloadEvent,
  recordPlaylistEvent,
  getDashboardStats,
  getDownloadEvents,
  getVisitors,
  getVisitorDetails,
  getPlaylistEvents,
  getRecentActivity,
  checkAdminRateLimit,
  recordAdminFailedAttempt,
  resetAdminRateLimit,
} from '../lib/db/database';

describe('Admin Security & Session Tokens', () => {
  it('creates and verifies a valid admin session token', () => {
    const token = createAdminSessionToken();
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);

    const isValid = verifyAdminSessionToken(token);
    expect(isValid).toBe(true);
  });

  it('rejects tampered or malformed admin tokens', () => {
    expect(verifyAdminSessionToken('')).toBe(false);
    expect(verifyAdminSessionToken('invalid.token')).toBe(false);
    expect(verifyAdminSessionToken(null as any)).toBe(false);

    const validToken = createAdminSessionToken();
    const tampered = validToken.slice(0, -4) + 'abcd';
    expect(verifyAdminSessionToken(tampered)).toBe(false);
  });

  it('rate limits failed admin login attempts properly', () => {
    const testIp = `192.168.1.${Math.floor(Math.random() * 1000)}`;

    // Initially not blocked
    const initialCheck = checkAdminRateLimit(testIp);
    expect(initialCheck.blocked).toBe(false);

    // Record 4 failed attempts
    for (let i = 0; i < 4; i++) {
      const res = recordAdminFailedAttempt(testIp);
      expect(res.blocked).toBe(false);
    }

    // 5th failed attempt triggers rate limit
    const fifth = recordAdminFailedAttempt(testIp);
    expect(fifth.blocked).toBe(true);

    // Subsequent check confirms blocked
    const blockedCheck = checkAdminRateLimit(testIp);
    expect(blockedCheck.blocked).toBe(true);
    expect(blockedCheck.retryAfterSeconds).toBeGreaterThan(0);

    // Resetting unblocks immediately
    resetAdminRateLimit(testIp);
    const unblockedCheck = checkAdminRateLimit(testIp);
    expect(unblockedCheck.blocked).toBe(false);
  });
});

describe('Database Analytics & Telemetry Tracking', () => {
  const visitorA = `AX-TEST-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
  const visitorB = `AX-TEST-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

  it('records anonymous visitors safely without personal identity', () => {
    upsertVisitor({
      visitorId: visitorA,
      deviceType: 'Desktop',
      browser: 'Chrome',
      ip: '203.0.113.45',
    });

    upsertVisitor({
      visitorId: visitorB,
      deviceType: 'Mobile',
      browser: 'Safari',
      ip: '198.51.100.89',
    });

    const { visitors } = getVisitors({ limit: 50 });
    const foundA = visitors.find((v) => v.visitorId === visitorA);
    const foundB = visitors.find((v) => v.visitorId === visitorB);

    expect(foundA).toBeDefined();
    expect(foundA?.device).toBe('Desktop');
    expect(foundA?.browser).toBe('Chrome');
    expect(foundA?.maskedIp).toBe('203.0.XX.XX');

    expect(foundB).toBeDefined();
    expect(foundB?.device).toBe('Mobile');
    expect(foundB?.browser).toBe('Safari');
  });

  it('records download events and distinguishes first downloads from re-downloads', () => {
    const song1Id = `vid_test_${Math.random().toString(36).slice(2)}`;
    const song2Id = `vid_test_${Math.random().toString(36).slice(2)}`;

    // First download for song 1
    recordDownloadEvent({
      visitorId: visitorA,
      videoId: song1Id,
      title: 'Bohemian Rhapsody',
      creator: 'Queen',
      format: 'mp3',
      quality: 'high',
      status: 'downloaded',
      isRedownload: false,
    });

    // Second download (re-download) of same song
    recordDownloadEvent({
      visitorId: visitorA,
      videoId: song1Id,
      title: 'Bohemian Rhapsody',
      creator: 'Queen',
      format: 'mp3',
      quality: 'high',
      status: 'downloaded',
      isRedownload: true,
    });

    // Visitor B downloads another track
    recordDownloadEvent({
      visitorId: visitorB,
      videoId: song2Id,
      title: 'Hotel California',
      creator: 'Eagles',
      format: 'm4a',
      quality: 'best',
      status: 'downloaded',
      isRedownload: false,
    });

    const { events: downloads } = getDownloadEvents({ limit: 50 });
    const song1Events = downloads.filter((d) => d.videoId === song1Id);
    expect(song1Events.length).toBe(2);

    const reDownloadEvent = song1Events.find((d) => d.isRedownload);
    const firstDownloadEvent = song1Events.find((d) => !d.isRedownload);
    expect(reDownloadEvent).toBeDefined();
    expect(firstDownloadEvent).toBeDefined();
  });

  it('records playlist operations and tracks summary metrics', () => {
    recordPlaylistEvent({
      visitorId: visitorA,
      playlistId: 'PL_rock_classics',
      playlistTitle: 'Rock Classics 80s',
      trackCount: 20,
      selectedCount: 5,
      completedCount: 5,
      failedCount: 0,
    });

    const visitorDetails = getVisitorDetails(visitorA);
    expect(visitorDetails).toBeDefined();
    expect(visitorDetails?.downloads).toBeGreaterThanOrEqual(2);
    expect(visitorDetails?.playlists).toBeGreaterThanOrEqual(1);
    expect(visitorDetails?.recentDownloads.length).toBeGreaterThanOrEqual(1);
  });

  it('aggregates dashboard stats correctly', () => {
    const stats = getDashboardStats();
    expect(stats.totalDownloads).toBeGreaterThanOrEqual(3);
    expect(stats.uniqueVisitors).toBeGreaterThanOrEqual(2);
    expect(stats.successfulDownloads).toBeGreaterThanOrEqual(3);
    expect(stats.mp3Count).toBeGreaterThanOrEqual(2);
    expect(stats.m4aCount).toBeGreaterThanOrEqual(1);
  });

  it('produces chronological activity stream', () => {
    const activities = getRecentActivity(20);
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].timestamp).toBeDefined();
    expect(activities[0].visitorId).toBeDefined();
  });

  it('queries playlist session history via getPlaylistEvents', () => {
    const res = getPlaylistEvents(10, 0);
    expect(res).toBeDefined();
    expect(Array.isArray(res.playlists)).toBe(true);
    expect(res.total).toBeGreaterThanOrEqual(1);

    const first = res.playlists[0];
    expect(first.playlistTitle).toBe('Rock Classics 80s');
    expect(first.totalTracks).toBe(20);
    expect(first.selectedTracks).toBe(5);
    expect(first.completedTracks).toBe(5);
  });
});

