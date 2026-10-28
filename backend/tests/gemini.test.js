'use strict';

const {
  allowedGeminiModels,
  generateGeminiContent,
  listConfiguredGeminiModels,
} = require('../src/utils/gemini');

describe('Gemini provider configuration and explicit fallback', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_FALLBACK_MODEL;
    delete process.env.GEMINI_ALLOWED_MODELS;
  });

  it('lists the explicitly configured fallback as a selectable Gemini model', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';

    expect(allowedGeminiModels()).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash']);
    expect(listConfiguredGeminiModels()).toMatchObject({
      configured: true,
      defaultModel: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.6-flash',
    });
  });

  it('uses the explicit fallback after an upstream 503 and reports the model used', async () => {
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';
    const fetchJsonImpl = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, data: { error: { status: 'UNAVAILABLE' } } })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { candidates: [] } });

    const result = await generateGeminiContent({
      key: 'test-key',
      model: 'gemini-3.8-flash',
      payload: { contents: [] },
      fetchJsonImpl,
    });

    expect(result).toMatchObject({ model: 'gemini-3.6-flash', fallbackFrom: 'gemini-3.8-flash', result: { ok: true } });
    expect(fetchJsonImpl).toHaveBeenCalledTimes(2);
    expect(fetchJsonImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    ]);
  });

  it('does not retry a network failure or implicitly switch an explicitly selected model', async () => {
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';
    const fetchJsonImpl = jest.fn().mockRejectedValue(new Error('network unavailable'));

    const result = await generateGeminiContent({
      key: 'test-key',
      model: 'gemini-3.8-flash',
      payload: { contents: [] },
      allowFallback: false,
      fetchJsonImpl,
    });

    expect(result).toMatchObject({ model: 'gemini-3.8-flash' });
    expect(result.requestError).toBeInstanceOf(Error);
    expect(fetchJsonImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the explicit fallback after a provider timeout', async () => {
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';
    const fetchJsonImpl = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      .mockResolvedValueOnce({ ok: true, status: 200, data: { candidates: [] } });

    const result = await generateGeminiContent({
      key: 'test-key',
      model: 'gemini-3.8-flash',
      payload: { contents: [] },
      fetchJsonImpl,
    });

    expect(result).toMatchObject({ model: 'gemini-3.6-flash', fallbackFrom: 'gemini-3.8-flash', result: { ok: true } });
    expect(fetchJsonImpl).toHaveBeenCalledTimes(2);
  });
});
