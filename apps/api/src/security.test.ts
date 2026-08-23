import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePairingCode, hashSecret, verifyHash } from './security.js';
describe('pairing security',()=>{it('generates safe formatted codes',()=>{const c=generatePairingCode();assert.match(c,/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);assert(!/[01IO]/.test(c));});it('hashes and verifies codes without storing plaintext',()=>{const c=generatePairingCode(),h=hashSecret(c);assert.notEqual(h,c);assert(verifyHash(c,h));assert(!verifyHash('AAAA-AAAA',h));});});
