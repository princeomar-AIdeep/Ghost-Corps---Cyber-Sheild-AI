'use strict';

const mongoose = require('mongoose');

const githubConnectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  githubUserId: { type: Number, required: true },
  login: { type: String, required: true, maxlength: 39 },
  encryptedAccessToken: { type: String, required: true, select: false },
  tokenIv: { type: String, required: true, select: false },
  tokenAuthTag: { type: String, required: true, select: false },
}, { timestamps: true });

module.exports = mongoose.models.GitHubConnection
  || mongoose.model('GitHubConnection', githubConnectionSchema);
