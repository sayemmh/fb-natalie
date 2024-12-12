const crypto = require('crypto');

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex'); // Generates a 64-character API key
}

// Example: Generate and log an API key
console.log(generateApiKey());