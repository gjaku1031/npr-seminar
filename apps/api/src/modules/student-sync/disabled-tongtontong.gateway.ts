import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { TongTongTongGateway, type TongBranchDescriptor, type TongBranchSnapshot, type TongSession } from "./tongtontong.gateway.js";

/**
 * 통통통 연동 비활성 시 쓰는 게이트웨이. 모든 호출을 503으로 거부
 */
@Injectable()
export class DisabledTongTongTongGateway extends TongTongTongGateway {
  /**
   * 연동 비활성 오류 발생
   *
   * @throws {DomainError} 503 TONG_SYNC_DISABLED
   */
  public assertReady(): never {
    throw new DomainError(503, "TONG_SYNC_DISABLED", "The live source adapter is disabled.");
  }

  /**
   * 로그인 거부
   */
  public async login(): Promise<never> { return this.assertReady(); }

  /**
   * 지점 조회 거부
   */
  public async fetchBranch(_session: TongSession, _branch: TongBranchDescriptor): Promise<TongBranchSnapshot> {
    return this.assertReady();
  }
}
