use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
pub const NONCE_LEN: usize = 24;
pub const TAG_LEN: usize = 16;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CtBlobB64 {
    pub nonce: String,
    pub ct: String,
    pub tag: String,
}
#[derive(Clone, Debug, thiserror::Error, PartialEq, Eq)]
pub enum CtBlobParseError {
    #[error("invalid length: expected {expected}, got {got}")]
    InvalidLength { expected: usize, got: usize },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CtBlob<const PT_LEN: usize> {
    #[serde(with = "serde_big_array::BigArray")]
    pub nonce: [u8; NONCE_LEN],
    #[serde(with = "serde_big_array::BigArray")]
    pub ct: [u8; PT_LEN],
    #[serde(with = "serde_big_array::BigArray")]
    pub tag: [u8; TAG_LEN],
}
impl<const PT_LEN: usize> CtBlob<PT_LEN> {
    pub const WIRE_LEN: usize = NONCE_LEN + PT_LEN + TAG_LEN;
    pub fn to_vec(&self) -> Vec<u8> {
        let mut v = Vec::with_capacity(Self::WIRE_LEN);
        v.extend_from_slice(&self.nonce);
        v.extend_from_slice(&self.ct);
        v.extend_from_slice(&self.tag);
        v
    }
    pub fn from_slice(input: &[u8]) -> Result<Self, CtBlobParseError> {
        if input.len() != Self::WIRE_LEN {
            return Err(CtBlobParseError::InvalidLength {
                expected: Self::WIRE_LEN,
                got: input.len(),
            });
        }
        let mut nonce = [0u8; NONCE_LEN];
        let mut ct = [0u8; PT_LEN];
        let mut tag = [0u8; TAG_LEN];
        nonce.copy_from_slice(&input[..NONCE_LEN]);
        ct.copy_from_slice(&input[NONCE_LEN..NONCE_LEN + PT_LEN]);
        tag.copy_from_slice(&input[NONCE_LEN + PT_LEN..]);
        Ok(Self { nonce, ct, tag })
    }
    pub fn to_b64(&self) -> CtBlobB64 {
        CtBlobB64 {
            nonce: b64_encode(&self.nonce),
            ct: b64_encode(&self.ct),
            tag: b64_encode(&self.tag),
        }
    }
    pub fn from_b64(b64: &CtBlobB64) -> Result<Self, UpspaError> {
        let nonce = b64_decode_array::<NONCE_LEN>(&b64.nonce)?;
        let ct = b64_decode_array::<PT_LEN>(&b64.ct)?;
        let tag = b64_decode_array::<TAG_LEN>(&b64.tag)?;
        Ok(Self { nonce, ct, tag })
    }
}
#[derive(Clone, Debug, thiserror::Error)]
pub enum UpspaError {
    #[error("invalid length: expected {expected}, got {got}")]
    InvalidLength { expected: usize, got: usize },
    #[error("base64 decode error: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("invalid ristretto point encoding")]
    InvalidRistrettoPoint,
    #[error("invalid scalar encoding")]
    InvalidScalar,
    #[error("aead error")]
    Aead,
    #[error("signature error")]
    Signature,
    #[error("ct blob parse error")]
    CtParse,
}
pub fn b64_encode(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}
pub fn b64_decode(s: &str) -> Result<Vec<u8>, base64::DecodeError> {
    URL_SAFE_NO_PAD.decode(s)
}
pub fn b64_decode_array<const N: usize>(s: &str) -> Result<[u8; N], UpspaError> {
    let v = b64_decode(s)?;
    if v.len() != N {
        return Err(UpspaError::InvalidLength {
            expected: N,
            got: v.len(),
        });
    }
    let mut out = [0u8; N];
    out.copy_from_slice(&v);
    Ok(out)
}
