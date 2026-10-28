'use strict';

const Joi = require('joi');

/**
 * validate(schema, target) — Joi validation middleware factory.
 *
 * @param {Joi.ObjectSchema} schema  - Joi schema to validate against
 * @param {'body'|'query'|'params'} target - Which part of req to validate
 *
 * Usage:
 *   router.post('/register', validate(registerSchema, 'body'), handler);
 *
 * On validation failure, returns 400 with the first human-readable error message.
 * abortEarly:false collects all errors so the frontend can display them together.
 */
function validate(schema, target = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,      // Collect all errors, not just the first
      stripUnknown: true,     // Remove any fields not in the schema (mass-assignment protection)
      convert: true,
    });

    if (error) {
      const messages = error.details.map((d) => d.message).join('; ');
      return res.status(400).json({ error: messages });
    }

    // Express 5 exposes req.query through a getter; keep its sanitized value separately.
    if (target === 'query') req.validatedQuery = value;
    else req[target] = value;
    next();
  };
}

// ── Auth schemas ─────────────────────────────────────────────────────────────

const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters.',
    'string.pattern.base': 'Password must include at least one letter and one number.',
    'any.required': 'Password is required.',
  });

const registerSchema = Joi.object({
  email: Joi.string().email().max(254).required().messages({
    'string.email': 'Enter a valid email address.',
    'any.required': 'Email is required.',
  }),
  password: passwordSchema,
  displayName: Joi.string().max(100).allow('').default(''),
  preAuthToken: Joi.string().max(2048).optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(254).required().messages({
    'string.email': 'Enter a valid email address.',
    'any.required': 'Email is required.',
  }),
  password: Joi.string().max(128).required().messages({
    'any.required': 'Password is required.',
  }),
  preAuthToken: Joi.string().max(2048).optional(),
});

const sendOtpSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  scope: Joi.string().valid('register', 'login', 'reset').required(),
});

const verifyOtpSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  scope: Joi.string().valid('register', 'login', 'reset').required(),
  otp: Joi.string().pattern(/^\d{6}$/).required().messages({
    'string.pattern.base': 'OTP must be a 6-digit code.',
  }),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  newPassword: passwordSchema,
  preAuthToken: Joi.string().max(2048).required(),
});

const chatMessageSchema = Joi.object({
  message: Joi.string().trim().min(1).max(8000).required(),
  sessionId: Joi.string().trim().max(64).allow('', null),
  mode: Joi.string().valid(
    'assistant',
    'generative',
    'agent_plan',
    'productivity',
    'code_explainer',
    'threat_summarizer',
    'security_assistant'
  ).default('assistant'),
  model: Joi.string().trim().max(80).pattern(/^gemini-[a-z0-9][a-z0-9._-]{0,78}$/i).optional(),
});

const chatHistoryQuerySchema = Joi.object({
  sessionId: Joi.string().trim().max(64).allow('', null),
});

const codingAssistantSchema = Joi.object({
  prompt: Joi.string().trim().min(1).max(4000).required(),
  filePaths: Joi.array()
    .items(Joi.string().min(1).max(512).required())
    .min(1)
    .max(10)
    .unique()
    .required(),
});

const codingAssistantProjectParamsSchema = Joi.object({
  projectId: Joi.string().hex().length(24).required(),
});

const createScanSchema = Joi.object({
  type: Joi.string().valid('URL', 'Code', 'File').required(),
  target: Joi.string().trim().min(1).max(4096).required(),
});

const fileScanSchema = Joi.object({}).default({});

const usbAlertSchema = Joi.object({
  deviceLabel: Joi.string().trim().max(200).default('Unknown Device'),
  files: Joi.array().items(Joi.object({
    name: Joi.string().trim().max(500).required(),
    size: Joi.number().min(0).max(1024 * 1024 * 1024 * 4).optional(),
    type: Joi.string().trim().max(200).allow('').optional(),
  })).max(500).default([]),
});

const updateProfileSchema = Joi.object({
  displayName: Joi.string().trim().max(100),
  avatarUrl: Joi.string().trim().max(2048).allow(''),
  assistantName: Joi.string().trim().min(1).max(40).pattern(/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u),
}).min(1);

const createReportSchema = Joi.object({
  title: Joi.string().trim().max(200).allow(''),
  sections: Joi.string().trim().max(500).allow(''),
});

const investigationSeverity = Joi.string().valid('critical', 'suspicious', 'normal', 'unknown');
const investigationStatus = Joi.string().valid('open', 'in_progress', 'under_review', 'resolved', 'false_positive');

const createInvestigationCaseSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(4000).allow('').default(''),
  severity: investigationSeverity.default('unknown'),
  status: investigationStatus.default('open'),
  projectId: Joi.string().hex().length(24).optional(),
});

const updateInvestigationCaseSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200),
  description: Joi.string().trim().max(4000).allow(''),
  severity: investigationSeverity,
  status: investigationStatus,
}).min(1);

const createAutomationWorkflowSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().trim().max(2000).allow('').default(''),
  frequency: Joi.string().valid('manual', 'daily', 'weekly', 'monthly').required(),
});

const investigationCaseParamsSchema = Joi.object({
  caseId: Joi.string().hex().length(24).required(),
});

const identityRangeQuerySchema = Joi.object({
  range: Joi.string().valid('today', 'week', 'month', 'all').default('week'),
});

const createAccessPolicySchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().trim().max(1000).allow('').default(''),
  effect: Joi.string().valid('allow', 'deny').default('allow'),
  resource: Joi.string().valid('workspace', 'scans', 'chat', 'identity', 'developer', 'reports').default('workspace'),
  enabled: Joi.boolean().default(true),
});

const updateAccessPolicySchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  description: Joi.string().trim().max(1000).allow(''),
  effect: Joi.string().valid('allow', 'deny'),
  resource: Joi.string().valid('workspace', 'scans', 'chat', 'identity', 'developer', 'reports'),
  enabled: Joi.boolean(),
}).min(1);

const accessPolicyParamsSchema = Joi.object({
  policyId: Joi.string().hex().length(24).required(),
});

// ── Project schemas ───────────────────────────────────────────────────────────

const createProjectSchema = Joi.object({
  title: Joi.string().trim().max(200).required().messages({
    'any.required': 'Project title is required.',
    'string.empty': 'Project title is required.',
  }),
  description: Joi.string().trim().max(2000).allow('').default(''),
});

const updateProjectSchema = Joi.object({
  title: Joi.string().trim().max(200),
  description: Joi.string().trim().max(2000).allow(''),
}).min(1).messages({ 'object.min': 'Provide at least one field to update.' });

// ── Task schemas ──────────────────────────────────────────────────────────────

const createTaskSchema = Joi.object({
  title: Joi.string().trim().max(500).required().messages({
    'any.required': 'Task title is required.',
    'string.empty': 'Task title is required.',
  }),
  due: Joi.string().trim().max(100).allow('').default('No due date'),
  done: Joi.boolean().default(false),
});

const updateTaskSchema = Joi.object({
  title: Joi.string().trim().max(500),
  due: Joi.string().trim().max(100).allow(''),
  done: Joi.boolean(),
}).min(1).messages({ 'object.min': 'Provide at least one field to update.' });

module.exports = {
  validate,
  schemas: {
    registerSchema,
    loginSchema,
    createProjectSchema,
    updateProjectSchema,
    createTaskSchema,
    updateTaskSchema,
    sendOtpSchema,
    verifyOtpSchema,
    resetPasswordSchema,
    chatMessageSchema,
    chatHistoryQuerySchema,
    codingAssistantSchema,
    codingAssistantProjectParamsSchema,
    createScanSchema,
    fileScanSchema,
    usbAlertSchema,
    updateProfileSchema,
    createReportSchema,
    createInvestigationCaseSchema,
    updateInvestigationCaseSchema,
    createAutomationWorkflowSchema,
    investigationCaseParamsSchema,
    identityRangeQuerySchema,
    createAccessPolicySchema,
    updateAccessPolicySchema,
    accessPolicyParamsSchema,
  },
};
