require('dotenv').config();
console.log('SERVER DOMAIN:', process.env.SERVER_DOMAIN);
require('colors');
const fs = require('fs');
const path = require('path');

const express = require('express');
const ExpressWs = require('express-ws');

const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');
const { recordingService } = require('./services/recording-service');


const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();
ExpressWs(app);

const PORT = process.env.PORT || 5004;


const { makeOutBoundCall } = require('./scripts/outbound.js'); // Import the function to make outbound calls
const bodyParser = require('body-parser');

app.use(bodyParser.json()); // Add middleware to parse JSON bodies

const validApiKeys = new Set([
  'nimbus-api-key-1',
  'nimbus-api-key-2', // Add your generated API keys here
]);

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key']; // API key passed in headers

  if (!apiKey || !validApiKeys.has(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key.' });
  }

  next(); // Proceed to the next middleware or route handler if the key is valid
};


// Endpoint with API key validation
app.post('/nimbus-call', validateApiKey, async (req, res) => {
  const {
    toNumber,
    payorName,
    NPI,
    patientFirstName,
    patientLastName,
    subscriberId,
    TIN,
    callbackNumber,
    dateOfBirth,
  } = req.body;

  // Validate that all required fields are present
  const missingFields = [];
  if (!toNumber) missingFields.push('toNumber');
  if (!payorName) missingFields.push('payorName');
  if (!NPI) missingFields.push('NPI');
  if (!patientFirstName) missingFields.push('patientFirstName');
  if (!patientLastName) missingFields.push('patientLastName');
  if (!subscriberId) missingFields.push('subscriberId');
  if (!TIN) missingFields.push('TIN');
  if (!callbackNumber) missingFields.push('callbackNumber');
  if (!dateOfBirth) missingFields.push('dateOfBirth');

  if (missingFields.length > 0) {
    return res
      .status(400)
      .json({ error: `Missing fields: ${missingFields.join(', ')}` });
  }

  // Validate payorName
  const validPayors = ['bcbs-az', 'humana'];
  if (!validPayors.includes(payorName.toLowerCase())) {
    return res
      .status(400)
      .json({ error: `Invalid payorName. Must be one of: ${validPayors.join(', ')}` });
  }

  try {
    // Log the parameters to a file
    const filePath = path.join(__dirname, 'services', 'prompts', 'params.txt');
    const paramsContent = JSON.stringify(req.body, null, 2);

    fs.writeFileSync(filePath, paramsContent, 'utf8');
    console.log(`[Sayem] Parameters written to ${filePath}`);

    console.log(`[Sayem] Triggering outbound call to ${toNumber}`);
    await makeOutBoundCall(toNumber); // Pass the number to the outbound call function

    res.status(200).json({ success: `Call initiated to ${toNumber}` });
  } catch (error) {
    console.error('Error making outbound call or writing params:', error);
    res.status(500).json({ error: 'Failed to initiate call or write params.' });
  }
});

app.post('/incoming', (req, res) => {
  console.log("[Sayem] Call came in")
  try {
    const response = new VoiceResponse();
    const connect = response.connect();

    connect.stream({ url: `wss://${process.env.SERVER_DOMAIN}/connection` });

    res.type('text/xml');
    res.end(response.toString());

  } catch (err) {
    console.log(err);
  }
});

app.post('/call/incoming', (req, res) => {
  console.log("[Sayem] Call came in")
  try {
    const response = new VoiceResponse();
    const connect = response.connect();

    connect.stream({ url: `wss://${process.env.SERVER_DOMAIN}/connection` });

    res.type('text/xml');
    res.end(response.toString());

  } catch (err) {
    console.log(err);
  }
});

app.post('/call/response', (req, res) => {
  const response = new VoiceResponse();
  response.say('Hello, this is an outbound call from the GPT service!');
  
  // You can also connect a media stream here or initiate a conversation
  const connect = response.connect();
  connect.stream({ url: `wss://${process.env.SERVER_DOMAIN}/connection` });

  res.type('text/xml');
  res.send(response.toString());
});

app.ws('/connection', (ws) => {
  console.log("[Sayem] /connection called")
  try {
    ws.on('error', console.error);
    // Filled in from start message
    let streamSid;
    let callSid;

    const gptService = new GptService();
    const streamService = new StreamService(ws);
    // const transcriptionService = new TranscriptionService();
    const transcriptionService = new TranscriptionService(callSid); // Pass callSid to the service

    const ttsService = new TextToSpeechService({});
  
    let marks = [];
    let interactionCount = 0;
  
    // Incoming from MediaStream
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        console.log(`Call SID: ${callSid}`);

        // transcriptionService.setCallSid(callSid); // Ensure it's passed to the service

        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(() => {
          console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
          ttsService.generate({partialResponseIndex: null, partialResponse: 'Hello!'}, 0);
        });
      } else if (msg.event === 'media') {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      } else if (msg.event === 'stop') {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });
  
    transcriptionService.on('utterance', async (text) => {
      // This is a bit of a hack to filter out empty utterances
      if(marks.length > 0 && text?.length > 5) {
        console.log('Twilio -> Interruption, Clearing stream'.red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }
    });
  
    transcriptionService.on('transcription', async (text) => {
      if (!text) { return; }
      console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });
    
    gptService.on('gptreply', async (gptReply, icount) => {
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green );
      ttsService.generate(gptReply, icount);
    });
  
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
  
      streamService.buffer(responseIndex, audio);
    });
  
    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
    });
  } catch (err) {
    console.log(err);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});