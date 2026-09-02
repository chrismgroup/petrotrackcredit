import { AppState } from 'react-native';

type TimerHandle = ReturnType<typeof setTimeout>;

export interface ForegroundTimerOptions {
  delayMs: number;
  callback: () => void | Promise<void>;
  runImmediately?: boolean;
  runOnResume?: boolean;
  onError?: (error: unknown) => void;
}

function isForeground(): boolean {
  // React Native Web and the Jest AppState shim can omit currentState. Treat
  // that as active so the scheduler has the same behavior as a normal JS
  // timer on platforms without an AppState value.
  return AppState.currentState == null || AppState.currentState === 'active';
}

/**
 * Schedule work only while the app is in the foreground.
 *
 * This deliberately uses the standard JS timer APIs supported by Expo on
 * iOS, Android, and web. Native background execution is not a reliable
 * contract for polling: when the OS suspends the app, work resumes from the
 * next AppState "active" event instead.
 */
export function startForegroundTimer({
  delayMs,
  callback,
  runImmediately = false,
  runOnResume = true,
  onError,
}: ForegroundTimerOptions): () => void {
  let stopped = false;
  let foreground = isForeground();
  let running = false;
  let timer: TimerHandle | undefined;

  const clearScheduled = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const schedule = () => {
    if (stopped || !foreground || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delayMs);
  };

  const run = async () => {
    if (stopped || !foreground || running) return;
    running = true;
    try {
      await callback();
    } catch (error) {
      onError?.(error);
    } finally {
      running = false;
      schedule();
    }
  };

  const appStateSubscription = AppState.addEventListener('change', state => {
    const wasForeground = foreground;
    foreground = state === 'active';
    if (!foreground) {
      clearScheduled();
      return;
    }
    if (!wasForeground && runOnResume) {
      void run();
    } else {
      schedule();
    }
  });

  if (foreground) {
    if (runImmediately) {
      void run();
    } else {
      schedule();
    }
  }

  return () => {
    stopped = true;
    clearScheduled();
    appStateSubscription.remove();
  };
}