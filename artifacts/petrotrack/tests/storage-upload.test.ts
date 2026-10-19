const mockPlatform = { OS: 'ios' as string };
const mockUploadAsync = jest.fn();

jest.mock('react-native', () => ({ Platform: mockPlatform }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = { getItem: jest.fn(async () => 'token-123'), setItem: jest.fn(), removeItem: jest.fn() };
  return { __esModule: true, default: storage, ...storage };
});
jest.mock('expo-file-system/legacy', () => ({
  uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));

process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { storageApi, uploadFailureMessage, MAX_UPLOAD_BYTES } = jest.requireActual('../lib/api') as typeof import('../lib/api');

const okBody = JSON.stringify({ objectPath: '/objects/uploads/abc', size: 42 });

describe('storageApi.uploadFile', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockUploadAsync.mockReset();
    mockPlatform.OS = 'ios';
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('uploads native files to the API with the original name and type', async () => {
    mockUploadAsync.mockResolvedValue({ status: 201, body: okBody });

    const uploaded = await storageApi.uploadFile({
      uri: 'file:///cache/minutes.pdf',
      name: 'Board minutes.pdf',
      mimeType: 'application/pdf',
      size: 42,
    }, { category: 'meeting_minutes', relatedId: 'minutes:7' });

    expect(uploaded).toEqual({ objectPath: '/objects/uploads/abc', name: 'Board minutes.pdf', mimeType: 'application/pdf', size: 42 });
    const [url, uri, options] = mockUploadAsync.mock.calls[0];
    expect(url).toBe('https://api.example.test/api/storage/uploads');
    expect(uri).toBe('file:///cache/minutes.pdf');
    expect(options.httpMethod).toBe('POST');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/octet-stream',
      'X-File-Name': 'Board%20minutes.pdf',
      'X-File-Type': 'application/pdf',
      'X-File-Category': 'meeting_minutes',
      'X-Related-Id': 'minutes%3A7',
    });
    expect(options.headers.Authorization).toContain('token-123');
  });

  it('uploads the browser File object on web without expo-file-system', async () => {
    mockPlatform.OS = 'web';
    const blob = new Blob(['hello']);
    const fetchMock = jest.fn(async () => ({ status: 201, text: async () => okBody }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await storageApi.uploadFile({ uri: 'blob:x', name: 'a.txt', mimeType: 'text/plain', file: blob });

    expect(mockUploadAsync).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/storage/uploads',
      expect.objectContaining({ method: 'POST', body: blob }),
    );
  });

  it('rejects oversized files before uploading', async () => {
    await expect(storageApi.uploadFile({ uri: 'file:///big', name: 'big.zip', size: MAX_UPLOAD_BYTES + 1 }))
      .rejects.toThrow('maximum size is 20 MB');
    expect(mockUploadAsync).not.toHaveBeenCalled();
  });

  it.each([
    [401, '', 'session has expired'],
    [403, '', 'do not have permission'],
    [500, JSON.stringify({ error: 'The server could not save the file. Please try again.' }), 'could not save the file'],
  ])('explains HTTP %s failures', async (status, body, message) => {
    mockUploadAsync.mockResolvedValue({ status, body });
    const error = await storageApi.uploadFile({ uri: 'file:///x', name: 'x.pdf' }).catch(e => e);
    expect(uploadFailureMessage(error)).toContain(message);
  });

  it('explains network failures', async () => {
    mockUploadAsync.mockRejectedValue(new Error('Network request failed'));
    const error = await storageApi.uploadFile({ uri: 'file:///x', name: 'x.pdf' }).catch(e => e);
    expect(uploadFailureMessage(error)).toContain('Could not reach the server');
  });
});
