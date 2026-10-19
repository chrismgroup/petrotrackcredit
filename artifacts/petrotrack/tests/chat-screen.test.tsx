import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

import CommsScreen from '@/app/(app)/comms';
import { useApp } from '@/context/AppContext';
import { chatApi, type ChatConversation, type ChatMessage } from '@/lib/api';

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  return {
    ActivityIndicator: primitive('ActivityIndicator'),
    Alert: { alert: jest.fn() },
    Image: primitive('Image'),
    KeyboardAvoidingView: primitive('KeyboardAvoidingView'),
    Modal: ({ visible, children }: any) => (visible ? React.createElement('Modal', null, children) : null),
    Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web ?? options.default },
    Pressable: primitive('Pressable'),
    ScrollView: primitive('ScrollView'),
    Share: { share: jest.fn(async () => undefined) },
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    TurboModuleRegistry: { get: jest.fn(() => null), getEnforcing: jest.fn(() => null) },
    View: primitive('View'),
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/lib/foreground-timer', () => ({ startForegroundTimer: () => () => undefined }));
jest.mock('@/lib/stored-files', () => ({
  downloadStoredFile: jest.fn(),
  exportStoredFile: jest.fn(),
  printStoredFile: jest.fn(),
  storedFilePreviewRoute: jest.fn(() => '/preview'),
  useStoredFileSource: () => null,
}));
jest.mock('@/components/ScreenLayout', () => {
  const React = require('react');
  return { ScreenLayout: ({ children }: any) => React.createElement('ScreenLayout', null, children) };
});
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff', surface: '#fafafa', border: '#ddd', inputBorder: '#ccc',
    text: '#111', textMuted: '#666', textSubtle: '#999', primary: '#185fa5', error: '#a32d2d',
  }),
}));
jest.mock('@/context/AppContext', () => ({
  ROLE_COLORS: { csm: '#0d6e56', acc: '#4b3c8f', att: '#374151' },
  ROLE_LABELS: { csm: 'HR', acc: 'Accountant', att: 'Attendant' },
  useApp: jest.fn(),
}));

const mockedUseApp = useApp as jest.MockedFunction<typeof useApp>;
const api = jest.mocked(chatApi);

const members = [
  { username: 'demo.hr', empName: 'Hannah Resources', appRole: 'csm', role: 'admin' as const, joinedAt: '2026-10-01T08:00:00Z' },
  { username: 'demo.acc', empName: 'Ada Accounts', appRole: 'acc', role: 'member' as const, joinedAt: '2026-10-01T08:00:00Z' },
];

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 1, conversationId: 7, sender: 'demo.acc', senderName: 'Ada Accounts', kind: 'text', body: 'Hello',
    media: null, replyTo: null, forwarded: false, createdAt: new Date().toISOString(), editedAt: null,
    deleted: false, pinnedAt: null, pinnedBy: null, reactions: [], seenCount: 0, recipientCount: 1,
    ...overrides,
  };
}

const direct: ChatConversation = {
  id: 7, kind: 'direct', name: null, createdBy: 'demo.hr', createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z', myRole: 'member', archived: false, unread: 2, lastReadMessageId: 0,
  members, lastMessage: message({ id: 2, body: 'Please send the report' }),
};

function nodeText(node: ReactTestInstance): string {
  return node.children.map(child => (typeof child === 'string' ? child : nodeText(child as ReactTestInstance))).join('');
}

function byLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const target = renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.type === 'string')[0];
  if (!target) throw new Error(`Missing element: ${label}`);
  return target;
}

async function press(renderer: ReactTestRenderer, label: string) {
  await act(async () => { await byLabel(renderer, label).props.onPress(); });
}

function screenText(renderer: ReactTestRenderer): string {
  return nodeText(renderer.root);
}

async function renderScreen() {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<CommsScreen />); });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).window = Object.assign((globalThis as any).window ?? {}, {
    confirm: jest.fn(() => true),
    alert: jest.fn(),
  });
  mockedUseApp.mockReturnValue({
    role: 'csm',
    userName: 'Hannah Resources',
    accountUsername: 'demo.hr',
    refreshChatUnread: jest.fn(async () => undefined),
    userAccounts: [
      { id: 1, username: 'demo.hr', empName: 'Hannah Resources', role: 'csm', status: 'active' },
      { id: 2, username: 'demo.acc', empName: 'Ada Accounts', role: 'acc', status: 'active' },
      { id: 3, username: 'demo.att', empName: 'Tunde Attendant', role: 'att', status: 'active' },
    ],
  } as any);
  api.conversations.mockResolvedValue({ conversations: [direct] });
  api.messages.mockResolvedValue({
    messages: [
      message({ id: 1, body: 'Good morning' }),
      message({ id: 2, body: 'Please send the report' }),
      message({ id: 3, sender: 'demo.hr', senderName: 'Hannah Resources', body: 'Sending now', seenCount: 1 }),
    ],
    hasMore: false,
  });
  api.pinned.mockResolvedValue({ messages: [] });
  api.markRead.mockResolvedValue({ ok: true, lastReadMessageId: 3 });
});

test('the inbox lists server conversations with unread counts and previews', async () => {
  const renderer = await renderScreen();
  const text = screenText(renderer);
  expect(text).toContain('Ada Accounts');
  expect(text).toContain('Please send the report');
  expect(text).toContain('2 unread messages');
});

test('opening a chat loads messages, marks it read, and sends a reply', async () => {
  const renderer = await renderScreen();
  await press(renderer, 'Open chat Ada Accounts');

  expect(api.messages).toHaveBeenCalledWith(7, { limit: 50 });
  expect(api.markRead).toHaveBeenCalledWith(7);
  expect(screenText(renderer)).toContain('Good morning');

  const sent = message({ id: 4, sender: 'demo.hr', senderName: 'Hannah Resources', body: 'Report attached' });
  api.send.mockResolvedValue({ message: sent });
  await act(async () => { byLabel(renderer, 'Message').props.onChangeText('Report attached'); });
  await press(renderer, 'Send message');

  expect(api.send).toHaveBeenCalledWith(7, { body: 'Report attached', replyToId: undefined });
  expect(screenText(renderer)).toContain('Report attached');
});

test('senders can edit and delete their message for everyone; others only for themselves', async () => {
  const renderer = await renderScreen();
  await press(renderer, 'Open chat Ada Accounts');

  await press(renderer, 'Message from Ada Accounts');
  expect(() => byLabel(renderer, 'Delete for everyone')).toThrow();
  expect(() => byLabel(renderer, 'Edit')).toThrow();
  byLabel(renderer, 'Delete for me');
  await press(renderer, 'Close');

  await press(renderer, 'Message from you');
  await press(renderer, 'Edit');
  api.edit.mockResolvedValue({ message: message({ id: 3, sender: 'demo.hr', body: 'Sending in 5 minutes', editedAt: new Date().toISOString() }) });
  await act(async () => { byLabel(renderer, 'Message').props.onChangeText('Sending in 5 minutes'); });
  await press(renderer, 'Save edit');
  expect(api.edit).toHaveBeenCalledWith(3, 'Sending in 5 minutes');
  expect(screenText(renderer)).toContain('edited');

  api.remove.mockResolvedValue({ ok: true, scope: 'everyone', conversationId: 7 });
  await press(renderer, 'Message from you');
  await press(renderer, 'Delete for everyone');
  expect(window.confirm).toHaveBeenCalled();
  expect(api.remove).toHaveBeenCalledWith(3, 'everyone');
});

test('anyone can create a group with selected staff', async () => {
  const group: ChatConversation = { ...direct, id: 9, kind: 'group', name: 'Station Team', myRole: 'admin', unread: 0, lastMessage: null };
  api.createGroup.mockResolvedValue({ conversation: group });
  const renderer = await renderScreen();

  await press(renderer, 'New group');
  await act(async () => { byLabel(renderer, 'Group name').props.onChangeText('Station Team'); });
  await press(renderer, 'Ada Accounts');
  await press(renderer, 'Tunde Attendant');
  await press(renderer, 'Create group');

  expect(api.createGroup).toHaveBeenCalledWith('Station Team', ['demo.acc', 'demo.att']);
});
