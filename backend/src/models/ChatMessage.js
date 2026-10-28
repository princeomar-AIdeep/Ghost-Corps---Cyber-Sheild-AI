'use strict';

const mongoose = require('mongoose');

/**
 * ChatMessage model
 *
 * Stores the conversation history per user so Kiara's context
 * can be reviewed, and future AI calls can include recent history.
 */
const chatMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'ChatMessage must belong to a user.'],
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: [16000, 'Message too long.'],
      trim: true,
    },
    model: {
      type: String,
      maxlength: 80,
      trim: true,
    },
    // Session identifier — groups messages into a conversation
    sessionId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
