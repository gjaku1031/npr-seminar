import "express-session";

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
    absoluteExpiresAt?: number;
    bookingManagementSessionId?: string;
    bookingManagementExpiresAt?: number;
    actor?: {
      subject: string;
      role: "ADMIN" | "SCANNER";
      scannerDeviceId?: string;
      selectedSessionId?: string;
    };
  }
}
