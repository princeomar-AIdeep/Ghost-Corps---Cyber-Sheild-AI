'use strict';

const mongoose = require('mongoose');

const automationWorkflowSchema = new mongoose.Schema(
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
      maxlength: 2000,
    },
    frequency: {
      type: String,
      enum: ['manual', 'daily', 'weekly', 'monthly'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft'],
      default: 'draft',
    },
    enabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false }
);

automationWorkflowSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AutomationWorkflow', automationWorkflowSchema);
