import { AppState } from 'react-native';

import { startForegroundTimer } from '@/lib/foreground-timer';

type TestAppState = typeof AppState & {
  __emitChange: (state: string) => void;
};

describe('startForegroundTimer', () => {
  const appState = AppState as TestAppState;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs on a standard timer while active and catches up on resume', async () => {
    const callback = jest.fn();
    const stop = startForegroundTimer({
      delayMs: 100,
      callback,
      runOnResume: true,
    });

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);

    appState.__emitChange('background');
    jest.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);

    appState.__emitChange('active');
    expect(callback).toHaveBeenCalledTimes(2);

    stop();
    jest.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('can defer the first run and resume refresh', () => {
    const callback = jest.fn();
    const stop = startForegroundTimer({
      delayMs: 100,
      callback,
      runOnResume: false,
    });

    appState.__emitChange('background');
    appState.__emitChange('active');
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
  });
});