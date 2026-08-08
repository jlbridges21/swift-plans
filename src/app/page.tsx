import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getUser();
  redirect(user ? "/dashboard" : "/sign-in");
}
