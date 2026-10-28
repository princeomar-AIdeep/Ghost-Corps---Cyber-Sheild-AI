'use strict';

const mongoose = require('mongoose');

/**
 * Task model.
 *
 * Fields:
 *   title  — required, trimmed task name
 *   due    — due date label (free-form string, e.g. "Oct 24" or "No due date")
 *   done   — completion flag
 *   userId — owner (enforced in Phase 3)
 */
const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required.'],
      trim: true,
      maxlength: [500, 'Task title must be 500 characters or fewer.'],
    },
    due: {
      type: String,
      default: 'No due date',
      maxlength: [100, 'Due date label must be 100 characters or fewer.'],
      trim: true,
    },
    done: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Task must belong to a user.'],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Task', taskSchema);
