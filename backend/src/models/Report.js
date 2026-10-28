'use strict';

const mongoose = require('mongoose');

/**
 * Report model
 *
 * Stores generated security reports per user.
 */
const reportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Report must belong to a user.'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Report title is required.'],
      maxlength: [200, 'Title must be 200 characters or fewer.'],
      trim: true,
    },
    sections: {
      type: String,
      default: 'Overview, scans, threat categories',
      trim: true,
    },
    summary: {
      type: String,
      default: null,
    },
    scanCount: {
      type: Number,
      default: 0,
    },
    findingCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Report', reportSchema);
