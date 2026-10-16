import assert from 'node:assert/strict'
import test from 'node:test'
import { countsTowardProfilePosts, PROFILE_POSTS_COUNT_SQL } from '../src/legacy-services/profilePostsCount.js'

test('profile Posts stat includes regular posts and both Clip types, excluding Glimpses', () => {
  assert.equal(countsTowardProfilePosts('post'), true)
  assert.equal(countsTowardProfilePosts('reel'), true)
  assert.equal(countsTowardProfilePosts('video'), true)
  assert.equal(countsTowardProfilePosts('glimpse'), false)
})

test('profile Posts count SQL excludes only Glimpses among post types', () => {
  assert.match(PROFILE_POSTS_COUNT_SQL, /visibility = 'public'/)
  assert.match(PROFILE_POSTS_COUNT_SQL, /COALESCE\(type, ''\) <> 'glimpse'/)
  assert.doesNotMatch(PROFILE_POSTS_COUNT_SQL, /\breel\b/)
  assert.doesNotMatch(PROFILE_POSTS_COUNT_SQL, /\bvideo\b/)
})
