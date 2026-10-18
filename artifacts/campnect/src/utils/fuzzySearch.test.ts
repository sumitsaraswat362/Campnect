import test from 'node:test';
import assert from 'node:assert/strict';
import { levenshteinDistance, fuzzyMatch } from './fuzzySearch.js';

test('levenshteinDistance computes edit distance correctly', () => {
  assert.equal(levenshteinDistance('hackathon', 'hacthon'), 2);
  assert.equal(levenshteinDistance('campnect', 'campnect'), 0);
});

test('fuzzyMatch detects partial matches and close typos', () => {
  assert.equal(fuzzyMatch('robotic', 'Robotics Society IIITD'), true);
  assert.equal(fuzzyMatch('dance', 'Annual Dance Society Auditions'), true);
});
