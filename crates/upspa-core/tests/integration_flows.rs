use rand_chacha::ChaCha20Rng;
use rand_core::SeedableRng;
use upspa_core::protocol::{
    authenticate, decrypt_cid, password_update, register, secret_update, setup,
};
use upspa_core::sign::verify_detached;
use upspa_core::toprf::{toprf_server_eval, ToprfClient, ToprfPartial};
#[test]
fn full_client_flow_smoke_test() {
    let uid = b"user123";
    let lsj = b"LS1";
    let password = b"benchmark password";
    let new_password = b"new benchmark password";
    let nsp = 5usize;
    let tsp = 3usize;
    let mut rng = ChaCha20Rng::from_seed([42u8; 32]);
    let (setup_out, _payloads) = setup::client_setup(uid, password, nsp, tsp, &mut rng);
    let (state, blinded) = ToprfClient::begin(password, &mut rng);
    let mut partials = Vec::new();
    for (id, share_bytes) in setup_out.shares.iter().take(tsp) {
        let y_i = toprf_server_eval(&blinded, share_bytes).unwrap();
        partials.push(ToprfPartial { id: *id, y: y_i });
    }
    let state_key = ToprfClient::finish(password, &state, &partials).unwrap();
    let reg =
        register::client_register(uid, lsj, &state_key, &setup_out.cid, nsp, &mut rng).unwrap();
    assert_eq!(reg.per_sp.len(), nsp);
    let cj0 = reg.per_sp[0].cj.clone();
    let vinfo_reg = reg.to_ls.vinfo;
    let auth_q =
        authenticate::client_auth_prepare(uid, lsj, &state_key, &setup_out.cid, nsp).unwrap();
    assert_eq!(auth_q.per_sp.len(), nsp);
    for (i, m) in reg.per_sp.iter().enumerate() {
        assert_eq!(auth_q.per_sp[i].0, m.sp_id);
        assert_eq!(auth_q.per_sp[i].1, m.suid);
    }
    let cjs = vec![cj0.clone(); tsp];
    let auth_res = authenticate::client_auth_finish(uid, lsj, &auth_q.k0, &cjs).unwrap();
    assert_eq!(auth_res.vinfo_prime, vinfo_reg);
    let su_q =
        secret_update::client_secret_update_prepare(uid, lsj, &state_key, &setup_out.cid, nsp)
            .unwrap();
    let su_res =
        secret_update::client_secret_update_finish(uid, lsj, &su_q.k0, &cjs, &mut rng).unwrap();
    assert_eq!(su_res.vinfo_prime, vinfo_reg);
    assert_eq!(su_res.old_ctr, 0);
    assert_eq!(su_res.new_ctr, 1);
    let cjs_new = vec![su_res.cj_new.clone(); tsp];
    let auth_res2 = authenticate::client_auth_finish(uid, lsj, &auth_q.k0, &cjs_new).unwrap();
    assert_eq!(auth_res2.vinfo_prime, su_res.vinfo_new);
    let timestamp: u64 = 123456;
    let pw_res = password_update::client_password_update(
        uid,
        &state_key,
        &setup_out.cid,
        nsp,
        tsp,
        new_password,
        timestamp,
        &mut rng,
    )
    .unwrap();
    for m in pw_res.per_sp.iter() {
        let mut msg = [0u8; password_update::PWD_UPDATE_SIG_MSG_LEN];
        let mut off = 0;
        msg[off..off + 24].copy_from_slice(&pw_res.cid_new.nonce);
        off += 24;
        msg[off..off + 96].copy_from_slice(&pw_res.cid_new.ct);
        off += 96;
        msg[off..off + 16].copy_from_slice(&pw_res.cid_new.tag);
        off += 16;
        msg[off..off + 32].copy_from_slice(&m.k_i_new);
        off += 32;
        msg[off..off + 8].copy_from_slice(&timestamp.to_le_bytes());
        off += 8;
        msg[off..off + 4].copy_from_slice(&m.sp_id.to_le_bytes());
        off += 4;
        assert_eq!(off, password_update::PWD_UPDATE_SIG_MSG_LEN);
        verify_detached(&setup_out.sig_pk, &msg, &m.sig).unwrap();
    }
    let (st2, blinded2) = ToprfClient::begin(new_password, &mut rng);
    let mut new_partials = Vec::new();
    for m in pw_res.per_sp.iter().take(tsp) {
        let y_i = toprf_server_eval(&blinded2, &m.k_i_new).unwrap();
        new_partials.push(ToprfPartial {
            id: m.sp_id,
            y: y_i,
        });
    }
    let new_state_key = ToprfClient::finish(new_password, &st2, &new_partials).unwrap();
    let cid_old_pt = decrypt_cid(uid, &state_key, &setup_out.cid)
        .unwrap()
        .to_bytes();
    let cid_new_pt = decrypt_cid(uid, &new_state_key, &pw_res.cid_new)
        .unwrap()
        .to_bytes();
    assert_eq!(cid_new_pt, cid_old_pt);
}
