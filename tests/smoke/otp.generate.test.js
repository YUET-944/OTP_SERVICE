const { api } = require('./helpers/request');
const { resetState } = require('./helpers/state');
const { redisClient } = require('../../src/config/redis');
const { getRecordKey } = require('../../scripts/seedHelpers');

describe('OTP generation flow', () => {
  beforeEach(async () => {
    await resetState();
  });

  it('generates an OTP and persists request metadata', async () => {
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
      channel: 'email',
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
      channel: 'email',
      value: payload.identifier.toLowerCase(),
    }));
  });
});
