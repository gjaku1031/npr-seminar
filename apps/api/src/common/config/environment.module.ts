import { Global, Module } from "@nestjs/common";
import { environmentProvider } from "./environment.js";

@Global()
@Module({
  providers: [environmentProvider],
  exports: [environmentProvider],
})
export class EnvironmentModule {}
