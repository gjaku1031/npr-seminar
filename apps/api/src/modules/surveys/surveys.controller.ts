import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { SameOriginGuard } from "../../common/auth/same-origin.guard.js";
import { SurveysService } from "./surveys.service.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";

class SubmitSurveyDto {
  @IsInt() @Min(1) @Max(5) public rating!: number;
  @IsOptional() @IsString() @MaxLength(2000) public comment?: string;
  @IsBoolean() public photoAttached!: boolean;
  @IsOptional() @IsString() @MaxLength(255) public photoName?: string;
}

@Controller("api/v1/public/family-bookings/:familyBookingId/survey-response")
export class PublicSurveysController {
  public constructor(private readonly service: SurveysService) {}

  @Post() @HttpCode(201) @UseGuards(SameOriginGuard) @SensitiveResponse()
  public submit(
    @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) familyBookingId: string,
    @Body() body: SubmitSurveyDto,
    @Headers("x-booking-proof") proof = "",
    @Headers("idempotency-key") key = "",
  ) { return this.service.submit(familyBookingId, body, proof, key); }
}
