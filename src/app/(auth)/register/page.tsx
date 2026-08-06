import { AuthForm } from "@/components/auth/auth-form";
import { financialDataService } from "@/services";

export default async function RegisterPage(){
  const brand = await financialDataService.getBrand();
  return <AuthForm mode="register" brand={brand}/>;
}
