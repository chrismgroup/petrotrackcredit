const mockPlatform = { OS: 'ios' as string };
const mockFetchObject = jest.fn();
const mockDownloadObject = jest.fn();
const mockObjectSource = jest.fn();
const mockDeleteAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockRequestDirectoryPermissionsAsync = jest.fn();
const mockCreateFileAsync = jest.fn();

jest.mock('react-native', () => ({ Platform: mockPlatform, Linking: { openURL: jest.fn() } }));
jest.mock('@/lib/api', () => ({
  storageApi: {
    fetchObject: (...args: unknown[]) => mockFetchObject(...args),
    downloadObject: (...args: unknown[]) => mockDownloadObject(...args),
    objectSource: (...args: unknown[]) => mockObjectSource(...args),
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  EncodingType: { Base64: 'base64' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: (...args: unknown[]) => mockRequestDirectoryPermissionsAsync(...args),
    createFileAsync: (...args: unknown[]) => mockCreateFileAsync(...args),
  },
}));
const mockPrintAsync = jest.fn();
jest.mock('expo-print', () => ({
  printAsync: (...args: unknown[]) => mockPrintAsync(...args),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  clearViewedFiles, downloadStoredFile, exportStoredFile, printStoredFile, resolveStoredFileUri,
  storedFileKind, storedFilePreviewRoute,
} = require('../lib/stored-files') as typeof import('../lib/stored-files');

describe('stored files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'ios';
    mockReadDirectoryAsync.mockResolvedValue([]);
  });

  it('downloads into a temporary folder that is emptied first, never a permanent cache', async () => {
    mockDownloadObject.mockImplementation(async (_path: string, dest: string) => dest);

    const uri = await resolveStoredFileUri({ objectPath: '/objects/uploads/abc', name: 'Waybill 12.pdf' });

    expect(uri).toBe('file:///cache/petrotrack-viewing/abc-Waybill_12.pdf');
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/petrotrack-viewing/', { idempotent: true });
    expect(mockDeleteAsync.mock.invocationCallOrder[0]).toBeLessThan(mockDownloadObject.mock.invocationCallOrder[0]);
    expect(mockDownloadObject).toHaveBeenCalledWith('/objects/uploads/abc', 'file:///cache/petrotrack-viewing/abc-Waybill_12.pdf');
  });

  it('removes copies left behind by older app versions', async () => {
    mockReadDirectoryAsync.mockResolvedValue(['petrotrack-my-folder-7-a.pdf', 'ExponentExperienceData', 'petrotrack-abc-photo.jpg']);

    await clearViewedFiles();

    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/petrotrack-my-folder-7-a.pdf', { idempotent: true });
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/petrotrack-abc-photo.jpg', { idempotent: true });
    expect(mockDeleteAsync).not.toHaveBeenCalledWith('file:///cache/ExponentExperienceData', expect.anything());
  });

  it('uses an in-memory blob URL on web', async () => {
    mockPlatform.OS = 'web';
    const blob = { size: 3 };
    mockFetchObject.mockResolvedValue({ blob, contentType: 'image/png' });
    const createObjectURL = jest.fn(() => 'blob:xyz');
    (globalThis as any).URL.createObjectURL = createObjectURL;

    const uri = await resolveStoredFileUri({ objectPath: '/objects/uploads/abc', name: 'photo.png' });

    expect(uri).toBe('blob:xyz');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(mockDownloadObject).not.toHaveBeenCalled();
  });

  it('falls back to the legacy uri for records created before database storage', async () => {
    await expect(resolveStoredFileUri({ uri: 'file:///old.jpg', name: 'old.jpg' })).resolves.toBe('file:///old.jpg');
    await expect(resolveStoredFileUri({ name: 'missing.pdf' })).rejects.toThrow('missing its stored copy');
  });

  it('fails clearly when the database copy cannot be downloaded', async () => {
    mockDownloadObject.mockResolvedValue(null);

    await expect(resolveStoredFileUri({ objectPath: '/objects/uploads/gone', name: 'x.pdf' }))
      .rejects.toThrow('could not be downloaded');
  });

  it('exports stored files through the share sheet on native', async () => {
    mockDownloadObject.mockImplementation(async (_path: string, dest: string) => dest);

    await exportStoredFile({ objectPath: '/objects/uploads/abc', name: 'minutes.pdf', mimeType: 'application/pdf' });

    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/petrotrack-viewing/abc-minutes.pdf', {
      mimeType: 'application/pdf',
      dialogTitle: 'Export minutes.pdf',
    });
  });

  it('reuses a file the preview already loaded instead of downloading again', async () => {
    await downloadStoredFile({ objectPath: '/objects/uploads/abc', name: 'a.pdf' }, 'file:///cache/petrotrack-viewing/abc-a.pdf');

    expect(mockDownloadObject).not.toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/petrotrack-viewing/abc-a.pdf', {
      mimeType: undefined,
      dialogTitle: 'Save a.pdf',
    });
  });

  it('saves to a folder the user picks on Android', async () => {
    mockPlatform.OS = 'android';
    mockRequestDirectoryPermissionsAsync.mockResolvedValue({ granted: true, directoryUri: 'content://docs' });
    mockCreateFileAsync.mockResolvedValue('content://docs/a.pdf');
    mockReadAsStringAsync.mockResolvedValue('QUJD');

    const result = await downloadStoredFile({ objectPath: '/o', name: 'a.pdf', mimeType: 'application/pdf' }, 'file:///tmp/a.pdf');

    expect(result).toBe('done');
    expect(mockCreateFileAsync).toHaveBeenCalledWith('content://docs', 'a.pdf', 'application/pdf');
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith('content://docs/a.pdf', 'QUJD', { encoding: 'base64' });
  });

  it('reports a cancelled Android download when no folder is chosen', async () => {
    mockPlatform.OS = 'android';
    mockRequestDirectoryPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(downloadStoredFile({ objectPath: '/o', name: 'a.pdf' }, 'file:///tmp/a.pdf')).resolves.toBe('cancelled');
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
  });

  it('prints PDFs directly and wraps images in a page', async () => {
    await printStoredFile({ objectPath: '/o', name: 'r.pdf', mimeType: 'application/pdf' }, 'file:///tmp/r.pdf');
    expect(mockPrintAsync).toHaveBeenCalledWith({ uri: 'file:///tmp/r.pdf' });

    mockReadAsStringAsync.mockResolvedValue('SU1H');
    await printStoredFile({ objectPath: '/o', name: 'p.png', mimeType: 'image/png' }, 'file:///tmp/p.png');
    expect(mockPrintAsync).toHaveBeenLastCalledWith({ html: expect.stringContaining('data:image/png;base64,SU1H') });
  });

  it('detects file kinds and builds preview routes', () => {
    expect(storedFileKind({ name: 'a.PDF' })).toBe('pdf');
    expect(storedFileKind({ name: 'x', mimeType: 'image/jpeg' })).toBe('image');
    expect(storedFileKind({ name: 'clip.mp4' })).toBe('video');
    expect(storedFileKind({ name: 'sheet.xlsx' })).toBe('other');
    expect(storedFilePreviewRoute(
      { objectPath: '/objects/uploads/abc', name: 'a.pdf', mimeType: 'application/pdf', size: 42 },
      { context: 'HR Library', uploadedBy: 'Ada' },
    )).toEqual({
      pathname: '/(app)/document-preview',
      params: { name: 'a.pdf', objectPath: '/objects/uploads/abc', mimeType: 'application/pdf', size: '42', context: 'HR Library', uploadedBy: 'Ada' },
    });
  });
});
