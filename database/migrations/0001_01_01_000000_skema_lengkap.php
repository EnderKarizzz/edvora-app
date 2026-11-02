<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Seluruh skema EDVORA dalam satu file: gabungan 26 migration sampai 2026_10_06_000003_ikon_badge,
 * termasuk katalog 11 avatar dan 20 badge. Dibuat dari pg_dump hasil menjalankan 26 migration itu.
 *
 * Database yang sudah punya tabel users dilewati, jadi file ini hanya membuat skema di database kosong.
 * Tabel subtes, topik, soal, universitas, dan program_studi tetap kosong.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users')) {
            return;
        }

        DB::unprepared(<<<'SQL'
            

            CREATE TABLE public.admin_editor (
                user_id uuid NOT NULL,
                nama_lengkap text NOT NULL
            );

            CREATE TABLE public.audit_log (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                user_id uuid,
                peran public.user_role NOT NULL,
                aksi text NOT NULL,
                keterangan text,
                created_at timestamp with time zone DEFAULT now() NOT NULL
            );

            CREATE TABLE public.avatar (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                nama text NOT NULL,
                gambar_perempuan character varying CONSTRAINT avatar_gambar_not_null NOT NULL,
                harga_point integer DEFAULT 0 NOT NULL,
                gambar_laki_laki character varying NOT NULL,
                level_minimal smallint DEFAULT 1 NOT NULL,
                CONSTRAINT avatar_harga_point_positif CHECK ((harga_point >= 0)),
                CONSTRAINT avatar_level_minimal_rentang CHECK (((level_minimal >= 1) AND (level_minimal <= 50)))
            );

            CREATE TABLE public.badge (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                nama_badge text NOT NULL,
                deskripsi text,
                icon character varying NOT NULL,
                syarat_text text NOT NULL,
                jenis_syarat text NOT NULL,
                target integer,
                CONSTRAINT badge_jenis_syarat_valid CHECK ((jenis_syarat = ANY (ARRAY['soal_dijawab'::text, 'jawaban_benar'::text, 'sesi_sempurna'::text, 'soal_remedial'::text, 'simulasi_selesai'::text, 'try_out_selesai'::text, 'rata_skor_try_out'::text, 'peringkat_try_out'::text, 'semua_avatar'::text]))),
                CONSTRAINT badge_target_positif CHECK ((target > 0)),
                CONSTRAINT badge_target_sesuai_jenis CHECK (((jenis_syarat = 'semua_avatar'::text) = (target IS NULL)))
            );

            CREATE TABLE public.battle (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                subtes_id uuid NOT NULL,
                mode public.mode_battle NOT NULL,
                join_code text,
                status public.status_battle DEFAULT 'waiting'::public.status_battle NOT NULL,
                jumlah_soal integer DEFAULT 10 NOT NULL,
                dibuat_oleh uuid,
                created_at timestamp with time zone DEFAULT now() NOT NULL,
                started_at timestamp with time zone,
                ended_at timestamp with time zone
            );

            CREATE TABLE public.battle_daftar_soal (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                battle_id uuid NOT NULL,
                soal_id uuid NOT NULL,
                urutan integer NOT NULL
            );

            CREATE TABLE public.battle_jawaban (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                battle_peserta_id uuid NOT NULL,
                battle_daftar_soal_id uuid NOT NULL,
                opsi_dipilih_id uuid,
                is_correct boolean DEFAULT false NOT NULL,
                waktu_jawab_ms integer DEFAULT 0 NOT NULL,
                answered_at timestamp with time zone DEFAULT now() NOT NULL,
                skor numeric DEFAULT 0
            );

            CREATE TABLE public.battle_peserta (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                battle_id uuid NOT NULL,
                user_id uuid NOT NULL,
                total_skor numeric DEFAULT 0,
                rank integer,
                joined_at timestamp with time zone DEFAULT now() NOT NULL
            );

            CREATE TABLE public.cache (
                key character varying(255) NOT NULL,
                value text NOT NULL,
                expiration integer NOT NULL
            );

            CREATE TABLE public.cache_locks (
                key character varying(255) NOT NULL,
                owner character varying(255) NOT NULL,
                expiration integer NOT NULL
            );

            CREATE TABLE public.failed_jobs (
                id bigint NOT NULL,
                uuid character varying(255) NOT NULL,
                connection text NOT NULL,
                queue text NOT NULL,
                payload text NOT NULL,
                exception text NOT NULL,
                failed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
            );

            CREATE SEQUENCE public.failed_jobs_id_seq
                START WITH 1
                INCREMENT BY 1
                NO MINVALUE
                NO MAXVALUE
                CACHE 1;

            ALTER SEQUENCE public.failed_jobs_id_seq OWNED BY public.failed_jobs.id;

            CREATE TABLE public.ice_breaking_content (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                konten_teks text NOT NULL,
                konten_gambar character varying,
                jawaban text NOT NULL,
                dibuat_oleh uuid,
                status public.status_konten DEFAULT 'draft'::public.status_konten NOT NULL,
                created_at timestamp with time zone DEFAULT now() NOT NULL
            );

            CREATE TABLE public.jawaban_pengerjaan (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                pengerjaan_id uuid NOT NULL,
                pengerjaan_subtes_id uuid,
                soal_id uuid NOT NULL,
                opsi_dipilih_id uuid,
                jawaban_isian text,
                is_correct boolean DEFAULT false NOT NULL,
                skor numeric DEFAULT 0,
                waktu_menjawab timestamp with time zone DEFAULT now() NOT NULL,
                opsi_dipilih_ids uuid[],
                pakai_hint boolean DEFAULT false NOT NULL,
                pilihan_kolom jsonb,
                CONSTRAINT jawaban_pengerjaan_pilihan_kolom_objek CHECK ((jsonb_typeof(pilihan_kolom) = 'object'::text))
            );

            CREATE TABLE public.job_batches (
                id character varying(255) NOT NULL,
                name character varying(255) NOT NULL,
                total_jobs integer NOT NULL,
                pending_jobs integer NOT NULL,
                failed_jobs integer NOT NULL,
                failed_job_ids text NOT NULL,
                options text,
                cancelled_at integer,
                created_at integer NOT NULL,
                finished_at integer
            );

            CREATE TABLE public.jobs (
                id bigint NOT NULL,
                queue character varying(255) NOT NULL,
                payload text NOT NULL,
                attempts smallint NOT NULL,
                reserved_at integer,
                available_at integer NOT NULL,
                created_at integer NOT NULL
            );

            CREATE SEQUENCE public.jobs_id_seq
                START WITH 1
                INCREMENT BY 1
                NO MINVALUE
                NO MAXVALUE
                CACHE 1;

            ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;

            CREATE TABLE public.opsi_jawaban (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                soal_id uuid NOT NULL,
                label character varying NOT NULL,
                teks_opsi text NOT NULL,
                gambar_opsi text,
                is_kunci boolean DEFAULT false NOT NULL,
                urutan integer NOT NULL,
                kunci_kolom smallint,
                CONSTRAINT opsi_jawaban_kunci_kolom_positif CHECK ((kunci_kolom >= 1))
            );

            CREATE TABLE public.password_reset_tokens (
                email character varying(255) NOT NULL,
                token character varying(255) NOT NULL,
                created_at timestamp(0) without time zone
            );

            CREATE TABLE public.pengerjaan (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                user_id uuid NOT NULL,
                tipe public.tipe_pengerjaan NOT NULL,
                status public.status_pengerjaan DEFAULT 'berjalan'::public.status_pengerjaan NOT NULL,
                subtes_id uuid,
                jumlah_soal_dipilih integer,
                ice_breaking_aktif boolean DEFAULT false,
                try_out_id uuid,
                started_at timestamp with time zone DEFAULT now() NOT NULL,
                finished_at timestamp with time zone,
                total_skor numeric DEFAULT 0,
                mode_latihan text,
                sesi_ulangan boolean DEFAULT false NOT NULL,
                soal_ids uuid[],
                hint_soal_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
                CONSTRAINT pengerjaan_mode_latihan_valid CHECK ((mode_latihan = ANY (ARRAY['fleksibel'::text, 'simulasi'::text, 'remedial'::text])))
            );

            CREATE TABLE public.pengerjaan_subtes (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                pengerjaan_id uuid NOT NULL,
                try_out_subtes_id uuid,
                waktu_mulai timestamp with time zone,
                waktu_selesai timestamp with time zone,
                skor_subtes numeric DEFAULT 0
            );

            CREATE TABLE public.penguasaan_topik (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                user_id uuid NOT NULL,
                topik_id uuid NOT NULL,
                skor numeric(5,2),
                n_jendela smallint DEFAULT 0 NOT NULL,
                n_di_tahap integer DEFAULT 0 NOT NULL,
                tahap smallint DEFAULT 1 NOT NULL,
                tahap_sejak timestamp with time zone,
                updated_at timestamp with time zone DEFAULT now() NOT NULL,
                skor_sementara numeric(5,2),
                CONSTRAINT penguasaan_topik_n_di_tahap_positif CHECK ((n_di_tahap >= 0)),
                CONSTRAINT penguasaan_topik_n_jendela_rentang CHECK (((n_jendela >= 0) AND (n_jendela <= 20))),
                CONSTRAINT penguasaan_topik_skor_rentang CHECK (((skor >= (0)::numeric) AND (skor <= (100)::numeric))),
                CONSTRAINT penguasaan_topik_skor_sementara_rentang CHECK (((skor_sementara >= (0)::numeric) AND (skor_sementara <= (100)::numeric))),
                CONSTRAINT penguasaan_topik_tahap_rentang CHECK (((tahap >= 1) AND (tahap <= 3)))
            );

            CREATE TABLE public.point_transactions (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                user_id uuid NOT NULL,
                jumlah integer NOT NULL,
                sumber_tipe public.sumber_tipe_transaksi NOT NULL,
                pengerjaan_id uuid,
                battle_id uuid,
                avatar_id uuid,
                created_at timestamp with time zone DEFAULT now() NOT NULL
            );

            CREATE TABLE public.program_studi (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                universitas_id uuid NOT NULL,
                nama_prodi text NOT NULL,
                kode_prodi character varying(20) NOT NULL,
                jenjang public.jenjang_prodi NOT NULL,
                is_aktif boolean DEFAULT true NOT NULL
            );

            CREATE TABLE public.riwayat_tahap (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                user_id uuid NOT NULL,
                topik_id uuid NOT NULL,
                dari_tahap smallint NOT NULL,
                ke_tahap smallint NOT NULL,
                skor numeric(5,2) NOT NULL,
                pengerjaan_id uuid,
                created_at timestamp with time zone DEFAULT now() NOT NULL
            );

            CREATE TABLE public.sessions (
                id character varying(255) NOT NULL,
                user_id uuid,
                ip_address character varying(45),
                user_agent text,
                payload text NOT NULL,
                last_activity integer NOT NULL
            );

            CREATE TABLE public.siswa (
                user_id uuid NOT NULL,
                nama_lengkap text NOT NULL,
                kelas text,
                jenis_kelamin public.jenis_kelamin,
                xp integer DEFAULT 0 NOT NULL,
                point integer DEFAULT 0 NOT NULL,
                streak_saat_ini integer DEFAULT 0 NOT NULL,
                avatar_aktif_id uuid,
                universitas_tujuan_id uuid,
                prodi_tujuan_id uuid,
                created_at timestamp with time zone DEFAULT now() NOT NULL,
                updated_at timestamp with time zone DEFAULT now() NOT NULL,
                CONSTRAINT siswa_point_tidak_negatif CHECK ((point >= 0))
            );

            CREATE TABLE public.siswa_avatar (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                user_id uuid NOT NULL,
                avatar_id uuid NOT NULL,
                dibeli_at timestamp with time zone DEFAULT now() NOT NULL
            );

            CREATE TABLE public.siswa_badge (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                user_id uuid NOT NULL,
                badge_id uuid NOT NULL,
                diperoleh_at timestamp with time zone DEFAULT now() NOT NULL
            );

            CREATE TABLE public.soal (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                kode_soal character varying(100) NOT NULL,
                subtes_id uuid NOT NULL,
                editor_id uuid,
                tipe public.tipe_soal NOT NULL,
                teks_soal text NOT NULL,
                gambar_soal text,
                kunci_jawaban text,
                hint text,
                pembahasan text NOT NULL,
                tingkat_kesulitan public.tingkat_kesulitan NOT NULL,
                status public.status_soal DEFAULT 'draft'::public.status_soal NOT NULL,
                created_at timestamp with time zone DEFAULT now() NOT NULL,
                updated_at timestamp with time zone DEFAULT now() NOT NULL,
                topik_id uuid NOT NULL,
                irt_a numeric,
                irt_b numeric,
                gambar_pembahasan text,
                kolom_tabel jsonb,
                CONSTRAINT soal_irt_a_positif CHECK (((irt_a IS NULL) OR (irt_a > (0)::numeric))),
                CONSTRAINT soal_isian_wajib_kunci CHECK (((tipe <> 'isian_singkat'::public.tipe_soal) OR (kunci_jawaban IS NOT NULL))),
                CONSTRAINT soal_kolom_tabel_valid CHECK ((((tipe = 'majemuk_tabel'::public.tipe_soal) = (kolom_tabel IS NOT NULL)) AND ((kolom_tabel IS NULL) OR
            CASE
                WHEN (jsonb_typeof(kolom_tabel) = 'array'::text) THEN ((jsonb_array_length(kolom_tabel) >= 2) AND (jsonb_array_length(kolom_tabel) <= 4))
                ELSE false
            END))),
                CONSTRAINT soal_opsi_tanpa_kunci_teks CHECK (((tipe = 'isian_singkat'::public.tipe_soal) OR (kunci_jawaban IS NULL)))
            );

            CREATE TABLE public.subtes (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                nama_subtes text NOT NULL,
                deskripsi text,
                urutan integer NOT NULL,
                waktu_default_menit numeric(4,1) NOT NULL,
                kode_subtes character varying,
                jumlah_soal integer NOT NULL,
                CONSTRAINT subtes_jumlah_soal_positif CHECK ((jumlah_soal > 0))
            );

            CREATE TABLE public.topik (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                subtes_id uuid NOT NULL,
                nama_topik text NOT NULL,
                urutan integer NOT NULL,
                jumlah_soal_simulasi smallint,
                CONSTRAINT topik_jumlah_soal_simulasi_positif CHECK ((jumlah_soal_simulasi > 0))
            );

            CREATE TABLE public.try_out (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                judul text NOT NULL,
                peraturan text,
                dibuat_oleh uuid,
                created_at timestamp with time zone DEFAULT now() NOT NULL,
                updated_at timestamp with time zone DEFAULT now() NOT NULL,
                mulai_at timestamp with time zone NOT NULL,
                selesai_at timestamp with time zone NOT NULL,
                dinilai_at timestamp with time zone,
                CONSTRAINT try_out_periode_valid CHECK ((selesai_at > mulai_at))
            );

            CREATE TABLE public.try_out_soal (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                try_out_subtes_id uuid NOT NULL,
                soal_id uuid NOT NULL,
                urutan integer NOT NULL
            );

            CREATE TABLE public.try_out_subtes (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                try_out_id uuid NOT NULL,
                subtes_id uuid NOT NULL,
                urutan integer NOT NULL,
                jumlah_soal integer NOT NULL,
                waktu_menit numeric(4,1) NOT NULL,
                CONSTRAINT try_out_subtes_isi_positif CHECK (((jumlah_soal > 0) AND (waktu_menit > (0)::numeric)))
            );

            CREATE TABLE public.universitas (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                nama_universitas text NOT NULL,
                kode_ptn character varying(10) NOT NULL,
                is_aktif boolean DEFAULT true NOT NULL
            );

            CREATE TABLE public.users (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                email text NOT NULL,
                password text NOT NULL,
                role public.user_role DEFAULT 'siswa'::public.user_role NOT NULL,
                is_active boolean DEFAULT true NOT NULL,
                email_verified_at timestamp with time zone,
                created_at timestamp with time zone DEFAULT now() NOT NULL,
                updated_at timestamp with time zone DEFAULT now() NOT NULL,
                remember_token character varying,
                name character varying(50),
                terakhir_login_at timestamp with time zone
            );

            CREATE TABLE public.xp_transactions (
                id uuid DEFAULT gen_random_uuid() NOT NULL,
                user_id uuid NOT NULL,
                jumlah integer NOT NULL,
                sumber_tipe public.sumber_tipe_transaksi NOT NULL,
                pengerjaan_id uuid,
                battle_id uuid,
                created_at timestamp with time zone DEFAULT now() NOT NULL
            );

            ALTER TABLE ONLY public.failed_jobs ALTER COLUMN id SET DEFAULT nextval('public.failed_jobs_id_seq'::regclass);

            ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);

            INSERT INTO public.avatar VALUES ('cbfdd0ac-ed6f-40d6-9830-f7e5ff89b22e', 'Peserta UTBK', '/images/avatar/peserta-utbk-perempuan.webp', 150, '/images/avatar/peserta-utbk-laki-laki.webp', 5);
            INSERT INTO public.avatar VALUES ('32f5d6e6-f020-4219-b67a-e90dff18a16a', 'Mahasiswa Baru', '/images/avatar/mahasiswa-baru-perempuan.webp', 300, '/images/avatar/mahasiswa-baru-laki-laki.webp', 10);
            INSERT INTO public.avatar VALUES ('7b8e088a-5ed8-458d-bada-52b405c8d422', 'Mahasiswa FMIPA', '/images/avatar/fmipa-perempuan.webp', 600, '/images/avatar/fmipa-laki-laki.webp', 15);
            INSERT INTO public.avatar VALUES ('3d6da444-ad72-409f-b9a5-406930193920', 'Mahasiswa Teknik', '/images/avatar/teknik-perempuan.webp', 600, '/images/avatar/teknik-laki-laki.webp', 15);
            INSERT INTO public.avatar VALUES ('30e753a5-681f-46b4-9d47-66cd0ddb7d8b', 'Mahasiswa Ekonomi', '/images/avatar/ekonomi-perempuan.webp', 600, '/images/avatar/ekonomi-laki-laki.webp', 15);
            INSERT INTO public.avatar VALUES ('aa69f34e-98cb-4f5f-8c3c-9780baea0d14', 'Mahasiswa Seni', '/images/avatar/seni-perempuan.webp', 600, '/images/avatar/seni-laki-laki.webp', 15);
            INSERT INTO public.avatar VALUES ('0d4c873c-9f57-40f7-92c6-74f7a1c71496', 'Mahasiswa Pendidikan', '/images/avatar/pendidikan-perempuan.webp', 600, '/images/avatar/pendidikan-laki-laki.webp', 15);
            INSERT INTO public.avatar VALUES ('fc1b5784-8f5f-4623-b23f-4a97fc77e2d9', 'Mahasiswa Hukum', '/images/avatar/hukum-perempuan.webp', 600, '/images/avatar/hukum-laki-laki.webp', 15);
            INSERT INTO public.avatar VALUES ('76791c4b-b8ac-40f1-b716-5da1ca38f5df', 'Mahasiswa Kedokteran', '/images/avatar/kedokteran-perempuan.webp', 800, '/images/avatar/kedokteran-laki-laki.webp', 20);
            INSERT INTO public.avatar VALUES ('4abcbc69-bc36-418a-ade0-66a7766145b8', 'Sarjana', '/images/avatar/sarjana-perempuan.webp', 1500, '/images/avatar/sarjana-laki-laki.webp', 30);
            INSERT INTO public.avatar VALUES ('69aeab05-ce2a-4b52-b235-1aed57dbabe9', 'Cumlaude', '/images/avatar/cumlaude-perempuan.webp', 2500, '/images/avatar/cumlaude-laki-laki.webp', 50);

            INSERT INTO public.badge VALUES ('7349ab31-1f94-4327-8c38-f02384e25f6e', 'Langkah Pertama', NULL, '/images/badge/Langkah_Pertama-1.svg', 'Mengerjakan 1 Soal', 'soal_dijawab', 1);
            INSERT INTO public.badge VALUES ('d293d6c3-634c-45b0-adbb-1d4363dad53d', 'Penakluk 100 Soal', NULL, '/images/badge/Penakluk_100_Soal-2.svg', 'Mengerjakan 100 Soal', 'soal_dijawab', 100);
            INSERT INTO public.badge VALUES ('e6f9c0f3-e20d-4212-809d-749ab7bdd378', 'Penakluk 500 Soal', NULL, '/images/badge/Penakluk_500_Soal-3.svg', 'Mengerjakan 500 Soal', 'soal_dijawab', 500);
            INSERT INTO public.badge VALUES ('16642786-583f-4d06-8d3f-f13e7c855e1f', 'Penakluk 1000 Soal', NULL, '/images/badge/Penakluk_1000_Soal-4.svg', 'Mengerjakan 1000 Soal', 'soal_dijawab', 1000);
            INSERT INTO public.badge VALUES ('1879471a-5614-48a8-a988-15718b740d9b', 'Penakluk Semua Soal', NULL, '/images/badge/Penakluk_Semua_Soal-5.svg', 'Mengerjakan lebih dari 2000 Soal', 'soal_dijawab', 2001);
            INSERT INTO public.badge VALUES ('7807d69e-4580-4367-a584-93d4cd56e515', 'Tepat Sasaran', NULL, '/images/badge/Tepat_Sasaran-6.svg', 'Menjawab benar 100 soal', 'jawaban_benar', 100);
            INSERT INTO public.badge VALUES ('d00c3f58-2648-43c1-ba31-11d67e0d1231', 'Tanpa Celah', NULL, '/images/badge/Tanpa_Celah-7.svg', 'Mengerjakan 1 Paket Soal dengan 100% Benar', 'sesi_sempurna', 1);
            INSERT INTO public.badge VALUES ('9c1b5181-9137-41bb-9ddf-57cc5cfe1524', 'Belajar dari Kesalahan', NULL, '/images/badge/Belajar_dari_Kesalahan-8.svg', 'Menyelesaikan 10 soal remedial', 'soal_remedial', 10);
            INSERT INTO public.badge VALUES ('a898d7fa-d50e-47e1-86f2-db073bbfa6b9', 'Pemburu Kesalahan', NULL, '/images/badge/Pemburu_Kesalahan-9.svg', 'Menyelesaikan 100 soal remedial', 'soal_remedial', 100);
            INSERT INTO public.badge VALUES ('905b84fa-ee9a-4455-9119-68b5f13d43dc', 'First Wave', NULL, '/images/badge/First_Wave-10.svg', 'Menyelesaikan 1 simulasi subtest', 'simulasi_selesai', 1);
            INSERT INTO public.badge VALUES ('ebbf79e2-0481-4e14-b6c6-ee906261ad8f', 'Tsunami', NULL, '/images/badge/Tsunami-11.svg', 'Menyelesaikan 15 simulasi subtest', 'simulasi_selesai', 15);
            INSERT INTO public.badge VALUES ('e379a781-b4a4-47f6-b196-d84ed6931da7', 'Ocean Master', NULL, '/images/badge/Ocean_Master-12.svg', 'Menyelesaikan 50 simulasi subtest', 'simulasi_selesai', 50);
            INSERT INTO public.badge VALUES ('56742bec-8690-4e98-9bb7-ed6b944d54ae', 'Debut TO', NULL, '/images/badge/Debut_TO-13.svg', 'Menyelesaikan 1 Try Out', 'try_out_selesai', 1);
            INSERT INTO public.badge VALUES ('d9d41771-3181-4f5a-8190-2b05d9ca52c6', 'Rising Star', NULL, '/images/badge/Rising_Star-14.svg', 'Menyelesaikan 5 Try Out', 'try_out_selesai', 5);
            INSERT INTO public.badge VALUES ('66f47f19-393c-4868-b6e4-5c3e845c9829', 'Veteran', NULL, '/images/badge/Veteran-15.svg', 'Menyelesaikan 10 Try Out', 'try_out_selesai', 10);
            INSERT INTO public.badge VALUES ('3c315968-0cae-456f-bd8c-1f15369f05c7', 'Tembus 600', NULL, '/images/badge/Tembus_600-16.svg', 'Skor Rata-Rata Try Out ≥ 600', 'rata_skor_try_out', 600);
            INSERT INTO public.badge VALUES ('4c05d0f0-afec-4eb2-a19f-a921b94d1d55', 'Tembus 700', NULL, '/images/badge/Tembus_700-17.svg', 'Skor Rata-Rata Try Out ≥ 700', 'rata_skor_try_out', 700);
            INSERT INTO public.badge VALUES ('fc895834-9824-4dce-bc14-6f5e46adac64', 'Lima Besar', NULL, '/images/badge/Lima_Besar-18.svg', 'Masuk 5 besar peringkat suatu TO', 'peringkat_try_out', 5);
            INSERT INTO public.badge VALUES ('aa2c3b02-9e24-4dae-9a77-849577a0e718', 'Champion', NULL, '/images/badge/Champion-19.svg', 'Peringkat pertama suatu TO', 'peringkat_try_out', 1);
            INSERT INTO public.badge VALUES ('739d295b-25e5-4a63-8ba2-d46c94ead4ae', 'Kolektor Avatar', NULL, '/images/badge/Kolektor_Avatar-20.svg', 'Memiliki semua avatar', 'semua_avatar', NULL);

            ALTER TABLE ONLY public.admin_editor
                ADD CONSTRAINT admin_editor_pkey PRIMARY KEY (user_id);

            ALTER TABLE ONLY public.audit_log
                ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.avatar
                ADD CONSTRAINT avatar_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.badge
                ADD CONSTRAINT badge_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.battle_daftar_soal
                ADD CONSTRAINT battle_daftar_soal_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.battle_jawaban
                ADD CONSTRAINT battle_jawaban_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.battle
                ADD CONSTRAINT battle_join_code_key UNIQUE (join_code);

            ALTER TABLE ONLY public.battle_peserta
                ADD CONSTRAINT battle_peserta_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.battle
                ADD CONSTRAINT battle_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.cache_locks
                ADD CONSTRAINT cache_locks_pkey PRIMARY KEY (key);

            ALTER TABLE ONLY public.cache
                ADD CONSTRAINT cache_pkey PRIMARY KEY (key);

            ALTER TABLE ONLY public.failed_jobs
                ADD CONSTRAINT failed_jobs_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.failed_jobs
                ADD CONSTRAINT failed_jobs_uuid_unique UNIQUE (uuid);

            ALTER TABLE ONLY public.ice_breaking_content
                ADD CONSTRAINT ice_breaking_content_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.jawaban_pengerjaan
                ADD CONSTRAINT jawaban_pengerjaan_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.jawaban_pengerjaan
                ADD CONSTRAINT jawaban_unik_per_soal UNIQUE (pengerjaan_id, soal_id);

            ALTER TABLE ONLY public.job_batches
                ADD CONSTRAINT job_batches_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.jobs
                ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.opsi_jawaban
                ADD CONSTRAINT opsi_jawaban_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.password_reset_tokens
                ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (email);

            ALTER TABLE ONLY public.pengerjaan
                ADD CONSTRAINT pengerjaan_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.pengerjaan_subtes
                ADD CONSTRAINT pengerjaan_subtes_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.pengerjaan_subtes
                ADD CONSTRAINT pengerjaan_subtes_subtes_unik UNIQUE (pengerjaan_id, try_out_subtes_id);

            ALTER TABLE ONLY public.penguasaan_topik
                ADD CONSTRAINT penguasaan_topik_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.penguasaan_topik
                ADD CONSTRAINT penguasaan_topik_unik UNIQUE (user_id, topik_id);

            ALTER TABLE ONLY public.point_transactions
                ADD CONSTRAINT point_transactions_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.program_studi
                ADD CONSTRAINT program_studi_id_universitas_key UNIQUE (id, universitas_id);

            ALTER TABLE ONLY public.program_studi
                ADD CONSTRAINT program_studi_kode_prodi_key UNIQUE (kode_prodi);

            ALTER TABLE ONLY public.program_studi
                ADD CONSTRAINT program_studi_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.riwayat_tahap
                ADD CONSTRAINT riwayat_tahap_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.sessions
                ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.siswa_avatar
                ADD CONSTRAINT siswa_avatar_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.siswa_avatar
                ADD CONSTRAINT siswa_avatar_unik UNIQUE (user_id, avatar_id);

            ALTER TABLE ONLY public.siswa_badge
                ADD CONSTRAINT siswa_badge_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.siswa_badge
                ADD CONSTRAINT siswa_badge_unik UNIQUE (user_id, badge_id);

            ALTER TABLE ONLY public.siswa
                ADD CONSTRAINT siswa_pkey PRIMARY KEY (user_id);

            ALTER TABLE ONLY public.soal
                ADD CONSTRAINT soal_kode_soal_key UNIQUE (kode_soal);

            ALTER TABLE ONLY public.soal
                ADD CONSTRAINT soal_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.subtes
                ADD CONSTRAINT subtes_kode_subtes_key UNIQUE (kode_subtes);

            ALTER TABLE ONLY public.subtes
                ADD CONSTRAINT subtes_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.topik
                ADD CONSTRAINT topik_id_subtes_key UNIQUE (id, subtes_id);

            ALTER TABLE ONLY public.topik
                ADD CONSTRAINT topik_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.try_out
                ADD CONSTRAINT try_out_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.try_out_soal
                ADD CONSTRAINT try_out_soal_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.try_out_soal
                ADD CONSTRAINT try_out_soal_satu_paket UNIQUE (soal_id);

            ALTER TABLE ONLY public.try_out_soal
                ADD CONSTRAINT try_out_soal_urutan_unik UNIQUE (try_out_subtes_id, urutan);

            ALTER TABLE ONLY public.try_out_subtes
                ADD CONSTRAINT try_out_subtes_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.try_out_subtes
                ADD CONSTRAINT try_out_subtes_subtes_unik UNIQUE (try_out_id, subtes_id);

            ALTER TABLE ONLY public.try_out_subtes
                ADD CONSTRAINT try_out_subtes_urutan_unik UNIQUE (try_out_id, urutan);

            ALTER TABLE ONLY public.universitas
                ADD CONSTRAINT universitas_kode_ptn_key UNIQUE (kode_ptn);

            ALTER TABLE ONLY public.universitas
                ADD CONSTRAINT universitas_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.users
                ADD CONSTRAINT users_email_key UNIQUE (email);

            ALTER TABLE ONLY public.users
                ADD CONSTRAINT users_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY public.xp_transactions
                ADD CONSTRAINT xp_transactions_pkey PRIMARY KEY (id);

            CREATE INDEX audit_log_peran_waktu_idx ON public.audit_log USING btree (peran, created_at DESC);

            CREATE UNIQUE INDEX avatar_nama_unik ON public.avatar USING btree (lower(nama));

            CREATE UNIQUE INDEX badge_nama_unik ON public.badge USING btree (lower(nama_badge));

            CREATE INDEX jawaban_pengerjaan_pengerjaan_idx ON public.jawaban_pengerjaan USING btree (pengerjaan_id);

            CREATE INDEX jawaban_pengerjaan_soal_idx ON public.jawaban_pengerjaan USING btree (soal_id);

            CREATE INDEX jobs_queue_index ON public.jobs USING btree (queue);

            CREATE UNIQUE INDEX pengerjaan_fleksibel_berjalan_satu ON public.pengerjaan USING btree (user_id, subtes_id) WHERE ((status = 'berjalan'::public.status_pengerjaan) AND (mode_latihan = 'fleksibel'::text));

            CREATE UNIQUE INDEX pengerjaan_try_out_sekali ON public.pengerjaan USING btree (try_out_id, user_id) WHERE (try_out_id IS NOT NULL);

            CREATE INDEX pengerjaan_user_selesai_idx ON public.pengerjaan USING btree (user_id, finished_at);

            CREATE UNIQUE INDEX program_studi_nama_unik ON public.program_studi USING btree (universitas_id, jenjang, lower(nama_prodi));

            CREATE INDEX riwayat_tahap_pengerjaan_idx ON public.riwayat_tahap USING btree (pengerjaan_id);

            CREATE INDEX sessions_last_activity_index ON public.sessions USING btree (last_activity);

            CREATE INDEX sessions_user_id_index ON public.sessions USING btree (user_id);

            CREATE INDEX siswa_prodi_tujuan_idx ON public.siswa USING btree (prodi_tujuan_id);

            CREATE INDEX soal_topik_tingkat_idx ON public.soal USING btree (topik_id, tingkat_kesulitan);

            CREATE UNIQUE INDEX topik_nama_unik ON public.topik USING btree (subtes_id, lower(nama_topik));

            CREATE UNIQUE INDEX universitas_nama_unik ON public.universitas USING btree (lower(nama_universitas));

            ALTER TABLE ONLY public.admin_editor
                ADD CONSTRAINT admin_editor_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

            ALTER TABLE ONLY public.audit_log
                ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

            ALTER TABLE ONLY public.battle_daftar_soal
                ADD CONSTRAINT battle_daftar_soal_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES public.battle(id);

            ALTER TABLE ONLY public.battle_daftar_soal
                ADD CONSTRAINT battle_daftar_soal_soal_id_fkey FOREIGN KEY (soal_id) REFERENCES public.soal(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.battle
                ADD CONSTRAINT battle_dibuat_oleh_fkey FOREIGN KEY (dibuat_oleh) REFERENCES public.users(id);

            ALTER TABLE ONLY public.battle_jawaban
                ADD CONSTRAINT battle_jawaban_battle_daftar_soal_id_fkey FOREIGN KEY (battle_daftar_soal_id) REFERENCES public.battle_daftar_soal(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.battle_jawaban
                ADD CONSTRAINT battle_jawaban_battle_peserta_id_fkey FOREIGN KEY (battle_peserta_id) REFERENCES public.battle_peserta(id);

            ALTER TABLE ONLY public.battle_jawaban
                ADD CONSTRAINT battle_jawaban_opsi_dipilih_id_fkey FOREIGN KEY (opsi_dipilih_id) REFERENCES public.opsi_jawaban(id) ON DELETE SET NULL;

            ALTER TABLE ONLY public.battle_peserta
                ADD CONSTRAINT battle_peserta_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES public.battle(id);

            ALTER TABLE ONLY public.battle_peserta
                ADD CONSTRAINT battle_peserta_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.siswa(user_id);

            ALTER TABLE ONLY public.battle
                ADD CONSTRAINT battle_subtes_id_fkey FOREIGN KEY (subtes_id) REFERENCES public.subtes(id);

            ALTER TABLE ONLY public.ice_breaking_content
                ADD CONSTRAINT ice_breaking_content_dibuat_oleh_fkey FOREIGN KEY (dibuat_oleh) REFERENCES public.users(id);

            ALTER TABLE ONLY public.jawaban_pengerjaan
                ADD CONSTRAINT jawaban_pengerjaan_opsi_dipilih_id_fkey FOREIGN KEY (opsi_dipilih_id) REFERENCES public.opsi_jawaban(id) ON DELETE SET NULL;

            ALTER TABLE ONLY public.jawaban_pengerjaan
                ADD CONSTRAINT jawaban_pengerjaan_pengerjaan_id_fkey FOREIGN KEY (pengerjaan_id) REFERENCES public.pengerjaan(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.jawaban_pengerjaan
                ADD CONSTRAINT jawaban_pengerjaan_pengerjaan_subtes_id_fkey FOREIGN KEY (pengerjaan_subtes_id) REFERENCES public.pengerjaan_subtes(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.jawaban_pengerjaan
                ADD CONSTRAINT jawaban_pengerjaan_soal_id_fkey FOREIGN KEY (soal_id) REFERENCES public.soal(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.opsi_jawaban
                ADD CONSTRAINT opsi_jawaban_soal_id_fkey FOREIGN KEY (soal_id) REFERENCES public.soal(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.pengerjaan
                ADD CONSTRAINT pengerjaan_subtes_id_fkey FOREIGN KEY (subtes_id) REFERENCES public.subtes(id);

            ALTER TABLE ONLY public.pengerjaan_subtes
                ADD CONSTRAINT pengerjaan_subtes_pengerjaan_id_fkey FOREIGN KEY (pengerjaan_id) REFERENCES public.pengerjaan(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.pengerjaan_subtes
                ADD CONSTRAINT pengerjaan_subtes_try_out_subtes_id_fkey FOREIGN KEY (try_out_subtes_id) REFERENCES public.try_out_subtes(id);

            ALTER TABLE ONLY public.pengerjaan
                ADD CONSTRAINT pengerjaan_try_out_id_fkey FOREIGN KEY (try_out_id) REFERENCES public.try_out(id);

            ALTER TABLE ONLY public.pengerjaan
                ADD CONSTRAINT pengerjaan_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.siswa(user_id);

            ALTER TABLE ONLY public.penguasaan_topik
                ADD CONSTRAINT penguasaan_topik_topik_id_fkey FOREIGN KEY (topik_id) REFERENCES public.topik(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.penguasaan_topik
                ADD CONSTRAINT penguasaan_topik_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.siswa(user_id);

            ALTER TABLE ONLY public.point_transactions
                ADD CONSTRAINT point_transactions_avatar_id_fkey FOREIGN KEY (avatar_id) REFERENCES public.avatar(id);

            ALTER TABLE ONLY public.point_transactions
                ADD CONSTRAINT point_transactions_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES public.battle(id);

            ALTER TABLE ONLY public.point_transactions
                ADD CONSTRAINT point_transactions_pengerjaan_id_fkey FOREIGN KEY (pengerjaan_id) REFERENCES public.pengerjaan(id);

            ALTER TABLE ONLY public.point_transactions
                ADD CONSTRAINT point_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.siswa(user_id);

            ALTER TABLE ONLY public.program_studi
                ADD CONSTRAINT program_studi_universitas_id_fkey FOREIGN KEY (universitas_id) REFERENCES public.universitas(id) ON DELETE RESTRICT;

            ALTER TABLE ONLY public.riwayat_tahap
                ADD CONSTRAINT riwayat_tahap_pengerjaan_id_fkey FOREIGN KEY (pengerjaan_id) REFERENCES public.pengerjaan(id) ON DELETE SET NULL;

            ALTER TABLE ONLY public.riwayat_tahap
                ADD CONSTRAINT riwayat_tahap_topik_id_fkey FOREIGN KEY (topik_id) REFERENCES public.topik(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.riwayat_tahap
                ADD CONSTRAINT riwayat_tahap_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.siswa(user_id);

            ALTER TABLE ONLY public.siswa
                ADD CONSTRAINT siswa_avatar_aktif_id_fkey FOREIGN KEY (avatar_aktif_id) REFERENCES public.avatar(id);

            ALTER TABLE ONLY public.siswa_avatar
                ADD CONSTRAINT siswa_avatar_avatar_id_fkey FOREIGN KEY (avatar_id) REFERENCES public.avatar(id);

            ALTER TABLE ONLY public.siswa_avatar
                ADD CONSTRAINT siswa_avatar_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.siswa(user_id);

            ALTER TABLE ONLY public.siswa_badge
                ADD CONSTRAINT siswa_badge_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badge(id);

            ALTER TABLE ONLY public.siswa_badge
                ADD CONSTRAINT siswa_badge_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.siswa(user_id);

            ALTER TABLE ONLY public.siswa
                ADD CONSTRAINT siswa_tujuan_fkey FOREIGN KEY (prodi_tujuan_id, universitas_tujuan_id) REFERENCES public.program_studi(id, universitas_id) MATCH FULL ON DELETE RESTRICT;

            ALTER TABLE ONLY public.siswa
                ADD CONSTRAINT siswa_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

            ALTER TABLE ONLY public.soal
                ADD CONSTRAINT soal_editor_id_fkey FOREIGN KEY (editor_id) REFERENCES public.admin_editor(user_id) ON DELETE SET NULL;

            ALTER TABLE ONLY public.soal
                ADD CONSTRAINT soal_subtes_id_fkey FOREIGN KEY (subtes_id) REFERENCES public.subtes(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.soal
                ADD CONSTRAINT soal_topik_fkey FOREIGN KEY (topik_id, subtes_id) REFERENCES public.topik(id, subtes_id);

            ALTER TABLE ONLY public.topik
                ADD CONSTRAINT topik_subtes_id_fkey FOREIGN KEY (subtes_id) REFERENCES public.subtes(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.try_out
                ADD CONSTRAINT try_out_dibuat_oleh_fkey FOREIGN KEY (dibuat_oleh) REFERENCES public.users(id);

            ALTER TABLE ONLY public.try_out_soal
                ADD CONSTRAINT try_out_soal_soal_id_fkey FOREIGN KEY (soal_id) REFERENCES public.soal(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.try_out_soal
                ADD CONSTRAINT try_out_soal_try_out_subtes_id_fkey FOREIGN KEY (try_out_subtes_id) REFERENCES public.try_out_subtes(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.try_out_subtes
                ADD CONSTRAINT try_out_subtes_subtes_id_fkey FOREIGN KEY (subtes_id) REFERENCES public.subtes(id);

            ALTER TABLE ONLY public.try_out_subtes
                ADD CONSTRAINT try_out_subtes_try_out_id_fkey FOREIGN KEY (try_out_id) REFERENCES public.try_out(id) ON DELETE CASCADE;

            ALTER TABLE ONLY public.xp_transactions
                ADD CONSTRAINT xp_transactions_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES public.battle(id);

            ALTER TABLE ONLY public.xp_transactions
                ADD CONSTRAINT xp_transactions_pengerjaan_id_fkey FOREIGN KEY (pengerjaan_id) REFERENCES public.pengerjaan(id);

            ALTER TABLE ONLY public.xp_transactions
                ADD CONSTRAINT xp_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.siswa(user_id);
            SQL);
    }

    public function down(): void
    {
        // Sengaja kosong: rollback di sini berarti menghapus seluruh database.
    }
};
