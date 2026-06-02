use rand_chacha::ChaCha20Rng;
use rand_core::{RngCore, SeedableRng};
use upspa_core::aead::{xchacha_decrypt_detached, xchacha_encrypt_detached};
#[test]
fn xchacha_roundtrip_and_aad_binding() {
    let mut rng = ChaCha20Rng::from_seed([9u8; 32]);
    let mut key = [0u8; 32];
    rng.fill_bytes(&mut key);
    let aad = b"example aad";
    let bad_aad = b"wrong aad";
    let mut pt = [0u8; 64];
    rng.fill_bytes(&mut pt);
    let blob = xchacha_encrypt_detached(&key, aad, &pt, &mut rng);
    let dec = xchacha_decrypt_detached(&key, aad, &blob).expect("decrypt should succeed");
    assert_eq!(dec, pt);
    assert!(xchacha_decrypt_detached(&key, bad_aad, &blob).is_err());
    let mut tampered = blob.clone();
    tampered.tag[0] ^= 1;
    assert!(xchacha_decrypt_detached(&key, aad, &tampered).is_err());
}
