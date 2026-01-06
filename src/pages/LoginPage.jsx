import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase/firebase";
export default function LoginPage() {
  // 1) state 4개
  const [email, setEmail] = useState(""); // input과 연결될 값
  const [password, setPassword] = useState(""); // input과 연결될 값
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [error, setError] = useState(""); // 에러 메시지
  // 2) mode 토글 함수
  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setError(""); // (선택) 모드 바꾸면 에러는 지우는 게 UX 좋음
  };
  // 3) 폼 제출 함수
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "signup") {
        // 3-1) 회원가입
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        // 3-2) 로그인
        await signInWithEmailAndPassword(auth, email, password);
      }

      // 성공 시: 여기서 navigate() 같은 이동 코드 쓰지 말 것!
      // AuthProvider의 onAuthStateChanged가 user를 갱신하면 App.jsx가 자동 분기함.
    } catch (err) {
      // 3-3) 에러 처리
      if (err?.code === "auth/invalid-credential") {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else if (err?.code === "auth/email-already-in-use") {
        setError("이미 사용 중인 이메일입니다.");
      } else if (err?.code === "auth/weak-password") {
        setError("비밀번호가 너무 약합니다. (예: 6자 이상)");
      } else if (err?.code === "auth/invalid-email") {
        setError("이메일 형식이 올바르지 않습니다.");
      } else {
        setError("로그인 중 오류가 발생했습니다.");
      }
      // console.log(err); // 디버깅용(원하면 켜기)
    }
  };
  const titleText = mode === "login" ? "로그인" : "회원가입";
  const submitText = mode === "login" ? "로그인" : "회원가입";
  const switchQuestion =
    mode === "login" ? "아직 계정이 없나요?" : "이미 계정이 있나요?";
  const switchButtonText = mode === "login" ? "회원가입" : "로그인";

  return (
    <div className='min-h-screen flex items-center justify-center'>
      <div className='w-full max-w-md p-6 rounded-xl shadow'>
        <h1 className='text-2xl font-bold text-center'>Mini SNS</h1>

        <p className='text-sm text-center mt-2 mb-6'>
          {titleText} 후 피드로 이동합니다
        </p>

        <form className='space-y-3' onSubmit={handleSubmit}>
          <input
            type='email'
            placeholder='이메일'
            className='w-full px-3 py-2 border rounded'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type='password'
            placeholder='비밀번호'
            className='w-full px-3 py-2 border rounded'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {/* error가 있을 때만 출력 */}
          {error && <p className='text-sm text-red-500'>{error}</p>}

          <button type='submit' className='w-full py-2 rounded border bg-blue-600 text-white hover:bg-blue-800 hover:cursor-pointer'>
            {submitText}
          </button>
        </form>

        <div className='mt-4 text-center text-sm'>
          {switchQuestion}
          <button type='button' className='ml-2 underline hover:cursor-pointer' onClick={toggleMode}>
            {switchButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
