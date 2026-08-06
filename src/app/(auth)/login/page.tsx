import { AuthForm } from "@/components/auth/auth-form";
import { financialDataService } from "@/services";

export default async function LoginPage(){
  const brand = await financialDataService.getBrand();
  return <AuthForm mode="login" brand={brand}/>;
}
