import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeHelpRole } from './helpRole.ts'

test('teacher maps to faculty; student stays; none is undefined', () => {
  assert.equal(normalizeHelpRole({ user_role: 'teacher' }), 'faculty')
  assert.equal(normalizeHelpRole({ account_type: 'Faculty' }), 'faculty')
  assert.equal(normalizeHelpRole({ user_role: 'student' }), 'student')
  assert.equal(normalizeHelpRole(null), undefined)
})
