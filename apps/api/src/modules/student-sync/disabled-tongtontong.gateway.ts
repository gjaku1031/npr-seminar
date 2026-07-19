import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { TongTongTongGateway, type TongBranchDescriptor, type TongBranchSnapshot, type TongSession } from "./tongtontong.gateway.js";

@Injectable()
export class DisabledTongTongTongGateway extends TongTongTongGateway {
  public assertReady(): never {
    throw new DomainError(503, "TONG_SYNC_DISABLED", "The live source adapter is disabled.");
  }

  public async login(): Promise<never> { return this.assertReady(); }
  public async fetchBranch(_session: TongSession, _branch: TongBranchDescriptor): Promise<TongBranchSnapshot> {
    return this.assertReady();
  }
}
