use crate::hash::{hash_suid, hash_vinfo};
use crate::protocol::{decrypt_cid, decrypt_cj, CipherId, CipherSp};
use crate::types::UpspaError;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthQueries {
    pub k0: [u8; 32],
    pub per_sp: Vec<(u32, [u8; 32])>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthResult {
    pub vinfo_prime: [u8; 32],
    pub best_ctr: u64,
}
pub fn client_auth_prepare(
    uid: &[u8],
    lsj: &[u8],
    password_state_key: &[u8; 32],
    cid: &CipherId,
    nsp: usize,
) -> Result<AuthQueries, UpspaError> {
    let cid_pt = decrypt_cid(uid, password_state_key, cid)?;
    let rsp = cid_pt.rsp;
    let k0 = cid_pt.k0;
    let mut per_sp = Vec::with_capacity(nsp);
    for i in 1..=nsp {
        let suid = hash_suid(&rsp, lsj, i as u32);
        per_sp.push((i as u32, suid));
    }
    Ok(AuthQueries { k0, per_sp })
}
pub fn client_auth_finish(
    uid: &[u8],
    lsj: &[u8],
    k0: &[u8; 32],
    cjs: &[CipherSp],
) -> Result<AuthResult, UpspaError> {
    if cjs.is_empty() {
        return Err(UpspaError::InvalidLength {
            expected: 1,
            got: 0,
        });
    }
    let mut best_ctr: u64 = 0;
    let mut best_rlsj = [0u8; 32];
    let mut any_ok = false;
    for cj in cjs {
        let pt = decrypt_cj(uid, k0, cj)?;
        any_ok = true;
        if pt.ctr >= best_ctr {
            best_ctr = pt.ctr;
            best_rlsj = pt.rlsj;
        }
    }
    if !any_ok {
        return Err(UpspaError::Aead);
    }
    let vinfo_prime = hash_vinfo(&best_rlsj, lsj);
    Ok(AuthResult {
        vinfo_prime,
        best_ctr,
    })
}
