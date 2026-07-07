use crate::aead::xchacha_encrypt_detached;
use crate::hash::{hash_to_point, oprf_finalize};
use crate::protocol::{cipherid_aad, CipherId, CIPHERID_PT_LEN};
use crate::toprf::toprf_gen;
use ed25519_dalek::SigningKey;
use rand_core::{CryptoRng, RngCore};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetupSpPayload {
    pub sp_id: u32,
    pub uid: Vec<u8>,
    pub sig_pk: [u8; 32],
    pub cid: CipherId,
    pub k_i: [u8; 32],
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetupOutput {
    pub sig_pk: [u8; 32],
    pub cid: CipherId,
    pub shares: Vec<(u32, [u8; 32])>,
}
pub fn client_setup<R: RngCore + CryptoRng>(
    uid: &[u8],
    password: &[u8],
    nsp: usize,
    tsp: usize,
    rng: &mut R,
) -> (SetupOutput, Vec<SetupSpPayload>) {
    assert!(tsp >= 1 && tsp <= nsp);
    let mut rsp = [0u8; 32];
    rng.fill_bytes(&mut rsp);
    let (master_sk, shares) = toprf_gen(nsp, tsp, rng);
    let signing_key = SigningKey::generate(rng);
    let ssk_bytes = signing_key.to_bytes();
    let sig_pk = signing_key.verifying_key().to_bytes();
    let mut k0 = [0u8; 32];
    rng.fill_bytes(&mut k0);
    let p = hash_to_point(password);
    let y = p * master_sk;
    let state_key: [u8; 32] = oprf_finalize(password, &y);
    let mut pt = [0u8; CIPHERID_PT_LEN];
    pt[0..32].copy_from_slice(&ssk_bytes);
    pt[32..64].copy_from_slice(&rsp);
    pt[64..96].copy_from_slice(&k0);
    let aad = cipherid_aad(uid);
    let cid = xchacha_encrypt_detached(&state_key, &aad, &pt, rng);
    let shares_bytes: Vec<(u32, [u8; 32])> =
        shares.iter().map(|(id, s)| (*id, s.to_bytes())).collect();
    let out = SetupOutput {
        sig_pk,
        cid: cid.clone(),
        shares: shares_bytes.clone(),
    };
    let payloads = shares_bytes
        .iter()
        .map(|(id, share_bytes)| SetupSpPayload {
            sp_id: *id,
            uid: uid.to_vec(),
            sig_pk,
            cid: cid.clone(),
            k_i: *share_bytes,
        })
        .collect();
    (out, payloads)
}
