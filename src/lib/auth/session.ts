import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);

  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user?.id) {
    throw new Error("Authentication required");
  }

  return user;
}
