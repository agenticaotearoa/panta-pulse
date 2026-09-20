import { describe, expect, it } from 'vitest';
import { Transaction, SystemProgram, Keypair, VersionedTransaction } from '@solana/web3.js';
import {
  offlineSignUnsignedTransaction,
  getSimulationSigner,
  getSimulationPublicKey,
  SIMULATION_NOTE,
} from '../src/signmock.js';

/**
 * Build a REAL, valid, unsigned versioned transaction.
 *
 * The previous version of this test did `new VersionedTransaction(new Uint8Array(1))`
 * and blew up with "Cannot read properties of undefined (reading
 * 'numRequiredSignatures')" — a 1-byte array is not a Message. The fix is to
 * compile an actual instruction into a message, which is what
 * `buildCreateTransaction` hands back from the Panta API in real life (as base64).
 */
function unsignedVersionedTxBase64(): string {
  const payer = getSimulationSigner().publicKey;
  const legacy = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
  legacy.recentBlockhash = '11111111111111111111111111111111';
  legacy.feePayer = payer;
  const vtx = new VersionedTransaction(legacy.compileMessage());
  return Buffer.from(vtx.serialize()).toString('base64');
}

describe('offlineSignUnsignedTransaction', () => {
  it('signs a transaction locally and never broadcasts it', async () => {
    const unsigned = unsignedVersionedTxBase64();
    const result = await offlineSignUnsignedTransaction(unsigned);

    expect(result.signerPublicKey).toBeTruthy();
    expect(result.note).toContain('Local simulation only');
    expect(result.note).toContain('never broadcast');
    expect(result.note).toContain('non-custodial');
    expect(
      VersionedTransaction.deserialize(Buffer.from(result.signedBase64, 'base64')).signatures.length,
    ).toBeGreaterThan(0);
  });

  it('changes the serialised bytes when it signs', async () => {
    const unsigned = unsignedVersionedTxBase64();
    const signed = await offlineSignUnsignedTransaction(unsigned);
    expect(signed.signedBase64).not.toBe(unsigned);
  });

  it('is deterministic so a demo run is reproducible', async () => {
    const unsigned = unsignedVersionedTxBase64();
    const a = await offlineSignUnsignedTransaction(unsigned);
    const b = await offlineSignUnsignedTransaction(unsigned);
    expect(a.signerPublicKey).toBe(b.signerPublicKey);
    expect(a.signedBase64).toBe(b.signedBase64);
  });

  it('exposes the deterministic wallet so it can quote the market', () => {
    expect(getSimulationPublicKey()).toBe(getSimulationSigner().publicKey.toBase58());
    expect(getSimulationPublicKey()).toBe(getSimulationPublicKey());
    expect(getSimulationPublicKey().length).toBeGreaterThan(30);
  });

  it('refuses to pretend to sign with a key that is not a required signer', async () => {
    const unsigned = unsignedVersionedTxBase64();
    await expect(
      offlineSignUnsignedTransaction(unsigned, Keypair.generate()),
    ).rejects.toThrow(/not a required signer/);
  });

  it('exposes the note as a constant so the demo text cannot drift', () => {
    expect(SIMULATION_NOTE).toContain('never broadcast');
    expect(SIMULATION_NOTE).toContain('non-custodial');
  });

  it('never mutates the caller-supplied transaction', async () => {
    const unsigned = unsignedVersionedTxBase64();
    const before = VersionedTransaction.deserialize(Buffer.from(unsigned, 'base64'));
    const beforeSigs = before.signatures.length;
    await offlineSignUnsignedTransaction(unsigned);
    const after = VersionedTransaction.deserialize(Buffer.from(unsigned, 'base64'));
    expect(after.signatures.length).toBe(beforeSigs);
  });
});
