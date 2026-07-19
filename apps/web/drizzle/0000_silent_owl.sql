CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"teacher_id" uuid NOT NULL,
	"teacher_name" text DEFAULT '' NOT NULL,
	"campus" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" text NOT NULL,
	"name" text NOT NULL,
	"school" text DEFAULT '' NOT NULL,
	"grade" text DEFAULT '' NOT NULL,
	"class_id" uuid NOT NULL,
	"class_name" text NOT NULL,
	"teacher_name" text DEFAULT '' NOT NULL,
	"campus" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"mother_phone" text NOT NULL,
	"father_phone" text NOT NULL,
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
	"role" text DEFAULT 'admin' NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"campus" text DEFAULT '전체' NOT NULL,
	"date" date NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"time" text DEFAULT '10:00' NOT NULL,
	"place" text NOT NULL,
	"capacity" integer NOT NULL,
	"desc" text DEFAULT '' NOT NULL,
	"attend_field" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"ended" boolean DEFAULT false NOT NULL,
	"banner" text DEFAULT 'violet' NOT NULL,
	"notice" text DEFAULT '' NOT NULL,
	"survey_sms" text DEFAULT '' NOT NULL,
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
	"class_name" text DEFAULT '비재원생' NOT NULL,
	"teacher_name" text DEFAULT '' NOT NULL,
	"campus" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"phone" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reserved_by" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '수동' NOT NULL,
	"attend_count" integer DEFAULT 1 NOT NULL,
	"member" boolean DEFAULT true NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scanner_no" integer,
	"entered_at" timestamp with time zone,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audit" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_id" uuid,
	"cancelled_by" text
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"scanner_no" integer NOT NULL,
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
	"campus" text NOT NULL,
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
	"campus" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"student" text NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"teacher_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"photo" boolean DEFAULT false NOT NULL,
	"photo_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "students_mother_phone_idx" ON "students" USING btree ("mother_phone");--> statement-breakpoint
CREATE INDEX "students_father_phone_idx" ON "students" USING btree ("father_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_code_uniq" ON "reservations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "reservations_session_idx" ON "reservations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "reservations_phone_idx" ON "reservations" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "reservations_student_session_idx" ON "reservations" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "reservations_group_idx" ON "reservations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "sms_logs_when_idx" ON "sms_logs" USING btree ("when");--> statement-breakpoint
CREATE INDEX "survey_responses_session_idx" ON "survey_responses" USING btree ("session_id");