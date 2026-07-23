--
-- PostgreSQL database dump
--

\restrict 547eAfF6v2PDVzxnamP1nEU26dRlUzJ7ZwYXScFJovjelaEhYqhKttnMioh8jHp

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;

$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analysis_golongan_totals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analysis_golongan_totals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_upload_id uuid NOT NULL,
    analysis_job_id uuid NOT NULL,
    golongan_code character varying(50) NOT NULL,
    golongan_label character varying(100) NOT NULL,
    vehicle_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analysis_golongan_totals_vehicle_count_check CHECK ((vehicle_count >= 0))
);


ALTER TABLE public.analysis_golongan_totals OWNER TO postgres;

--
-- Name: analysis_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analysis_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_upload_id uuid NOT NULL,
    status character varying(50) NOT NULL,
    model_name character varying(255),
    config_json jsonb,
    summary_json jsonb,
    annotated_relative_path text,
    report_relative_path text,
    total_frames bigint,
    processed_frames bigint,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analysis_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'queued'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE public.analysis_jobs OWNER TO postgres;

--
-- Name: count_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.count_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    line_order integer DEFAULT 1 NOT NULL,
    start_x double precision NOT NULL,
    start_y double precision NOT NULL,
    end_x double precision NOT NULL,
    end_y double precision NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT count_lines_end_x_check CHECK (((end_x >= (0)::double precision) AND (end_x <= (1)::double precision))),
    CONSTRAINT count_lines_end_y_check CHECK (((end_y >= (0)::double precision) AND (end_y <= (1)::double precision))),
    CONSTRAINT count_lines_start_x_check CHECK (((start_x >= (0)::double precision) AND (start_x <= (1)::double precision))),
    CONSTRAINT count_lines_start_y_check CHECK (((start_y >= (0)::double precision) AND (start_y <= (1)::double precision)))
);


ALTER TABLE public.count_lines OWNER TO postgres;

--
-- Name: csv_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.csv_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_upload_id uuid NOT NULL,
    analysis_job_id uuid NOT NULL,
    site_id uuid NOT NULL,
    csv_relative_path text,
    segment_count integer DEFAULT 0 NOT NULL,
    segments_completed integer DEFAULT 0 NOT NULL,
    segment_duration_seconds integer DEFAULT 60 NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    error_message text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.csv_reports OWNER TO postgres;

--
-- Name: detection_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detection_settings (
    id integer NOT NULL,
    global_confidence double precision DEFAULT 0.12 NOT NULL,
    motorcycle_min_confidence double precision DEFAULT 0.12 NOT NULL,
    car_min_confidence double precision DEFAULT 0.30 NOT NULL,
    bus_min_confidence double precision DEFAULT 0.34 NOT NULL,
    truck_min_confidence double precision DEFAULT 0.38 NOT NULL,
    vehicle_min_confidence double precision DEFAULT 0.30 NOT NULL,
    iou_threshold double precision DEFAULT 0.45 NOT NULL,
    frame_stride integer DEFAULT 1 NOT NULL,
    target_analysis_fps double precision DEFAULT 15.0 NOT NULL,
    preview_fps double precision DEFAULT 6.0 NOT NULL,
    working_max_width integer DEFAULT 1600 NOT NULL,
    preview_max_width integer DEFAULT 960 NOT NULL,
    preview_jpeg_quality integer DEFAULT 70 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    model_path character varying(255) DEFAULT 'yolov8s.pt'::character varying,
    csv_flush_mode character varying(20) DEFAULT 'concurrent'::character varying NOT NULL
);


ALTER TABLE public.detection_settings OWNER TO postgres;

--
-- Name: fd_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fd_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_upload_id uuid NOT NULL,
    line_spacing_m double precision NOT NULL,
    direction character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    interval_s integer DEFAULT 60 NOT NULL,
    greenshields_vf double precision,
    greenshields_kj double precision,
    greenshields_q_cap double precision,
    matched_pairs_count integer,
    intervals_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.fd_results OWNER TO postgres;

--
-- Name: master_classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.master_classes (
    code character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    description text,
    sort_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT master_classes_sort_order_check CHECK ((sort_order >= 1))
);


ALTER TABLE public.master_classes OWNER TO postgres;

--
-- Name: sites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    location_description text,
    latitude double precision,
    longitude double precision,
    direction_normal_label character varying(255) DEFAULT 'Normal'::character varying NOT NULL,
    direction_opposite_label character varying(255) DEFAULT 'Opposite'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sites OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(100) NOT NULL,
    full_name character varying(255) NOT NULL,
    password_hash text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: vehicle_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicle_events (
    id bigint NOT NULL,
    video_upload_id uuid NOT NULL,
    analysis_job_id uuid NOT NULL,
    site_id uuid NOT NULL,
    sequence_no integer NOT NULL,
    track_id bigint,
    vehicle_class character varying(50) NOT NULL,
    detected_label character varying(100),
    vehicle_type_code character varying(100),
    vehicle_type_label character varying(255),
    golongan_code character varying(50) NOT NULL,
    golongan_label character varying(100) NOT NULL,
    source_label character varying(100),
    count_line_order integer,
    count_line_name character varying(255),
    direction character varying(50) NOT NULL,
    crossed_at_seconds double precision NOT NULL,
    crossed_at_frame integer NOT NULL,
    confidence double precision,
    speed_kph double precision,
    bbox_x1 double precision,
    bbox_y1 double precision,
    bbox_x2 double precision,
    bbox_y2 double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicle_events_direction_check CHECK (((direction)::text = ANY ((ARRAY['normal'::character varying, 'opposite'::character varying])::text[]))),
    CONSTRAINT vehicle_events_vehicle_class_check CHECK (((vehicle_class)::text = ANY ((ARRAY['bicycle'::character varying, 'motorcycle'::character varying, 'car'::character varying, 'bus'::character varying, 'truck'::character varying])::text[])))
);


ALTER TABLE public.vehicle_events OWNER TO postgres;

--
-- Name: vehicle_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vehicle_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vehicle_events_id_seq OWNER TO postgres;

--
-- Name: vehicle_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vehicle_events_id_seq OWNED BY public.vehicle_events.id;


--
-- Name: video_count_aggregates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.video_count_aggregates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_upload_id uuid NOT NULL,
    analysis_job_id uuid NOT NULL,
    site_id uuid NOT NULL,
    bucket_type character varying(50) NOT NULL,
    bucket_index integer NOT NULL,
    bucket_start_seconds double precision NOT NULL,
    bucket_end_seconds double precision NOT NULL,
    bucket_started_at timestamp with time zone,
    bucket_ended_at timestamp with time zone,
    direction character varying(50) NOT NULL,
    vehicle_class character varying(50) NOT NULL,
    vehicle_count integer NOT NULL,
    avg_speed_kph double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_count_aggregates_bucket_type_check CHECK (((bucket_type)::text = ANY ((ARRAY['minute'::character varying, 'five_minute'::character varying, 'hour'::character varying, 'day'::character varying, 'total'::character varying])::text[]))),
    CONSTRAINT video_count_aggregates_direction_check CHECK (((direction)::text = ANY ((ARRAY['normal'::character varying, 'opposite'::character varying])::text[]))),
    CONSTRAINT video_count_aggregates_vehicle_class_check CHECK (((vehicle_class)::text = ANY ((ARRAY['bicycle'::character varying, 'motorcycle'::character varying, 'car'::character varying, 'bus'::character varying, 'truck'::character varying])::text[]))),
    CONSTRAINT video_count_aggregates_vehicle_count_check CHECK ((vehicle_count >= 0))
);


ALTER TABLE public.video_count_aggregates OWNER TO postgres;

--
-- Name: video_count_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.video_count_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_upload_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    line_order integer NOT NULL,
    start_x double precision NOT NULL,
    start_y double precision NOT NULL,
    end_x double precision NOT NULL,
    end_y double precision NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_count_lines_end_x_check CHECK (((end_x >= (0)::double precision) AND (end_x <= (1)::double precision))),
    CONSTRAINT video_count_lines_end_y_check CHECK (((end_y >= (0)::double precision) AND (end_y <= (1)::double precision))),
    CONSTRAINT video_count_lines_line_order_check CHECK (((line_order >= 1) AND (line_order <= 2))),
    CONSTRAINT video_count_lines_start_x_check CHECK (((start_x >= (0)::double precision) AND (start_x <= (1)::double precision))),
    CONSTRAINT video_count_lines_start_y_check CHECK (((start_y >= (0)::double precision) AND (start_y <= (1)::double precision)))
);


ALTER TABLE public.video_count_lines OWNER TO postgres;

--
-- Name: video_uploads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.video_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    site_id uuid NOT NULL,
    original_filename text NOT NULL,
    stored_filename text NOT NULL,
    relative_path text NOT NULL,
    description text,
    mime_type character varying(255),
    file_size_bytes bigint,
    recorded_at timestamp with time zone,
    uploaded_by character varying(255),
    status character varying(50) NOT NULL,
    video_fps double precision,
    frame_width integer,
    frame_height integer,
    frame_count bigint,
    duration_seconds double precision,
    processing_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_uploads_status_check CHECK (((status)::text = ANY ((ARRAY['uploaded'::character varying, 'converting'::character varying, 'processing'::character varying, 'processed'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE public.video_uploads OWNER TO postgres;

--
-- Name: vehicle_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_events ALTER COLUMN id SET DEFAULT nextval('public.vehicle_events_id_seq'::regclass);


--
-- Name: analysis_golongan_totals analysis_golongan_totals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analysis_golongan_totals
    ADD CONSTRAINT analysis_golongan_totals_pkey PRIMARY KEY (id);


--
-- Name: analysis_jobs analysis_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analysis_jobs
    ADD CONSTRAINT analysis_jobs_pkey PRIMARY KEY (id);


--
-- Name: analysis_jobs analysis_jobs_video_upload_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analysis_jobs
    ADD CONSTRAINT analysis_jobs_video_upload_id_key UNIQUE (video_upload_id);


--
-- Name: count_lines count_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.count_lines
    ADD CONSTRAINT count_lines_pkey PRIMARY KEY (id);


--
-- Name: csv_reports csv_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.csv_reports
    ADD CONSTRAINT csv_reports_pkey PRIMARY KEY (id);


--
-- Name: detection_settings detection_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detection_settings
    ADD CONSTRAINT detection_settings_pkey PRIMARY KEY (id);


--
-- Name: fd_results fd_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fd_results
    ADD CONSTRAINT fd_results_pkey PRIMARY KEY (id);


--
-- Name: master_classes master_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_classes
    ADD CONSTRAINT master_classes_pkey PRIMARY KEY (code);


--
-- Name: master_classes master_classes_sort_order_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_classes
    ADD CONSTRAINT master_classes_sort_order_key UNIQUE (sort_order);


--
-- Name: sites sites_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_code_key UNIQUE (code);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: analysis_golongan_totals uq_analysis_golongan_total_job; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analysis_golongan_totals
    ADD CONSTRAINT uq_analysis_golongan_total_job UNIQUE (analysis_job_id, golongan_code);


--
-- Name: video_count_aggregates uq_video_count_aggregate_bucket; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_count_aggregates
    ADD CONSTRAINT uq_video_count_aggregate_bucket UNIQUE (video_upload_id, bucket_type, bucket_index, direction, vehicle_class);


--
-- Name: video_count_lines uq_video_count_line_order; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_count_lines
    ADD CONSTRAINT uq_video_count_line_order UNIQUE (video_upload_id, line_order);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: vehicle_events vehicle_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_events
    ADD CONSTRAINT vehicle_events_pkey PRIMARY KEY (id);


--
-- Name: video_count_aggregates video_count_aggregates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_count_aggregates
    ADD CONSTRAINT video_count_aggregates_pkey PRIMARY KEY (id);


--
-- Name: video_count_lines video_count_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_count_lines
    ADD CONSTRAINT video_count_lines_pkey PRIMARY KEY (id);


--
-- Name: video_uploads video_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_uploads
    ADD CONSTRAINT video_uploads_pkey PRIMARY KEY (id);


--
-- Name: video_uploads video_uploads_stored_filename_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_uploads
    ADD CONSTRAINT video_uploads_stored_filename_key UNIQUE (stored_filename);


--
-- Name: idx_analysis_golongan_totals_video_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_analysis_golongan_totals_video_code ON public.analysis_golongan_totals USING btree (video_upload_id, golongan_code);


--
-- Name: idx_count_lines_site_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_count_lines_site_active ON public.count_lines USING btree (site_id, is_active, line_order);


--
-- Name: idx_csv_reports_site; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_csv_reports_site ON public.csv_reports USING btree (site_id);


--
-- Name: idx_csv_reports_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_csv_reports_status ON public.csv_reports USING btree (status);


--
-- Name: idx_csv_reports_video; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_csv_reports_video ON public.csv_reports USING btree (video_upload_id);


--
-- Name: idx_fd_results_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fd_results_created_at ON public.fd_results USING btree (created_at DESC);


--
-- Name: idx_fd_results_video_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fd_results_video_id ON public.fd_results USING btree (video_upload_id);


--
-- Name: idx_master_classes_sort_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_master_classes_sort_order ON public.master_classes USING btree (sort_order);


--
-- Name: idx_vehicle_events_video_line; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicle_events_video_line ON public.vehicle_events USING btree (video_upload_id, count_line_order, sequence_no);


--
-- Name: idx_vehicle_events_video_sequence; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicle_events_video_sequence ON public.vehicle_events USING btree (video_upload_id, sequence_no);


--
-- Name: idx_vehicle_events_video_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicle_events_video_time ON public.vehicle_events USING btree (video_upload_id, crossed_at_seconds);


--
-- Name: idx_vehicle_events_video_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicle_events_video_type ON public.vehicle_events USING btree (video_upload_id, vehicle_type_code);


--
-- Name: idx_video_count_aggregates_video_bucket; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_video_count_aggregates_video_bucket ON public.video_count_aggregates USING btree (video_upload_id, bucket_type, bucket_index);


--
-- Name: idx_video_count_lines_video_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_video_count_lines_video_active ON public.video_count_lines USING btree (video_upload_id, is_active, line_order);


--
-- Name: idx_video_uploads_site_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_video_uploads_site_status ON public.video_uploads USING btree (site_id, status, created_at DESC);


--
-- Name: uq_count_lines_one_active_per_site; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_count_lines_one_active_per_site ON public.count_lines USING btree (site_id) WHERE is_active;


--
-- Name: analysis_golongan_totals trg_analysis_golongan_totals_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_analysis_golongan_totals_updated_at BEFORE UPDATE ON public.analysis_golongan_totals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analysis_jobs trg_analysis_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_analysis_jobs_updated_at BEFORE UPDATE ON public.analysis_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: count_lines trg_count_lines_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_count_lines_updated_at BEFORE UPDATE ON public.count_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: master_classes trg_master_classes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_master_classes_updated_at BEFORE UPDATE ON public.master_classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sites trg_sites_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: video_count_lines trg_video_count_lines_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_video_count_lines_updated_at BEFORE UPDATE ON public.video_count_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: video_uploads trg_video_uploads_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_video_uploads_updated_at BEFORE UPDATE ON public.video_uploads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: analysis_golongan_totals analysis_golongan_totals_analysis_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analysis_golongan_totals
    ADD CONSTRAINT analysis_golongan_totals_analysis_job_id_fkey FOREIGN KEY (analysis_job_id) REFERENCES public.analysis_jobs(id) ON DELETE CASCADE;


--
-- Name: analysis_golongan_totals analysis_golongan_totals_golongan_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analysis_golongan_totals
    ADD CONSTRAINT analysis_golongan_totals_golongan_code_fkey FOREIGN KEY (golongan_code) REFERENCES public.master_classes(code) ON DELETE RESTRICT;


--
-- Name: analysis_golongan_totals analysis_golongan_totals_video_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analysis_golongan_totals
    ADD CONSTRAINT analysis_golongan_totals_video_upload_id_fkey FOREIGN KEY (video_upload_id) REFERENCES public.video_uploads(id) ON DELETE CASCADE;


--
-- Name: analysis_jobs analysis_jobs_video_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analysis_jobs
    ADD CONSTRAINT analysis_jobs_video_upload_id_fkey FOREIGN KEY (video_upload_id) REFERENCES public.video_uploads(id) ON DELETE CASCADE;


--
-- Name: count_lines count_lines_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.count_lines
    ADD CONSTRAINT count_lines_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE;


--
-- Name: csv_reports csv_reports_analysis_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.csv_reports
    ADD CONSTRAINT csv_reports_analysis_job_id_fkey FOREIGN KEY (analysis_job_id) REFERENCES public.analysis_jobs(id) ON DELETE CASCADE;


--
-- Name: csv_reports csv_reports_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.csv_reports
    ADD CONSTRAINT csv_reports_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE RESTRICT;


--
-- Name: csv_reports csv_reports_video_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.csv_reports
    ADD CONSTRAINT csv_reports_video_upload_id_fkey FOREIGN KEY (video_upload_id) REFERENCES public.video_uploads(id) ON DELETE CASCADE;


--
-- Name: fd_results fd_results_video_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fd_results
    ADD CONSTRAINT fd_results_video_upload_id_fkey FOREIGN KEY (video_upload_id) REFERENCES public.video_uploads(id) ON DELETE CASCADE;


--
-- Name: vehicle_events vehicle_events_analysis_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_events
    ADD CONSTRAINT vehicle_events_analysis_job_id_fkey FOREIGN KEY (analysis_job_id) REFERENCES public.analysis_jobs(id) ON DELETE CASCADE;


--
-- Name: vehicle_events vehicle_events_golongan_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_events
    ADD CONSTRAINT vehicle_events_golongan_code_fkey FOREIGN KEY (golongan_code) REFERENCES public.master_classes(code) ON DELETE RESTRICT;


--
-- Name: vehicle_events vehicle_events_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_events
    ADD CONSTRAINT vehicle_events_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE RESTRICT;


--
-- Name: vehicle_events vehicle_events_video_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_events
    ADD CONSTRAINT vehicle_events_video_upload_id_fkey FOREIGN KEY (video_upload_id) REFERENCES public.video_uploads(id) ON DELETE CASCADE;


--
-- Name: video_count_aggregates video_count_aggregates_analysis_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_count_aggregates
    ADD CONSTRAINT video_count_aggregates_analysis_job_id_fkey FOREIGN KEY (analysis_job_id) REFERENCES public.analysis_jobs(id) ON DELETE CASCADE;


--
-- Name: video_count_aggregates video_count_aggregates_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_count_aggregates
    ADD CONSTRAINT video_count_aggregates_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE RESTRICT;


--
-- Name: video_count_aggregates video_count_aggregates_video_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_count_aggregates
    ADD CONSTRAINT video_count_aggregates_video_upload_id_fkey FOREIGN KEY (video_upload_id) REFERENCES public.video_uploads(id) ON DELETE CASCADE;


--
-- Name: video_count_lines video_count_lines_video_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_count_lines
    ADD CONSTRAINT video_count_lines_video_upload_id_fkey FOREIGN KEY (video_upload_id) REFERENCES public.video_uploads(id) ON DELETE CASCADE;


--
-- Name: video_uploads video_uploads_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_uploads
    ADD CONSTRAINT video_uploads_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict 547eAfF6v2PDVzxnamP1nEU26dRlUzJ7ZwYXScFJovjelaEhYqhKttnMioh8jHp

