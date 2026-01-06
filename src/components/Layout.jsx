import Header from "./Header";
import HomePage from "../pages/HomePage";
import FeedPage from "../pages/FeedPage";
import LoginPage from "../pages/LoginPage";
import { useAuth } from "../auth/useAuth";

export default function Layout() {
  const { isLogin } = useAuth();

  return (
    <div>
      <Header />
      {isLogin ? <FeedPage /> : <HomePage />}
      {!isLogin && <LoginPage />}
    </div>
  );
}
