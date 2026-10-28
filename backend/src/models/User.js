'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User model.
 *
 * Fields:
 *   email        — unique, lowercased, indexed
 *   passwordHash — bcrypt hash; never returned in queries by default
 *   role         — 'user' | 'admin'
 *   displayName  — optional, shown in the UI
 *   createdAt    — auto timestamp
 *
 * Security notes:
 *   - passwordHash is selected: false, so it is NEVER returned
 *     unless explicitly requested with .select('+passwordHash')
 *   - comparePassword() does the bcrypt comparison server-side
 *   - Input normalisation (lowercase, trim) happens in the schema
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address.'],
      maxlength: [254, 'Email must be 254 characters or fewer.'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned in normal queries
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: [100, 'Display name must be 100 characters or fewer.'],
      default: '',
    },
    assistantName: {
      type: String,
      trim: true,
      maxlength: [40, 'Assistant name must be 40 characters or fewer.'],
      default: 'Kiara',
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: (v) => !v || /^https?:\/\//i.test(v),
        message: 'avatarUrl must be a valid http/https URL.',
      },
    },
  },
  {
    timestamps: true,
  }
);



/**
 * Hash the plain-text password before saving.
 * Only runs when passwordHash has been modified.
 */
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

/**
 * Compare a plain-text candidate password against the stored hash.
 * Must be called on a user document fetched with .select('+passwordHash').
 *
 * @param {string} candidate - Plain-text password from the request
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

/**
 * Return a safe public representation of the user.
 * Never include passwordHash here.
 */
userSchema.methods.toPublicJSON = function () {
  return {
    _id: this._id,
    email: this.email,
    displayName: this.displayName,
    assistantName: this.assistantName || 'Kiara',
    avatarUrl: this.avatarUrl || '',
    role: this.role,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
