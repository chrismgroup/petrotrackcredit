import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/** Temporary copies of database files opened on this device. */
const VIEWING_FOLDER = 'petrotrack-viewing/';
// Names used by earlier app versions that cached downloads permanently.
const LEGACY_CACHE_PREFIXES = ['petrotrack-my-folder-', 'petrotrack-'];

export function viewingDirectory(): string | null {
  const root = FileSystem.cacheDirectory;
  return root ? `${root}${VIEWING_FOLDER}` : null;
}

export function viewingFileName(objectPath: string, name: string): string {
  const id = objectPath.split('/').pop() ?? 'file';
  return `${id}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

/** Deletes every temporary copy of a database file from this device. */
export async function clearViewedFiles(): Promise<void> {
  if (Platform.OS === 'web') return;
  const root = FileSystem.cacheDirectory;
  if (!root) return;
  try {
    await FileSystem.deleteAsync(`${root}${VIEWING_FOLDER}`, { idempotent: true });
    const entries = await FileSystem.readDirectoryAsync(root);
    await Promise.all(entries
      .filter(entry => LEGACY_CACHE_PREFIXES.some(prefix => entry.startsWith(prefix)))
      .map(entry => FileSystem.deleteAsync(`${root}${entry}`, { idempotent: true })));
  } catch {
    // Best effort: the operating system also clears the cache directory.
  }
}
