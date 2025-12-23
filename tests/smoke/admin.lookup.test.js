const { adminGet } = require('./helpers/admin');
const { resetState } = require('./helpers/state');
const { seedEntry } = require('../../scripts/seedHelpers');

describe('Admin OTP lookup', () => {
  beforeEach(async () => {
    await resetState();
  });

  it('returns masked OTP request details', async () => {
    const seeded = await seedEntry({
      type: 'phone',
      identifier: '+923001112229',
      purpose: 'reset',
      preGeneratedOtp: '445566',
    });

    const response = await adminGet(`/internal/otp/lookup?request_id=${seeded.requestId}`).expect(200);

    const { body } = response;
    expect(body.request_id).toBe(seeded.requestId);
    expect(body.status).toBe('pending');
    expect(body.delivery_attempts).toBe(0);
    expect(body.purpose).toBe(seeded.purpose);
    expect(body.channel).toMatch(/^(sms|phone)$/);
    expect(body.lifecycle).toEqual(expect.arrayContaining(['created']));
    expect(body.provider).toEqual(expect.any(String));
    expect(body.identifier).toMatch(/^(\+?923\*{6}\d{2}|\*{3})$/);
    expect(body.identifier).not.toContain(seeded.identifier.slice(-4));
    expect(body).toHaveProperty('max_attempts', expect.any(Number));
    expect(body).toHaveProperty('attempts', expect.any(Number));
    expect([null, 'string']).toContain(body.verified_at === null ? null : typeof body.verified_at);
    expect([null, 'string']).toContain(body.expires_at === null ? null : typeof body.expires_at);
    expect(typeof body.created_at === 'string' || body.created_at === null).toBe(true);
    expect(typeof body.updated_at === 'string' || body.updated_at === null).toBe(true);
  });
});
