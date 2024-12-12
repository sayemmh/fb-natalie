const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;
const path = require('path');
const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Custom log format
const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

// Function to generate the filename with a timestamp
const getLogFilename = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');

  return path.join(__dirname, `logs/transcription_service_${year}-${month}-${day}_${hour}.log`);
};

// Initialize the logger
const logger = createLogger({
  format: combine(
    timestamp(),
    logFormat
  ),
  transports: [
    new transports.Console({
      format: format.colorize(),
    }),
    new transports.File({ filename: getLogFilename() })
  ]
});


class TranscriptionService extends EventEmitter {
  constructor(callSid) {
    super();
    this.callSid = callSid; 
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    this.dgConnection = deepgram.listen.live({
      encoding: 'mulaw',
      sample_rate: '8000',
      model: 'nova-2',
      punctuate: true,
      interim_results: true,
      endpointing: 500,
      utterance_end_ms: 1500
    });

    this.finalResult = '';
    this.speechFinal = false;
    this.speechTimeout = null;
    this.SPEECH_TIMEOUT_DURATION = 2000;

    // Counter for consecutive empty transcripts
    this.emptyTranscriptCount = 0;
    this.EMPTY_TRANSCRIPT_THRESHOLD = 3; // Trigger after 4 empty transcripts
    this.hasReceivedNonEmptyTranscript = false; // Flag to track if we've received a non-empty transcript

    this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
      logger.info('STT -> Deepgram connection opened.');

      this.dgConnection.on(LiveTranscriptionEvents.Transcript, (transcriptionEvent) => {
        const alternatives = transcriptionEvent.channel?.alternatives;
        let text = '';
        if (alternatives) {
          text = alternatives[0]?.transcript;
        }

        // Clear existing timeout whenever new text is received
        clearTimeout(this.speechTimeout);

        // Log the transcript and current state
        logger.info(`Received transcript: "${text}"`);
        logger.info(`Current speechFinal state: ${this.speechFinal}`);

        if (text.trim().length > 0) {
          // Non-empty transcript: reset emptyTranscriptCount and mark that we have received non-empty text
          this.emptyTranscriptCount = 0;
          this.hasReceivedNonEmptyTranscript = true;

          if (transcriptionEvent.is_final === true) {
            logger.info('Received final transcript chunk.');
            this.finalResult += ` ${text}`;

            if (transcriptionEvent.speech_final === true) {
              logger.info('Speech final detected.');
              this.speechFinal = true;
              this.emit('transcription', this.finalResult);
              this.finalResult = '';
              this.hasReceivedNonEmptyTranscript = false; // Reset after sending
            } else {
              this.speechFinal = false;
              logger.info('Speech final not detected, resetting speechFinal state.');
            }
          } else {
            this.speechFinal = false;
            this.emit('utterance', text);
          }
          this.detectIvrCommand(text);
        } else {
          // Empty transcript: increment emptyTranscriptCount
          if (this.hasReceivedNonEmptyTranscript) {
            this.emptyTranscriptCount += 1;

            // Check if the empty transcript threshold is met
            if (this.emptyTranscriptCount >= this.EMPTY_TRANSCRIPT_THRESHOLD && this.finalResult.trim().length > 0) {
              logger.warn(`Speech timeout with empty transcripts. Force emitting transcription after ${this.emptyTranscriptCount} empty events.`);
              this.emit('transcription', this.finalResult);
              this.finalResult = '';
              this.speechFinal = true; // Prevent further processing until new speech starts
              this.hasReceivedNonEmptyTranscript = false; // Reset after forcing the transcription
            }
          }
        }

        // Set a timeout to handle cases where the user stops talking but no speech_final is set
        this.speechTimeout = setTimeout(() => {
          logger.warn('Speech timeout reached.');
          if (!this.speechFinal && this.finalResult.trim().length > 0) {
            logger.warn('Speech timeout reached, emitting transcription.');
            this.emit('transcription', this.finalResult);
            this.finalResult = '';
            this.speechFinal = true;
            this.hasReceivedNonEmptyTranscript = false; // Reset after sending
          }
        }, this.SPEECH_TIMEOUT_DURATION);
      });

      // Error handling and other events remain unchanged
      this.dgConnection.on(LiveTranscriptionEvents.Error, (error) => {
        logger.error('STT -> Deepgram error');
        logger.error(error.stack);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Warning, (warning) => {
        logger.warn('STT -> Deepgram warning');
        logger.warn(warning);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Metadata, (metadata) => {
        logger.info('STT -> Deepgram metadata');
        logger.info(metadata);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Close, () => {
        logger.warn('STT -> Deepgram connection closed');
      });
    });
  }


  setCallSid(callSid) {
    this.callSid = callSid;
  }

  /**
   * Send the payload to Deepgram
   * @param {String} payload A base64 MULAW/8000 audio stream
   */
  send(payload) {
    if (this.dgConnection.getReadyState() === 1) {
      // logger.info('Sending audio payload to Deepgram.');
      this.dgConnection.send(Buffer.from(payload, 'base64'));
    }
  }

  /**
   * Detect and handle IVR commands like "Press 1"
   * @param {String} text The transcribed text
   */
  detectIvrCommand(text) {
    const normalizedText = text.toLowerCase();
    const textWithNumbers = normalizedText.replace(/\bone\b/g, '1');

    if (textWithNumbers.includes('press 1')) {
      logger.info('Detected IVR command: Press 1');
      
      // Use this.callSid instead of process.env.CALL_SID
      if (!this.callSid) {
        logger.error('No callSid available. Cannot send DTMF.');
        return;
      }

      // Send DTMF tone to Twilio using the callSid
      twilioClient.calls(this.callSid)
        .update({ sendDigits: '1' })
        .then(call => logger.info(`Sent DTMF 1 for call ${call.sid}`))
        .catch(err => {
          logger.error('Error sending DTMF:', err);
          logger.error(`Twilio call update failed with error: ${err.message || 'undefined error'}`);
        });
    }
  }

}

module.exports = { TranscriptionService };