import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { BookingProofRequiredGuard } from "../family-bookings/booking-proof-required.guard.js";
import { SurveysService } from "./surveys.service.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";

class SubmitSurveyDto {
  @IsInt() @Min(1) @Max(5) public rating!: number;
  @IsOptional() @IsString() @MaxLength(2000) public comment?: string;
}

@Controller("api/v1/public/family-bookings/:familyBookingId/survey-response")
export class PublicSurveysController {
  public constructor(private readonly service: SurveysService) {}

  @Post() @HttpCode(201) @UseGuards(BookingProofRequiredGuard, CsrfGuard) @SensitiveResponse()
  public submit(
    @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) familyBookingId: string,
    @Body() body: SubmitSurveyDto,
    @Headers("x-booking-proof") proof = "",
    @Headers("idempotency-key") key = "",
  ) { return this.service.submit(familyBookingId, body, proof, key); }
}
