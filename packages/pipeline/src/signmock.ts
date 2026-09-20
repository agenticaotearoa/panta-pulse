import { Keypair, VersionedTransaction } from '@solana/web3.js';

/**
 * Deterministic stand-in for the user's wallet, used so a demo can complete the
 * create flow without spending the real 50 USDC market-creation fee.
 *
 * WHY A DETERMINISTIC KEY
 * Runs must be reproducible — the same input must produce the same bytes every
 * time, or a judge cannot replay the demo. A fixed 32-byte seed gives that.
 *
 * WHY THIS IS NOT CUSTODY
 * This key never holds funds, is never funded, and nothing is ever broadcast.
 * The real flow is: the wallet in `quoteCreateMarket({wallet})` signs, because
 * Panta is non-custodial and the API only ever returns unsigned transactions.
 * So the simulated wallet must be the SAME wallet that quoted the market, which
 * is why `getSimulationSigner()` is exported: the pipeline uses its public key as
 * the quote's `wallet` parameter.
 */

// Keypair.fromSeed() requires EXACTLY 32 bytes. A 47-byte seed does not throw at
// import time — it throws at call time with "private key of length 32 expected,
// got 47", which is why this is asserted rather than assumed.
const SIMULATION_SEED = Uint8Array.from([
  80, 97, 110, 116, 97, 80, 117, 108,
  115, 101, 32, 111, 102, 102, 108, 105,
  110, 101, 32, 115, 105, 103, 110, 105,
  110, 103, 32, 48, 48, 48, 48, 49,
]);

if (SIMULATION_SEED.length !== 32) {
  throw new Error(`simulation seed must be exactly 32 bytes, got ${SIMULATION_SEED.length}`);
}

export const SIMULATION_NOTE =
  'Local simulation only. This transaction was never broadcast. In production, your own wallet signs this step because Panta is non-custodial.';

/** The deterministic demo wallet. Use its public key as the quote's `wallet`. */
export function getSimulationSigner(): Keypair {
  return Keypair.fromSeed(SIMULATION_SEED);
}

/** Base58 public key of the deterministic demo wallet. */
export function getSimulationPublicKey(): string {
  return getSimulationSigner().publicKey.toBase58();
}

export interface OfflineSignResult {
  signedBase64: string;
  signerPublicKey: string;
  note: string;
}

/**
 * Sign an unsigned base64 versioned transaction locally. Never broadcasts.
 *
 * `VersionedTransaction.sign()` only accepts keys that the message actually lists
 * as required signers — passing anything else throws "Cannot sign with non signer
 * key". So when the supplied signer is not the transaction's fee payer, we do not
 * pretend to sign: we report the mismatch clearly.
 *
 * @throws if `base64Tx` is not a deserialisable versioned transaction, or if the
 *   signer is not one of the transaction's required signers.
 */
export async function offlineSignUnsignedTransaction(
  base64Tx: string,
  signer: Keypair = getSimulationSigner(),
): Promise<OfflineSignResult> {
  const transaction = VersionedTransaction.deserialize(Buffer.from(base64Tx, 'base64'));

  const required = transaction.message.staticAccountKeys
    .slice(0, transaction.message.header.numRequiredSignatures)
    .map((key) => key.toBase58());

  const signerKey = signer.publicKey.toBase58();
  if (!required.includes(signerKey)) {
    throw new Error(
      `signer ${signerKey} is not a required signer of this transaction ` +
        `(required: ${required.join(', ')}). Quote the market with this wallet's ` +
        `public key so that it becomes the fee payer.`,
    );
  }

  transaction.sign([signer]);

  return {
    signedBase64: Buffer.from(transaction.serialize()).toString('base64'),
    signerPublicKey: signerKey,
    note: SIMULATION_NOTE,
  };
}
