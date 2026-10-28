'use strict';

if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./src/config/env');
const { isDbReady } = require('./src/config/db');
const { httpLogger } = require('./src/utils/logger');
const { correlationId } = require('./src/utils/correlationId');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const errorHandler = require('./src/middleware/errorHandler');

const authRouter    = require('./src/modules/auth/auth.routes');
const projectsRouter = require('./src/modules/projects/projects.routes');
const workspaceFilesRouter = require('./src/modules/workspaceFiles/workspaceFiles.routes');
const codingAssistantRouter = require('./src/modules/codingAssistant/codingAssistant.routes');
const terminalRouter = require('./src/modules/terminal/terminal.routes');
const previewRouter = require('./src/modules/preview/preview.routes');
const { previewAccessRouter } = previewRouter;
const githubRouter = require('./src/modules/github/github.routes');
const tasksRouter   = require('./src/modules/tasks/tasks.routes');
const chatRouter    = require('./src/modules/chat/chat.routes');
const scansRouter   = require('./src/modules/scans/scans.routes');
const usersRouter   = require('./src/modules/users/users.routes');
const reportsRouter = require('./src/modules/reports/reports.routes');
const usbRouter     = require('./src/modules/usb/usbAlert.routes');
const investigationsRouter = require('./src/modules/investigations/investigations.routes');
const automationRouter = require('./src/modules/automation/automation.routes');
const aiDefenseRouter = require('./src/modules/aiDefense/aiDefense.routes');
const identityRouter = require('./src/modules/identity/identity.routes');

function mountApi(app, prefix) {
  app.use(`${prefix}/auth`,     authRouter);
  app.use(`${prefix}/projects`, projectsRouter);
  app.use(`${prefix}/projects/:projectId/files`, workspaceFilesRouter);
  app.use(`${prefix}/projects/:projectId/assistant`, codingAssistantRouter);
  app.use(`${prefix}/projects/:projectId/terminal`, terminalRouter);
  app.use(`${prefix}/projects/:projectId/preview`, previewRouter);
  app.use(`${prefix}/github`, githubRouter);
  app.use(`${prefix}/tasks`,    tasksRouter);
  app.use(`${prefix}/chat`,     chatRouter);
  app.use(`${prefix}/scans`,    scansRouter);
  app.use(`${prefix}/users`,    usersRouter);
  app.use(`${prefix}/reports`,  reportsRouter);
  app.use(`${prefix}/usb`,      usbRouter);
  app.use(`${prefix}/investigations`, investigationsRouter);
  app.use(`${prefix}/automation`, automationRouter);
  app.use(`${prefix}/ai-defense`, aiDefenseRouter);
  app.use(`${prefix}/identity`, identityRouter);
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(correlationId);

  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      credentials: false,
    })
  );

  app.use(httpLogger);

  app.use((req, res, next) => {
    const imageScan = req.originalUrl && req.originalUrl.replace(/\?.*$/, '').endsWith('/scans/image');
    express.json({ limit: imageScan ? '15mb' : '1mb' })(req, res, next);
  });
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use('/api/', apiLimiter);
  app.use('/api/v1/', apiLimiter);
  app.use('/api/preview-access', previewAccessRouter);
  app.use('/api/v1/preview-access', previewAccessRouter);

  app.get(['/api/health', '/api/v1/health'], (req, res) => {
    res.json({
      status: 'ok',
      service: 'CYBER-AGENT AI',
      timestamp: new Date().toISOString(),
    });
  });

  app.get(['/api/ready', '/api/v1/ready'], (req, res) => {
    const db = isDbReady();
    if (!db && env.nodeEnv !== 'test') {
      return res.status(503).json({
        status: 'not_ready',
        db: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      status: db ? 'ready' : 'degraded',
      db: db ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  mountApi(app, '/api');
  mountApi(app, '/api/v1');

  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
  });

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
