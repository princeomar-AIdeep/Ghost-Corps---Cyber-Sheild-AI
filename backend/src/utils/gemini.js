'use strict';

const { fetchJson } = require('./fetchJson');

/**
 * Gemini model IDs used by this backend.
 * Official generateContent IDs as of Google's Gemini API model catalog
 * (https://ai.google.dev/gemini-api/docs/models, retrieved 2026-10-28):
 *   gemini-3.8-flash, gemini-3.6-flash, gemini-3.5-flash-lite,
 *   gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro
 * Live/audio models (gemini-3.8-live, TTS) are not used by generateContent chat.
 */

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const MODEL_ID = /^gemini-[a-z0-9][a-z0-9._-]{0,78}$/i;
const FALLBACK_HTTP_STATUSES = new Set([429, 502, 503, 504]);

function configuredGeminiModel() {
  const fromEnv = (process.env.GEMINI_MODEL || '').trim();
  return MODEL_ID.test(fromEnv) ? fromEnv : DEFAULT_GEMINI_MODEL;
}

function configuredGeminiFallbackModel() {
  const fallback = (process.env.GEMINI_FALLBACK_MODEL || '').trim();
  if (!MODEL_ID.test(fallback) || fallback === configuredGeminiModel()) return null;
  return fallback;
}

function allowedGeminiModels() {
  const extra = (process.env.GEMINI_ALLOWED_MODELS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((id) => MODEL_ID.test(id));
  return [...new Set([configuredGeminiModel(), configuredGeminiFallbackModel(), ...extra].filter(Boolean))];
}

function resolveGeminiModel(requested) {
  const allowed = allowedGeminiModels();
  if (requested == null || requested === '') return allowed[0];
  const id = String(requested).trim();
  if (!allowed.includes(id)) {
    const error = new Error('The selected model is not configured on this server.');
    error.statusCode = 400;
    error.code = 'AI_MODEL_NOT_CONFIGURED';
    throw error;
  }
  return id;
}

function geminiGenerateContentUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

async function generateGeminiContent({
  key,
  model = configuredGeminiModel(),
  payload,
  timeoutMs = 15000,
  fetchJsonImpl = fetchJson,
  allowFallback = true,
}) {
  const request = async (requestedModel) => {
    try {
      return {
        model: requestedModel,
        result: await fetchJsonImpl(
          geminiGenerateContentUrl(requestedModel),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(payload),
          },
          timeoutMs
        ),
      };
    } catch (requestError) {
      return { model: requestedModel, requestError };
    }
  };

  const primary = await request(model);
  const fallbackModel = allowFallback && model === configuredGeminiModel()
    ? configuredGeminiFallbackModel()
    : null;
  const timedOut = ['AbortError', 'TimeoutError'].includes(primary.requestError?.name);
  if (fallbackModel && (FALLBACK_HTTP_STATUSES.has(primary.result?.status) || timedOut)) {
    const fallback = await request(fallbackModel);
    return { ...fallback, fallbackFrom: model };
  }
  return primary;
}

function listConfiguredGeminiModels() {
  const configured = Boolean(process.env.GEMINI_API_KEY);
  const defaultModel = configuredGeminiModel();
  return {
    configured,
    provider: configured ? 'gemini' : null,
    defaultModel,
    fallbackModel: configuredGeminiFallbackModel(),
    models: allowedGeminiModels().map((id) => ({
      id,
      label: id,
      generateContent: true,
      liveAudio: false,
    })),
    liveAudio: {
      available: false,
      model: (process.env.GEMINI_LIVE_MODEL || '').trim() || 'gemini-3.8-live',
      reason: 'Live audio requires a separately implemented Gemini Live API session; generateContent chat does not stream realtime audio.',
    },
  };
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  configuredGeminiModel,
  configuredGeminiFallbackModel,
  allowedGeminiModels,
  resolveGeminiModel,
  geminiGenerateContentUrl,
  generateGeminiContent,
  listConfiguredGeminiModels,
};
