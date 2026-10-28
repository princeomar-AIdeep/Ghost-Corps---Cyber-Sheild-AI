'use strict';

const mongoose = require('mongoose');

const registrationPreAuthSchema = new mongoose.Schema({
  jti: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0,
  },
});

module.exports = mongoose.model('RegistrationPreAuth', registrationPreAuthSchema);
