import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/auth/auth-provider";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
