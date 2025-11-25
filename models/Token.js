const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  refreshToken: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800 // Auto-delete after 7 days
  }
});

tokenSchema.index({ userId: 1 });
tokenSchema.index({ refreshToken: 1 });

module.exports = mongoose.model('Token', tokenSchema);
