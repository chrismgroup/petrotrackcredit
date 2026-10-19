import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  MY_FOLDER_ALLOWED_ROLES,
  ROLE_COLORS,
  useApp,
  type MyFolderSection,
  type Role,
} from '@/context/AppContext';
import {
  clearViewedFiles,
  downloadStoredFile,
  exportStoredFile,
  printStoredFile,
  resolveStoredFileUri,
  storedFileKind,
  type StoredFileKind,
  type StoredFileRef,
} from '@/lib/stored-files';
import { useColors } from '@/hooks/useColors';

const SECTION_LABELS: Record<MyFolderSection, string> = {
  compliance: 'Compliance',
  legal: 'Legal Documents',
  projects: 'Projects',
  minutes: 'Minutes of Meetings',
  correspondences: 'Correspondences',
  general: 'General Library',
};

const KIND_ICONS: Record<StoredFileKind, string> = {
  image: 'image-outline',
  pdf: 'document-text-outline',
  video: 'videocam-outline',
  audio: 'musical-notes-outline',
  text: 'reader-outline',
  other: 'document-outline',
};

type BusyAction = 'download' | 'export' | 'print' | 'open';

interface PreviewFile extends StoredFileRef {
  context: string;
  uploadedBy?: string;
  uploadedAt?: string;
  expiresAt?: string;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatSize(bytes?: number): string {
  if (!bytes) return 'Size unavailable';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Browsers can show these inline; native apps show images inline and open the rest in the device viewer. */
function canPreviewInline(kind: StoredFileKind): boolean {
  if (kind === 'image') return true;
  return Platform.OS === 'web' && kind !== 'other';
}

export default function DocumentPreviewScreen() {
  const params = useLocalSearchParams<{
    fileId?: string;
    section?: string;
    objectPath?: string;
    uri?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    context?: string;
    uploadedBy?: string;
    uploadedAt?: string;
  }>();
  const section = first(params.section) as MyFolderSection | undefined;
  const rawFileId = first(params.fileId);
  const { role, myFolderFiles, myFolders } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;

  const file = useMemo<PreviewFile | null>(() => {
    if (rawFileId) {
      const fileId = Number(rawFileId);
      const folderFile = myFolderFiles.find(candidate =>
        candidate.id === fileId
        && !candidate.deletedAt
        && (!section || candidate.section === section),
      );
      if (!folderFile || !section || !role) return null;
      if (section !== 'general' && !MY_FOLDER_ALLOWED_ROLES.includes(role as Role)) return null;
      const folderName = folderFile.folderId === null || folderFile.folderId === undefined
        ? 'Main folder'
        : myFolders.find(folder => folder.id === folderFile.folderId)?.name ?? 'Folder';
      return {
        objectPath: folderFile.objectPath,
        name: folderFile.name,
        mimeType: folderFile.mimeType,
        size: folderFile.size,
        context: `My Folders · ${SECTION_LABELS[section]} · ${folderName}`,
        uploadedBy: folderFile.uploadedBy,
        uploadedAt: folderFile.uploadedAt,
        expiresAt: folderFile.expiresAt,
      };
    }
    const name = first(params.name);
    const objectPath = first(params.objectPath);
    const legacyUri = first(params.uri);
    if (!role || !name || (!objectPath && !legacyUri)) return null;
    const size = Number(first(params.size));
    return {
      objectPath,
      uri: objectPath ? undefined : legacyUri,
      name,
      mimeType: first(params.mimeType),
      size: Number.isFinite(size) && size > 0 ? size : undefined,
      context: first(params.context) || 'Uploaded file',
      uploadedBy: first(params.uploadedBy),
      uploadedAt: first(params.uploadedAt),
    };
  }, [rawFileId, section, role, myFolderFiles, myFolders, params.name, params.objectPath, params.uri, params.mimeType, params.size, params.context, params.uploadedBy, params.uploadedAt]);

  const fileKey = file ? `${file.objectPath ?? file.uri}:${file.name}` : '';
  const kind = file ? storedFileKind(file) : 'other';
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    return () => {
      if (previewUri?.startsWith('blob:')) URL.revokeObjectURL(previewUri);
    };
  }, [previewUri]);

  useEffect(() => () => { void clearViewedFiles(); }, []);

  const loadFile = useCallback(async (): Promise<string | null> => {
    if (!file) return null;
    setLoading(true);
    setLoadError('');
    try {
      const uri = await resolveStoredFileUri(file);
      setPreviewUri(current => {
        if (current?.startsWith('blob:') && current !== uri) URL.revokeObjectURL(current);
        return uri;
      });
      return uri;
    } catch {
      setLoadError('This file could not be loaded from the database. Check your connection and try again.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fileKey]);

  useEffect(() => {
    setPreviewUri(null);
    setLoadError('');
    if (file && canPreviewInline(storedFileKind(file))) void loadFile();
  }, [fileKey]);

  async function ensureFile(): Promise<string | null> {
    return previewUri ?? await loadFile();
  }

  async function runAction(action: BusyAction, task: (uri: string) => Promise<void>, failure: [string, string]) {
    if (!file) return;
    setBusyAction(action);
    try {
      const uri = await ensureFile();
      if (!uri) return;
      await task(uri);
    } catch (error) {
      Alert.alert(failure[0], error instanceof Error && error.message ? error.message : failure[1]);
    } finally {
      setBusyAction(null);
    }
  }

  const downloadFile = () => runAction('download', async uri => {
    const result = await downloadStoredFile(file!, uri);
    if (result === 'done' && Platform.OS === 'android') {
      Alert.alert('Downloaded', `${file!.name} was saved to the selected folder.`);
    }
  }, ['Download failed', 'The file could not be saved to this device.']);

  const exportFile = () => runAction('export', async uri => {
    await exportStoredFile(file!, uri);
  }, ['Export failed', 'The file could not be exported.']);

  const printFile = () => runAction('print', async uri => {
    await printStoredFile(file!, uri);
  }, ['Print unavailable', 'This file could not be sent to a printer.']);

  const openFile = () => runAction('open', async uri => {
    if (Platform.OS === 'web') {
      window.open(uri, '_blank', 'noopener,noreferrer');
      return;
    }
    const openUri = Platform.OS === 'android' ? await FileSystem.getContentUriAsync(uri) : uri;
    try {
      await Linking.openURL(openUri);
    } catch {
      await Sharing.shareAsync(uri, { mimeType: file!.mimeType, dialogTitle: `Open ${file!.name}` });
    }
  }, ['Open unavailable', 'This file could not be opened on the device.']);

  if (!file) {
    return (
      <ScreenLayout title="File preview">
        <View style={styles.emptyPage}>
          <Ionicons name="document-lock-outline" size={42} color={colors.textSubtle} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>File unavailable</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            This file may have been removed or you may not have permission to view it.
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  const actionDisabled = loading || !!busyAction;
  const showInline = !!previewUri && canPreviewInline(kind);

  return (
    <ScreenLayout title="File preview">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.fileHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.fileIcon, { backgroundColor: roleColor + '18' }]}>
            <Ionicons name={KIND_ICONS[kind] as any} size={25} color={roleColor} />
          </View>
          <View style={styles.fileHeroCopy}>
            <Text style={[styles.eyebrow, { color: roleColor }]}>{file.context}</Text>
            <Text style={[styles.fileTitle, { color: colors.text }]}>{file.name}</Text>
            <Text style={[styles.fileSubtitle, { color: colors.textMuted }]}>
              {formatSize(file.size)} · Stored securely in the Petrotrack database
            </Text>
          </View>
        </View>

        <View style={[styles.previewSurface, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {showInline && kind === 'image' ? (
            <Image source={{ uri: previewUri! }} style={styles.image} resizeMode="contain" accessibilityLabel={file.name} />
          ) : showInline ? (
            <WebInlinePreview uri={previewUri!} kind={kind} name={file.name} />
          ) : (
            <>
              <View style={[styles.filePlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {loading ? (
                  <ActivityIndicator color={roleColor} />
                ) : (
                  <Ionicons name={KIND_ICONS[kind] as any} size={46} color={roleColor} />
                )}
                <Text style={[styles.placeholderTitle, { color: colors.text }]}>
                  {loading ? 'Loading file…' : previewUri ? 'File ready' : 'Preview this file'}
                </Text>
                <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                  {kind === 'pdf'
                    ? 'Tap Open to read this PDF in your device PDF viewer.'
                    : 'Tap Open to view this file with an app on your device, or Download / Export a copy.'}
                </Text>
              </View>
              {!previewUri && !loading && (
                <TouchableOpacity
                  onPress={() => void openFile()}
                  disabled={actionDisabled}
                  style={[styles.loadPreviewButton, { backgroundColor: roleColor }]}
                >
                  <Ionicons name="eye-outline" size={16} color="#fff" />
                  <Text style={styles.loadPreviewText}>Open preview</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {!!loadError && (
            <>
              <Text style={[styles.errorText, { color: colors.error }]}>{loadError}</Text>
              <TouchableOpacity onPress={() => void loadFile()} style={[styles.loadPreviewButton, { backgroundColor: roleColor }]}>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.loadPreviewText}>Try again</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.actionGrid}>
          <ActionButton icon="download-outline" label="Download" busy={busyAction === 'download'} onPress={downloadFile} disabled={actionDisabled} color={roleColor} colors={colors} />
          <ActionButton icon="share-outline" label="Export" busy={busyAction === 'export'} onPress={exportFile} disabled={actionDisabled} color={roleColor} colors={colors} />
          <ActionButton icon="print-outline" label="Print" busy={busyAction === 'print'} onPress={printFile} disabled={actionDisabled} color={roleColor} colors={colors} />
          <ActionButton icon="open-outline" label="Open" busy={busyAction === 'open'} onPress={openFile} disabled={actionDisabled} color={roleColor} colors={colors} />
        </View>
        <Text style={[styles.hint, { color: colors.textSubtle }]}>
          Download saves a copy where you choose. Export sends it to email, WhatsApp, Drive or another app.
        </Text>

        <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.detailsTitle, { color: colors.text }]}>File details</Text>
          <DetailRow label="Type" value={file.mimeType || 'Unknown'} colors={colors} />
          <DetailRow label="Size" value={formatSize(file.size)} colors={colors} />
          <DetailRow label="Uploaded by" value={file.uploadedBy || '—'} colors={colors} />
          <DetailRow label="Uploaded" value={formatDate(file.uploadedAt)} colors={colors} />
          {file.expiresAt && <DetailRow label="Expires" value={formatDate(file.expiresAt)} colors={colors} />}
        </View>
        <View style={styles.bottomSpace} />
      </ScrollView>
    </ScreenLayout>
  );
}

/** Web-only inline viewer for PDFs, text, video and audio. */
function WebInlinePreview({ uri, kind, name }: { uri: string; kind: StoredFileKind; name: string }) {
  if (kind === 'video') {
    return React.createElement('video', { src: uri, controls: true, style: { width: '100%', maxHeight: 480, borderRadius: 11, background: '#101418' } });
  }
  if (kind === 'audio') {
    return React.createElement('audio', { src: uri, controls: true, style: { width: '100%' } });
  }
  return React.createElement('iframe', {
    src: uri,
    title: name,
    style: { width: '100%', height: 560, border: 0, borderRadius: 11, background: '#fff' },
  });
}

function ActionButton({
  icon, label, onPress, disabled, color, colors, busy,
}: {
  icon: string;
  label: string;
  busy?: boolean;
  onPress: () => void;
  disabled: boolean;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: disabled ? colors.border : color }]}
    >
      {busy
        ? <ActivityIndicator size="small" color={color} />
        : <Ionicons name={icon as any} size={17} color={disabled ? colors.textSubtle : color} />}
      <Text style={[styles.actionLabel, { color: disabled ? colors.textSubtle : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 14 },
  fileHero: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 10 },
  fileIcon: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  fileHeroCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  fileTitle: { fontSize: 18, fontWeight: '800', marginTop: 3 },
  fileSubtitle: { fontSize: 11, marginTop: 4 },
  previewSurface: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  image: { width: '100%', height: 360, borderRadius: 11, backgroundColor: '#101418' },
  filePlaceholder: { minHeight: 260, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, padding: 24 },
  placeholderTitle: { fontSize: 16, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  placeholderText: { fontSize: 12, lineHeight: 17, marginTop: 5, maxWidth: 280, textAlign: 'center' },
  loadPreviewButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, paddingVertical: 11, marginTop: 10 },
  loadPreviewText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  errorText: { fontSize: 11, lineHeight: 16, marginTop: 9, textAlign: 'center' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  hint: { fontSize: 11, lineHeight: 15, textAlign: 'center', marginBottom: 10 },
  actionButton: { flexGrow: 1, minWidth: '46%', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 11, borderWidth: 1 },
  actionLabel: { fontSize: 12, fontWeight: '800' },
  detailsCard: { borderRadius: 15, borderWidth: 1, padding: 14 },
  detailsTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  detailLabel: { width: 82, fontSize: 11 },
  detailValue: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  emptyPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyText: { maxWidth: 340, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  bottomSpace: { height: 24 },
});