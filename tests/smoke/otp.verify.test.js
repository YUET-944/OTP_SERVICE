const { api } = require('./helpers/request');
const { resetState } = require('./helpers/state');
const { seedEntry, getRecordKey } = require('../../scripts/seedHelpers');
const { redisClient } = require('../../src/config/redis');
const { getOtpLogByRequestId } = require('../../src/models/otpLog.model');

describe('OTP verification flow', () => {
  beforeEach(async () => {
    await resetState();
  });

  it('verifies a valid OTP and issues a token', async () => {
    const seeded = await seedEntry({
      type: 'email',
      identifier: 'qa.verify-success@example.com',
      purpose: 'login',
      preGeneratedOtp: '789012',
    });

    const response = await api()
      .post('/api/otp/verify')
      .send({
        identifier: seeded.identifier,
        channel: seeded.channel,
        purpose: seeded.purpose,
        otp: '789012',
      })
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      verified: true,
      token: expect.any(String),
    }));

    const redisRecord = await redisClient.get(getRecordKey(seeded.requestId));
    expect(redisRecord).toBeNull();

    const logRecord = await getOtpLogByRequestId(seeded.requestId);
    expect(logRecord.verified).toBe(true);
    expect(logRecord.verification_attempts).toBe(1);
  });

  it('rejects an invalid OTP and increments attempts', async () => {
    const seeded = await seedEntry({
      type: 'email',
      identifier: 'qa.verify-fail@example.com',
      purpose: 'login',
      preGeneratedOtp: '112233',
    });

    const response = await api()
      .post('/api/otp/verify')
      .send({
        identifier: seeded.identifier,
        channel: seeded.channel,
        purpose: seeded.purpose,
        otp: '000000',
      })
      .expect(400);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'INVALID_REQUEST',
      }),
      request_id: expect.any(String),
    }));

    const logRecord = await getOtpLogByRequestId(seeded.requestId);
    expect(logRecord.verified).toBe(false);
    expect(logRecord.verification_attempts).toBe(1);
  });
});
