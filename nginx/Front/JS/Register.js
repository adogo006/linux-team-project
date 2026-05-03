// ── register.js ──

// 중복 확인 통과 여부 추적
const checked = { nickname: false, username: false };
const pwValid = { match: false };

function resetCheck(field) {
  checked[field] = false;
  const input = document.getElementById(field);
  input.classList.remove("valid", "invalid");
  document.getElementById(field + "-hint").textContent =
    field === "nickname" ? "한글/영문 2~12자" : "영문·숫자 조합 최대 12자";
  document.getElementById(field + "-hint").className = "hint info";
  updateSubmitBtn();
}

async function checkDuplicate(field) {
  const input = document.getElementById(field);
  const hint = document.getElementById(field + "-hint");
  const value = input.value.trim();

  // 클라이언트 유효성 검사
  if (field === "nickname" && (value.length < 2 || value.length > 12)) {
    hint.textContent = "닉네임은 2~12자여야 합니다.";
    hint.className = "hint fail";
    input.classList.add("invalid");
    input.classList.remove("valid");
    return;
  }
  if (
    field === "username" &&
    !/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9]{1,12}$/.test(value)
  ) {
    hint.textContent = "영문·숫자 조합 최대 12자로 입력해주세요.";
    hint.className = "hint fail";
    input.classList.add("invalid");
    input.classList.remove("valid");
    return;
  }

  hint.textContent = "확인 중...";
  hint.className = "hint info";

  try {
    // TODO: API URL 확정되면 교체
    const API_URL = `http://YOUR_API_URL/api/auth/check-${field}?value=${encodeURIComponent(value)}`;
    const res = await fetch(API_URL);
    const data = await res.json();

    if (data.available) {
      hint.textContent = "✓ 사용 가능합니다.";
      hint.className = "hint ok";
      input.classList.add("valid");
      input.classList.remove("invalid");
      checked[field] = true;
    } else {
      hint.textContent =
        "✗ 이미 사용 중인 " +
        (field === "nickname" ? "닉네임" : "아이디") +
        "입니다.";
      hint.className = "hint fail";
      input.classList.add("invalid");
      input.classList.remove("valid");
      checked[field] = false;
    }
  } catch (e) {
    // [DEV] Mock 처리
    hint.textContent = "[DEV] 사용 가능 (API 미연결)";
    hint.className = "hint ok";
    input.classList.add("valid");
    input.classList.remove("invalid");
    checked[field] = true;
  }

  updateSubmitBtn();
}

function checkPwMatch() {
  const pw = document.getElementById("password").value;
  const pw2 = document.getElementById("password-confirm").value;
  const pwHint = document.getElementById("pw-hint");
  const matchHint = document.getElementById("pw-match-hint");
  const fill = document.getElementById("pw-match-fill");
  const pwInput = document.getElementById("password");
  const pw2Input = document.getElementById("password-confirm");

  // 비밀번호 강도 체크
  const strongPw = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/.test(pw);

  if (pw.length === 0) {
    pwHint.textContent = "영문·숫자·특수문자 포함 8자 이상";
    pwHint.className = "hint info";
    pwInput.classList.remove("valid", "invalid");
  } else if (strongPw) {
    pwHint.textContent = "✓ 안전한 비밀번호입니다.";
    pwHint.className = "hint ok";
    pwInput.classList.add("valid");
    pwInput.classList.remove("invalid");
  } else {
    pwHint.textContent = "영문·숫자·특수문자를 모두 포함해야 합니다.";
    pwHint.className = "hint fail";
    pwInput.classList.add("invalid");
    pwInput.classList.remove("valid");
  }

  // 비밀번호 일치 확인
  if (pw2.length === 0) {
    fill.style.width = "0%";
    matchHint.textContent = "";
    matchHint.className = "hint info";
    pw2Input.classList.remove("valid", "invalid");
    pwValid.match = false;
  } else if (pw === pw2) {
    fill.style.width = "100%";
    fill.style.background = "#22c55e";
    matchHint.textContent = "✓ 비밀번호가 일치합니다.";
    matchHint.className = "hint ok";
    pw2Input.classList.add("valid");
    pw2Input.classList.remove("invalid");
    pwValid.match = strongPw;
  } else {
    const ratio = Math.min(pw2.length / pw.length, 0.9) * 100;
    fill.style.width = ratio + "%";
    fill.style.background = "#f87171";
    matchHint.textContent = "✗ 비밀번호가 일치하지 않습니다.";
    matchHint.className = "hint fail";
    pw2Input.classList.add("invalid");
    pw2Input.classList.remove("valid");
    pwValid.match = false;
  }

  updateSubmitBtn();
}

function updateSubmitBtn() {
  const ready = checked.nickname && checked.username && pwValid.match;
  document.getElementById("submit-btn").disabled = !ready;
}

async function handleRegister() {
  const status = document.getElementById("reg-status");
  const body = {
    nickname: document.getElementById("nickname").value.trim(),
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value,
  };

  status.textContent = "처리 중...";
  status.className = "status";

  try {
    // TODO: API URL 확정되면 교체
    const API_URL = "http://YOUR_API_URL/api/auth/register";
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (res.ok) {
      status.textContent = "✓ 회원가입이 완료되었습니다!";
      status.className = "status success";
      setTimeout(goLogin, 1500);
    } else {
      status.textContent = data.message || "회원가입에 실패했습니다.";
      status.className = "status error";
    }
  } catch (e) {
    status.textContent = "[DEV] API 미연결 상태입니다.";
    status.className = "status error";
  }
}

function goLogin() {
  window.location.href = "Login.html";
}
