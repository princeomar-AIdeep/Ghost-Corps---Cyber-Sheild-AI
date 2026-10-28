'use strict';

const mongoose = require('mongoose');

const investigationCaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000,
    },
    severity: {
      type: String,
      enum: ['critical', 'suspicious', 'normal', 'unknown'],
      default: 'unknown',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'under_review', 'resolved', 'false_positive'],
      default: 'open',
    },
  },
  { timestamps: true, versionKey: false }
);

investigationCaseSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('InvestigationCase', investigationCaseSchema);
