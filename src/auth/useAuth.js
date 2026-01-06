import { useContext } from "react";
import { AuthContext } from "./AuthContext";
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth는 반드시 <AuthProvider> 안에서 사용해야 합니다.");
  }
  return ctx;
}
