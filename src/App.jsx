import { useAuth } from "./auth/useAuth";
import LoginPage from "./pages/LoginPage";
import FeedPage from "./pages/FeedPage";
export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        로그인 상태 확인 중...
      </div>
    );
  }
  return user ? <FeedPage /> : <LoginPage />;
}