import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Linking, Platform, type ImageSourcePropType } from 'react-native';

import { storageApi } from '@/lib/api';
import { clearViewedFiles, viewingDirectory, viewingFileName } from '@/lib/viewed-files';

export { clearViewedFiles };

/**
 * Files live only in the app's PostgreSQL database. The app never keeps its
 * own copies: images stream from the API, and files opened, printed or shared
 * are downloaded into a temporary folder that is emptied before the next file
 * is opened, when the preview closes, at sign-out and at app start.
 */

/** A file attached to an app record. `objectPath` points at the copy stored in the app's database. */
export interface StoredFileRef {
  objectPath?: string;
  /** Legacy URI kept only for records created before database storage. */
  uri?: string;
  name: string;
  mimeType?: string;
}

/**
 * Returns a URI the device can open, print or share: a short-lived blob URL on
 * web, or a temporary download on native. Falls back to the legacy URI for
 * records created before database storage.
 */
export async function resolveStoredFileUri(file: StoredFileRef): Promise<string> {
  if (!file.objectPath) {
    if (file.uri) return file.uri;
    throw new Error('This file is missing its stored copy.');
  }
  if (Platform.OS === 'web') {
    const fetched = await storageApi.fetchObject(file.objectPath);
    if (!fetched) throw new Error('The file could not be downloaded.');
    return URL.createObjectURL(fetched.blob);
  }
  const directory = viewingDirectory();
  if (!directory) throw new Error('No temporary folder is available.');
  await clearViewedFiles();
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const downloaded = await storageApi.downloadObject(
    file.objectPath,
    `${directory}${viewingFileName(file.objectPath, file.name)}`,
  );
  if (!downloaded) throw new Error('The file could not be downloaded.');
  return downloaded;
}

/** Downloads a stored file temporarily and opens it with the device's viewer or share sheet. */
export async function openStoredFile(file: StoredFileRef): Promise<void> {
  const uri = await resolveStoredFileUri(file);
  if (Platform.OS === 'web') {
    window.open(uri, '_blank', 'noopener');
    if (uri.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(uri), 60_000);
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: file.mimeType, dialogTitle: file.name });
  } else {
    await Linking.openURL(uri);
  }
}

/**
 * Image source for a stored file. Native apps stream it from the API with the
 * sign-in token (nothing is written to disk); web uses an in-memory blob URL.
 */
export function useStoredFileSource(file: StoredFileRef | null | undefined): ImageSourcePropType | null {
  const objectPath = file?.objectPath;
  const legacyUri = file?.uri;
  const [source, setSource] = useState<ImageSourcePropType | null>(
    objectPath ? null : legacyUri ? { uri: legacyUri } : null,
  );

  useEffect(() => {
    if (!objectPath) {
      setSource(legacyUri ? { uri: legacyUri } : null);
      return;
    }
    let cancelled = false;
    let blobUri: string | null = null;
    setSource(null);
    const load = async () => {
      if (Platform.OS === 'web') {
        const fetched = await storageApi.fetchObject(objectPath);
        if (!fetched) return null;
        blobUri = URL.createObjectURL(fetched.blob);
        return { uri: blobUri };
      }
      const remote = await storageApi.objectSource(objectPath);
      return remote ? { uri: remote.uri, headers: remote.headers, cache: 'reload' as const } : null;
    };
    load()
      .then(next => {
        if (cancelled) {
          if (blobUri) URL.revokeObjectURL(blobUri);
          return;
        }
        setSource(next);
      })
      .catch(() => {
        if (!cancelled) setSource(null);
      });
    return () => {
      cancelled = true;
      if (blobUri) URL.revokeObjectURL(blobUri);
    };
  }, [objectPath, legacyUri]);

  return source;
}
