'use strict';

const mongoose = require('mongoose');

const workspaceFileSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    path: {
      type: String,
      required: true,
      maxlength: 512,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

workspaceFileSchema.index({ projectId: 1, path: 1 }, { unique: true });

module.exports = mongoose.model('WorkspaceFile', workspaceFileSchema);
