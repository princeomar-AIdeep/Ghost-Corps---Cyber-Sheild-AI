'use strict';

const mongoose = require('mongoose');

const accessPolicySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    effect: {
      type: String,
      enum: ['allow', 'deny'],
      default: 'allow',
    },
    resource: {
      type: String,
      enum: [
        'workspace',
        'scans',
        'chat',
        'identity',
        'developer',
        'reports',
      ],
      default: 'workspace',
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, versionKey: false }
);

accessPolicySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AccessPolicy', accessPolicySchema);
