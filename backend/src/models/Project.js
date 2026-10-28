'use strict';

const mongoose = require('mongoose');

/**
 * Project model.
 *
 * Fields:
 *   title       — required, trimmed display name
 *   description — optional notes about the project
 *   userId      — owner (populated in Phase 3 when auth is added)
 *
 * Indexes:
 *   - createdAt descending (default sort order for listings)
 *   - userId (for fast per-user queries in Phase 3)
 */
const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Project title is required.'],
      trim: true,
      maxlength: [200, 'Project title must be 200 characters or fewer.'],
    },
    description: {
      type: String,
      default: '',
      maxlength: [2000, 'Description must be 2000 characters or fewer.'],
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project must belong to a user.'],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

projectSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Project', projectSchema);
