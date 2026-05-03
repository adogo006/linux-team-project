// ── login.js ──

async function handleLogin() {
  const id = document.getElementById("login-id").value.trim();
  const pw = document.getElementById("login-pw").value;
  const status = document.getElementById("login-status");

  if (!id || !pw) {
    status.textContent = "아이디와 비밀번호를 입력해주세요.";
    status.className = "status error";
    return;
  }

  status.textContent = "로그인 중...";
  status.className = "status";

  try {
    // TODO: API URL 확정되면 교체
    const API_URL = "http://YOUR_API_URL/api/auth/login";

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: id, password: pw }),
    });
    const data = await res.json();

    if (res.ok) {
      status.textContent = "✓ 로그인 성공";
      status.className = "status success";
      // TODO: API 연결 후 아래 주석 해제
      // window.location.href = 'project.html';
    } else {
      status.textContent =
        data.message || "아이디 또는 비밀번호가 올바르지 않습니다.";
      status.className = "status error";
    }
  } catch (e) {
    // 개발 중 API 없을 때 Mock 처리
    status.textContent = "[DEV] API 미연결 상태입니다.";
    status.className = "status error";
  }
}

function goRegister() {
  window.location.href = "Register.html";
}

// Enter 키 로그인
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
