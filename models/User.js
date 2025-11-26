const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  companyName: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true; // Phone is optional
        return /^\d{10}$/.test(v.replace(/\D/g, ''));
      },
      message: 'Phone number must be 10 digits'
    }
  },
  verification_status: {
    type: String,
    enum: ['PENDING', 'VERIFIED'],
    default: 'PENDING'
  },
  verified_at: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);
