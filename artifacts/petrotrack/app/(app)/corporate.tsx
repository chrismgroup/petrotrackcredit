import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  CorpApproval, CorpAttachment, CorpProject, CorpRecordType,
  LegalMatter, MeetingMinutes, MyFolder, MyFolderFile, MyFolderSection,
  MY_FOLDER_ALLOWED_ROLES, ROLE_COLORS, fmtDate, fmtDateTime, useApp,
  type Role,
} from '@/context/AppContext';
import { MAX_UPLOAD_BYTES, storageApi, uploadFailureMessage } from '@/lib/api';
import { resolveStoredFileUri } from '@/lib/stored-files';
import { useColors } from '@/hooks/useColors';

// ── Compliance helpers ──────────────────────────────────────────────────────
function daysLeft(exp: string) {
  return Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
}
function getDocStatus(days: number) {
  if (days < 0)  return { label: 'Expired',       color: '#365A47', bg: '#E9F0EB' };
  if (days < 14) return { label: `${days}d left`,  color: '#365A47', bg: '#E9F0EB' };
  if (days < 30) return { label: `${days}d left`,  color: '#71805B', bg: '#EEF2E4' };
  return             { label: `${days}d left`,  color: '#1F6848', bg: '#E5F1E9' };
}

// ── File-type helpers ───────────────────────────────────────────────────────
const ATT_FILE_TYPES = [
  { key: 'pdf',   label: 'PDF',   icon: 'document-text', color: '#365A47' },
  { key: 'docx',  label: 'DOCX',  icon: 'document',      color: '#286247' },
  { key: 'xlsx',  label: 'XLSX',  icon: 'grid',          color: '#1F6848' },
  { key: 'pptx',  label: 'PPTX',  icon: 'easel',         color: '#71805B' },
  { key: 'img',   label: 'Image', icon: 'image',         color: '#315F49' },
  { key: 'mp4',   label: 'Video', icon: 'videocam',      color: '#52705D' },
  { key: 'audio', label: 'Audio', icon: 'musical-notes', color: '#1F6848' },
  { key: 'zip',   label: 'ZIP',   icon: 'archive',       color: '#315F49' },
  { key: 'other', label: 'Other', icon: 'attach',        color: '#7F8C8D' },
] as const;
const FILE_TYPE_MAP: Record<string, { icon: string; color: string }> = Object.fromEntries(
  ATT_FILE_TYPES.map(t => [t.key, { icon: t.icon, color: t.color }])
);

function attachmentType(fileName: string, mimeType?: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return 'img';
  if (mimeType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 'mp4';
  if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return 'docx';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'xlsx';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'pptx';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
  return 'other';
}

function formatAttachmentSize(bytes: number): string {
  if (!bytes) return 'Size unavailable';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function expiryDays(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000);
}

function expiryLabel(expiresAt?: string): string | null {
  const days = expiryDays(expiresAt);
  if (days === null) return null;
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days}d`;
}

type Colors = ReturnType<typeof useColors>;

export function FolderWorkspacePanel({
  section, folders, files, roleColor, colors, userName, addFolder, addFile,
  removeFile, replaceFile, canManage,
}: {
  section: MyFolderSection;
  folders: MyFolder[];
  files: MyFolderFile[];
  roleColor: string;
  colors: Colors;
  userName: string;
  addFolder: (section: MyFolderSection, name: string) => void;
  addFile: (file: Omit<MyFolderFile, 'id' | 'uploadedAt'>) => void;
  removeFile: (id: number) => void;
  replaceFile: (id: number, file: Omit<MyFolderFile, 'id' | 'uploadedAt'>) => void;
  canManage: boolean;
}) {
  const router = useRouter();
  const [folderName, setFolderName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyFileId, setBusyFileId] = useState<number | null>(null);
  const [showUploadDetails, setShowUploadDetails] = useState(false);
  const [documentKind, setDocumentKind] = useState<'certificate' | 'document'>('document');
  const [expiryDate, setExpiryDate] = useState('');
  const { fileId: routeFileId, section: routeSection } = useLocalSearchParams<{ fileId?: string; section?: string }>();
  const focusedFileId = typeof routeFileId === 'string' && Number.isFinite(Number(routeFileId))
    ? Number(routeFileId)
    : null;
  const sectionFolders = folders.filter(f => f.section === section);
  const sectionFiles = files.filter(f =>
    !f.deletedAt && f.section === section && f.folderId === selectedFolderId,
  );
  const expiringFiles = files.filter(file => {
    const days = expiryDays(file.expiresAt);
    return !file.deletedAt && file.section === section && days !== null && days <= 90;
  });

  useEffect(() => {
    if (focusedFileId === null || routeSection !== section) return;
    const focusedFile = files.find(file => file.id === focusedFileId && file.section === section && !file.deletedAt);
    if (focusedFile) setSelectedFolderId(focusedFile.folderId);
  }, [files, focusedFileId, routeSection, section]);

  function getLocalFile(file: MyFolderFile): Promise<string> {
    if (!file.objectPath) return Promise.reject(new Error('This document is missing its stored file.'));
    return resolveStoredFileUri({ objectPath: file.objectPath, name: file.name, mimeType: file.mimeType });
  }

  async function previewDocument(file: MyFolderFile) {
    router.push({
      pathname: '/(app)/document-preview',
      params: { fileId: String(file.id), section },
    } as never);
  }

  async function downloadDocument(file: MyFolderFile) {
    setBusyFileId(file.id);
    try {
      const uri = await getLocalFile(file);
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = file.name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(uri), 1000);
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
      setBusyFileId(null);
    }
  }

  async function printDocument(file: MyFolderFile) {
    setBusyFileId(file.id);
    try {
      const uri = await getLocalFile(file);
      await Print.printAsync({ uri });
    } catch {
      Alert.alert('Print unavailable', 'This document could not be sent to a printer.');
    } finally {
      setBusyFileId(null);
    }
  }

  async function shareDocument(file: MyFolderFile) {
    setBusyFileId(file.id);
    try {
      const uri = await getLocalFile(file);
      if (Platform.OS === 'web') {
        const webNavigator = navigator as Navigator & {
          share?: (data: { title?: string; url?: string }) => Promise<void>;
        };
        if (webNavigator.share) {
          await webNavigator.share({ title: file.name, url: uri });
        } else {
          window.open(uri, '_blank', 'noopener,noreferrer');
        }
        setTimeout(() => URL.revokeObjectURL(uri), 1000);
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(uri, { dialogTitle: `Share ${file.name}` });
    } catch {
      Alert.alert('Share failed', 'The document could not be shared.');
    } finally {
      setBusyFileId(null);
    }
  }

  function createFolder() {
    const name = folderName.trim();
    if (!name) {
      Alert.alert('Required', 'Enter a name for the new folder.');
      return;
    }
    addFolder(section, name);
    setFolderName('');
  }

  async function pickAndUploadFile(metadata: Pick<MyFolderFile, 'documentKind' | 'expiresAt'>): Promise<Omit<MyFolderFile, 'id' | 'uploadedAt'> | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return null;

      const file = result.assets[0];
      setUploading(true);
      const upload = await storageApi.uploadFile(file, {
        category: 'my_folder',
        relatedId: `${section}:${selectedFolderId ?? 'main'}`,
      });

      return {
        section,
        folderId: selectedFolderId,
        name: file.name,
        objectPath: upload.objectPath,
        mimeType: upload.mimeType,
        size: upload.size,
        uploadedBy: userName || 'System',
        ...metadata,
      };
    } catch (error) {
      Alert.alert('Upload failed', uploadFailureMessage(error));
      return null;
    } finally {
      setUploading(false);
    }
  }

  function openUploadDetails() {
    setDocumentKind('document');
    setExpiryDate('');
    setShowUploadDetails(true);
  }

  async function uploadNewFile() {
    const normalizedExpiry = expiryDate.trim();
    if (normalizedExpiry && Number.isNaN(new Date(normalizedExpiry).getTime())) {
      Alert.alert('Check the expiry date', 'Use a valid date in YYYY-MM-DD format, or leave it blank.');
      return;
    }
    setShowUploadDetails(false);
    const uploaded = await pickAndUploadFile({
      documentKind,
      ...(normalizedExpiry ? { expiresAt: normalizedExpiry } : {}),
    });
    if (!uploaded) return;
    addFile(uploaded);
    Alert.alert('Uploaded', `${uploaded.name} was added to ${selectedFolderId === null ? 'the main folder' : 'the selected folder'}.`);
  }

  async function replaceExistingFile(existing: MyFolderFile) {
    const replacement = await pickAndUploadFile({
      documentKind: existing.documentKind ?? 'document',
      ...(existing.expiresAt ? { expiresAt: existing.expiresAt } : {}),
    });
    if (!replacement) return;

    if (existing.objectPath && !(await storageApi.deleteObject(existing.objectPath))) {
      if (replacement.objectPath) await storageApi.deleteObject(replacement.objectPath);
      throw new Error('The existing document could not be removed');
    }

    replaceFile(existing.id, replacement);
    Alert.alert('Replaced', `${existing.name} was replaced with ${replacement.name}.`);
  }

  function confirmReplace(file: MyFolderFile) {
    Alert.alert(
      'Replace document',
      `Choose a new file to replace "${file.name}". The old document will be removed after the new upload succeeds.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose replacement',
          onPress: () => {
            void replaceExistingFile(file).catch(() => {
              Alert.alert('Replace failed', 'The existing document was kept. Please try again.');
            });
          },
        },
      ],
    );
  }

  function confirmDelete(file: MyFolderFile) {
    Alert.alert(
      'Delete document',
      `Remove "${file.name}" from this folder? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (file.objectPath && !(await storageApi.deleteObject(file.objectPath))) {
                Alert.alert('Delete failed', 'The document could not be removed from storage.');
                return;
              }
              removeFile(file.id);
              Alert.alert('Deleted', `${file.name} was removed.`);
            })();
          },
        },
      ],
    );
  }

  return (
    <View style={[sty.workspacePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={sty.workspaceHeader}>
        <View style={[sty.workspaceIcon, { backgroundColor: roleColor + '18' }]}>
          <Ionicons name="folder-open-outline" size={19} color={roleColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sty.workspaceTitle, { color: colors.text }]}>Shared folders and files</Text>
          <Text style={[sty.workspaceSub, { color: colors.textMuted }]}>
            Anyone authorized to view this folder can preview, download, print or share its files.
          </Text>
        </View>
      </View>

      <View style={[sty.workspaceStats, { backgroundColor: colors.background }]}>
        <View>
          <Text style={[sty.workspaceStatNumber, { color: roleColor }]}>{sectionFolders.length + 1}</Text>
          <Text style={[sty.workspaceStatLabel, { color: colors.textMuted }]}>folders</Text>
        </View>
        <View style={[sty.workspaceStatDivider, { backgroundColor: colors.border }]} />
        <View>
          <Text style={[sty.workspaceStatNumber, { color: roleColor }]}>{files.filter(file => !file.deletedAt && file.section === section).length}</Text>
          <Text style={[sty.workspaceStatLabel, { color: colors.textMuted }]}>files</Text>
        </View>
        <View style={[sty.workspaceStatDivider, { backgroundColor: colors.border }]} />
        <View>
          <Text style={[sty.workspaceStatNumber, { color: expiringFiles.length ? colors.warning : roleColor }]}>{expiringFiles.length}</Text>
          <Text style={[sty.workspaceStatLabel, { color: colors.textMuted }]}>due soon</Text>
        </View>
      </View>

      {canManage && (
        <View style={sty.folderCreateRow}>
          <TextInput
            value={folderName}
            onChangeText={setFolderName}
            placeholder="New folder name"
            placeholderTextColor={colors.textSubtle}
            style={[sty.folderInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
          />
          <TouchableOpacity onPress={createFolder} style={[sty.folderCreateBtn, { backgroundColor: roleColor }]}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={sty.folderCreateTxt}>Folder</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[sty.workspaceFilesLabel, { color: colors.textMuted }]}>Browse folders</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sty.folderTiles}>
        <TouchableOpacity
          onPress={() => setSelectedFolderId(null)}
          style={[sty.folderTile, { backgroundColor: selectedFolderId === null ? roleColor + '18' : colors.background, borderColor: selectedFolderId === null ? roleColor : colors.border }]}
        >
          <Ionicons name="folder-open-outline" size={26} color={selectedFolderId === null ? roleColor : colors.textMuted} />
          <Text style={[sty.folderTileTitle, { color: selectedFolderId === null ? roleColor : colors.text }]} numberOfLines={1}>Main folder</Text>
          <Text style={[sty.folderTileMeta, { color: colors.textMuted }]}>
            {files.filter(file => !file.deletedAt && file.section === section && file.folderId === null).length} file{files.filter(file => !file.deletedAt && file.section === section && file.folderId === null).length === 1 ? '' : 's'}
          </Text>
        </TouchableOpacity>
        {sectionFolders.map(folder => (
          <TouchableOpacity
            key={folder.id}
            onPress={() => setSelectedFolderId(folder.id)}
            style={[sty.folderTile, { backgroundColor: selectedFolderId === folder.id ? roleColor + '18' : colors.background, borderColor: selectedFolderId === folder.id ? roleColor : colors.border }]}
          >
            <Ionicons name="folder-outline" size={26} color={selectedFolderId === folder.id ? roleColor : colors.textMuted} />
            <Text style={[sty.folderTileTitle, { color: selectedFolderId === folder.id ? roleColor : colors.text }]} numberOfLines={1}>{folder.name}</Text>
            <Text style={[sty.folderTileMeta, { color: colors.textMuted }]}>
              {files.filter(file => !file.deletedAt && file.section === section && file.folderId === folder.id).length} file{files.filter(file => !file.deletedAt && file.section === section && file.folderId === folder.id).length === 1 ? '' : 's'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {canManage && (
        <TouchableOpacity
          onPress={openUploadDetails}
          disabled={uploading}
          style={[sty.uploadAnyBtn, { backgroundColor: uploading ? colors.border : roleColor }]}
        >
          <Ionicons name={uploading ? 'hourglass-outline' : 'cloud-upload-outline'} size={16} color="#fff" />
          <Text style={sty.uploadAnyTxt} numberOfLines={1}>
            {uploading
              ? 'Uploading…'
              : `Upload to ${selectedFolderId === null ? 'Main folder' : sectionFolders.find(f => f.id === selectedFolderId)?.name ?? 'folder'}`}
          </Text>
        </TouchableOpacity>
      )}
      {canManage && (
        <Text style={[sty.workspaceEmpty, { color: colors.textSubtle, marginTop: -4 }]}>
          Any file type up to {MAX_UPLOAD_BYTES / (1024 * 1024)} MB. Choose a folder above first.
        </Text>
      )}

      <Text style={[sty.workspaceFilesLabel, { color: colors.textMuted }]}>
        {selectedFolderId === null ? 'Main folder' : sectionFolders.find(f => f.id === selectedFolderId)?.name} · {sectionFiles.length} file{sectionFiles.length === 1 ? '' : 's'}
      </Text>
      {sectionFiles.length === 0 ? (
        <Text style={[sty.workspaceEmpty, { color: colors.textSubtle }]}>No files in this folder yet.</Text>
      ) : (
        sectionFiles.slice().reverse().map(file => (
          <View
            key={file.id}
            style={[
              sty.workspaceFile,
              {
                borderColor: focusedFileId === file.id ? roleColor : colors.border,
                borderWidth: focusedFileId === file.id ? 2 : 1,
                backgroundColor: focusedFileId === file.id ? roleColor + '0A' : colors.surface,
              },
            ]}
          >
            <View style={[sty.workspaceFileIcon, { backgroundColor: roleColor + '14' }]}>
              <Ionicons name="document-attach-outline" size={18} color={roleColor} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[sty.workspaceFileName, { color: colors.text }]} numberOfLines={1}>{file.name}</Text>
              <Text style={[sty.workspaceFileMeta, { color: colors.textMuted }]}>
                {file.mimeType} · {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Size unavailable'} · {file.uploadedBy}
              </Text>
              {file.expiresAt && (
                <View style={[
                  sty.fileExpiry,
                  {
                    backgroundColor: (expiryDays(file.expiresAt) ?? 91) <= 0 ? colors.errorBg : colors.warningBg,
                    borderColor: (expiryDays(file.expiresAt) ?? 91) <= 0 ? colors.errorBorder : colors.warningBorder,
                  },
                ]}>
                  <Ionicons
                    name={(expiryDays(file.expiresAt) ?? 91) <= 0 ? 'alert-circle-outline' : 'calendar-outline'}
                    size={12}
                    color={(expiryDays(file.expiresAt) ?? 91) <= 0 ? colors.error : colors.warning}
                  />
                  <Text style={[
                    sty.fileExpiryText,
                    { color: (expiryDays(file.expiresAt) ?? 91) <= 0 ? colors.error : colors.warning },
                  ]}>
                    {file.documentKind === 'certificate' ? 'Certificate' : 'Document'} · {expiryLabel(file.expiresAt)} · {fmtDate(file.expiresAt)}
                  </Text>
                </View>
              )}
              <View style={sty.workspaceFileActions}>
                <TouchableOpacity
                  onPress={() => void previewDocument(file)}
                  disabled={busyFileId === file.id}
                  style={[sty.workspaceFileAction, { borderColor: colors.border }]}
                  accessibilityLabel={`Preview ${file.name}`}
                >
                  <Ionicons name="eye-outline" size={14} color={roleColor} />
                  <Text style={[sty.workspaceFileActionText, { color: roleColor }]}>Preview</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void downloadDocument(file)}
                  disabled={busyFileId === file.id}
                  style={[sty.workspaceFileAction, { borderColor: colors.border }]}
                  accessibilityLabel={`Download ${file.name}`}
                >
                  <Ionicons name="download-outline" size={14} color={roleColor} />
                  <Text style={[sty.workspaceFileActionText, { color: roleColor }]}>Download</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void printDocument(file)}
                  disabled={busyFileId === file.id}
                  style={[sty.workspaceFileAction, { borderColor: colors.border }]}
                  accessibilityLabel={`Print ${file.name}`}
                >
                  <Ionicons name="print-outline" size={14} color={roleColor} />
                  <Text style={[sty.workspaceFileActionText, { color: roleColor }]}>Print</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void shareDocument(file)}
                  disabled={busyFileId === file.id}
                  style={[sty.workspaceFileAction, { borderColor: colors.border }]}
                  accessibilityLabel={`Share ${file.name}`}
                >
                  <Ionicons name="share-outline" size={14} color={roleColor} />
                  <Text style={[sty.workspaceFileActionText, { color: roleColor }]}>Share</Text>
                </TouchableOpacity>
                {canManage && (
                 <TouchableOpacity
                   onPress={() => confirmReplace(file)}
                    disabled={uploading || busyFileId === file.id}
                   style={[sty.workspaceFileAction, { borderColor: colors.border }]}
                   accessibilityLabel={`Replace ${file.name}`}
                 >
                   <Ionicons name="swap-horizontal-outline" size={14} color={roleColor} />
                    <Text style={[sty.workspaceFileActionText, { color: roleColor }]}>Replace</Text>
                 </TouchableOpacity>
                )}
                {canManage && (
                  <TouchableOpacity
                    onPress={() => confirmDelete(file)}
                    disabled={uploading || busyFileId === file.id}
                    style={[sty.workspaceFileAction, { borderColor: colors.errorBorder }]}
                    accessibilityLabel={`Delete ${file.name}`}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={[sty.workspaceFileActionText, { color: colors.error }]}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ))
      )}
      <Modal
        visible={showUploadDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUploadDetails(false)}
      >
        <KeyboardAwareScrollViewCompat contentContainerStyle={sty.detailsBackdrop} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          <View style={[sty.detailsCard, { backgroundColor: colors.surface }]}>
            <View style={sty.detailsHeader}>
              <View>
                <Text style={[sty.detailsTitle, { color: colors.text }]}>File details</Text>
                <Text style={[sty.detailsSubtitle, { color: colors.textMuted }]}>Add expiry tracking before choosing a file.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowUploadDetails(false)} accessibilityLabel="Close file details">
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[sty.detailsLabel, { color: colors.textMuted }]}>File type</Text>
            <View style={sty.detailsChoiceRow}>
              {(['document', 'certificate'] as const).map(kind => (
                <TouchableOpacity
                  key={kind}
                  onPress={() => setDocumentKind(kind)}
                  style={[
                    sty.detailsChoice,
                    {
                      backgroundColor: documentKind === kind ? roleColor + '18' : colors.background,
                      borderColor: documentKind === kind ? roleColor : colors.border,
                    },
                  ]}
                >
                  <Ionicons name={kind === 'certificate' ? 'ribbon-outline' : 'document-text-outline'} size={16} color={documentKind === kind ? roleColor : colors.textMuted} />
                  <Text style={[sty.detailsChoiceText, { color: documentKind === kind ? roleColor : colors.text }]}>{kind === 'certificate' ? 'Certificate' : 'Document'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[sty.detailsLabel, { color: colors.textMuted }]}>Expiry date (optional)</Text>
            <TextInput
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="none"
              style={[sty.detailsInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
            />
            <Text style={[sty.detailsHint, { color: colors.textMuted }]}>
              Petrotrack will notify active users three months before this date.
            </Text>
            <TouchableOpacity onPress={() => void uploadNewFile()} style={[sty.detailsSubmit, { backgroundColor: roleColor }]}>
              <Ionicons name="folder-open-outline" size={17} color="#fff" />
              <Text style={sty.detailsSubmitText}>Choose file</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
      </Modal>
    </View>
  );
}

// ── Legal / Project status helpers ──────────────────────────────────────────
const LEGAL_TYPES: LegalMatter['type'][] = ['Contract','Dispute','Regulatory','Advisory','Other'];
const LEGAL_STATUS_META: Record<LegalMatter['status'], { color: string; bg: string }> = {
  Active:   { color: '#286247', bg: '#EAF2ED' },
  Pending:  { color: '#71805B', bg: '#EEF2E4' },
  Resolved: { color: '#1F6848', bg: '#E5F1E9' },
  Closed:   { color: '#7F8C8D', bg: '#F6F8F3' },
};
const LEGAL_PRI_META: Record<LegalMatter['priority'], { color: string; bg: string }> = {
  High:   { color: '#365A47', bg: '#E9F0EB' },
  Medium: { color: '#71805B', bg: '#EEF2E4' },
  Low:    { color: '#1F6848', bg: '#E5F1E9' },
};
const PROJ_STATUS_META: Record<CorpProject['status'], { color: string; bg: string; icon: string }> = {
  Planning:   { color: '#286247', bg: '#EAF2ED',  icon: 'compass'          },
  Active:     { color: '#1F6848', bg: '#E5F1E9',  icon: 'play-circle'      },
  'On Hold':  { color: '#71805B', bg: '#EEF2E4',  icon: 'pause-circle'     },
  Completed:  { color: '#1F6848', bg: '#D6F5EC',  icon: 'checkmark-circle' },
  Cancelled:  { color: '#7F8C8D', bg: '#F6F8F3',  icon: 'close-circle'     },
};

// ── Approval status helpers ─────────────────────────────────────────────────
const APPROVAL_META: Record<CorpApproval['status'], { label: string; color: string; bg: string; icon: string }> = {
  draft:     { label: 'Draft',     color: '#7F8C8D', bg: '#F6F8F3', icon: 'create-outline'        },
  submitted: { label: 'Submitted', color: '#286247', bg: '#EAF2ED', icon: 'paper-plane-outline'   },
  approved:  { label: 'Approved',  color: '#1F6848', bg: '#E5F1E9', icon: 'checkmark-circle'      },
  rejected:  { label: 'Rejected',  color: '#365A47', bg: '#E9F0EB', icon: 'close-circle-outline'  },
};

// ── Tab definition ──────────────────────────────────────────────────────────
type Tab = 'compliance' | 'legal' | 'projects' | 'minutes' | 'correspondences' | 'general';

// ── Shared micro-components ─────────────────────────────────────────────────
function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <View style={[sp.pill, { backgroundColor: bg }]}><Text style={[sp.pillText, { color }]}>{label}</Text></View>;
}

function EmptySlate({ icon, text }: { icon: string; text: string }) {
  const c = useColors();
  return (
    <View style={sp.empty}>
      <Ionicons name={icon as any} size={38} color={c.border} />
      <Text style={[sp.emptyTxt, { color: c.textMuted }]}>{text}</Text>
    </View>
  );
}

// Records awaiting CEO/admin approval surface above everything else so a
// submitted lease, project, or meeting-minutes record can never be buried
// under older/unrelated entries further down the list.
function withPendingApprovalFirst<T extends { approval: { status: string; submittedAt?: string } }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const rank = (item: T) => item.approval.status === 'submitted' ? 0 : 1;
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    if (rank(a) === 0) return (b.approval.submittedAt ?? '').localeCompare(a.approval.submittedAt ?? '');
    return 0;
  });
}

// ════════════════════════════════════════════════════════════════════════════
export default function CorporateScreen() {
  const {
    role, userName,
    docs,
    myFolders, myFolderFiles, addMyFolder, addMyFolderFile, removeMyFolderFile, replaceMyFolderFile,
    legalMatters, addLegalMatter, updateLegalMatter, updateLegalStatus, deleteLegalMatter,
    corpProjects, addCorpProject, updateCorpProject, updateProjectProgress, deleteCorpProject,
    meetingMinutes, addMeetingMinutes, updateMeetingMinutes, deleteMeetingMinutes,
    addCorpAttachment, removeCorpAttachment,
    submitCorpItem, approveCorpItem, rejectCorpItem,
  } = useApp();

  const colors    = useColors();
  const router    = useRouter();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const hasFolderAccess = !!role;
  const hasRestrictedFolderAccess = !!role && MY_FOLDER_ALLOWED_ROLES.includes(role as Role);
  const isCSM     = role === 'csm';
  const isCEO     = role === 'ceo' || role === 'md';
  const sortedLegalMatters   = withPendingApprovalFirst(legalMatters);
  const sortedCorpProjects   = withPendingApprovalFirst(corpProjects);
  const sortedMeetingMinutes = withPendingApprovalFirst(meetingMinutes);
  const isAdmin   = role === 'admin';
  const canCreate = isCSM || isAdmin;

  // ── Tab ──
  const [activeTab, setActiveTab] = useState<Tab>(hasRestrictedFolderAccess ? 'compliance' : 'general');
  const { section: routeSection } = useLocalSearchParams<{ section?: string }>();

  useEffect(() => {
    const requestedSection = Array.isArray(routeSection) ? routeSection[0] : routeSection;
    const validSection = ['compliance', 'legal', 'minutes', 'projects', 'correspondences', 'general'].includes(requestedSection ?? '')
      ? requestedSection as Tab
      : null;
    if (validSection && (validSection === 'general' || hasRestrictedFolderAccess)) {
      setActiveTab(validSection);
    }
  }, [hasRestrictedFolderAccess, routeSection]);

  // ── Expansion (which card shows its full panel) ──
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ── Attachment form state ──
  const [attachingTo, setAttachingTo] = useState<{ type: CorpRecordType; id: number } | null>(null);

  // ── Submit modal ──
  const [submitTarget, setSubmitTarget] = useState<{ type: CorpRecordType; id: number } | null>(null);
  const [submitTo,     setSubmitTo]     = useState<'CEO' | 'MD' | 'Both'>('CEO');

  // ── Reject modal ──
  const [rejectTarget, setRejectTarget] = useState<{ type: CorpRecordType; id: number } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Edit-mode record (id per type) ──
  const [editId, setEditId] = useState<number | null>(null);

  // ── Legal create/edit form ──
  const [showLegalForm, setShowLegalForm] = useState(false);
  const [lTitle,  setLTitle]  = useState('');
  const [lType,   setLType]   = useState<LegalMatter['type']>('Contract');
  const [lParty,  setLParty]  = useState('');
  const [lPri,    setLPri]    = useState<LegalMatter['priority']>('Medium');
  const [lNotes,  setLNotes]  = useState('');
  const [lStatus, setLStatus] = useState<LegalMatter['status']>('Active');

  // ── Project create/edit form ──
  const [showProjForm, setShowProjForm] = useState(false);
  const [pTitle, setPTitle] = useState('');
  const [pDesc,  setPDesc]  = useState('');
  const [pLead,  setPLead]  = useState('');
  const [pStart, setPStart] = useState(new Date().toISOString().split('T')[0]);
  const [pDue,   setPDue]   = useState('');
  const [pStat,  setPStat]  = useState<CorpProject['status']>('Planning');

  // ── Minutes create/edit form ──
  const [showMinForm,  setShowMinForm]  = useState(false);
  const [mTitle,   setMTitle]   = useState('');
  const [mDate,    setMDate]    = useState(new Date().toISOString().split('T')[0]);
  const [mVenue,   setMVenue]   = useState('');
  const [mAtt,     setMAtt]     = useState('');
  const [mSummary, setMSummary] = useState('');

  // ── Compliance stats ──
  const expiredDocs = docs.filter(d => daysLeft(d.exp) < 0);
  const urgentDocs  = docs.filter(d => daysLeft(d.exp) >= 0 && daysLeft(d.exp) < 14);
  const warnDocs    = docs.filter(d => daysLeft(d.exp) >= 14 && daysLeft(d.exp) < 30);
  const okDocs      = docs.filter(d => daysLeft(d.exp) >= 30);

  // ── Helpers ─────────────────────────────────────────────────────────────

  function resetLegalForm() { setLTitle(''); setLParty(''); setLNotes(''); setLType('Contract'); setLPri('Medium'); setLStatus('Active'); }
  function resetProjForm()  { setPTitle(''); setPDesc(''); setPLead(''); setPDue(''); setPStat('Planning'); setPStart(new Date().toISOString().split('T')[0]); }
  function resetMinForm()   { setMTitle(''); setMVenue(''); setMAtt(''); setMSummary(''); setMDate(new Date().toISOString().split('T')[0]); }

  function loadLegalForEdit(m: LegalMatter) {
    setLTitle(m.title); setLType(m.type); setLParty(m.party); setLPri(m.priority); setLNotes(m.notes); setLStatus(m.status);
    setEditId(m.id); setShowLegalForm(true);
  }
  function loadProjForEdit(p: CorpProject) {
    setPTitle(p.title); setPDesc(p.description); setPLead(p.lead); setPStart(p.startDate); setPDue(p.dueDate); setPStat(p.status);
    setEditId(p.id); setShowProjForm(true);
  }
  function loadMinForEdit(m: MeetingMinutes) {
    setMTitle(m.title); setMDate(m.date); setMVenue(m.venue); setMAtt(m.attendees); setMSummary(m.summary);
    setEditId(m.id); setShowMinForm(true);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSaveLegal() {
    if (!lTitle.trim() || !lParty.trim()) { Alert.alert('Required', 'Title and party are required.'); return; }
    if (editId !== null) {
      updateLegalMatter(editId, { title: lTitle.trim(), type: lType, party: lParty.trim(), priority: lPri, status: lStatus, notes: lNotes.trim() });
      setEditId(null);
    } else {
      addLegalMatter({ title: lTitle.trim(), type: lType, party: lParty.trim(), priority: lPri, status: lStatus, notes: lNotes.trim() });
    }
    resetLegalForm(); setShowLegalForm(false);
  }

  function handleSaveProject() {
    if (!pTitle.trim() || !pLead.trim() || !pDue) { Alert.alert('Required', 'Title, lead and due date are required.'); return; }
    if (editId !== null) {
      updateCorpProject(editId, { title: pTitle.trim(), description: pDesc.trim(), lead: pLead.trim(), startDate: pStart, dueDate: pDue, status: pStat });
      setEditId(null);
    } else {
      addCorpProject({ title: pTitle.trim(), description: pDesc.trim(), lead: pLead.trim(), startDate: pStart, dueDate: pDue, status: pStat, progress: 0 });
    }
    resetProjForm(); setShowProjForm(false);
  }

  function handleSaveMinutes() {
    if (!mTitle.trim() || !mSummary.trim()) { Alert.alert('Required', 'Title and summary are required.'); return; }
    if (editId !== null) {
      updateMeetingMinutes(editId, { title: mTitle.trim(), date: mDate, venue: mVenue.trim() || 'HQ — Abuja CBD', attendees: mAtt.trim(), summary: mSummary.trim() });
      setEditId(null);
    } else {
      addMeetingMinutes({ title: mTitle.trim(), date: mDate, venue: mVenue.trim() || 'HQ — Abuja CBD', attendees: mAtt.trim(), summary: mSummary.trim(), by: userName || 'System' });
    }
    resetMinForm(); setShowMinForm(false);
  }

  async function handleAddAttachment() {
    if (!attachingTo) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const file = result.assets[0];
      const upload = await storageApi.uploadFile(file, {
        category: attachingTo.type === 'minutes' ? 'meeting_minutes' : 'general',
        relatedId: `${attachingTo.type}:${attachingTo.id}`,
      });
      const sizeBytes = upload.size;
      const mimeType = upload.mimeType;

      addCorpAttachment(attachingTo.type, attachingTo.id, {
        name: file.name,
        fileType: attachmentType(file.name, mimeType),
        size: formatAttachmentSize(sizeBytes),
        uploadedBy: userName || 'System',
        objectPath: upload.objectPath,
        mimeType,
      });
      setAttachingTo(null);
      Alert.alert('Uploaded', `${file.name} was uploaded to the meeting minutes.`);
    } catch (error) {
      Alert.alert('Upload failed', uploadFailureMessage(error));
    }
  }

  function handleSubmit() {
    if (!submitTarget) return;
    submitCorpItem(submitTarget.type, submitTarget.id, submitTo);
    setSubmitTarget(null);
    Alert.alert('Submitted', `Record submitted to ${submitTo} for approval.`);
  }

  function handleApprove(type: CorpRecordType, id: number) {
    Alert.alert('Approve Record', 'Approve this record? It will be locked and cannot be edited further.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => approveCorpItem(type, id) },
    ]);
  }

  function handleReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { Alert.alert('Required', 'Please state a reason for rejection.'); return; }
    rejectCorpItem(rejectTarget.type, rejectTarget.id, rejectReason.trim());
    setRejectTarget(null); setRejectReason('');
    Alert.alert('Rejected', 'Record rejected. CSM has been notified to make corrections.');
  }

  // ── Shared card panel renderer ───────────────────────────────────────────

  function ApprovalPanel({ type, approval, id }: { type: CorpRecordType; approval: CorpApproval; id: number }) {
    const am = APPROVAL_META[approval.status];
    const locked  = approval.status === 'approved';
    const canAct  = isCEO || isAdmin;
    const canSubmit = (isCSM || isAdmin) && (approval.status === 'draft' || approval.status === 'rejected');

    return (
      <View style={[sty.approvalWrap, { borderColor: am.color + '40', backgroundColor: am.bg + '80' }]}>
        {/* Status header */}
        <View style={sty.approvalHeader}>
          <Ionicons name={am.icon as any} size={16} color={am.color} />
          <Text style={[sty.approvalStatus, { color: am.color }]}>{am.label}</Text>
          {approval.submittedTo && approval.status !== 'draft' && (
            <Text style={[sty.approvalSub, { color: am.color }]}>→ {approval.submittedTo}</Text>
          )}
        </View>

        {/* Rejection reason */}
        {approval.status === 'rejected' && approval.rejectionReason && (
          <View style={[sty.rejectionBox, { backgroundColor: '#E9F0EB', borderColor: '#365A4740' }]}>
            <Ionicons name="alert-circle" size={14} color="#365A47" />
            <View style={{ flex: 1 }}>
              <Text style={sty.rejectionLabel}>Rejection Reason</Text>
              <Text style={sty.rejectionText}>{approval.rejectionReason}</Text>
              {approval.reviewedBy && (
                <Text style={sty.rejectionBy}>— {approval.reviewedBy}, {fmtDate(approval.reviewedAt ?? '')}</Text>
              )}
            </View>
          </View>
        )}

        {/* Approved banner */}
        {locked && (
          <Text style={[sty.approvedBy, { color: '#1F6848' }]}>
            Approved by {approval.reviewedBy} · {fmtDate(approval.reviewedAt ?? '')}
          </Text>
        )}

        {/* Submitted info */}
        {approval.status === 'submitted' && approval.submittedBy && (
          <Text style={[sty.approvedBy, { color: '#286247' }]}>
            Submitted by {approval.submittedBy} · {fmtDate(approval.submittedAt ?? '')}
          </Text>
        )}

        {/* Action buttons */}
        <View style={sty.approvalActions}>
          {canSubmit && (
            <TouchableOpacity onPress={() => setSubmitTarget({ type, id })}
              style={[sty.actionBtn, { backgroundColor: roleColor }]}>
              <Ionicons name="paper-plane" size={13} color="#fff" />
              <Text style={sty.actionBtnTxt}>{approval.status === 'rejected' ? 'Edit & Resubmit' : 'Submit for Approval'}</Text>
            </TouchableOpacity>
          )}
          {canAct && approval.status === 'submitted' && (
            <>
              <TouchableOpacity onPress={() => handleApprove(type, id)}
                style={[sty.actionBtn, { backgroundColor: '#1F6848' }]}>
                <Ionicons name="checkmark-circle" size={13} color="#fff" />
                <Text style={sty.actionBtnTxt}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRejectTarget({ type, id })}
                style={[sty.actionBtn, { backgroundColor: '#365A47' }]}>
                <Ionicons name="close-circle" size={13} color="#fff" />
                <Text style={sty.actionBtnTxt}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
          {locked && (
            <View style={[sty.lockedTag, { borderColor: '#1F684840' }]}>
              <Ionicons name="lock-closed" size={12} color="#1F6848" />
              <Text style={[sty.lockedTxt, { color: '#1F6848' }]}>Locked — Approved</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  function AttachmentsPanel({ type, id, attachments, locked }: {
    type: CorpRecordType; id: number; attachments: CorpAttachment[]; locked: boolean;
  }) {
    const isOpen = attachingTo?.type === type && attachingTo?.id === id;
    return (
      <View style={sty.attWrap}>
        <View style={sty.attHeader}>
          <Ionicons name="attach" size={14} color={colors.textMuted} />
          <Text style={[sty.attTitle, { color: colors.text }]}>Attachments ({attachments.length})</Text>
          {!locked && (canCreate || isCEO || isAdmin) && (
            <TouchableOpacity onPress={() => {
               if (isOpen) { setAttachingTo(null); }
              else { setAttachingTo({ type, id }); }
            }} style={[sty.attAddBtn, { borderColor: roleColor }]}>
              <Ionicons name={isOpen ? 'close' : 'add'} size={13} color={roleColor} />
              <Text style={[sty.attAddTxt, { color: roleColor }]}>{isOpen ? 'Cancel' : 'Attach'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Document picker/upload action */}
        {isOpen && (
          <View style={[sty.attForm, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[sty.attEmpty, { color: colors.textMuted }]}>
              Choose a document from this device. PDFs, Word files, spreadsheets, presentations, images, media, and archives are supported.
            </Text>
            <TouchableOpacity onPress={() => void handleAddAttachment()}
              style={[sty.attSubmitBtn, { backgroundColor: roleColor }]}>
              <Ionicons name="cloud-upload" size={14} color="#fff" />
              <Text style={sty.attSubmitTxt}>Choose and Upload Document</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Attachment list */}
        {attachments.map(a => {
          const fi = FILE_TYPE_MAP[a.fileType] || FILE_TYPE_MAP.other;
          return (
            <View key={a.id} style={[sty.attItem, { borderColor: colors.border }]}>
              <View style={[sty.attIcon, { backgroundColor: fi.color + '18' }]}>
                <Ionicons name={fi.icon as any} size={16} color={fi.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[sty.attName, { color: colors.text }]} numberOfLines={1}>{a.name}</Text>
                <Text style={[sty.attMeta, { color: colors.textMuted }]}>{a.size} · {fmtDate(a.uploadedAt)} · {a.uploadedBy}</Text>
              </View>
              {!locked && (canCreate || isAdmin) && (
                <TouchableOpacity onPress={() => removeCorpAttachment(type, id, a.id)}
                  style={sty.attRemove}>
                  <Ionicons name="trash-outline" size={14} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {attachments.length === 0 && (
          <Text style={[sty.attEmpty, { color: colors.textMuted }]}>No attachments yet</Text>
        )}
      </View>
    );
  }

  // ── Tab bar ─────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; description: string; icon: string }[] = [
    { key: 'compliance', label: 'Compliance',       description: 'Licences, certificates and renewals', icon: 'shield-checkmark' },
    { key: 'legal',      label: 'Legal Documents',  description: 'Matters, agreements and records', icon: 'scale' },
    { key: 'projects',   label: 'Projects',         description: 'Plans, briefs and delivery files', icon: 'hammer' },
    { key: 'minutes',    label: 'Minutes of Meetings', description: 'Decisions, actions and follow-ups', icon: 'reader' },
    { key: 'correspondences', label: 'Correspondences', description: 'Letters, emails and official replies', icon: 'mail' },
    { key: 'general',    label: 'General',          description: 'Shared files for the wider team', icon: 'library' },
  ];
  const visibleTabs = TABS.filter(t => t.key === 'general' || hasRestrictedFolderAccess);

  if (!hasFolderAccess) {
    return (
      <ScreenLayout title="My Documents">
        <View style={sty.accessDenied}>
          <Ionicons name="lock-closed-outline" size={42} color={colors.textSubtle} />
          <Text style={[sty.accessDeniedTitle, { color: colors.text }]}>Access restricted</Text>
          <Text style={[sty.accessDeniedText, { color: colors.textMuted }]}>
            Please sign in to access the General Library.
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="My Documents">

      {/* ── Document area navigator ── */}
      <View style={[sty.folderNavWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[sty.folderNavEyebrow, { color: colors.textMuted }]}>My Documents</Text>
        <Text style={[sty.folderNavTitle, { color: colors.text }]}>Choose a document area</Text>
        <Text style={[sty.folderNavSub, { color: colors.textMuted }]}>Open a workspace to browse its shared folders and files.</Text>
        <View style={sty.folderNavGrid}>
        {visibleTabs.map(t => {
          const active = t.key === activeTab;
          return (
            <TouchableOpacity
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setActiveTab(t.key);
                setExpandedId(null);
                setEditId(null);
                setShowLegalForm(false);
                setShowProjForm(false);
                setShowMinForm(false);
                router.push({
                  pathname: '/(app)/corporate-workspace',
                  params: { section: t.key },
                } as never);
              }}
              style={[
                sty.folderNavTile,
                visibleTabs.length === 1 && sty.folderNavTileSolo,
                { backgroundColor: active ? roleColor + '18' : colors.surface, borderColor: active ? roleColor : colors.border },
              ]}
            >
              <View style={sty.folderNavTileTop}>
                <View style={[sty.folderNavIcon, { backgroundColor: active ? roleColor : roleColor + '14' }]}>
                  <Ionicons name={t.icon as any} size={19} color={active ? '#fff' : roleColor} />
                </View>
                <Ionicons name="arrow-forward-outline" size={17} color={active ? roleColor : colors.textSubtle} />
              </View>
              <Text style={[sty.folderNavTileLabel, { color: active ? roleColor : colors.text }]}>{t.label}</Text>
              <Text style={[sty.folderNavTileDesc, { color: colors.textMuted }]}>{t.description}</Text>
            </TouchableOpacity>
          );
        })}
        </View>
      </View>

          {/* ════════════════════════════════════════ COMPLIANCE FOLDER */}
      {activeTab === 'compliance' && (
        <KeyboardAwareScrollViewCompat contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false} bottomOffset={32}>
          <View style={sty.summaryRow}>
            {[
              { n: expiredDocs.length, label: 'Expired',  col: colors.error,   bg: colors.errorBg,   border: colors.errorBorder   },
              { n: urgentDocs.length,  label: '<14 days', col: colors.error,   bg: colors.errorBg,   border: colors.errorBorder   },
              { n: warnDocs.length,    label: '<30 days', col: colors.warning, bg: colors.warningBg, border: colors.warningBorder },
              { n: okDocs.length,      label: 'Current',  col: colors.success, bg: colors.successBg, border: colors.successBorder },
            ].map(s => (
              <View key={s.label} style={[sty.summaryCard, { backgroundColor: s.bg, borderColor: s.border }]}>
                <Text style={[sty.summaryNum, { color: s.col }]}>{s.n}</Text>
                <Text style={[sty.summaryLabel, { color: s.col }]}>{s.label}</Text>
              </View>
            ))}
          </View>
          {docs.map(doc => {
            const days = daysLeft(doc.exp);
            const st   = getDocStatus(days);
            return (
              <View key={doc.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={sty.cardHeader}>
                  <View style={[sty.cardIcon, { backgroundColor: roleColor + '18' }]}>
                    <Ionicons name="document-text" size={18} color={roleColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.cardTitle, { color: colors.text }]}>{doc.name}</Text>
                    <Text style={[sty.cardSub, { color: colors.textMuted }]}>{doc.iss} · Ref: {doc.ref}</Text>
                  </View>
                  <Pill label={st.label} color={st.color} bg={st.bg} />
                </View>
                <View style={sty.infoRow}>
                  <View><Text style={[sty.infoLabel, { color: colors.textMuted }]}>Category</Text><Text style={[sty.infoValue, { color: colors.text }]}>{doc.cat}</Text></View>
                  <View><Text style={[sty.infoLabel, { color: colors.textMuted }]}>Expires</Text><Text style={[sty.infoValue, { color: st.color }]}>{fmtDate(doc.exp)}</Text></View>
                </View>
                {days < 30 && (
                  <View style={[sty.alertBanner, { backgroundColor: st.bg }]}>
                    <Ionicons name="warning" size={14} color={st.color} />
                    <Text style={[sty.alertText, { color: st.color }]}>
                      {days < 0 ? 'Expired. Immediate renewal required.' : `Renewal required within ${days} days.`}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          {docs.length === 0 && <EmptySlate icon="shield-outline" text="No compliance documents" />}

          <FolderWorkspacePanel
            section="compliance"
            folders={myFolders}
            files={myFolderFiles}
            roleColor={roleColor}
            colors={colors}
            userName={userName || 'System'}
            addFolder={addMyFolder}
            addFile={addMyFolderFile}
            removeFile={removeMyFolderFile}
            replaceFile={replaceMyFolderFile}
            canManage={hasRestrictedFolderAccess}
          />

          <View style={{ height: 20 }} />
        </KeyboardAwareScrollViewCompat>
      )}

      {/* ════════════════════════════════════════ LEGAL */}
      {activeTab === 'legal' && (
        <KeyboardAwareScrollViewCompat contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          {/* Summary */}
          <View style={sty.summaryRow}>
            {(['Active','Pending','Resolved','Closed'] as LegalMatter['status'][]).map(s => {
              const m = LEGAL_STATUS_META[s];
              return (
                <View key={s} style={[sty.summaryCard, { backgroundColor: m.bg, borderColor: m.color + '44' }]}>
                  <Text style={[sty.summaryNum, { color: m.color }]}>{legalMatters.filter(l => l.status === s).length}</Text>
                  <Text style={[sty.summaryLabel, { color: m.color }]}>{s}</Text>
                </View>
              );
            })}
          </View>

          {/* Create / edit form */}
          {canCreate && (
            <TouchableOpacity onPress={() => { if (showLegalForm && editId === null) { setShowLegalForm(false); resetLegalForm(); } else if (!showLegalForm) { setShowLegalForm(true); setEditId(null); resetLegalForm(); } }}
              style={[sty.addBtn, { backgroundColor: showLegalForm && editId === null ? colors.border : roleColor }]}>
              <Ionicons name={showLegalForm && editId === null ? 'close' : 'add'} size={16} color={showLegalForm && editId === null ? colors.textMuted : '#fff'} />
              <Text style={[sty.addBtnTxt, { color: showLegalForm && editId === null ? colors.textMuted : '#fff' }]}>
                {showLegalForm && editId === null ? 'Cancel' : 'Add Legal Matter'}
              </Text>
            </TouchableOpacity>
          )}

          {showLegalForm && (
            <View style={[sty.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[sty.formTitle, { color: colors.text }]}>{editId ? 'Edit Legal Matter' : 'New Legal Matter'}</Text>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Title *</Text>
              <TextInput value={lTitle} onChangeText={setLTitle} placeholder="e.g. Lease Agreement — Lugbe Branch" placeholderTextColor={colors.textMuted}
                style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Type</Text>
              <View style={sty.chipRow}>
                {LEGAL_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setLType(t)} style={[sty.chip, { backgroundColor: t === lType ? roleColor : colors.background, borderColor: t === lType ? roleColor : colors.border }]}>
                    <Text style={[sty.chipTxt, { color: t === lType ? '#fff' : colors.textMuted }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Counterparty / Lawyer *</Text>
              <TextInput value={lParty} onChangeText={setLParty} placeholder="e.g. FIRS, Aluko & Oyebode" placeholderTextColor={colors.textMuted}
                style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Priority</Text>
              <View style={sty.chipRow}>
                {(['High','Medium','Low'] as LegalMatter['priority'][]).map(p => {
                  const m = LEGAL_PRI_META[p];
                  return (
                    <TouchableOpacity key={p} onPress={() => setLPri(p)} style={[sty.chip, { backgroundColor: p === lPri ? m.color : colors.background, borderColor: p === lPri ? m.color : colors.border }]}>
                      <Text style={[sty.chipTxt, { color: p === lPri ? '#fff' : colors.textMuted }]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Status</Text>
              <View style={sty.chipRow}>
                {(['Active','Pending','Resolved','Closed'] as LegalMatter['status'][]).map(s => (
                  <TouchableOpacity key={s} onPress={() => setLStatus(s)} style={[sty.chip, { backgroundColor: s === lStatus ? roleColor : colors.background, borderColor: s === lStatus ? roleColor : colors.border }]}>
                    <Text style={[sty.chipTxt, { color: s === lStatus ? '#fff' : colors.textMuted }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Notes</Text>
              <TextInput value={lNotes} onChangeText={setLNotes} placeholder="Background, key terms, next steps…" placeholderTextColor={colors.textMuted}
                multiline numberOfLines={3} style={[sty.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <TouchableOpacity onPress={handleSaveLegal} style={[sty.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={sty.submitBtnTxt}>{editId ? 'Save Changes' : 'Create Legal Matter'}</Text>
              </TouchableOpacity>
              {editId && (
                <TouchableOpacity onPress={() => { setEditId(null); resetLegalForm(); setShowLegalForm(false); }}
                  style={[sty.cancelEditBtn, { borderColor: colors.border }]}>
                  <Text style={[sty.cancelEditTxt, { color: colors.textMuted }]}>Cancel Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {legalMatters.length === 0 && <EmptySlate icon="scale-outline" text="No legal matters recorded" />}
          {sortedLegalMatters.map(m => {
            const sm = LEGAL_STATUS_META[m.status];
            const pm = LEGAL_PRI_META[m.priority];
            const am = APPROVAL_META[m.approval.status];
            const locked = m.approval.status === 'approved';
            const expanded = expandedId === m.id;
            return (
              <View key={m.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity style={sty.cardHeader} onPress={() => setExpandedId(expanded ? null : m.id)} activeOpacity={0.7}>
                  <View style={[sty.cardIcon, { backgroundColor: '#315F4918' }]}>
                    <Ionicons name="scale" size={18} color="#315F49" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.cardTitle, { color: colors.text }]}>{m.title}</Text>
                    <Text style={[sty.cardSub, { color: colors.textMuted }]}>{m.type} · {m.party}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Pill label={m.status}         color={sm.color} bg={sm.bg} />
                    <Pill label={m.approval.status} color={am.color} bg={am.bg} />
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {m.notes.length > 0 && !expanded && (
                  <Text style={[sty.noteText, { color: colors.textMuted }]} numberOfLines={1}>{m.notes}</Text>
                )}

                {expanded && (
                  <View style={[sty.expandBody, { borderTopColor: colors.border }]}>
                    {m.notes.length > 0 && <Text style={[sty.noteText, { color: colors.textMuted }]}>{m.notes}</Text>}
                    <Pill label={m.priority} color={pm.color} bg={pm.bg} />
                    <Text style={[sty.metaTxt, { color: colors.textSubtle }]}>Opened {fmtDate(m.openedAt)}</Text>

                    <AttachmentsPanel type="legal" id={m.id} attachments={m.attachments} locked={locked} />
                    <ApprovalPanel type="legal" id={m.id} approval={m.approval} />

                    {!locked && canCreate && (
                      <View style={sty.cardActions}>
                        <TouchableOpacity onPress={() => { loadLegalForEdit(m); window.scrollTo?.(0, 0); }}
                          style={[sty.editBtn, { borderColor: roleColor }]}>
                          <Ionicons name="create-outline" size={14} color={roleColor} />
                          <Text style={[sty.editBtnTxt, { color: roleColor }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${m.title}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteLegalMatter(m.id) },
                        ])} style={[sty.deleteBtn, { borderColor: colors.error }]}>
                          <Ionicons name="trash-outline" size={14} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <FolderWorkspacePanel
            section="legal"
            folders={myFolders}
            files={myFolderFiles}
            roleColor={roleColor}
            colors={colors}
            userName={userName || 'System'}
            addFolder={addMyFolder}
            addFile={addMyFolderFile}
            removeFile={removeMyFolderFile}
            replaceFile={replaceMyFolderFile}
            canManage={hasRestrictedFolderAccess}
          />
          <View style={{ height: 20 }} />
        </KeyboardAwareScrollViewCompat>
      )}

      {/* ════════════════════════════════════════ PROJECTS */}
      {activeTab === 'projects' && (
        <KeyboardAwareScrollViewCompat contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          <View style={sty.summaryRow}>
            {(['Planning','Active','On Hold','Completed'] as CorpProject['status'][]).map(s => {
              const m = PROJ_STATUS_META[s];
              return (
                <View key={s} style={[sty.summaryCard, { backgroundColor: m.bg, borderColor: m.color + '44' }]}>
                  <Text style={[sty.summaryNum, { color: m.color }]}>{corpProjects.filter(p => p.status === s).length}</Text>
                  <Text style={[sty.summaryLabel, { color: m.color }]}>{s}</Text>
                </View>
              );
            })}
          </View>

          {canCreate && (
            <TouchableOpacity onPress={() => { if (showProjForm && editId === null) { setShowProjForm(false); resetProjForm(); } else if (!showProjForm) { setShowProjForm(true); setEditId(null); resetProjForm(); } }}
              style={[sty.addBtn, { backgroundColor: showProjForm && editId === null ? colors.border : roleColor }]}>
              <Ionicons name={showProjForm && editId === null ? 'close' : 'add'} size={16} color={showProjForm && editId === null ? colors.textMuted : '#fff'} />
              <Text style={[sty.addBtnTxt, { color: showProjForm && editId === null ? colors.textMuted : '#fff' }]}>
                {showProjForm && editId === null ? 'Cancel' : 'New Project'}
              </Text>
            </TouchableOpacity>
          )}

          {showProjForm && (
            <View style={[sty.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
              <Text style={[sty.formTitle, { color: colors.text }]}>{editId ? 'Edit Project' : 'New Corporate Project'}</Text>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Project Title *</Text>
              <TextInput value={pTitle} onChangeText={setPTitle} placeholder="e.g. Branch Renovation — Lugbe" placeholderTextColor={colors.textMuted}
                style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Description</Text>
              <TextInput value={pDesc} onChangeText={setPDesc} placeholder="Brief scope of work…" placeholderTextColor={colors.textMuted} multiline numberOfLines={2}
                style={[sty.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Project Lead *</Text>
              <TextInput value={pLead} onChangeText={setPLead} placeholder="e.g. Ngozi Okafor" placeholderTextColor={colors.textMuted}
                style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
              <View style={sty.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Start Date</Text>
                  <TextInput value={pStart} onChangeText={setPStart} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
                    style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Due Date *</Text>
                  <TextInput value={pDue} onChangeText={setPDue} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
                    style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                </View>
              </View>
              <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Status</Text>
              <View style={sty.chipRow}>
                {(['Planning','Active','On Hold'] as CorpProject['status'][]).map(s => {
                  const m = PROJ_STATUS_META[s];
                  return (
                    <TouchableOpacity key={s} onPress={() => setPStat(s)} style={[sty.chip, { backgroundColor: s === pStat ? m.color : colors.background, borderColor: s === pStat ? m.color : colors.border }]}>
                      <Text style={[sty.chipTxt, { color: s === pStat ? '#fff' : colors.textMuted }]}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity onPress={handleSaveProject} style={[sty.submitBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={sty.submitBtnTxt}>{editId ? 'Save Changes' : 'Create Project'}</Text>
              </TouchableOpacity>
              {editId && (
                <TouchableOpacity onPress={() => { setEditId(null); resetProjForm(); setShowProjForm(false); }}
                  style={[sty.cancelEditBtn, { borderColor: colors.border }]}>
                  <Text style={[sty.cancelEditTxt, { color: colors.textMuted }]}>Cancel Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {corpProjects.length === 0 && <EmptySlate icon="hammer-outline" text="No projects yet" />}
          {sortedCorpProjects.map(p => {
            const sm = PROJ_STATUS_META[p.status];
            const am = APPROVAL_META[p.approval.status];
            const locked   = p.approval.status === 'approved';
            const expanded = expandedId === p.id;
            const pct = Math.min(100, Math.max(0, p.progress));
            return (
              <View key={p.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity style={sty.cardHeader} onPress={() => setExpandedId(expanded ? null : p.id)} activeOpacity={0.7}>
                  <View style={[sty.cardIcon, { backgroundColor: sm.bg }]}>
                    <Ionicons name={sm.icon as any} size={18} color={sm.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.cardTitle, { color: colors.text }]}>{p.title}</Text>
                    <Text style={[sty.cardSub, { color: colors.textMuted }]}>Lead: {p.lead}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Pill label={p.status}          color={sm.color} bg={sm.bg} />
                    <Pill label={p.approval.status} color={am.color} bg={am.bg} />
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {/* Progress bar always visible */}
                <View style={sty.progressWrap}>
                  <View style={[sty.progressBg, { backgroundColor: colors.border }]}>
                    <View style={[sty.progressFill, { width: `${pct}%` as any, backgroundColor: sm.color }]} />
                  </View>
                  <Text style={[sty.progressLabel, { color: colors.textMuted }]}>{pct}%</Text>
                </View>

                {expanded && (
                  <View style={[sty.expandBody, { borderTopColor: colors.border }]}>
                    {p.description.length > 0 && <Text style={[sty.noteText, { color: colors.textMuted }]}>{p.description}</Text>}
                    <Text style={[sty.metaTxt, { color: colors.textSubtle }]}>{fmtDate(p.startDate)} → {fmtDate(p.dueDate)}</Text>

                    {/* Progress controls */}
                    {!locked && (canCreate || isCEO || isAdmin) && p.status !== 'Completed' && p.status !== 'Cancelled' && (
                      <TouchableOpacity onPress={() => {
                        const newPct = Math.min(100, pct + 25);
                        updateProjectProgress(p.id, newPct, newPct >= 100 ? 'Completed' : p.status);
                      }} style={[sty.progressBtn, { borderColor: sm.color }]}>
                        <Ionicons name="trending-up-outline" size={14} color={sm.color} />
                        <Text style={[sty.progressBtnTxt, { color: sm.color }]}>Advance Progress +25%</Text>
                      </TouchableOpacity>
                    )}

                    <AttachmentsPanel type="project" id={p.id} attachments={p.attachments} locked={locked} />
                    <ApprovalPanel type="project" id={p.id} approval={p.approval} />

                    {!locked && canCreate && (
                      <View style={sty.cardActions}>
                        <TouchableOpacity onPress={() => loadProjForEdit(p)} style={[sty.editBtn, { borderColor: roleColor }]}>
                          <Ionicons name="create-outline" size={14} color={roleColor} />
                          <Text style={[sty.editBtnTxt, { color: roleColor }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${p.title}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteCorpProject(p.id) },
                        ])} style={[sty.deleteBtn, { borderColor: colors.error }]}>
                          <Ionicons name="trash-outline" size={14} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          <FolderWorkspacePanel
            section="projects"
            folders={myFolders}
            files={myFolderFiles}
            roleColor={roleColor}
            colors={colors}
            userName={userName || 'System'}
            addFolder={addMyFolder}
            addFile={addMyFolderFile}
            removeFile={removeMyFolderFile}
            replaceFile={replaceMyFolderFile}
            canManage={hasRestrictedFolderAccess}
          />
          <View style={{ height: 20 }} />
        </KeyboardAwareScrollViewCompat>
      )}

      {/* ════════════════════════════════════════ MEETING MINUTES */}
      {activeTab === 'minutes' && (() => {
        const isStaffOnly = !isCSM && !isCEO && !isAdmin;
        const sharedMinutes = meetingMinutes.filter(m => m.shared);

        /* ── Staff-only view: read-only shared minutes ── */
        if (isStaffOnly) return (
          <KeyboardAwareScrollViewCompat contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false} bottomOffset={32}>
            <View style={[sty.sharedBanner, { backgroundColor: '#EAF2ED', borderColor: '#28624740' }]}>
              <Ionicons name="share-social" size={16} color="#286247" />
              <Text style={[sty.sharedBannerTxt, { color: '#286247' }]}>
                Minutes shared with you by Corporate Services
              </Text>
            </View>
            {sharedMinutes.length === 0 && <EmptySlate icon="reader-outline" text="No minutes have been shared with staff yet" />}
            {sharedMinutes.map(m => {
              const expanded = expandedId === m.id;
              return (
                <View key={m.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: '#28624740' }]}>
                  <TouchableOpacity style={sty.cardHeader} onPress={() => setExpandedId(expanded ? null : m.id)} activeOpacity={0.7}>
                    <View style={[sty.cardIcon, { backgroundColor: '#28624718' }]}>
                      <Ionicons name="reader" size={18} color="#286247" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[sty.cardTitle, { color: colors.text }]}>{m.title}</Text>
                      <Text style={[sty.cardSub, { color: colors.textMuted }]}>{fmtDate(m.date)} · {m.venue}</Text>
                    </View>
                    <View style={[sty.sharedPill, { backgroundColor: '#EAF2ED' }]}>
                      <Ionicons name="share-social" size={10} color="#286247" />
                      <Text style={[sty.sharedPillTxt, { color: '#286247' }]}>Shared</Text>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>

                  {m.attendees.length > 0 && (
                    <View style={[sty.attendeeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                      <Text style={[sty.attendeeTxt, { color: colors.textMuted }]}>{m.attendees}</Text>
                    </View>
                  )}
                  <Text style={[sty.noteText, { color: colors.text }]} numberOfLines={expanded ? undefined : 2}>{m.summary}</Text>

                  {expanded && m.attachments.length > 0 && (
                    <View style={[sty.expandBody, { borderTopColor: colors.border }]}>
                      <Text style={[sty.attTitle, { color: colors.text, marginBottom: 6 }]}>
                        <Ionicons name="attach" size={13} color={colors.textMuted} /> Attachments ({m.attachments.length})
                      </Text>
                      {m.attachments.map(a => {
                        const fi = FILE_TYPE_MAP[a.fileType] || FILE_TYPE_MAP.other;
                        return (
                          <View key={a.id} style={[sty.attItem, { borderColor: colors.border }]}>
                            <View style={[sty.attIcon, { backgroundColor: fi.color + '18' }]}>
                              <Ionicons name={fi.icon as any} size={16} color={fi.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[sty.attName, { color: colors.text }]} numberOfLines={1}>{a.name}</Text>
                              <Text style={[sty.attMeta, { color: colors.textMuted }]}>{a.size} · {fmtDate(a.uploadedAt)}</Text>
                            </View>
                          </View>
                        );
                      })}
                      {m.sharedBy && (
                        <Text style={[sty.metaTxt, { color: colors.textSubtle, marginTop: 6 }]}>
                          Shared by {m.sharedBy} · {fmtDate(m.sharedAt ?? '')}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <FolderWorkspacePanel
              section="minutes"
              folders={myFolders}
              files={myFolderFiles}
              roleColor={roleColor}
              colors={colors}
              userName={userName || 'System'}
              addFolder={addMyFolder}
              addFile={addMyFolderFile}
              removeFile={removeMyFolderFile}
              replaceFile={replaceMyFolderFile}
              canManage={hasRestrictedFolderAccess}
            />
            <View style={{ height: 20 }} />
          </KeyboardAwareScrollViewCompat>
        );

        /* ── CSM / CEO / Admin view: full management ── */
        return (
          <KeyboardAwareScrollViewCompat contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={24}>
            {/* Sharing summary */}
            {sharedMinutes.length > 0 && (
              <View style={[sty.sharedBanner, { backgroundColor: '#E5F1E9', borderColor: '#1F684840' }]}>
                <Ionicons name="share-social" size={15} color="#1F6848" />
                <Text style={[sty.sharedBannerTxt, { color: '#1F6848' }]}>
                  {sharedMinutes.length} {sharedMinutes.length === 1 ? 'record' : 'records'} shared with all staff
                </Text>
              </View>
            )}

            {canCreate && (
              <TouchableOpacity onPress={() => { if (showMinForm && editId === null) { setShowMinForm(false); resetMinForm(); } else if (!showMinForm) { setShowMinForm(true); setEditId(null); resetMinForm(); } }}
                style={[sty.addBtn, { backgroundColor: showMinForm && editId === null ? colors.border : roleColor }]}>
                <Ionicons name={showMinForm && editId === null ? 'close' : 'add'} size={16} color={showMinForm && editId === null ? colors.textMuted : '#fff'} />
                <Text style={[sty.addBtnTxt, { color: showMinForm && editId === null ? colors.textMuted : '#fff' }]}>
                  {showMinForm && editId === null ? 'Cancel' : 'Record Minutes'}
                </Text>
              </TouchableOpacity>
            )}

            {showMinForm && (
              <View style={[sty.form, { backgroundColor: colors.surface, borderColor: roleColor + '44' }]}>
                <Text style={[sty.formTitle, { color: colors.text }]}>{editId ? 'Edit Meeting Minutes' : 'Meeting Minutes'}</Text>
                <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Meeting Title *</Text>
                <TextInput value={mTitle} onChangeText={setMTitle} placeholder="e.g. Board Meeting — Q3 Review" placeholderTextColor={colors.textMuted}
                  style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                <View style={sty.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Date</Text>
                    <TextInput value={mDate} onChangeText={setMDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
                      style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Venue</Text>
                    <TextInput value={mVenue} onChangeText={setMVenue} placeholder="e.g. HQ Boardroom" placeholderTextColor={colors.textMuted}
                      style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                  </View>
                </View>
                <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Attendees</Text>
                <TextInput value={mAtt} onChangeText={setMAtt} placeholder="e.g. CEO, MD, CSM, ACC" placeholderTextColor={colors.textMuted}
                  style={[sty.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                <Text style={[sty.fieldLabel, { color: colors.textMuted }]}>Key Decisions / Summary *</Text>
                <TextInput value={mSummary} onChangeText={setMSummary}
                  placeholder="Record agenda items, key decisions, and action points…"
                  placeholderTextColor={colors.textMuted} multiline numberOfLines={5}
                  style={[sty.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, minHeight: 100 }]} />
                <TouchableOpacity onPress={handleSaveMinutes} style={[sty.submitBtn, { backgroundColor: roleColor }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={sty.submitBtnTxt}>{editId ? 'Save Changes' : 'Save Minutes'}</Text>
                </TouchableOpacity>
                {editId && (
                  <TouchableOpacity onPress={() => { setEditId(null); resetMinForm(); setShowMinForm(false); }}
                    style={[sty.cancelEditBtn, { borderColor: colors.border }]}>
                    <Text style={[sty.cancelEditTxt, { color: colors.textMuted }]}>Cancel Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {meetingMinutes.length === 0 && <EmptySlate icon="reader-outline" text="No meeting minutes recorded" />}
            {sortedMeetingMinutes.map(m => {
              const am = APPROVAL_META[m.approval.status];
              const locked   = m.approval.status === 'approved';
              const expanded = expandedId === m.id;
              return (
                <View key={m.id} style={[sty.card, { backgroundColor: colors.surface, borderColor: m.shared ? '#28624740' : colors.border }]}>
                  <TouchableOpacity style={sty.cardHeader} onPress={() => setExpandedId(expanded ? null : m.id)} activeOpacity={0.7}>
                    <View style={[sty.cardIcon, { backgroundColor: roleColor + '18' }]}>
                      <Ionicons name="reader" size={18} color={roleColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[sty.cardTitle, { color: colors.text }]}>{m.title}</Text>
                      <Text style={[sty.cardSub, { color: colors.textMuted }]}>{fmtDate(m.date)} · {m.venue}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Pill label={m.approval.status} color={am.color} bg={am.bg} />
                      {m.shared && (
                        <View style={[sty.sharedPill, { backgroundColor: '#EAF2ED' }]}>
                          <Ionicons name="share-social" size={10} color="#286247" />
                          <Text style={[sty.sharedPillTxt, { color: '#286247' }]}>Shared</Text>
                        </View>
                      )}
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>

                  {m.attendees.length > 0 && (
                    <View style={[sty.attendeeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                      <Text style={[sty.attendeeTxt, { color: colors.textMuted }]}>{m.attendees}</Text>
                    </View>
                  )}

                  {!expanded && (
                    <Text style={[sty.noteText, { color: colors.text }]} numberOfLines={2}>{m.summary}</Text>
                  )}

                  {expanded && (
                    <View style={[sty.expandBody, { borderTopColor: colors.border }]}>
                      <Text style={[sty.noteText, { color: colors.text }]}>{m.summary}</Text>
                      <Text style={[sty.metaTxt, { color: colors.textSubtle }]}>Recorded by {m.by}</Text>

                      <AttachmentsPanel type="minutes" id={m.id} attachments={m.attachments} locked={locked} />
                      <ApprovalPanel type="minutes" id={m.id} approval={m.approval} />

                      <View style={sty.cardActions}>
                        {!locked && canCreate && (
                          <>
                            <TouchableOpacity onPress={() => loadMinForEdit(m)} style={[sty.editBtn, { borderColor: roleColor }]}>
                              <Ionicons name="create-outline" size={14} color={roleColor} />
                              <Text style={[sty.editBtnTxt, { color: roleColor }]}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => Alert.alert('Delete', `Remove "${m.title}"?`, [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => deleteMeetingMinutes(m.id) },
                            ])} style={[sty.deleteBtn, { borderColor: colors.error }]}>
                              <Ionicons name="trash-outline" size={14} color={colors.error} />
                            </TouchableOpacity>
                          </>
                        )}
                        {/* Share toggle — CSM and admin */}
                        {canCreate && (
                          <TouchableOpacity
                            onPress={() => {
                              if (m.shared) {
                                Alert.alert('Stop Sharing', `Remove "${m.title}" from staff view?`, [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Stop Sharing', style: 'destructive', onPress: () => updateMeetingMinutes(m.id, { shared: false, sharedAt: undefined, sharedBy: undefined }) },
                                ]);
                              } else {
                                updateMeetingMinutes(m.id, { shared: true, sharedAt: new Date().toISOString(), sharedBy: userName || 'System' });
                                Alert.alert('Shared', 'These minutes are now visible to all staff.');
                              }
                            }}
                            style={[sty.shareBtn, {
                              backgroundColor: m.shared ? '#EAF2ED' : colors.background,
                              borderColor: m.shared ? '#286247' : colors.border,
                            }]}>
                            <Ionicons name={m.shared ? 'share-social' : 'share-social-outline'} size={13} color={m.shared ? '#286247' : colors.textMuted} />
                            <Text style={[sty.shareBtnTxt, { color: m.shared ? '#286247' : colors.textMuted }]}>
                              {m.shared ? 'Shared' : 'Share with Staff'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            <FolderWorkspacePanel
              section="minutes"
              folders={myFolders}
              files={myFolderFiles}
              roleColor={roleColor}
              colors={colors}
              userName={userName || 'System'}
              addFolder={addMyFolder}
              addFile={addMyFolderFile}
              removeFile={removeMyFolderFile}
              replaceFile={replaceMyFolderFile}
              canManage={hasRestrictedFolderAccess}
            />
            <View style={{ height: 20 }} />
          </KeyboardAwareScrollViewCompat>
        );
      })()}

      {activeTab === 'general' && (
        <KeyboardAwareScrollViewCompat contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false} bottomOffset={32}>
          <View style={[sty.libraryIntro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[sty.workspaceIcon, { backgroundColor: roleColor + '18' }]}>
              <Ionicons name="library-outline" size={21} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sty.workspaceTitle, { color: colors.text }]}>Company General Library</Text>
              <Text style={[sty.libraryIntroText, { color: colors.textMuted }]}>
                Shared resources for everyone, including company handbooks, standard operating procedures, safety manuals and other guidance.
              </Text>
            </View>
          </View>
          <FolderWorkspacePanel
            section="general"
            folders={myFolders}
            files={myFolderFiles}
            roleColor={roleColor}
            colors={colors}
            userName={userName || 'System'}
            addFolder={addMyFolder}
            addFile={addMyFolderFile}
            removeFile={removeMyFolderFile}
            replaceFile={replaceMyFolderFile}
            canManage={hasRestrictedFolderAccess}
          />
          <View style={{ height: 20 }} />
        </KeyboardAwareScrollViewCompat>
      )}

      {activeTab === 'correspondences' && (
        <KeyboardAwareScrollViewCompat contentContainerStyle={sty.scroll} showsVerticalScrollIndicator={false} bottomOffset={32}>
          <View style={[sty.libraryIntro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[sty.workspaceIcon, { backgroundColor: roleColor + '18' }]}>
              <Ionicons name="mail-open-outline" size={21} color={roleColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sty.workspaceTitle, { color: colors.text }]}>Company Correspondences</Text>
              <Text style={[sty.libraryIntroText, { color: colors.textMuted }]}>
                Store letters, emails, notices, memos and other miscellaneous company correspondence. Create subfolders to keep records organized.
              </Text>
            </View>
          </View>
          <FolderWorkspacePanel
            section="correspondences"
            folders={myFolders}
            files={myFolderFiles}
            roleColor={roleColor}
            colors={colors}
            userName={userName || 'System'}
            addFolder={addMyFolder}
            addFile={addMyFolderFile}
            removeFile={removeMyFolderFile}
            replaceFile={replaceMyFolderFile}
            canManage={hasRestrictedFolderAccess}
          />
          <View style={{ height: 20 }} />
        </KeyboardAwareScrollViewCompat>
      )}

      {/* ════════════════════════════════ SUBMIT MODAL */}
      <Modal visible={!!submitTarget} transparent animationType="fade">
        <View style={sty.modalBackdrop}>
          <View style={[sty.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[sty.modalTitle, { color: colors.text }]}>Submit for Approval</Text>
            <Text style={[sty.modalSub, { color: colors.textMuted }]}>Select who should review this record:</Text>
            <View style={sty.chipRow}>
              {(['CEO', 'MD', 'Both'] as const).map(opt => (
                <TouchableOpacity key={opt} onPress={() => setSubmitTo(opt)}
                  style={[sty.chip, { backgroundColor: opt === submitTo ? roleColor : colors.background, borderColor: opt === submitTo ? roleColor : colors.border, flex: 1, justifyContent: 'center' }]}>
                  <Text style={[sty.chipTxt, { color: opt === submitTo ? '#fff' : colors.textMuted, textAlign: 'center' }]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={sty.modalActions}>
              <TouchableOpacity onPress={() => setSubmitTarget(null)} style={[sty.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[sty.modalCancelTxt, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSubmit} style={[sty.modalConfirmBtn, { backgroundColor: roleColor }]}>
                <Ionicons name="paper-plane" size={14} color="#fff" />
                <Text style={sty.modalConfirmTxt}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════ REJECT MODAL */}
      <Modal visible={!!rejectTarget} transparent animationType="fade">
        <KeyboardAwareScrollViewCompat contentContainerStyle={sty.modalBackdrop} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          <View style={[sty.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[sty.modalTitle, { color: colors.text }]}>Reject Record</Text>
            <Text style={[sty.modalSub, { color: colors.textMuted }]}>State the reason for rejection so CSM can correct:</Text>
            <TextInput value={rejectReason} onChangeText={setRejectReason}
              placeholder="e.g. Incorrect party details, missing supporting documents…"
              placeholderTextColor={colors.textMuted} multiline numberOfLines={4}
              style={[sty.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, minHeight: 80 }]} />
            <View style={sty.modalActions}>
              <TouchableOpacity onPress={() => { setRejectTarget(null); setRejectReason(''); }} style={[sty.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[sty.modalCancelTxt, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReject} style={[sty.modalConfirmBtn, { backgroundColor: '#365A47' }]}>
                <Ionicons name="close-circle" size={14} color="#fff" />
                <Text style={sty.modalConfirmTxt}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareScrollViewCompat>
      </Modal>

    </ScreenLayout>
  );
}

// ── Shared pill styles ──────────────────────────────────────────────────────
const sp = StyleSheet.create({
  pill:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  pillText:{ fontSize: 10, fontWeight: '700' },
  empty:   { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTxt:{ fontSize: 14 },
});

// ── Main styles ─────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  accessDeniedTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  accessDeniedText: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 340 },
  workspacePanel: { borderRadius: 15, borderWidth: 1, padding: 13, marginTop: 8, marginBottom: 8, gap: 10 },
  workspaceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  workspaceIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  workspaceTitle: { fontSize: 14, fontWeight: '800' },
  workspaceSub: { fontSize: 11, marginTop: 2 },
  workspaceStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 12, paddingVertical: 9 },
  workspaceStatNumber: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  workspaceStatLabel: { fontSize: 10, marginTop: 1, textAlign: 'center' },
  workspaceStatDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  libraryIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 15, borderWidth: 1, padding: 13, marginBottom: 8 },
  libraryIntroText: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  folderCreateRow: { flexDirection: 'row', gap: 8 },
  folderInput: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12 },
  folderCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9, paddingHorizontal: 11 },
  folderCreateTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  folderTiles: { gap: 9, paddingVertical: 2, paddingRight: 4 },
  folderTile: { width: 132, minHeight: 92, borderWidth: 1, borderRadius: 13, padding: 11, justifyContent: 'space-between' },
  folderTileTitle: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  folderTileMeta: { fontSize: 10, marginTop: 3 },
  uploadAnyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, paddingVertical: 11 },
  uploadAnyTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  workspaceFilesLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  workspaceEmpty: { fontSize: 11, fontStyle: 'italic', paddingVertical: 4 },
  workspaceFile: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  workspaceFileIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  workspaceFileName: { fontSize: 12, fontWeight: '700' },
  workspaceFileMeta: { fontSize: 10, marginTop: 2 },
  fileExpiry: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 4, marginTop: 6 },
  fileExpiryText: { fontSize: 9, fontWeight: '700' },
  workspaceFileActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 7 },
  workspaceFileAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  workspaceFileActionText: { fontSize: 9, fontWeight: '700' },
  detailsBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.52)', justifyContent: 'flex-end', padding: 12 },
  detailsCard: { borderRadius: 18, padding: 16, gap: 9 },
  detailsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 },
  detailsTitle: { fontSize: 17, fontWeight: '800' },
  detailsSubtitle: { fontSize: 11, marginTop: 3 },
  detailsLabel: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  detailsChoiceRow: { flexDirection: 'row', gap: 8 },
  detailsChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  detailsChoiceText: { fontSize: 12, fontWeight: '800' },
  detailsInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 14 },
  detailsHint: { fontSize: 10, lineHeight: 14 },
  detailsSubmit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 11, paddingVertical: 12, marginTop: 3 },
  detailsSubmitText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  previewCard: { width: '100%', maxWidth: 390, borderRadius: 16, padding: 12 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  previewTitle: { flex: 1, fontSize: 14, fontWeight: '800' },
  previewImage: { width: '100%', height: 500, borderRadius: 10, backgroundColor: '#101418' },
  folderNavWrap:       { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  folderNavEyebrow:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  folderNavTitle:      { fontSize: 18, fontWeight: '800', marginTop: 3 },
  folderNavSub:        { fontSize: 11, lineHeight: 15, marginTop: 3, marginBottom: 12 },
  folderNavGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  folderNavTile:       { width: '48%', minHeight: 112, borderWidth: 1, borderRadius: 14, padding: 11, justifyContent: 'space-between' },
  folderNavTileSolo:   { width: '100%' },
  folderNavTileTop:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  folderNavIcon:       { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  folderNavTileLabel:  { fontSize: 14, fontWeight: '800', lineHeight: 17, marginTop: 9 },
  folderNavTileDesc:   { fontSize: 10, lineHeight: 14, marginTop: 3 },

  scroll:        { padding: 14 },

  summaryRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCard:   { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  summaryNum:    { fontSize: 20, fontWeight: '700' },
  summaryLabel:  { fontSize: 9, marginTop: 2, textAlign: 'center' },

  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginBottom: 14, alignSelf: 'flex-start' },
  addBtnTxt:     { fontSize: 13, fontWeight: '700' },

  form:          { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14, gap: 2 },
  formTitle:     { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  fieldLabel:    { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  textInput:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  textArea:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlignVertical: 'top' },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  chipTxt:       { fontSize: 11, fontWeight: '600' },
  twoCol:        { flexDirection: 'row', gap: 10 },
  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  submitBtnTxt:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelEditBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: 10, marginTop: 6, borderWidth: 1 },
  cancelEditTxt: { fontSize: 13, fontWeight: '600' },

  card:          { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  cardIcon:      { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle:     { fontSize: 14, fontWeight: '600' },
  cardSub:       { fontSize: 11, marginTop: 2 },
  noteText:      { fontSize: 12, lineHeight: 17, paddingHorizontal: 13 },
  expandBody:    { borderTopWidth: StyleSheet.hairlineWidth, padding: 13, gap: 10 },
  metaTxt:       { fontSize: 10 },
  cardActions:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  editBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  editBtnTxt:    { fontSize: 12, fontWeight: '600' },
  deleteBtn:     { padding: 7, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconBtn:       { padding: 7, borderRadius: 8, borderWidth: 1 },

  infoRow:       { flexDirection: 'row', gap: 24, padding: 13, paddingTop: 0 },
  infoLabel:     { fontSize: 10 },
  infoValue:     { fontSize: 13, fontWeight: '600', marginTop: 1 },
  alertBanner:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, margin: 13, marginTop: 0, borderRadius: 8 },
  alertText:     { flex: 1, fontSize: 12, lineHeight: 17 },

  progressWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingBottom: 10 },
  progressBg:    { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 5, borderRadius: 3 },
  progressLabel: { fontSize: 11, fontWeight: '600', width: 32, textAlign: 'right' },
  progressBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  progressBtnTxt:{ fontSize: 12, fontWeight: '600' },

  attendeeRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 13, marginBottom: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  attendeeTxt:   { fontSize: 11, flex: 1 },

  // Approval panel
  approvalWrap:     { borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  approvalHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  approvalStatus:   { fontSize: 13, fontWeight: '700' },
  approvalSub:      { fontSize: 11, opacity: 0.8 },
  rejectionBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  rejectionLabel:   { fontSize: 10, fontWeight: '700', color: '#365A47', marginBottom: 2 },
  rejectionText:    { fontSize: 12, lineHeight: 17, color: '#365A47' },
  rejectionBy:      { fontSize: 10, color: '#365A47', marginTop: 4, fontStyle: 'italic' },
  approvedBy:       { fontSize: 11, fontWeight: '600' },
  approvalActions:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  actionBtnTxt:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  lockedTag:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  lockedTxt:        { fontSize: 11, fontWeight: '700' },

  // Attachment panel
  attWrap:       { gap: 6 },
  attHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attTitle:      { flex: 1, fontSize: 12, fontWeight: '700' },
  attAddBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  attAddTxt:     { fontSize: 11, fontWeight: '700' },
  attForm:       { borderRadius: 10, borderWidth: 1, padding: 10, gap: 2 },
  typeRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 4 },
  typeBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  typeBtnTxt:    { fontSize: 10, fontWeight: '700' },
  attSubmitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, marginTop: 6 },
  attSubmitTxt:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  attItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  attIcon:       { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  attName:       { fontSize: 12, fontWeight: '600' },
  attMeta:       { fontSize: 10, marginTop: 1 },
  attRemove:     { padding: 6 },
  attEmpty:      { fontSize: 11, fontStyle: 'italic', paddingVertical: 6 },

  divider:         { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 18 },
  subSectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },

  sharedBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  sharedBannerTxt: { flex: 1, fontSize: 12, fontWeight: '600' },
  sharedPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  sharedPillTxt:   { fontSize: 10, fontWeight: '700' },
  shareBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  shareBtnTxt:     { fontSize: 12, fontWeight: '600' },

  // Documents section
  uploadPanel:   { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  uploadHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  uploadTitle:   { fontSize: 15, fontWeight: '700' },
  sectionTitle:  { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  fileCard:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  fileIconWrap:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileName:      { fontSize: 13, fontWeight: '600' },
  fileMeta:      { fontSize: 11, marginTop: 2 },
  fileBy:        { fontSize: 10, marginTop: 2 },

  // Modals
  modalBackdrop:   { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard:       { width: '100%', maxWidth: 360, borderRadius: 16, padding: 20, gap: 12 },
  modalTitle:      { fontSize: 17, fontWeight: '700' },
  modalSub:        { fontSize: 13 },
  modalActions:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  modalCancelTxt:  { fontSize: 14, fontWeight: '600' },
  modalConfirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  modalConfirmTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
