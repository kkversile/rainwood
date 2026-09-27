import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml } from '../src/components/CheckoutSettlementDialog';

test('final folio print values escape HTML metacharacters', () => {
  assert.equal(escapeHtml('Aarav <script>alert(1)</script>'), 'Aarav &lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('Dinner <img src=x onerror=alert(1)>'), 'Dinner &lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml('A&B "quoted" \'value\''), 'A&amp;B &quot;quoted&quot; &#39;value&#39;');
});
