import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Platform, type ImageSourcePropType } from 'react-native';

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
  size?: number;
}

/** Extra details shown on the file preview screen. */
export interface StoredFilePreviewDetails {
  /** Where the file belongs, e.g. "HR Library · Policies". */
  context?: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export type StoredFileKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other';

export function storedFileKind(file: Pick<StoredFileRef, 'name' | 'mimeType'>): StoredFileKind {
  const mime = (file.mimeType || '').toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'].includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'm4v', 'webm'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'aac', 'ogg'].includes(ext)) return 'audio';
  if (mime.startsWith('text/') || ['txt', 'csv', 'json', 'md', 'log'].includes(ext)) return 'text';
  return 'other';
}

/** Route for the in-app preview screen, which offers preview, download, export, print and open. */
export function storedFilePreviewRoute(file: StoredFileRef, details: StoredFilePreviewDetails = {}) {
  const params: Record<string, string> = { name: file.name };
  if (file.objectPath) params.objectPath = file.objectPath;
  else if (file.uri) params.uri = file.uri;
  if (file.mimeType) params.mimeType = file.mimeType;
  if (file.size) params.size = String(file.size);
  if (details.context) params.context = details.context;
  if (details.uploadedBy) params.uploadedBy = details.uploadedBy;
  if (details.uploadedAt) params.uploadedAt = details.uploadedAt;
  return { pathname: '/(app)/document-preview', params } as const;
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

function triggerWebDownload(uri: string, name: string) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function revokeLater(uri: string, preloaded?: string) {
  if (uri !== preloaded && uri.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(uri), 60_000);
}

export type FileActionResult = 'done' | 'cancelled';

/**
 * Saves a copy of a stored file to a place the user chooses. This is an
 * explicit export by the user; the app itself keeps no copy.
 * `preloadedUri` reuses a file the preview already fetched.
 */
export async function downloadStoredFile(file: StoredFileRef, preloadedUri?: string): Promise<FileActionResult> {
  const uri = preloadedUri ?? await resolveStoredFileUri(file);
  if (Platform.OS === 'web') {
    triggerWebDownload(uri, file.name);
    revokeLater(uri, preloadedUri);
    return 'done';
  }
  if (Platform.OS === 'android') {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return 'cancelled';
    const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      file.name,
      file.mimeType || 'application/octet-stream',
    );
    const contents = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(targetUri, contents, { encoding: FileSystem.EncodingType.Base64 });
    return 'done';
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Saving is not supported on this device.');
  await Sharing.shareAsync(uri, { mimeType: file.mimeType, dialogTitle: `Save ${file.name}` });
  return 'done';
}

/** Sends a stored file to another app (email, WhatsApp, Drive, Files, AirDrop…). */
export async function exportStoredFile(file: StoredFileRef, preloadedUri?: string): Promise<FileActionResult> {
  const uri = preloadedUri ?? await resolveStoredFileUri(file);
  if (Platform.OS === 'web') {
    const webNavigator = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { title?: string; files?: File[] }) => Promise<void>;
    };
    try {
      const blob = await (await fetch(uri)).blob();
      const shared = new File([blob], file.name, { type: file.mimeType || blob.type });
      if (webNavigator.share && webNavigator.canShare?.({ files: [shared] })) {
        await webNavigator.share({ title: file.name, files: [shared] });
        return 'done';
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return 'cancelled';
    } finally {
      revokeLater(uri, preloadedUri);
    }
    triggerWebDownload(uri, file.name);
    return 'done';
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not supported on this device.');
  await Sharing.shareAsync(uri, { mimeType: file.mimeType, dialogTitle: `Export ${file.name}` });
  return 'done';
}

/** Prints a stored file. Images are wrapped in a page; PDFs print directly. */
export async function printStoredFile(file: StoredFileRef, preloadedUri?: string): Promise<void> {
  const uri = preloadedUri ?? await resolveStoredFileUri(file);
  const kind = storedFileKind(file);
  if (Platform.OS === 'web') {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    if (kind === 'image') {
      frame.srcdoc = `<html><body style="margin:0"><img src="${uri}" style="max-width:100%"></body></html>`;
    } else {
      frame.src = uri;
    }
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => {
        frame.remove();
        revokeLater(uri, preloadedUri);
      }, 60_000);
    };
    document.body.appendChild(frame);
    return;
  }
  if (kind === 'image') {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const mime = file.mimeType || 'image/jpeg';
    await Print.printAsync({
      html: `<html><body style="margin:0;text-align:center"><img src="data:${mime};base64,${base64}" style="max-width:100%;max-height:100vh"></body></html>`,
    });
    return;
  }
  await Print.printAsync({ uri });
}
