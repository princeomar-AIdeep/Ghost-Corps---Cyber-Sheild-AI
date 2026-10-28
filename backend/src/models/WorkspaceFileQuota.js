'use strict';

const mongoose = require('mongoose');

const workspaceFileQuotaSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    unique: true,
  },
  fileCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
});

module.exports = mongoose.model('WorkspaceFileQuota', workspaceFileQuotaSchema);
