CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"teacher_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"school" text DEFAULT '' NOT NULL,
	"grade" text DEFAULT '' NOT NULL,
	"class_id" uuid,
	"parent_phone" text NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"converted_from" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"teacher_id" uuid,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"time" text DEFAULT '10:00' NOT NULL,
	"place" text NOT NULL,
	"capacity" integer NOT NULL,
	"desc" text DEFAULT '' NOT NULL,
	"attend_field" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"ended" boolean DEFAULT false NOT NULL,
	"reminders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"banner" text DEFAULT 'navy' NOT NULL,
	"notice" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid,
	"name" text NOT NULL,
	"school" text DEFAULT '' NOT NULL,
	"grade" text DEFAULT '' NOT NULL,
	"phone" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"attend_count" integer DEFAULT 1 NOT NULL,
	"member" boolean DEFAULT true NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audit" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_id" uuid,
	"cancelled_by" text
);
--> statement-breakpoint
CREATE TABLE "counsel_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"date" date NOT NULL,
	"time" text NOT NULL,
	"name" text NOT NULL,
	"grade" text DEFAULT '' NOT NULL,
	"phone" text NOT NULL,
	"from_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counsel_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"date" date NOT NULL,
	"time" text NOT NULL,
	"booked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"on" boolean DEFAULT false NOT NULL,
	"battery" integer DEFAULT 100 NOT NULL,
	"last" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"when" timestamp with time zone DEFAULT now() NOT NULL,
	"to" integer DEFAULT 0 NOT NULL,
	"template" text NOT NULL,
	"session" text DEFAULT '' NOT NULL,
	"ok" integer DEFAULT 0 NOT NULL,
	"fail" integer DEFAULT 0 NOT NULL,
	"auto" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"body" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"helpful" text DEFAULT '' NOT NULL,
	"again" text DEFAULT '' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_bookings" ADD CONSTRAINT "counsel_bookings_slot_id_counsel_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."counsel_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_bookings" ADD CONSTRAINT "counsel_bookings_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_bookings" ADD CONSTRAINT "counsel_bookings_from_session_id_sessions_id_fk" FOREIGN KEY ("from_session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counsel_slots" ADD CONSTRAINT "counsel_slots_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_code_uniq" ON "reservations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "reservations_session_idx" ON "reservations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "reservations_phone_idx" ON "reservations" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "reservations_group_idx" ON "reservations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "counsel_slots_teacher_idx" ON "counsel_slots" USING btree ("teacher_id","date");--> statement-breakpoint
CREATE INDEX "sms_logs_when_idx" ON "sms_logs" USING btree ("when");--> statement-breakpoint
CREATE INDEX "survey_responses_session_idx" ON "survey_responses" USING btree ("session_id");