import assert from 'node:assert/strict';
import test from 'node:test';
import { userFromSession } from './identity';

test('returns id and username when both claims are present', () => {
    assert.deepEqual(userFromSession({ user: { id: 'sub-1', username: 'alice' } }), { id: 'sub-1', username: 'alice' });
});

test('denies anonymous and incomplete sessions', () => {
    for (const session of [null, undefined, {}, { user: {} }, { user: { id: 'sub-1' } }, { user: { username: 'alice' } }, { user: { id: '', username: 'alice' } }]) {
        assert.throws(() => userFromSession(session), /Unauthenticated/);
    }
});
