export interface AuthenticatedActor {
  readonly subject: string;
  readonly role: "ADMIN" | "SCANNER";
  readonly scannerDeviceId?: string;
  readonly selectedSessionId?: string;
}
