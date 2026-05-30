import { createServer } from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);

// In-memory demo DB.
// account_id -> password hash
const users = new Map();

function htmlPage(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 720px;
      margin: 40px auto;
      padding: 0 16px;
    }
    nav a { margin-right: 12px; }
    label {
      display: block;
      margin-top: 14px;
      font-weight: 600;
    }
    input, button {
      width: 100%;
      box-sizing: border-box;
      padding: 8px;
      margin-top: 6px;
    }
    button { margin-top: 18px; cursor: pointer; }
    .box {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 8px;
      margin-top: 20px;
    }
    code { background: #eee; padding: 2px 4px; }
  </style>
</head>
<body>
  <nav>
    <a href="/">Home</a>
    <a href="/register">Register</a>
    <a href="/login">Login</a>
    <a href="/secret-update">Secret update</a>
  </nav>
  <hr />
  ${body}
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sendHtml(res, status, title, body) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(htmlPage(title, body));
}

function redirect(res, path) {
  res.writeHead(303, { Location: path });
  res.end();
}

async function readForm(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return new URLSearchParams(raw);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, expectedB64] = stored.split(":");
    const actual = scryptSync(password, salt, 32);
    const expected = Buffer.from(expectedB64, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function homePage(res) {
  const accounts = Array.from(users.keys());
  sendHtml(
    res,
    200,
    "UpSPA Light Login Server",
    `<h1>UpSPA Light Login Server</h1>
     <p>This login server does not know UpSPA. It only stores and verifies the password value submitted by the browser.</p>
     <div class="box">
       <p><b>Registered demo accounts:</b></p>
       ${
         accounts.length
           ? `<ul>${accounts.map((u) => `<li><code>${escapeHtml(u)}</code></li>`).join("")}</ul>`
           : `<p>No accounts registered yet.</p>`
       }
     </div>`
  );
}

function registerPage(res, msg = "") {
  sendHtml(
    res,
    200,
    "Register",
    `<h1>Register</h1>
     <p>User enters login-server account id and UpSPA master password. Extension replaces password with <code>vInfo</code>.</p>
     ${msg}
     <form method="post" action="/register" data-upspa-flow="register">
       <label>
         Main UpSPA UID
         <input id="uid" name="uid" autocomplete="username" required />
       </label>

       <label>
         Login-server UID'
         <input id="account_id" name="account_id" value="alice" autocomplete="username" required />
       </label>

       <label>
         UpSPA master password
         <input type="password" name="password" autocomplete="new-password" />
       </label>

       <label>
         Confirm UpSPA master password
         <input type="password" name="password_confirm" autocomplete="new-password" />
       </label>

       <button type="submit">Register</button>
     </form>`
  );
}

function loginPage(res, msg = "") {
  sendHtml(
    res,
    200,
    "Login",
    `<h1>Login</h1>
     <p>User enters account id and UpSPA master password. Extension replaces password with <code>vInfoPrime</code>.</p>
     ${msg}
     <form method="post" action="/login" data-upspa-flow="auth">
       <label>
         Main UpSPA UID
         <input id="uid" name="uid" autocomplete="username" required />
       </label>

       <label>
         Login-server UID'
         <input id="account_id" name="account_id" value="alice" autocomplete="username" required />
       </label>

       <label>
         UpSPA master password
         <input type="password" name="password" autocomplete="current-password" />
       </label>

       <button type="submit">Login</button>
     </form>`
  );
}

function secretUpdatePage(res, msg = "", status = 200) {
  sendHtml(
    res,
    status,
    "Secret Update",
    `<h1>Secret Update</h1>
     <p>
       This rotates the login-server secret for this account.
       It is NOT a master password update.
     </p>

     ${msg}

     <form method="post"
           action="/secret-update"
           data-upspa-flow="secret-update">

       <label>
         Main UpSPA UID
         <input
           id="uid"
           name="uid"
           autocomplete="username"
           required
         />
       </label>

       <label>
         Login-server UID'
         <input
           id="account_id"
           name="account_id"
           value="alice"
           autocomplete="username"
           required
         />
       </label>

       <label>
         UpSPA master password
         <input
           type="password"
           name="upspa_master_password"
           autocomplete="current-password"
         />
       </label>

       <!-- hidden LS old/new secrets filled by extension -->
       <input type="hidden" name="old_password" />
       <input type="hidden" name="new_password" />

       <button type="submit">
         Rotate login-server secret
       </button>
     </form>`
  );
}


async function handleRegister(req, res) {
  const form = await readForm(req);
  const accountId = String(form.get("account_id") || "").trim();
  const password = String(form.get("password") || "");
  const confirm = String(form.get("password_confirm") || "");

  if (!accountId || !password) {
    return registerPage(res, `<p class="box">Missing account id or password.</p>`);
  }
  if (password !== confirm) {
    return registerPage(res, `<p class="box">Password fields do not match.</p>`);
  }
  if (users.has(accountId)) {
    return registerPage(res, `<p class="box">Account already exists: <code>${escapeHtml(accountId)}</code></p>`);
  }

  users.set(accountId, hashPassword(password));
  return sendHtml(
    res,
    201,
    "Registered",
    `<h1>Registered</h1>
     <p>Account <code>${escapeHtml(accountId)}</code> registered successfully.</p>
     <p><a href="/login">Go to login</a></p>`
  );
}

async function handleLogin(req, res) {
  const form = await readForm(req);
  const accountId = String(form.get("account_id") || "").trim();
  const password = String(form.get("password") || "");

  const stored = users.get(accountId);
  if (!stored || !verifyPassword(password, stored)) {
    return loginPage(res, `<p class="box">Login failed.</p>`);
  }

  return sendHtml(
    res,
    200,
    "Login success",
    `<h1>Login success</h1>
     <p>Account <code>${escapeHtml(accountId)}</code> authenticated.</p>`
  );
}

async function handleSecretUpdate(req, res) {
  const form = await readForm(req);

  const accountId = String(form.get("account_id") || "").trim();
  const oldPassword = String(form.get("old_password") || "");
  const newPassword = String(form.get("new_password") || "");

  console.log("[LS secret-update] accountId =", accountId);
  console.log("[LS secret-update] account exists =", users.has(accountId));
  console.log("[LS secret-update] oldPassword length =", oldPassword.length);
  console.log("[LS secret-update] newPassword length =", newPassword.length);

  if (!accountId) {
    return secretUpdatePage(
      res,
      `<p class="box">Secret update failed: account id is empty.</p>`,
      400
    );
  }

  if (!users.has(accountId)) {
    return secretUpdatePage(
      res,
      `<p class="box">Secret update failed: account does not exist: <code>${escapeHtml(accountId)}</code>.</p>`,
      404
    );
  }

  if (!oldPassword) {
    return secretUpdatePage(
      res,
      `<p class="box">Secret update failed: old secret is empty. The extension probably did not fill <code>old_password</code>.</p>`,
      400
    );
  }

  if (!newPassword) {
    return secretUpdatePage(
      res,
      `<p class="box">Secret update failed: new secret is empty. The extension probably did not fill <code>new_password</code>.</p>`,
      400
    );
  }

  const stored = users.get(accountId);

  if (!verifyPassword(oldPassword, stored)) {
    return secretUpdatePage(
      res,
      `<p class="box">Secret update failed: old secret did not verify. This usually means the extension generated a different <code>vInfoPrime</code> from the one used during registration/login, or the LSJ/account id changed.</p>`,
      401
    );
  }

  users.set(accountId, hashPassword(newPassword));

  console.log("[LS secret-update] success for accountId =", accountId);

  return sendHtml(
    res,
    200,
    "Secret updated",
    `<h1>Secret updated</h1>
     <p>Account <code>${escapeHtml(accountId)}</code> now has a new login-server secret.</p>
     <p><a href="/login">Login again</a></p>`
  );
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") return homePage(res);
    if (req.method === "GET" && url.pathname === "/register") return registerPage(res);
    if (req.method === "GET" && url.pathname === "/login") return loginPage(res);
    if (req.method === "GET" && url.pathname === "/secret-update") return secretUpdatePage(res);

    if (req.method === "POST" && url.pathname === "/register") return await handleRegister(req, res);
    if (req.method === "POST" && url.pathname === "/login") return await handleLogin(req, res);
    if (req.method === "POST" && url.pathname === "/secret-update") return await handleSecretUpdate(req, res);

    sendHtml(res, 404, "Not found", "<h1>404</h1>");
  } catch (e) {
    sendHtml(res, 500, "Server error", `<h1>500</h1><pre>${escapeHtml(e?.stack || e)}</pre>`);
  }
});

server.listen(PORT, () => {
  console.log(`Light login server running at http://localhost:${PORT}`);
});
