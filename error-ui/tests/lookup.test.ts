import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import {
  FALLBACK_HEADER,
  FALLBACK_MESSAGE,
  firstValue,
  lookupErrorDetails,
  normalizeParams,
  type LookupResponse,
} from '@/lib/lookup';

// Pure-logic unit tests for src/lib/lookup.ts. `fetch` is mocked via vi.stubGlobal (Vitest's
// built-in global mocking — no separate mocking library needed), and MANAGEMENT_API_URL /
// EML_SYSTEM_API_KEY are set/unset directly on process.env in beforeEach/afterEach, restoring
// the original values each time so no test leaks env state into another. See tests/README.md
// for the scope boundary (no page-rendering tests here — see FALLBACK_HEADER/FALLBACK_MESSAGE
// below, asserted against directly rather than re-hardcoded, since page.tsx imports these same
// constants).
describe('normalizeParams / firstValue', () => {
  it('picks the first element when the value is an array', () => {
    expect(firstValue(['first', 'second'])).toBe('first');
  });

  it('normalizes undefined to null', () => {
    expect(firstValue(undefined)).toBeNull();
  });

  it('normalizes an empty string to null (current behavior: "" is falsy, so `resolved ? resolved : null` treats it the same as undefined)', () => {
    expect(firstValue('')).toBeNull();
  });

  it('normalizeParams applies firstValue to every field', () => {
    expect(
      normalizeParams({
        appname: ['Billing Service', 'ignored'],
        code: 'CODE_1',
        environment: undefined,
        language: '',
      }),
    ).toEqual({
      appname: 'Billing Service',
      code: 'CODE_1',
      environment: null,
      language: null,
    });
  });
});

describe('lookupErrorDetails', () => {
  const originalManagementApiUrl = process.env.MANAGEMENT_API_URL;
  const originalSystemApiKey = process.env.EML_SYSTEM_API_KEY;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
    if (originalManagementApiUrl === undefined) {
      delete process.env.MANAGEMENT_API_URL;
    } else {
      process.env.MANAGEMENT_API_URL = originalManagementApiUrl;
    }
    if (originalSystemApiKey === undefined) {
      delete process.env.EML_SYSTEM_API_KEY;
    } else {
      process.env.EML_SYSTEM_API_KEY = originalSystemApiKey;
    }
  });

  const fullParams = {
    appname: 'Billing Service',
    code: 'CODE_1',
    environment: 'production',
    language: 'en',
  };

  it('returns null without calling fetch when appname is missing', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    const result = await lookupErrorDetails({ ...fullParams, appname: null });
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null without calling fetch when code is missing', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    const result = await lookupErrorDetails({ ...fullParams, code: null });
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null without calling fetch when environment is missing', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    const result = await lookupErrorDetails({ ...fullParams, environment: null });
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null without calling fetch when language is missing', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    const result = await lookupErrorDetails({ ...fullParams, language: null });
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null and logs when MANAGEMENT_API_URL is unset', async () => {
    delete process.env.MANAGEMENT_API_URL;
    process.env.EML_SYSTEM_API_KEY = 'test-system-key';
    const result = await lookupErrorDetails(fullParams);
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('MANAGEMENT_API_URL'),
    );
  });

  it('returns null and logs when EML_SYSTEM_API_KEY is unset', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    delete process.env.EML_SYSTEM_API_KEY;
    const result = await lookupErrorDetails(fullParams);
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('EML_SYSTEM_API_KEY'),
    );
  });

  it('builds the correct URL and request init, including a value with a space', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    process.env.EML_SYSTEM_API_KEY = 'test-system-key';
    const body: LookupResponse = {
      appname: 'Billing Service',
      code: 'CODE_1',
      language: 'en',
      environment: 'production',
      header: 'Header',
      description: 'Description',
      friendlyMessage: 'Friendly message',
      category: null,
      errorCategory: null,
      httpCode: null,
      alertString: null,
      redirectUrl: null,
      eventId: null,
      eventCategory: null,
      transIdDisplay: null,
      retryEnabled: null,
      errorCodeDisplay: null,
      needsAuthoring: false,
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    await lookupErrorDetails(fullParams);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = vi.mocked(fetch).mock.calls[0];
    const calledUrl = new URL(requestUrl as string | URL);

    expect(calledUrl.pathname).toBe('/api/v1/lookup');
    expect(calledUrl.searchParams.get('application')).toBe('Billing Service');
    expect(calledUrl.searchParams.get('code')).toBe('CODE_1');
    expect(calledUrl.searchParams.get('environment')).toBe('production');
    expect(requestInit).toMatchObject({
      headers: { 'Accept-Language': 'en', 'Authorization': 'Bearer test-system-key' },
      cache: 'no-store',
    });
  });

  it('returns the parsed JSON body on a 200 response', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    process.env.EML_SYSTEM_API_KEY = 'test-system-key';
    const body: LookupResponse = {
      appname: 'Billing Service',
      code: 'CODE_1',
      language: 'en',
      environment: 'production',
      header: 'Header',
      description: 'Description',
      friendlyMessage: 'Friendly message',
      category: 'General',
      errorCategory: 'Unclassified',
      httpCode: 500,
      alertString: 'toast',
      redirectUrl: null,
      eventId: null,
      eventCategory: null,
      transIdDisplay: null,
      retryEnabled: true,
      errorCodeDisplay: null,
      needsAuthoring: false,
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    const result = await lookupErrorDetails(fullParams);
    expect(result).toEqual(body);
  });

  it('returns null on a non-2xx response, without reading the body', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    process.env.EML_SYSTEM_API_KEY = 'test-system-key';
    const jsonSpy = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: jsonSpy,
    } as unknown as Response);

    const result = await lookupErrorDetails(fullParams);
    expect(result).toBeNull();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('returns null and logs when fetch itself throws', async () => {
    process.env.MANAGEMENT_API_URL = 'http://localhost:3000';
    process.env.EML_SYSTEM_API_KEY = 'test-system-key';
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const result = await lookupErrorDetails(fullParams);
    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to reach MANAGEMENT_API_URL'),
      expect.any(Error),
    );
  });
});

describe('fallback copy', () => {
  it('exposes the exact fallback header/message page.tsx renders', () => {
    expect(FALLBACK_HEADER).toBe("We couldn't load this error");
    expect(FALLBACK_MESSAGE).toBe(
      "We couldn't load this error's details right now. Please try again later.",
    );
  });
});
