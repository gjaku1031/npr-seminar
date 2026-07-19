ALTER TABLE "reservations" ADD COLUMN "qr_token" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_qr_token_uniq" ON "reservations" USING btree ("qr_token");