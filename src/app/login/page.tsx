import { configured } from "@/lib/supabase";
import { LoginForm } from "@/components/login";
export default function Login() {
  return <LoginForm ready={configured()} />;
}
