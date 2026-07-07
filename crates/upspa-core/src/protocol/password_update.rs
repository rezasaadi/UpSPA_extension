use crate::aead::xchacha_encrypt_detached;
use crate::hash::{hash_to_point, oprf_finalize};
use crate::protocol::{cipherid_aad, decrypt_cid, CipherId, CIPHERID_PT_LEN};
use crate::sign::sign_detached;
use crate::toprf::toprf_gen;
use crate::types::UpspaError;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand_core::{CryptoRng, RngCore};
use serde::{Deserialize, Serialize};
pub const PWD_UPDATE_SIG_MSG_LEN: usize = 24 + 96 + 16 + 32 + 8 + 4;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PasswordUpdateSpMessage {
    pub uid_b64: String,
    pub sp_id: u32,
    pub timestamp: u64,
    #[serde(with = "serde_big_array::BigArray")]
    pub sig: [u8; 64],
    #[serde(with = "serde_big_array::BigArray")]
    pub k_i_new: [u8; 32],
    pub cid_new: CipherId,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PasswordUpdateOutput {
    pub cid_new: CipherId,
    pub per_sp: Vec<PasswordUpdateSpMessage>,
}
pub fn client_password_update<R: RngCore + CryptoRng>(
    uid: &[u8],
    old_password_state_key: &[u8; 32],
    cid_old: &CipherId,
    nsp: usize,
    tsp: usize,
    new_password: &[u8],
    timestamp: u64,
    rng: &mut R,
) -> Result<PasswordUpdateOutput, UpspaError> {
    assert!(tsp >= 1 && tsp <= nsp);
    let cid_pt = decrypt_cid(uid, old_password_state_key, cid_old)?;
    let (new_master_sk, new_shares) = toprf_gen(nsp, tsp, rng);
    let cipherid_pt_bytes: [u8; CIPHERID_PT_LEN] = cid_pt.to_bytes();
    let signing_key = cid_pt.signing_key;
    let p_new = hash_to_point(new_password);
    let y_new = p_new * new_master_sk;
    let new_state_key: [u8; 32] = oprf_finalize(new_password, &y_new);
    let aad = cipherid_aad(uid);
    let cid_new = xchacha_encrypt_detached(&new_state_key, &aad, &cipherid_pt_bytes, rng);
    let mut per_sp = Vec::with_capacity(new_shares.len());
    let uid_b64_str = URL_SAFE_NO_PAD.encode(uid);
    for (sp_id, share) in new_shares.iter() {
        let k_i_new = share.to_bytes();
        let mut msg = [0u8; PWD_UPDATE_SIG_MSG_LEN];
        let mut off = 0;
        msg[off..off + 24].copy_from_slice(&cid_new.nonce);
        off += 24;
        msg[off..off + 96].copy_from_slice(&cid_new.ct);
        off += 96;
        msg[off..off + 16].copy_from_slice(&cid_new.tag);
        off += 16;
        msg[off..off + 32].copy_from_slice(&k_i_new);
        off += 32;
        msg[off..off + 8].copy_from_slice(&timestamp.to_le_bytes());
        off += 8;
        let sp_id_u32: u32 = (*sp_id) as u32;
        msg[off..off + 4].copy_from_slice(&sp_id_u32.to_le_bytes());
        off += 4;
        debug_assert_eq!(off, PWD_UPDATE_SIG_MSG_LEN);
        let sig = sign_detached(&signing_key, &msg);
        per_sp.push(PasswordUpdateSpMessage {
            uid_b64: uid_b64_str.clone(),
            sp_id: sp_id_u32,
            timestamp,
            sig,
            k_i_new,
            cid_new: cid_new.clone(),
        });
    }
    Ok(PasswordUpdateOutput { cid_new, per_sp })
}
