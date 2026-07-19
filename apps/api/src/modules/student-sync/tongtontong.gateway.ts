import type { BranchCode } from "./offline-snapshot.types.js";

export interface TongBranchDescriptor {
  readonly code: BranchCode;
  readonly sourceCode: string;
}

export interface TongSourceAssignment {
  readonly sourceUniqueNo: string;
  readonly classRegistrationNo: string;
  readonly studentNo: string;
  readonly name: string;
  readonly className: string;
  readonly motherPhone: string;
  /** undefined means the upstream column was not present in the confirmed wire contract. */
  readonly fatherPhone?: string;
  readonly schoolName: string;
  readonly grade: string;
  readonly teacherName: string;
  readonly unitName: string;
  readonly sourceStatus: string;
}

export interface TongBranchSnapshot {
  readonly branch: BranchCode;
  readonly assignments: readonly TongSourceAssignment[];
  readonly snapshotHash: Buffer;
}

export interface TongSession {
  readonly opaque: object;
}

export abstract class TongTongTongGateway {
  /** Performs configuration checks only. It MUST NOT make a network request. */
  public abstract assertReady(): void;
  /** Performs exactly one logical upstream login attempt. The caller never retries it. */
  public abstract login(): Promise<TongSession>;
  /** Switches and verifies branch context, then fetches every bounded page once. */
  public abstract fetchBranch(session: TongSession, branch: TongBranchDescriptor): Promise<TongBranchSnapshot>;
}
