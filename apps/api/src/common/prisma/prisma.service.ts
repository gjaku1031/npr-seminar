import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { type AppEnvironment } from "../config/environment.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  public readonly configured: boolean;

  public constructor(@Inject("APP_ENVIRONMENT") environment: AppEnvironment) {
    const configuredUrl = environment.processRole === "worker"
      ? environment.workerDatabaseUrl
      : environment.databaseUrl;
    const connectionString = configuredUrl
      ?? "postgresql://unconfigured:unconfigured@127.0.0.1:9/unconfigured";
    super({ adapter: new PrismaPg({ connectionString }) });
    this.configured = configuredUrl !== undefined;
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
