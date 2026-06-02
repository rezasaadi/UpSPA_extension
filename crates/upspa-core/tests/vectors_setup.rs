use rand_chacha::ChaCha20Rng;
use rand_core::SeedableRng;
use upspa_core::protocol::{decrypt_cid, setup};
use upspa_core::toprf::{toprf_server_eval, ToprfClient, ToprfPartial};
#[test]
fn setup_produces_decryptable_cid_via_toprf() {
    let uid = b"user123";
    let password = b"benchmark password";
    let nsp = 5usize;
    let tsp = 3usize;
    let mut rng = ChaCha20Rng::from_seed([1u8; 32]);
    let (out, _payloads) = setup::client_setup(uid, password, nsp, tsp, &mut rng);
    assert_eq!(out.shares.len(), nsp);
    let (state, blinded) = ToprfClient::begin(password, &mut rng);
    let mut partials = Vec::new();
    for (id, share_bytes) in out.shares.iter().take(tsp) {
        let y_i = toprf_server_eval(&blinded, share_bytes).unwrap();
        partials.push(ToprfPartial { id: *id, y: y_i });
    }
    let state_key = ToprfClient::finish(password, &state, &partials).unwrap();
    let cid_pt = decrypt_cid(uid, &state_key, &out.cid).unwrap();
    let _pk = cid_pt.signing_key.verifying_key().to_bytes();
    assert_eq!(cid_pt.rsp.len(), 32);
    assert_eq!(cid_pt.k0.len(), 32);
}
