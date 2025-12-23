const sgMail = require('@sendgrid/mail');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const logger = require('../utils/logger');

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'sendgrid';

let emailClient;

if (EMAIL_PROVIDER === 'sendgrid') {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY) {
    logger.warn('SENDGRID_API_KEY not set, email sending will fail');
  } else {
    sgMail.setApiKey(SENDGRID_API_KEY);
  }
  emailClient = {
    send: async (params) => {
      const msg = {
        to: params.to,
        from: process.env.EMAIL_FROM,
        subject: params.subject,
        text: params.text,
      };
      const [response] = await sgMail.send(msg);
      return {
        messageId: response?.headers?.['x-message-id'],
        statusCode: response?.statusCode,
      };
    },
  };
} else if (EMAIL_PROVIDER === 'ses') {
  const sesClient = new SESClient({
    region: process.env.AWS_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  emailClient = {
    send: async (params) => {
      const command = new SendEmailCommand({
        Destination: {
          ToAddresses: [params.to],
        },
        Message: {
          Body: {
            Text: {
              Charset: 'UTF-8',
              Data: params.text,
            },
          },
          Subject: {
            Charset: 'UTF-8',
            Data: params.subject,
          },
        },
        Source: process.env.EMAIL_FROM,
      });
      const response = await sesClient.send(command);
      return {
        messageId: response?.MessageId,
        statusCode: 200,
      };
    },
  };
} else {
  throw new Error(`Unsupported EMAIL_PROVIDER: ${EMAIL_PROVIDER}`);
}

module.exports = emailClient;
