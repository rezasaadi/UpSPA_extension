use blake3;
use curve25519_dalek::ristretto::RistrettoPoint;
pub fn hash_to_point(msg: &[u8]) -> RistrettoPoint {
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"uptspa/hash_to_point");
    hasher.update(msg);
    let mut wide = [0u8; 64];
    hasher.finalize_xof().fill(&mut wide);
    RistrettoPoint::from_uniform_bytes(&wide)
}
pub fn oprf_finalize(password: &[u8], y: &RistrettoPoint) -> [u8; 32] {
    let y_bytes = y.compress().to_bytes();
    let mut h = blake3::Hasher::new();
    h.update(b"uptspa/oprf_finalize");
    h.update(password);
    h.update(&y_bytes);
    let out = h.finalize();
    let mut r = [0u8; 32];
    r.copy_from_slice(out.as_bytes());
    r
}
pub fn hash_suid(rsp: &[u8; 32], lsj: &[u8], i: u32) -> [u8; 32] {
    let mut h = blake3::Hasher::new();
    h.update(b"uptspa/suid");
    h.update(rsp);
    h.update(lsj);
    h.update(&i.to_le_bytes());
    let out = h.finalize();
    let mut r = [0u8; 32];
    r.copy_from_slice(out.as_bytes());
    r
}
pub fn hash_vinfo(rlsj: &[u8; 32], lsj: &[u8]) -> [u8; 32] {
    let mut h = blake3::Hasher::new();
    h.update(b"uptspa/vinfo");
    h.update(rlsj);
    h.update(lsj);
    let out = h.finalize();
    let mut r = [0u8; 32];
    r.copy_from_slice(out.as_bytes());
    r
}
