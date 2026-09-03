import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  MY_FOLDER_ALLOWED_ROLES,
  ROLE_COLORS,
  useApp,
  type MyFolderFile,
  type MyFolderSection,
  type Role,
} from '@/context/AppContext';
import { storageApi } from '@/lib/api';
import { useColors } from '@/hooks/useColors';

const SECTION_LABELS: Record<MyFolderSection, string> = {
  compliance: 'Compliance',
  legal: 'Legal Documents',
  projects: 'Projects',
  minutes: 'Minutes of Meetings',
  correspondences: 'Correspondences',
  general: 'General Library',
};

function formatSize(bytes: number): string {
  if (!bytes) return 'Size unavailable';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || '—' : date.toLocaleDateString();
}

function safeFileName(file: MyFolderFile): string {
  return `petrotrack-my-folder-${file.id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function isImageFile(file: MyFolderFile): boolean {
  return file.mimeType.startsWith('image/');
}

function isPdfFile(file: MyFolderFile): boolean {
  return file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export default function DocumentPreviewScreen() {
  const { fileId: rawFileId, section: rawSection } = useLocalSearchParams<{
    fileId?: string;
    section?: string;
  }>();
  const section = (Array.isArray(rawSection) ? rawSection[0] : rawSection) as MyFolderSection | undefined;
  const fileId = Number(Array.isArray(rawFileId) ? rawFileId[0] : rawFileId);
  const {
    role,
    myFolderFiles,
    myFolders,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const file = useMemo(
    () => myFolderFiles.find(candidate =>
      candidate.id === fileId
      && !candidate.deletedAt
      && (!section || candidate.section === section),
    ) ?? null,
    [fileId, myFolderFiles, section],
  );
  const canView = !!role && !!file && !!section
    && (section === 'general' || MY_FOLDER_ALLOWED_ROLES.includes(role as Role));
  const folderName = file?.folderId === null || file?.folderId === undefined
    ? 'Main folder'
    : myFolders.find(folder => folder.id === file.folderId)?.name ?? 'Folder';
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<'download' | 'print' | 'open' | 'share' | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    return () => {
      if (previewUri?.startsWith('blob:')) URL.revokeObjectURL(previewUri);
    };
  }, [previewUri]);

  useEffect(() => {
    setPreviewUri(null);
    setLoadError('');
  }, [file?.id]);

  async function loadFile(): Promise<string> {
    if (!file?.objectPath) throw new Error('This document is missing its stored file.');
    if (Platform.OS === 'web') {
      const fetched = await storageApi.fetchObject(file.objectPath);
      if (!fetched) throw new Error('The document could not be downloaded.');
      const uri = URL.createObjectURL(fetched.blob);
      setPreviewUri(current => {
        if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
        return uri;
      });
      return uri;
    }
    const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!root) throw new Error('No local file directory is available.');
    const destinationUri = `${root}${safeFileName(file)}`;
    const existing = await FileSystem.getInfoAsync(destinationUri);
    if (existing.exists) {
      setPreviewUri(destinationUri);
      return destinationUri;
    }
    const downloaded = await storageApi.downloadObject(file.objectPath, destinationUri);
    if (!downloaded) throw new Error('The document could not be downloaded.');
    setPreviewUri(downloaded);
    return downloaded;
  }

  async function ensurePreview() {
    if (previewUri) return previewUri;
    setLoading(true);
    setLoadError('');
    try {
      return await loadFile();
    } catch {
      setLoadError('This file could not be loaded from secure storage.');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function openFile() {
    if (!file) return;
    setBusyAction('open');
    try {
      const uri = await ensurePreview();
      if (!uri) return;
      if (Platform.OS === 'web') {
        window.open(uri, '_blank', 'noopener,noreferrer');
      } else {
        const openUri = Platform.OS === 'android' ? await FileSystem.getContentUriAsync(uri) : uri;
        try {
          await Linking.openURL(openUri);
        } catch {
          await Sharing.shareAsync(uri, { dialogTitle: `Open ${file.name}` });
        }
      }
    } catch {
      Alert.alert('Open unavailable', 'This file could not be opened on the device.');
    } finally {
      setBusyAction(null);
    }
  }

  async function downloadFile() {
    if (!file) return;
    setBusyAction('download');
    try {
      const uri = await ensurePreview();
      if (!uri) return;
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = file.name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return;
        const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          file.name,
          file.mimeType || 'application/octet-stream',
        );
        const contents = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(targetUri, contents, {
          encoding: FileSystem.EncodingType.Base64,
        });
        Alert.alert('Downloaded', `${file.name} was saved to the selected folder.`);
      } else {
        await Sharing.shareAsync(uri, { dialogTitle: `Save ${file.name}` });
      }
    } catch {
      Alert.alert('Download failed', 'The document could not be saved to this device.');
    } finally {
      setBusyAction(null);
    }
  }

  async function printFile() {
    if (!file) return;
    setBusyAction('print');
    try {
      const uri = await ensurePreview();
      if (!uri) return;
      await Print.printAsync({ uri });
    } catch {
      Alert.alert('Print unavailable', 'This document could not be sent to a printer.');
    } finally {
      setBusyAction(null);
    }
  }

  async function shareFile() {
    if (!file) return;
    setBusyAction('share');
    try {
      const uri = await ensurePreview();
      if (!uri) return;
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(uri, { dialogTitle: `Share ${file.name}` });
    } catch {
      Alert.alert('Share failed', 'The document could not be shared.');
    } finally {
      setBusyAction(null);
    }
  }

  if (!canView || !file || !section) {
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
  const imagePreview = isImageFile(file) && !!previewUri;

  return (
    <ScreenLayout title="File preview">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.fileHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.fileIcon, { backgroundColor: roleColor + '18' }]}>
            <Ionicons name={isImageFile(file) ? 'image-outline' : isPdfFile(file) ? 'document-text-outline' : 'document-outline'} size={25} color={roleColor} />
          </View>
          <View style={styles.fileHeroCopy}>
            <Text style={[styles.eyebrow, { color: roleColor }]}>Selected file</Text>
            <Text style={[styles.fileTitle, { color: colors.text }]}>{file.name}</Text>
            <Text style={[styles.fileSubtitle, { color: colors.textMuted }]}>
              {SECTION_LABELS[section]} · {folderName}
            </Text>
          </View>
        </View>

        <View style={[styles.previewSurface, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {imagePreview ? (
            <Image source={{ uri: previewUri }} style={styles.image} resizeMode="contain" />
          ) : (
            <>
              <View style={[styles.filePlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Ionicons name={isPdfFile(file) ? 'document-text' : 'document-attach'} size={46} color={roleColor} />
                <Text style={[styles.placeholderTitle, { color: colors.text }]}>
                  {loading ? 'Loading file…' : 'File ready to view'}
                </Text>
                <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                  {isPdfFile(file)
                    ? 'Open this PDF in a new browser tab or your device PDF viewer.'
                    : 'Use Open to view this file with the app installed on your device.'}
                </Text>
              </View>
              {!previewUri && (
                <TouchableOpacity
                  onPress={() => void ensurePreview()}
                  disabled={actionDisabled}
                  style={[styles.loadPreviewButton, { backgroundColor: roleColor }]}
                >
                  <Ionicons name="eye-outline" size={16} color="#fff" />
                  <Text style={styles.loadPreviewText}>{loading ? 'Loading…' : 'Load preview'}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {!!loadError && <Text style={[styles.errorText, { color: colors.error }]}>{loadError}</Text>}
        </View>

        <View style={styles.actionGrid}>
          <ActionButton icon="download-outline" label="Download" onPress={downloadFile} disabled={actionDisabled} color={roleColor} colors={colors} />
          <ActionButton icon="print-outline" label="Print" onPress={printFile} disabled={actionDisabled} color={roleColor} colors={colors} />
          <ActionButton icon="open-outline" label="Open" onPress={openFile} disabled={actionDisabled} color={roleColor} colors={colors} />
          <ActionButton icon="share-outline" label="Share" onPress={shareFile} disabled={actionDisabled} color={roleColor} colors={colors} />
        </View>

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

function ActionButton({
  icon, label, onPress, disabled, color, colors,
}: {
  icon: string;
  label: string;
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
      <Ionicons name={icon as any} size={17} color={disabled ? colors.textSubtle : color} />
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
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
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