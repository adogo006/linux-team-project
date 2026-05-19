// ── login.js ──

const API_BASE = "http://YOUR_API_URL";

// ── 로그인 요청 ───────────────────────────────────────────────
async function request_login(id, password) {
  const res = await fetch(`${API_BASE}/api:8000/request_login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password }),
  });
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.message || "INVALID_CREDENTIALS");
  }

  return data; // { access_token, token_type, nickname, ... }
}

// ── 핸들러 ────────────────────────────────────────────────────
async function handleLogin() {
  const id = document.getElementById("login-id").value.trim();
  const pw = document.getElementById("login-pw").value;
  const status = document.getElementById("login-status");

  if (!id || !pw) {
    status.textContent = "아이디와 비밀번호를 제대로 입력해주세요.";
    status.className = "status error";
    return;
  }

  status.textContent = "로그인 중...";
  status.className = "status";

  try {
    const data = await request_login(id, pw);

    sessionStorage.setItem("access_token", data.access_token);
    sessionStorage.setItem("nickname", data.nickname); // 파싱 없이 바로 사용

    status.textContent = "✓ 로그인 성공";
    status.className = "status success";

    window.location.href = "project.html";
  } catch (e) {
    const msg = e.message;
    if (
      msg === "존재하지 않는 아이디입니다." ||
      msg === "비밀번호가 일치하지 않습니다."
    ) {
      status.textContent = msg;
    } else if (msg === "INVALID_CREDENTIALS") {
      status.textContent = "아이디 또는 비밀번호가 올바르지 않습니다.";
    } else {
      status.textContent =
        "서버와 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
    }
    status.className = "status error";
  }
}

function goRegister() {
  window.location.href = "Register.html";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
