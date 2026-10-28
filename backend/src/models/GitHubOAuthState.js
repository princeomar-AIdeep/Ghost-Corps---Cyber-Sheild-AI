'use strict';

const mongoose = require('mongoose');

const githubOAuthStateSchema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true, select: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

module.exports = mongoose.models.GitHubOAuthState
  || mongoose.model('GitHubOAuthState', githubOAuthStateSchema);
