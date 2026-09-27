import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinalFolioPrintHtml, escapeHtml } from '../src/components/CheckoutSettlementDialog';

test('final folio print values escape HTML metacharacters', () => {
  assert.equal(escapeHtml('Aarav <script>alert(1)</script>'), 'Aarav &lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('Dinner <img src=x onerror=alert(1)>'), 'Dinner &lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml('A&B "quoted" \'value\''), 'A&amp;B &quot;quoted&quot; &#39;value&#39;');
});

test('generated final folio HTML is one escaped document', () => {
  const html = buildFinalFolioPrintHtml({
    reference: 'RW-XSS-1',
    finalFolioNumber: 'RW-FOLIO-2027-ONE',
    stayStatus: 'CHECKED_OUT',
    status: 'SETTLED',
    settlement: { grossAmount: 1250, incidentalAmount: 250, paidAmount: 1250, balanceAmount: 0, settledAt: '2026-12-31T20:00:00.000Z' },
    snapshot: {
      hotel: { name: 'RainWood <svg onload=alert(1)>' },
      guest: { name: 'Aarav <script>alert("x")</script>', email: 'aarav@example.com', mobile: '+91 90000 00000', gstin: 'GST<&' },
      stay: { rooms: [{ roomNumber: '101', roomType: 'Premium <b>Room</b>' }] },
      charges: { incidentals: [{ description: 'Dinner <img src=x onerror=alert(1)>', category: 'FOOD_BEVERAGE', totalAmount: 250 }] },
      payments: [{ mode: 'UPI', reference: 'receipt<&', amount: 1250 }],
      overrideReason: 'COMPANY_CREDIT',
      authorizedBy: 'Admin <script>alert(1)</script>',
      notes: 'note<&',
    },
  });
  assert.equal((html.match(/<html>/g) ?? []).length, 1);
  assert.equal((html.match(/<\/html>/g) ?? []).length, 1);
  assert.equal((html.match(/<body>/g) ?? []).length, 1);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img src=x onerror='), false);
  assert.equal(html.includes('<svg onload='), false);
  assert.match(html, /Aarav &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Dinner &lt;img src=x onerror=alert\(1\)&gt;/);
});
