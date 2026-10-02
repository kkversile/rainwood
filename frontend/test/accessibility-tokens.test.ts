import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function channel(value: string) {
  const normalized = value.length === 1 ? `${value}${value}` : value;
  return Number.parseInt(normalized, 16) / 255;
}

function relativeLuminance(hex: string) {
  const values = [channel(hex.slice(1, 3)), channel(hex.slice(3, 5)), channel(hex.slice(5, 7))].map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

test('admin action teal meets WCAG AA contrast with white text', () => {
  const css = readFileSync(new URL('../src/app/accessibility-overrides.css', import.meta.url), 'utf8');
  const teal = css.match(/background:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(teal);
  const lighter = Math.max(relativeLuminance(teal), 1);
  const darker = Math.min(relativeLuminance(teal), 1);
  assert.ok((lighter + 0.05) / (darker + 0.05) >= 4.5);
});
