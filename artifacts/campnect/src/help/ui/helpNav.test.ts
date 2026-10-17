import assert from 'node:assert/strict'
import test from 'node:test'
import { returnToHelp } from './helpNav.ts'

test('from-home uses shared back and does not replace', () => {
  let replaced = 0
  returnToHelp({ state: { helpFromHome: true }, requestBack: () => true, replaceToHelp: () => { replaced++ } })
  assert.equal(replaced, 0)
})
test('from-home without a handler falls back to replace', () => {
  let replaced = 0
  returnToHelp({ state: { helpFromHome: true }, requestBack: () => false, replaceToHelp: () => { replaced++ } })
  assert.equal(replaced, 1)
})
test('cold entry replaces without requesting back', () => {
  let asked = 0, replaced = 0
  returnToHelp({ state: null, requestBack: () => { asked++; return true }, replaceToHelp: () => { replaced++ } })
  assert.equal(asked, 0); assert.equal(replaced, 1)
})
