import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      isAdmin: boolean;
      isActive: boolean;
      registrationApproved: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    isAdmin?: boolean;
    isActive?: boolean;
    registrationApproved?: boolean;
  }
}
