import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { FolderWorkspacePanel } from '@/app/(app)/corporate';
import {
  MY_FOLDER_ALLOWED_ROLES,
  ROLE_COLORS,
  useApp,
  type MyFolderSection,
  type Role,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const WORKSPACE_META: Record<MyFolderSection, {
  label: string;
  description: string;
  icon: string;
}> = {
  compliance: {
    label: 'Compliance',
    description: 'Licences, certificates, renewals, and regulatory records.',
    icon: 'shield-checkmark',
  },
  legal: {
    label: 'Legal Documents',
    description: 'Agreements, legal records, matters, and supporting files.',
    icon: 'scale',
  },
  projects: {
    label: 'Projects',
    description: 'Project briefs, plans, delivery records, and working files.',
    icon: 'hammer',
  },
  minutes: {
    label: 'Minutes of Meetings',
    description: 'Meeting records, decisions, and follow-up documents.',
    icon: 'reader',
  },
  correspondences: {
    label: 'Correspondences',
    description: 'Letters, notices, emails, memos, and official replies.',
    icon: 'mail',
  },
  general: {
    label: 'General Library',
    description: 'Shared handbooks, procedures, safety manuals, and guidance.',
    icon: 'library',
  },
};

function parseSection(value: string | string[] | undefined): MyFolderSection | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && candidate in WORKSPACE_META ? candidate as MyFolderSection : null;
}

export default function CorporateWorkspaceScreen() {
  const { section: rawSection } = useLocalSearchParams<{ section?: string }>();
  const section = parseSection(rawSection);
  const {
    role,
    userName,
    myFolders,
    myFolderFiles,
    addMyFolder,
    addMyFolderFile,
    removeMyFolderFile,
    replaceMyFolderFile,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'csm'] || colors.primary;
  const canView = !!role && !!section
    && (section === 'general' || MY_FOLDER_ALLOWED_ROLES.includes(role as Role));
  const meta = section ? WORKSPACE_META[section] : null;

  if (!canView || !section || !meta) {
    return (
      <ScreenLayout title="Document workspace">
        <View style={styles.emptyPage}>
          <Ionicons name="lock-closed-outline" size={42} color={colors.textSubtle} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Workspace unavailable</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            This document workspace is unavailable or you do not have permission to view it.
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title={meta.label}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: roleColor + '18' }]}>
            <Ionicons name={meta.icon as any} size={23} color={roleColor} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: roleColor }]}>Document workspace</Text>
            <Text style={[styles.title, { color: colors.text }]}>{meta.label}</Text>
            <Text style={[styles.description, { color: colors.textMuted }]}>{meta.description}</Text>
          </View>
        </View>

        <View style={[styles.tip, { backgroundColor: roleColor + '10', borderColor: roleColor + '30' }]}>
          <Ionicons name="information-circle-outline" size={16} color={roleColor} />
          <Text style={[styles.tipText, { color: colors.textMuted }]}>
            Select a folder to browse its files. Tap Preview on any file to open its dedicated file page.
          </Text>
        </View>

        <FolderWorkspacePanel
          section={section}
          folders={myFolders}
          files={myFolderFiles}
          roleColor={roleColor}
          colors={colors}
          userName={userName || 'System'}
          addFolder={addMyFolder}
          addFile={addMyFolderFile}
          removeFile={removeMyFolderFile}
          replaceFile={replaceMyFolderFile}
          canManage={MY_FOLDER_ALLOWED_ROLES.includes(role as Role)}
        />
        <View style={styles.bottomSpace} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 14 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 10 },
  heroIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 21, fontWeight: '800', marginTop: 3 },
  description: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 11, borderWidth: 1, padding: 11, marginBottom: 10 },
  tipText: { flex: 1, fontSize: 11, lineHeight: 16 },
  emptyPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyText: { maxWidth: 340, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  bottomSpace: { height: 24 },
});