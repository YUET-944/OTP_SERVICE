const { api } = require('./helpers/request');
const { resetState } = require('./helpers/state');
const { adminGet } = require('./helpers/admin');
const { seedEntries, getRecordKey } = require('../../scripts/seedHelpers');
const { redisClient } = require('../../src/config/redis');
const { getOtpLogByRequestId } = require('../../src/models/otpLog.model');

describe('OTP generate + verify integration', () => {
  beforeEach(async () => {
    await resetState();
  });

  it('generates an OTP via API and stores record in Redis', async () => {
    const payload = {
      identifier: 'qa.generate@example.com',
      channel: 'email',
      purpose: 'login',
    };

    const response = await api()
      .post('/api/otp/generate')
      .send(payload)
      .expect(201);

    expect(response.body).toEqual(expect.objectContaining({
      request_id: expect.any(String),
      status: 'sent',
      channel: payload.channel,
      fallback_used: false,
      expires_in: expect.any(Number),
    }));

    const recordKey = getRecordKey(response.body.request_id);
    const storedRecordRaw = await redisClient.get(recordKey);
    expect(storedRecordRaw).toBeTruthy();
    const storedRecord = JSON.parse(storedRecordRaw);
    expect(storedRecord).toEqual(expect.objectContaining({
      requestId: response.body.request_id,
      purpose: payload.purpose,
      locked: false,
    }));
    expect(storedRecord.identifiers[0]).toEqual(expect.objectContaining({
      channel: payload.channel,
      value: payload.identifier.toLowerCase(),
    }));
  });

  it('verifies OTP successfully after seeding with known code', async () => {
    const [{ requestId, identifier, channel, purpose, otp }] = await seedEntries([
      {
        type: 'email',
        identifier: 'qa.verify-success@example.com',
        purpose: 'login',
        preGeneratedOtp: '789012',
      },
    ]);

    const response = await api()
      .post('/api/otp/verify')
      .send({
        identifier,
        channel,
        purpose,
        otp,
      })
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      verified: true,
      token: expect.any(String),
    }));

    const redisRecord = await redisClient.get(getRecordKey(requestId));
    expect(redisRecord).toBeNull();

    const logRecord = await getOtpLogByRequestId(requestId);
    expect(logRecord.verified).toBe(true);
    expect(logRecord.verification_attempts).toBe(1);
  });

  it('rejects invalid OTP attempts and increments counters', async () => {
    const [{ requestId, identifier, channel, purpose }] = await seedEntries([
      {
        type: 'email',
        identifier: 'qa.verify-fail@example.com',
        purpose: 'login',
        preGeneratedOtp: '112233',
      },
    ]);

    const response = await api()
      .post('/api/otp/verify')
      .send({
        identifier,
        channel,
        purpose,
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

    const logRecord = await getOtpLogByRequestId(requestId);
    expect(logRecord.verified).toBe(false);
    expect(logRecord.verification_attempts).toBe(1);
  });

  it('allows admin lookup with masked identifiers', async () => {
    const [{ requestId }] = await seedEntries([
      {
        type: 'phone',
        identifier: '+923001112229',
        purpose: 'reset',
        preGeneratedOtp: '445566',
      },
    ]);

    const response = await adminGet(`/internal/otp/lookup?request_id=${requestId}`).expect(200);

    const { body } = response;
    expect(body.request_id).toBe(requestId);
    expect(body.status).toBe('pending');
    expect(body.delivery_attempts).toBe(0);
    expect(body.purpose).toBe('reset');
    expect(body.channel).toMatch(/^(sms|phone)$/);
    expect(body.lifecycle).toEqual(expect.arrayContaining(['created']));
    expect(body.provider).toEqual(expect.any(String));
    expect(body.identifier).toMatch(/^(\+?\d{2,4}\*{3,}\d{2}|\*{3})$/);
    expect(body.identifier).not.toContain('112229');
    expect(body).toHaveProperty('max_attempts', expect.any(Number));
    expect(body).toHaveProperty('attempts', expect.any(Number));
    expect([null, 'string']).toContain(body.verified_at === null ? null : typeof body.verified_at);
    expect([null, 'string']).toContain(body.expires_at === null ? null : typeof body.expires_at);
    expect(typeof body.created_at === 'string' || body.created_at === null).toBe(true);
    expect(typeof body.updated_at === 'string' || body.updated_at === null).toBe(true);
  });
});
