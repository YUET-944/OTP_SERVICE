const logger = require('../utils/logger');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const twilio = require('twilio');

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'twilio';

let smsClient;

if (SMS_PROVIDER === 'twilio') {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    logger.warn('Twilio credentials not fully configured; SMS sending may fail');
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  smsClient = {
    send: async ({ to, message }) => {
      const result = await client.messages.create({
        to,
        from: TWILIO_FROM_NUMBER,
        body: message,
      });
      return {
        messageId: result?.sid,
        status: result?.status,
      };
    },
  };
} else if (SMS_PROVIDER === 'sns') {
  const snsClient = new SNSClient({
    region: process.env.AWS_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  smsClient = {
    send: async ({ to, message }) => {
      const command = new PublishCommand({
        Message: message,
        PhoneNumber: to,
      });
      const response = await snsClient.send(command);
      return {
        messageId: response?.MessageId,
        status: response?.$metadata?.httpStatusCode,
      };
    },
  };
} else {
  throw new Error(`Unsupported SMS_PROVIDER: ${SMS_PROVIDER}`);
}

module.exports = smsClient;
