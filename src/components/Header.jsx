import { useAuth } from "../auth/useAuth";
export default function Header() {
  const { isLogin } = useAuth();
  return (
    <header>
      <h1>Mini SNS</h1>
      <p>{isLogin ? "로그인 상태" : "비로그인 상태"}</p>
    </header>
  );
}
