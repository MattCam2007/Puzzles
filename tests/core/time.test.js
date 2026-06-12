import { describe, it, expect, vi } from 'vitest';
import { formatTime, createTicker } from '../../js/core/time.js';

describe('formatTime', () => {
  it('formats zero', () => expect(formatTime(0)).toBe('0:00'));
  it('pads single-digit seconds', () => expect(formatTime(61)).toBe('1:01'));
  it('handles exact minutes', () => expect(formatTime(600)).toBe('10:00'));
  it('handles 59 seconds', () => expect(formatTime(59)).toBe('0:59'));
  it('handles long times', () => expect(formatTime(3661)).toBe('61:01'));
});

describe('createTicker', () => {
  it('ticks on the interval and stops cleanly', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const ticker = createTicker(onTick, 1000);
    expect(ticker.running).toBe(false);
    ticker.start();
    expect(ticker.running).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(onTick).toHaveBeenCalledTimes(3);
    ticker.stop();
    vi.advanceTimersByTime(3000);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(ticker.running).toBe(false);
    vi.useRealTimers();
  });

  it('restarting does not double-tick', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const ticker = createTicker(onTick, 1000);
    ticker.start();
    ticker.start();
    vi.advanceTimersByTime(2000);
    expect(onTick).toHaveBeenCalledTimes(2);
    ticker.stop();
    vi.useRealTimers();
  });
});
