'use strict';

const mongoose = require('mongoose');

const authSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jti: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },
    event: {
      type: String,
      enum: ['login', 'logout', 'login_failed', 'revoked'],
      required: true,
      index: true,
    },
    ipHash: { type: String, default: '', maxlength: 64 },
    deviceLabel: { type: String, default: 'Unknown browser', trim: true, maxlength: 80 },
    userAgentHash: { type: String, default: '', maxlength: 64 },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

authSessionSchema.index({ userId: 1, createdAt: -1 });
authSessionSchema.index({ userId: 1, jti: 1, event: 1 });

module.exports = mongoose.model('AuthSession', authSessionSchema);
