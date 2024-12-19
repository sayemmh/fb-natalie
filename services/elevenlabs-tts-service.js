require("dotenv").config();
const { Buffer } = require("node:buffer");
const EventEmitter = require("events");
const { ElevenLabsClient } = require("elevenlabs"); // Import ElevenLabs Client

// Initialize ElevenLabs Client
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

class TextToSpeechService extends EventEmitter {
  constructor() {
    super();
    this.nextExpectedIndex = 0;
    this.speechBuffer = {};
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;

    if (!partialResponse) {
      return;
    }

    try {
      // Use ElevenLabs to generate speech from text
      const audioStream = await client.generate({
        voice: "Rachel", // Choose the voice you'd like to use
        model_id: "eleven_turbo_v2", // Specify model
        text: partialResponse, // The text to convert to speech
      });

      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk); // Collect all audio chunks
      }

      // Concatenate the chunks into a single audio buffer
      const content = Buffer.concat(chunks);
      const base64String = content.toString("base64"); // Convert to base64 string

      // Emit the speech event with necessary data
      this.emit(
        "speech",
        partialResponseIndex,
        base64String,
        partialResponse,
        interactionCount
      );
    } catch (err) {
      console.error("Error occurred in TextToSpeech service");
      console.error(err);
    }
  }
}

module.exports = { TextToSpeechService };
