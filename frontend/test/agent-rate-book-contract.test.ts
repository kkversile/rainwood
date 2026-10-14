import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = readFileSync(join(process.cwd(), 'src/app/agent/rate-plans/page.tsx'), 'utf8');

test('agent rate book uses the tolerant rate-book API view', () => {
  assert.match(page, /view: 'rate-book'/);
  assert.match(page, /Complete coverage/);
  assert.match(page, /Partial coverage/);
  assert.match(page, /Unavailable/);
  assert.match(page, /EP/);
  assert.match(page, /CP/);
  assert.match(page, /MAP/);
  assert.match(page, /AP/);
  assert.match(page, /Guest supplements/);
  assert.match(page, /From date for daily rate details/);
  assert.match(page, /To date for daily rate details/);
  assert.match(page, /Filter daily rates by hotel/);
  assert.match(page, /placeholder="From date"/);
  assert.match(page, /placeholder="To date"/);
  assert.match(page, /daily rates by room type/);
  assert.match(page, /daily rates by meal plan/);
  assert.match(page, /View daily rates/);
  assert.match(page, /agentRateDailyDetails/);
  assert.doesNotMatch(page, /agentRateBookDetails/);
  assert.match(page, /agentRateDailyLink/);
  assert.match(page, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(page, /Go to top/);
  assert.match(page, /const plansWithRates = useMemo\(\(\) => plans\.filter\(\(plan\) => plan\.rates\.length > 0\)/);
  assert.match(page, /const assignedCoverage = useMemo/);
  assert.match(page, /<h3>No rates assigned<\/h3>/);
});

test('agent rate book keeps internal categories out of the agent-facing page', () => {
  assert.doesNotMatch(page, /category[A-E]Amount/);
  assert.doesNotMatch(page, /category mapping code/);
  assert.match(page, /Final availability, taxes and booking eligibility/);
});
