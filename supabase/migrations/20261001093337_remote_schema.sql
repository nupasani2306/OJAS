SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE TABLE "public"."chat_messages" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "sender"     text                     NOT NULL,
  "message"    text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "valid_sender" CHECK ((sender = ANY (ARRAY['user'::text, 'assistant'::text])))
);

ALTER TABLE "public"."chat_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."daily_health_summary" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        uuid                     NOT NULL,
  "summary_date"   date                     NOT NULL,
  "steps"          integer                  DEFAULT 0,
  "calories"       numeric(10,2)            DEFAULT 0,
  "water_ml"       integer                  DEFAULT 0,
  "sleep_minutes"  integer                  DEFAULT 0,
  "avg_heart_rate" numeric(6,2),
  "avg_spo2"       numeric(6,2),
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "daily_health_summary_pkey" PRIMARY KEY (id),
  CONSTRAINT "daily_health_summary_user_id_summary_date_key" UNIQUE (user_id, summary_date)
);

ALTER TABLE "public"."daily_health_summary"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."devices" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "device_name"      text                     NOT NULL DEFAULT 'OJAS Band'::text,
  "device_uid"       text                     NOT NULL,
  "firmware_version" text,
  "battery_level"    integer,
  "is_connected"     boolean                  NOT NULL DEFAULT false,
  "last_seen_at"     timestamp with time zone,
  "paired_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "devices_device_uid_key" UNIQUE (device_uid),
  CONSTRAINT "devices_pkey" PRIMARY KEY (id),
  CONSTRAINT "valid_battery" CHECK (((battery_level IS NULL) OR ((battery_level >= 0) AND (battery_level <= 100))))
);

ALTER TABLE "public"."devices"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."documents" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"       uuid                     NOT NULL,
  "document_name" text                     NOT NULL,
  "document_type" text,
  "storage_path"  text                     NOT NULL,
  "file_url"      text,
  "uploaded_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "documents_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."documents"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."emergency_contacts" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           uuid                     NOT NULL,
  "name"              text                     NOT NULL,
  "phone"             text                     NOT NULL,
  "relationship"      text,
  "use_for_emergency" boolean                  NOT NULL DEFAULT true,
  "use_for_sos"       boolean                  NOT NULL DEFAULT true,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."emergency_contacts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."health_readings" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "device_id"   uuid,
  "metric"      text                     NOT NULL,
  "value"       numeric(10,2)            NOT NULL,
  "recorded_at" timestamp with time zone NOT NULL,
  "source"      text                     NOT NULL DEFAULT 'band'::text,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "health_readings_pkey" PRIMARY KEY (id),
  CONSTRAINT "valid_health_metric" CHECK ((metric = ANY (ARRAY['heart_rate'::text, 'spo2'::text, 'steps'::text, 'calories'::text, 'water'::text]))),
  CONSTRAINT "valid_health_source" CHECK ((source = ANY (ARRAY['band'::text, 'app'::text, 'manual'::text, 'backend'::text])))
);

ALTER TABLE "public"."health_readings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."medical_info" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"            uuid                     NOT NULL,
  "blood_group"        text,
  "allergies"          text,
  "medical_conditions" text,
  "medications"        text,
  "emergency_notes"    text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "medical_info_pkey" PRIMARY KEY (id),
  CONSTRAINT "medical_info_user_id_key" UNIQUE (user_id)
);

ALTER TABLE "public"."medical_info"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."medical_share_links" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "share_token" text                     NOT NULL,
  "is_active"   boolean                  NOT NULL DEFAULT true,
  "expires_at"  timestamp with time zone,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "medical_share_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "medical_share_links_share_token_key" UNIQUE (share_token)
);

ALTER TABLE "public"."medical_share_links"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sleep_sessions" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "device_id"        uuid,
  "start_time"       timestamp with time zone NOT NULL,
  "end_time"         timestamp with time zone NOT NULL,
  "duration_minutes" integer,
  "sleep_score"      numeric(5,2),
  "sleep_quality"    text,
  "source"           text                     NOT NULL DEFAULT 'app'::text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sleep_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "valid_sleep_duration" CHECK (((duration_minutes IS NULL) OR (duration_minutes >= 0))),
  CONSTRAINT "valid_sleep_quality" CHECK (((sleep_quality IS NULL) OR (sleep_quality = ANY (ARRAY['POOR'::text, 'FAIR'::text, 'GOOD'::text, 'EXCELLENT'::text])))),
  CONSTRAINT "valid_sleep_score" CHECK (((sleep_score IS NULL) OR ((sleep_score >= (0)::numeric) AND (sleep_score <= (100)::numeric)))),
  CONSTRAINT "valid_sleep_time" CHECK ((end_time > start_time))
);

ALTER TABLE "public"."sleep_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sos_events" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "device_id"    uuid,
  "event_type"   text                     NOT NULL,
  "triggered_at" timestamp with time zone NOT NULL DEFAULT now(),
  "latitude"     numeric(10,7),
  "longitude"    numeric(10,7),
  "status"       text                     NOT NULL DEFAULT 'PENDING'::text,
  "cancelled_at" timestamp with time zone,
  CONSTRAINT "sos_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "valid_event_type" CHECK ((event_type = ANY (ARRAY['SOS'::text, 'FALL'::text]))),
  CONSTRAINT "valid_sos_status" CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'CANCELLED'::text, 'RESOLVED'::text])))
);

ALTER TABLE "public"."sos_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sos_notifications" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "sos_event_id" uuid                     NOT NULL,
  "contact_id"   uuid                     NOT NULL,
  "channel"      text                     NOT NULL,
  "message"      text,
  "status"       text                     NOT NULL DEFAULT 'PENDING'::text,
  "sent_at"      timestamp with time zone,
  "delivered_at" timestamp with time zone,
  CONSTRAINT "sos_notifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "valid_notification_channel" CHECK ((channel = ANY (ARRAY['SMS'::text, 'WHATSAPP'::text, 'CALL'::text, 'EMAIL'::text]))),
  CONSTRAINT "valid_notification_status" CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'DELIVERED'::text, 'FAILED'::text])))
);

ALTER TABLE "public"."sos_notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_profiles" (
  "user_id"           uuid                     NOT NULL,
  "full_name"         text                     NOT NULL,
  "email"             text,
  "phone"             text,
  "date_of_birth"     date,
  "gender"            text,
  "height_cm"         numeric(5,2),
  "weight_kg"         numeric(5,2),
  "profile_photo_url" text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_profiles_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."user_profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_settings" (
  "user_id"               uuid                     NOT NULL,
  "step_length_cm"        numeric(6,2),
  "daily_step_goal"       integer                  NOT NULL DEFAULT 10000,
  "daily_water_goal_ml"   integer                  NOT NULL DEFAULT 2000,
  "daily_calorie_goal"    integer,
  "sleep_goal_minutes"    integer                  NOT NULL DEFAULT 480,
  "notifications_enabled" boolean                  NOT NULL DEFAULT true,
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "positive_sleep_goal" CHECK ((sleep_goal_minutes > 0)),
  CONSTRAINT "positive_step_goal" CHECK ((daily_step_goal > 0)),
  CONSTRAINT "positive_step_length" CHECK (((step_length_cm IS NULL) OR (step_length_cm > (0)::numeric))),
  CONSTRAINT "positive_water_goal" CHECK ((daily_water_goal_ml > 0)),
  CONSTRAINT "user_settings_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."user_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workout_exercises" (
  "id"            uuid    NOT NULL DEFAULT gen_random_uuid(),
  "workout_id"    uuid    NOT NULL,
  "exercise_name" text    NOT NULL,
  "exercise_type" text,
  "order_no"      integer NOT NULL DEFAULT 1,
  CONSTRAINT "workout_exercises_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."workout_exercises"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workout_sets" (
  "id"                  uuid         NOT NULL DEFAULT gen_random_uuid(),
  "workout_exercise_id" uuid         NOT NULL,
  "set_number"          integer      NOT NULL,
  "weight_kg"           numeric(8,2),
  "reps"                integer,
  "completed"           boolean      NOT NULL DEFAULT false,
  CONSTRAINT "workout_sets_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."workout_sets"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workouts" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "workout_type"     text                     NOT NULL,
  "workout_name"     text,
  "started_at"       timestamp with time zone,
  "ended_at"         timestamp with time zone,
  "duration_minutes" integer,
  "calories_burned"  numeric(10,2),
  "distance_km"      numeric(10,2),
  "status"           text                     NOT NULL DEFAULT 'COMPLETED'::text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "valid_workout_status" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'COMPLETED'::text, 'CANCELLED'::text]))),
  CONSTRAINT "valid_workout_type" CHECK ((workout_type = ANY (ARRAY['Strength'::text, 'HIIT'::text, 'Running'::text, 'Cycling'::text, 'Cardio'::text, 'Yoga'::text]))),
  CONSTRAINT "workouts_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."workouts"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
    insert into public.user_profiles (
        user_id,
        full_name,
        email
    )
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        new.email
    );

    return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM "anon", "authenticated", "service_role";

ALTER TABLE "public"."health_readings"
  ADD CONSTRAINT "health_readings_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE "public"."sleep_sessions"
  ADD CONSTRAINT "sleep_sessions_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE "public"."sos_events"
  ADD CONSTRAINT "sos_events_device_fk" FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE "public"."sos_notifications"
  ADD CONSTRAINT "sos_notifications_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.emergency_contacts(id) ON DELETE CASCADE;

ALTER TABLE "public"."sos_notifications"
  ADD CONSTRAINT "sos_notifications_sos_event_id_fkey" FOREIGN KEY (sos_event_id) REFERENCES public.sos_events(id) ON DELETE CASCADE;

ALTER TABLE "public"."chat_messages"
  ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."daily_health_summary"
  ADD CONSTRAINT "daily_health_summary_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."devices"
  ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."emergency_contacts"
  ADD CONSTRAINT "emergency_contacts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."health_readings"
  ADD CONSTRAINT "health_readings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."medical_info"
  ADD CONSTRAINT "medical_info_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."medical_share_links"
  ADD CONSTRAINT "medical_share_links_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."sleep_sessions"
  ADD CONSTRAINT "sleep_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."sos_events"
  ADD CONSTRAINT "sos_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."user_profiles"
  ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_settings"
  ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE "public"."workout_sets"
  ADD CONSTRAINT "workout_sets_workout_exercise_id_fkey" FOREIGN KEY (workout_exercise_id) REFERENCES public.workout_exercises(id) ON DELETE CASCADE;

ALTER TABLE "public"."workout_exercises"
  ADD CONSTRAINT "workout_exercises_workout_id_fkey" FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;

ALTER TABLE "public"."workouts"
  ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

CREATE INDEX idx_chat_messages_created ON public.chat_messages USING btree (created_at);

CREATE INDEX idx_chat_messages_user ON public.chat_messages USING btree (user_id);

CREATE INDEX idx_daily_summary_user_date ON public.daily_health_summary USING btree (user_id, summary_date);

CREATE INDEX idx_devices_user ON public.devices USING btree (user_id);

CREATE INDEX idx_documents_user ON public.documents USING btree (user_id);

CREATE INDEX idx_emergency_contacts_user ON public.emergency_contacts USING btree (user_id);

CREATE INDEX idx_health_readings_metric ON public.health_readings USING btree (metric);

CREATE INDEX idx_health_readings_recorded ON public.health_readings USING btree (recorded_at);

CREATE INDEX idx_health_readings_user_metric_time ON public.health_readings USING btree (user_id, metric, recorded_at);

CREATE INDEX idx_health_readings_user ON public.health_readings USING btree (user_id);

CREATE INDEX idx_medical_info_user ON public.medical_info USING btree (user_id);

CREATE INDEX idx_medical_share_token ON public.medical_share_links USING btree (share_token);

CREATE INDEX idx_sleep_sessions_time ON public.sleep_sessions USING btree (start_time, end_time);

CREATE INDEX idx_sleep_sessions_user ON public.sleep_sessions USING btree (user_id);

CREATE INDEX idx_sos_events_device ON public.sos_events USING btree (device_id);

CREATE INDEX idx_sos_events_triggered ON public.sos_events USING btree (triggered_at);

CREATE INDEX idx_sos_events_user ON public.sos_events USING btree (user_id);

CREATE INDEX idx_sos_notifications_event ON public.sos_notifications USING btree (sos_event_id);

CREATE INDEX idx_workout_exercises_workout ON public.workout_exercises USING btree (workout_id);

CREATE INDEX idx_workout_sets_exercise ON public.workout_sets USING btree (workout_exercise_id);

CREATE INDEX idx_workouts_started ON public.workouts USING btree (started_at);

CREATE INDEX idx_workouts_user ON public.workouts USING btree (user_id);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_medical_info_updated_at
  BEFORE UPDATE ON public.medical_info
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can insert own chat" ON "public"."chat_messages"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own chat" ON "public"."chat_messages"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own daily summary" ON "public"."daily_health_summary"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own daily summary" ON "public"."daily_health_summary"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own daily summary" ON "public"."daily_health_summary"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete own devices" ON "public"."devices"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own devices" ON "public"."devices"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own devices" ON "public"."devices"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own devices" ON "public"."devices"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete own documents" ON "public"."documents"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own documents" ON "public"."documents"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own documents" ON "public"."documents"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete own contacts" ON "public"."emergency_contacts"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own contacts" ON "public"."emergency_contacts"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own contacts" ON "public"."emergency_contacts"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own contacts" ON "public"."emergency_contacts"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own health readings" ON "public"."health_readings"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own health readings" ON "public"."health_readings"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete own medical info" ON "public"."medical_info"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own medical info" ON "public"."medical_info"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own medical info" ON "public"."medical_info"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own medical info" ON "public"."medical_info"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can create own share links" ON "public"."medical_share_links"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own share links" ON "public"."medical_share_links"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own share links" ON "public"."medical_share_links"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own share links" ON "public"."medical_share_links"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own sleep sessions" ON "public"."sleep_sessions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own sleep sessions" ON "public"."sleep_sessions"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own sleep sessions" ON "public"."sleep_sessions"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own SOS events" ON "public"."sos_events"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own SOS events" ON "public"."sos_events"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own SOS events" ON "public"."sos_events"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own SOS notifications" ON "public"."sos_notifications"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.sos_events se
  WHERE ((se.id = sos_notifications.sos_event_id) AND (se.user_id = auth.uid())))));

CREATE POLICY "Users can insert own profile" ON "public"."user_profiles"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own profile" ON "public"."user_profiles"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own profile" ON "public"."user_profiles"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own settings" ON "public"."user_settings"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own settings" ON "public"."user_settings"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own settings" ON "public"."user_settings"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own workout exercises" ON "public"."workout_exercises"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workouts w
  WHERE ((w.id = workout_exercises.workout_id) AND (w.user_id = auth.uid())))));

CREATE POLICY "Users can update own workout exercises" ON "public"."workout_exercises"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.workouts w
  WHERE ((w.id = workout_exercises.workout_id) AND (w.user_id = auth.uid())))));

CREATE POLICY "Users can view own workout exercises" ON "public"."workout_exercises"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.workouts w
  WHERE ((w.id = workout_exercises.workout_id) AND (w.user_id = auth.uid())))));

CREATE POLICY "Users can insert own workout sets" ON "public"."workout_sets"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workout_exercises we
     JOIN public.workouts w ON ((w.id = we.workout_id)))
  WHERE ((we.id = workout_sets.workout_exercise_id) AND (w.user_id = auth.uid())))));

CREATE POLICY "Users can view own workout sets" ON "public"."workout_sets"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM (public.workout_exercises we
     JOIN public.workouts w ON ((w.id = we.workout_id)))
  WHERE ((we.id = workout_sets.workout_exercise_id) AND (w.user_id = auth.uid())))));

CREATE POLICY "Users can delete own workouts" ON "public"."workouts"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own workouts" ON "public"."workouts"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own workouts" ON "public"."workouts"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own workouts" ON "public"."workouts"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own medical documents" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'medical-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can update their own medical documents" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'medical-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  WITH CHECK (((bucket_id = 'medical-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can upload their own medical documents" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'medical-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can view their own medical documents" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'medical-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "postgres";

REVOKE ALL ON TABLE "public"."chat_messages" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."chat_messages" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."chat_messages" TO "authenticated";

REVOKE ALL ON TABLE "public"."chat_messages" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."chat_messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."chat_messages" TO "service_role";

REVOKE ALL ON TABLE "public"."daily_health_summary" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."daily_health_summary" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."daily_health_summary" TO "authenticated";

REVOKE ALL ON TABLE "public"."daily_health_summary" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."daily_health_summary" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."daily_health_summary" TO "service_role";

REVOKE ALL ON TABLE "public"."devices" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."devices" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."devices" TO "authenticated";

REVOKE ALL ON TABLE "public"."devices" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."devices" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."devices" TO "service_role";

REVOKE ALL ON TABLE "public"."documents" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."documents" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."documents" TO "authenticated";

REVOKE ALL ON TABLE "public"."documents" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."documents" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."documents" TO "service_role";

REVOKE ALL ON TABLE "public"."emergency_contacts" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."emergency_contacts" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."emergency_contacts" TO "authenticated";

REVOKE ALL ON TABLE "public"."emergency_contacts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."emergency_contacts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."emergency_contacts" TO "service_role";

REVOKE ALL ON TABLE "public"."health_readings" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."health_readings" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_readings" TO "authenticated";

REVOKE ALL ON TABLE "public"."health_readings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_readings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_readings" TO "service_role";

REVOKE ALL ON TABLE "public"."medical_info" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."medical_info" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."medical_info" TO "authenticated";

REVOKE ALL ON TABLE "public"."medical_info" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."medical_info" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."medical_info" TO "service_role";

REVOKE ALL ON TABLE "public"."medical_share_links" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."medical_share_links" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."medical_share_links" TO "authenticated";

REVOKE ALL ON TABLE "public"."medical_share_links" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."medical_share_links" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."medical_share_links" TO "service_role";

REVOKE ALL ON TABLE "public"."sleep_sessions" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."sleep_sessions" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sleep_sessions" TO "authenticated";

REVOKE ALL ON TABLE "public"."sleep_sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sleep_sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sleep_sessions" TO "service_role";

REVOKE ALL ON TABLE "public"."sos_events" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."sos_events" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sos_events" TO "authenticated";

REVOKE ALL ON TABLE "public"."sos_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sos_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sos_events" TO "service_role";

REVOKE ALL ON TABLE "public"."sos_notifications" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."sos_notifications" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sos_notifications" TO "authenticated";

REVOKE ALL ON TABLE "public"."sos_notifications" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sos_notifications" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sos_notifications" TO "service_role";

REVOKE ALL ON TABLE "public"."user_profiles" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."user_profiles" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."user_profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_profiles" TO "service_role";

REVOKE ALL ON TABLE "public"."user_settings" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."user_settings" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "authenticated";

REVOKE ALL ON TABLE "public"."user_settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_settings" TO "service_role";

REVOKE ALL ON TABLE "public"."workout_exercises" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."workout_exercises" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_exercises" TO "authenticated";

REVOKE ALL ON TABLE "public"."workout_exercises" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_exercises" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_exercises" TO "service_role";

REVOKE ALL ON TABLE "public"."workout_sets" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."workout_sets" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_sets" TO "authenticated";

REVOKE ALL ON TABLE "public"."workout_sets" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_sets" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_sets" TO "service_role";

REVOKE ALL ON TABLE "public"."workouts" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."workouts" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workouts" TO "authenticated";

REVOKE ALL ON TABLE "public"."workouts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workouts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workouts" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

