use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use upspa_core::protocol::{
    authenticate, password_update, register, secret_update, setup, CipherId, CipherSp,
};
use upspa_core::toprf::{ToprfClient, ToprfClientState, ToprfPartial};
use upspa_core::types::{b64_decode_array, b64_encode, CtBlobB64, UpspaError};
use wasm_bindgen::prelude::*;
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "panic_hook")]
    console_error_panic_hook::set_once();
}
fn to_js_error(msg: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&msg.to_string())
}
fn map_err(e: UpspaError) -> JsValue {
    to_js_error(e)
}
#[derive(Serialize, Deserialize)]
pub struct SetupShareWasm {
    pub sp_id: u32,
    pub k_i: String,
}
#[derive(Serialize, Deserialize)]
pub struct SetupSpPayloadWasm {
    pub sp_id: u32,
    pub uid: String,
    pub sig_pk: String,
    pub cid: CtBlobB64,
    pub k_i: String,
}
#[derive(Serialize, Deserialize)]
pub struct SetupResultWasm {
    pub sig_pk: String,
    pub cid: CtBlobB64,
    pub shares: Vec<SetupShareWasm>,
    pub sp_payloads: Vec<SetupSpPayloadWasm>,
}
#[wasm_bindgen]
pub fn protocol_setup(
    uid: String,
    password: String,
    nsp: usize,
    tsp: usize,
) -> Result<JsValue, JsValue> {
    let mut rng = OsRng;
    let (out, payloads) =
        setup::client_setup(uid.as_bytes(), password.as_bytes(), nsp, tsp, &mut rng);
    let res = SetupResultWasm {
        sig_pk: b64_encode(&out.sig_pk),
        cid: out.cid.to_b64(),
        shares: out
            .shares
            .iter()
            .map(|(id, s)| SetupShareWasm {
                sp_id: *id,
                k_i: b64_encode(s),
            })
            .collect(),
        sp_payloads: payloads
            .iter()
            .map(|p| SetupSpPayloadWasm {
                sp_id: p.sp_id,
                uid: b64_encode(&p.uid),
                sig_pk: b64_encode(&p.sig_pk),
                cid: p.cid.to_b64(),
                k_i: b64_encode(&p.k_i),
            })
            .collect(),
    };
    serde_wasm_bindgen::to_value(&res).map_err(to_js_error)
}
#[derive(Serialize, Deserialize)]
pub struct ToprfBeginWasm {
    pub r: String,
    pub blinded: String,
}
#[wasm_bindgen]
pub fn toprf_begin(password: String) -> Result<JsValue, JsValue> {
    let mut rng = OsRng;
    let (state, blinded) = ToprfClient::begin(password.as_bytes(), &mut rng);
    let out = ToprfBeginWasm {
        r: b64_encode(&state.r),
        blinded: b64_encode(&blinded),
    };
    serde_wasm_bindgen::to_value(&out).map_err(to_js_error)
}
#[derive(Deserialize)]
pub struct ToprfPartialIn {
    pub id: u32,
    pub y: String,
}
#[wasm_bindgen]
pub fn toprf_finish(password: String, r: String, partials: JsValue) -> Result<String, JsValue> {
    let r_bytes = b64_decode_array::<32>(&r).map_err(map_err)?;
    let state = ToprfClientState { r: r_bytes };
    let parts_in: Vec<ToprfPartialIn> =
        serde_wasm_bindgen::from_value(partials).map_err(to_js_error)?;
    let mut parts = Vec::with_capacity(parts_in.len());
    for p in parts_in {
        let y = b64_decode_array::<32>(&p.y).map_err(map_err)?;
        parts.push(ToprfPartial { id: p.id, y });
    }
    let state_key = ToprfClient::finish(password.as_bytes(), &state, &parts).map_err(map_err)?;
    Ok(b64_encode(&state_key))
}
#[derive(Deserialize)]
pub struct CtBlobIn {
    pub nonce: String,
    pub ct: String,
    pub tag: String,
}
fn parse_cipherid(obj: CtBlobIn) -> Result<CipherId, UpspaError> {
    let b64 = CtBlobB64 {
        nonce: obj.nonce,
        ct: obj.ct,
        tag: obj.tag,
    };
    CipherId::from_b64(&b64)
}
fn parse_ciphersp(obj: CtBlobIn) -> Result<CipherSp, UpspaError> {
    let b64 = CtBlobB64 {
        nonce: obj.nonce,
        ct: obj.ct,
        tag: obj.tag,
    };
    CipherSp::from_b64(&b64)
}
#[derive(Serialize)]
pub struct RegistrationSpOut {
    pub sp_id: u32,
    pub suid: String,
    pub cj: CtBlobB64,
}
#[derive(Serialize)]
pub struct RegistrationOut {
    pub per_sp: Vec<RegistrationSpOut>,
    pub to_ls: RegistrationLsOut,
}
#[derive(Serialize)]
pub struct RegistrationLsOut {
    pub uid: String,
    pub vinfo: String,
}
#[wasm_bindgen]
pub fn protocol_register(
    uid: String,
    lsj: String,
    state_key: String,
    cid: JsValue,
    nsp: usize,
) -> Result<JsValue, JsValue> {
    let state_key = b64_decode_array::<32>(&state_key).map_err(map_err)?;
    let cid_in: CtBlobIn = serde_wasm_bindgen::from_value(cid).map_err(to_js_error)?;
    let cid = parse_cipherid(cid_in).map_err(map_err)?;
    let mut rng = OsRng;
    let out = register::client_register(
        uid.as_bytes(),
        lsj.as_bytes(),
        &state_key,
        &cid,
        nsp,
        &mut rng,
    )
    .map_err(map_err)?;
    let per_sp = out
        .per_sp
        .iter()
        .map(|m| RegistrationSpOut {
            sp_id: m.sp_id,
            suid: b64_encode(&m.suid),
            cj: m.cj.to_b64(),
        })
        .collect();
    let to_ls = RegistrationLsOut {
        uid: uid.clone(),
        vinfo: b64_encode(&out.to_ls.vinfo),
    };
    serde_wasm_bindgen::to_value(&RegistrationOut { per_sp, to_ls }).map_err(to_js_error)
}
#[derive(Serialize)]
pub struct AuthPrepareOut {
    pub k0: String,
    pub per_sp: Vec<AuthSuidOut>,
}
#[derive(Serialize)]
pub struct AuthSuidOut {
    pub sp_id: u32,
    pub suid: String,
}
#[wasm_bindgen]
pub fn protocol_auth_prepare(
    uid: String,
    lsj: String,
    state_key: String,
    cid: JsValue,
    nsp: usize,
) -> Result<JsValue, JsValue> {
    let state_key = b64_decode_array::<32>(&state_key).map_err(map_err)?;
    let cid_in: CtBlobIn = serde_wasm_bindgen::from_value(cid).map_err(to_js_error)?;
    let cid = parse_cipherid(cid_in).map_err(map_err)?;
    let q =
        authenticate::client_auth_prepare(uid.as_bytes(), lsj.as_bytes(), &state_key, &cid, nsp)
            .map_err(map_err)?;
    let per_sp = q
        .per_sp
        .iter()
        .map(|(id, suid)| AuthSuidOut {
            sp_id: *id,
            suid: b64_encode(suid),
        })
        .collect();
    serde_wasm_bindgen::to_value(&AuthPrepareOut {
        k0: b64_encode(&q.k0),
        per_sp,
    })
    .map_err(to_js_error)
}
#[derive(Serialize)]
pub struct AuthFinishOut {
    pub vinfo_prime: String,
    pub best_ctr: u64,
}
#[wasm_bindgen]
pub fn protocol_auth_finish(
    uid: String,
    lsj: String,
    k0: String,
    cjs: JsValue,
) -> Result<JsValue, JsValue> {
    let k0 = b64_decode_array::<32>(&k0).map_err(map_err)?;
    let cjs_in: Vec<CtBlobIn> = serde_wasm_bindgen::from_value(cjs).map_err(to_js_error)?;
    let mut cjs_parsed = Vec::with_capacity(cjs_in.len());
    for cj in cjs_in {
        cjs_parsed.push(parse_ciphersp(cj).map_err(map_err)?);
    }
    let out = authenticate::client_auth_finish(uid.as_bytes(), lsj.as_bytes(), &k0, &cjs_parsed)
        .map_err(map_err)?;
    serde_wasm_bindgen::to_value(&AuthFinishOut {
        vinfo_prime: b64_encode(&out.vinfo_prime),
        best_ctr: out.best_ctr,
    })
    .map_err(to_js_error)
}
#[derive(Serialize)]
pub struct SecretUpdatePrepareOut {
    pub k0: String,
    pub per_sp: Vec<AuthSuidOut>,
}
#[wasm_bindgen]
pub fn protocol_secret_update_prepare(
    uid: String,
    lsj: String,
    state_key: String,
    cid: JsValue,
    nsp: usize,
) -> Result<JsValue, JsValue> {
    let state_key = b64_decode_array::<32>(&state_key).map_err(map_err)?;
    let cid_in: CtBlobIn = serde_wasm_bindgen::from_value(cid).map_err(to_js_error)?;
    let cid = parse_cipherid(cid_in).map_err(map_err)?;
    let q = secret_update::client_secret_update_prepare(
        uid.as_bytes(),
        lsj.as_bytes(),
        &state_key,
        &cid,
        nsp,
    )
    .map_err(map_err)?;
    let per_sp = q
        .per_sp
        .iter()
        .map(|(id, suid)| AuthSuidOut {
            sp_id: *id,
            suid: b64_encode(suid),
        })
        .collect();
    serde_wasm_bindgen::to_value(&SecretUpdatePrepareOut {
        k0: b64_encode(&q.k0),
        per_sp,
    })
    .map_err(to_js_error)
}
#[derive(Serialize)]
pub struct SecretUpdateFinishOut {
    pub vinfo_prime: String,
    pub vinfo_new: String,
    pub cj_new: CtBlobB64,
    pub old_ctr: u64,
    pub new_ctr: u64,
}
#[wasm_bindgen]
pub fn protocol_secret_update_finish(
    uid: String,
    lsj: String,
    k0: String,
    cjs: JsValue,
) -> Result<JsValue, JsValue> {
    let k0 = b64_decode_array::<32>(&k0).map_err(map_err)?;
    let cjs_in: Vec<CtBlobIn> = serde_wasm_bindgen::from_value(cjs).map_err(to_js_error)?;
    let mut cjs_parsed = Vec::with_capacity(cjs_in.len());
    for cj in cjs_in {
        cjs_parsed.push(parse_ciphersp(cj).map_err(map_err)?);
    }
    let mut rng = OsRng;
    let out = secret_update::client_secret_update_finish(
        uid.as_bytes(),
        lsj.as_bytes(),
        &k0,
        &cjs_parsed,
        &mut rng,
    )
    .map_err(map_err)?;
    serde_wasm_bindgen::to_value(&SecretUpdateFinishOut {
        vinfo_prime: b64_encode(&out.vinfo_prime),
        vinfo_new: b64_encode(&out.vinfo_new),
        cj_new: out.cj_new.to_b64(),
        old_ctr: out.old_ctr,
        new_ctr: out.new_ctr,
    })
    .map_err(to_js_error)
}
#[derive(Serialize)]
pub struct PwdUpdateSpOut {
    pub sp_id: u32,
    pub sig: String,
    pub k_i_new: String,
}
#[derive(Serialize)]
pub struct PwdUpdateOut {
    pub cid_new: CtBlobB64,
    pub per_sp: Vec<PwdUpdateSpOut>,
}
#[wasm_bindgen]
pub fn protocol_password_update(
    uid: String,
    old_state_key: String,
    cid_old: JsValue,
    nsp: usize,
    tsp: usize,
    new_password: String,
    timestamp: u64,
) -> Result<JsValue, JsValue> {
    let old_state_key = b64_decode_array::<32>(&old_state_key).map_err(map_err)?;
    let cid_in: CtBlobIn = serde_wasm_bindgen::from_value(cid_old).map_err(to_js_error)?;
    let cid_old = parse_cipherid(cid_in).map_err(map_err)?;
    let mut rng = OsRng;
    let out = password_update::client_password_update(
        uid.as_bytes(),
        &old_state_key,
        &cid_old,
        nsp,
        tsp,
        new_password.as_bytes(),
        timestamp,
        &mut rng,
    )
    .map_err(map_err)?;
    let per_sp = out
        .per_sp
        .iter()
        .map(|m| PwdUpdateSpOut {
            sp_id: m.sp_id,
            sig: b64_encode(&m.sig),
            k_i_new: b64_encode(&m.k_i_new),
        })
        .collect();
    serde_wasm_bindgen::to_value(&PwdUpdateOut {
        cid_new: out.cid_new.to_b64(),
        per_sp,
    })
    .map_err(to_js_error)
}
