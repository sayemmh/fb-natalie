require('dotenv').config();
const twilio = require('twilio');

// Function to make the outbound call
async function makeOutBoundCall(toNumber) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  const client = twilio(accountSid, authToken);

  try {
    // Use the toNumber passed as a parameter, instead of process.env.YOUR_NUMBER
    const call = await client.calls.create({
      url: `https://${process.env.SERVER_DOMAIN}/incoming`,  // TwiML URL
      to: toNumber,  // Use the dynamic number passed in
      from: process.env.FROM_NUMBER  // Your Twilio phone number
    });

    console.log(`Call initiated with SID: ${call.sid}`);
  } catch (error) {
    console.error('Error making outbound call:', error);
  }
}

// Export the function for use in other files
module.exports = { makeOutBoundCall };
