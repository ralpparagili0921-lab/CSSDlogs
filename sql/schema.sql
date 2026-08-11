-- ============================================================
-- CSSD Digital Logbooks — Supabase Schema v2
-- Tebow CURE Children's Hospital
-- ============================================================
-- IF THIS IS A FRESH SUPABASE PROJECT: just run this whole file.
--
-- IF YOU ALREADY RAN THE v1 SCHEMA (from the first build) AND HAVE
-- NO REAL DATA YET: run sql/reset_and_upgrade.sql instead — it drops
-- the old tables first, then recreates everything from this file.
--
-- IF YOU ALREADY HAVE REAL DATA YOU NEED TO KEEP: stop and ask
-- Claude for a migration script instead of running this directly —
-- it will need to ALTER existing tables rather than recreate them.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- STAFF ----------
-- Three roles:
--   superuser — full access, including account creation & app settings
--   admin     — dashboard + KPI reports + all logbooks, no staff/settings management
--   user      — logbook data entry only
--
-- New accounts (created from the login screen) start on the shared
-- DEFAULT_PIN ('0000') with pin_changed = false. On their first
-- successful login with that PIN, the app offers them the chance to
-- set a personal PIN and two security questions (used later for
-- self-service PIN recovery). A superuser can reset any account back
-- to this same default-PIN state at any time from Manage Staff & Settings.
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null default '0000',
  pin_changed boolean not null default false,
  role text not null default 'user' check (role in ('superuser','admin','user')),
  job_title text,
  shift_start time,                   -- e.g. 07:00 — informational, shown next to their name
  shift_end time,                     -- e.g. 15:00
  active boolean not null default true,
  security_question_1 text,
  security_answer_1 text,     -- stored lowercase/trimmed, plain text (see README security note)
  security_question_2 text,
  security_answer_2 text,
  created_at timestamptz not null default now()
);

-- ---------- APP METADATA (for the Version & Updates panel) ----------
create table if not exists app_meta (
  id int primary key default 1,
  app_version text not null default '2.0.0',
  released_on date not null default current_date,
  changelog text,
  -- Years of log history to keep. Purging is manual-only (Admin -> Run
  -- Cleanup Now) — this setting is just the cutoff it uses, never a
  -- trigger by itself. Backlog item #9.
  retention_years integer not null default 3,
  -- Pre-launch gate (backlog item #12). Blocks all use until a superuser
  -- confirms with their PIN; once set, launch_date becomes the floor for
  -- every missed-log/compliance calculation (see WorkCalendar.launchDate()
  -- in js/work-calendar.js) — nothing before go-live counts against anyone.
  launched boolean not null default false,
  launch_date date,
  constraint single_row_meta check (id = 1)
);
insert into app_meta (id, app_version, changelog) values
  (1, '2.0.0', 'Role-based access, account creation with security questions, restructured equipment downtime workflow, brush registration, missed-log alerts.')
  on conflict (id) do nothing;

-- ---------- LOGBOOK ASSIGNMENTS (who is responsible, for missed-log alerts) ----------
-- One default assignee per logbook. Anyone can still log an entry —
-- this just drives whose name gets flagged for a missed date, and
-- who a "needs attention" item points to. A blank/null assignee means
-- the logbook is shared ("everyone") and won't generate individual
-- missed-date tracking for a specific person.
create table if not exists logbook_assignments (
  logbook text primary key check (logbook in ('ro','equipment','cycles','qa','brush','instrument')),
  staff_id uuid references staff(id)
);
insert into logbook_assignments (logbook) values ('ro'), ('equipment'), ('cycles'), ('qa'), ('brush'), ('instrument')
  on conflict do nothing;

-- ---------- RO WATER QUALITY THRESHOLDS ----------
-- KPI spec (TCCH-SPU-PROC-015): conductivity, TDS and microbial count each
-- get their own compliance rate. Leave microbial_max blank until you've
-- confirmed the number against your RO system's validated spec sheet or
-- ---------- RO PARAMETERS (admin-configurable catalog) ----------
-- Conductivity/TDS/pH are the always-on defaults; everything else
-- (Hardness, Chlorides, Silicates, Bacteria/HPC, Endotoxins — per
-- ANSI/AAMI ST108:2023 / ISO 15883) is seeded but INACTIVE — activated
-- on a need-to-basis by a superuser in Admin, not shown on the entry
-- form until then. New parameters can be added the same way later.
create table if not exists ro_parameters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text,
  limit_min numeric,
  limit_max numeric,
  -- Some limits are conditional/compound (e.g. Conductivity differs by
  -- steam vs washer-rinse use) and don't reduce to one clean min/max —
  -- this carries the full reference text; limit_min/max drive the
  -- automatic pass/fail flag, reference_note is shown alongside for context.
  reference_note text,
  standard_reference text,
  active boolean not null default true,
  sort_order int not null default 0,
  -- Per-parameter expected testing cadence — fully superuser-editable in
  -- Admin, nothing about frequency is hardcoded in app logic. AAMI ST108
  -- Annex G specifies different real-world cadences per parameter
  -- (conductivity daily, pH/hardness/alkalinity quarterly, HPC/endotoxin
  -- monthly) — seeded accordingly below, but every value here is just a
  -- starting point, adjust freely to match actual department practice.
  schedule_frequency text not null default 'daily' check (schedule_frequency in ('daily','weekly','monthly','quarterly')),
  schedule_day text check (schedule_day in ('Monday','Tuesday','Wednesday','Thursday','Friday')),  -- only used when weekly
  created_at timestamptz not null default now()
);
insert into ro_parameters (name, unit, limit_min, limit_max, reference_note, standard_reference, active, sort_order, schedule_frequency) values
  ('Conductivity', 'µS/cm', null, 5, '< 5 µS/cm (Steam / High Purity), < 30 µS/cm (Washer Rinse) — using the stricter Steam/High Purity limit', 'ANSI/AAMI ST108 / ISO 15883', true, 1, 'daily'),
  ('TDS', 'ppm', null, 10, null, null, true, 2, 'daily'),
  ('pH', null, 5.0, 7.5, null, 'ANSI/AAMI ST108 / ISO 15883', true, 3, 'quarterly'),
  ('Hardness', 'mg/L', null, 2, null, 'ANSI/AAMI ST108 / ISO 15883', false, 4, 'quarterly'),
  ('Chlorides', 'mg/L', null, 0.5, null, 'ANSI/AAMI ST108 / ISO 15883', false, 5, 'quarterly'),
  ('Silicates', 'mg/L', null, 1.0, null, 'ANSI/AAMI ST108 / ISO 15883', false, 6, 'quarterly'),
  ('Bacteria (HPC)', 'CFU/mL', null, 10, null, 'ANSI/AAMI ST108 / ISO 15883', false, 7, 'monthly'),
  ('Endotoxins', 'EU/mL', null, 0.25, null, 'ANSI/AAMI ST108 / ISO 15883', false, 8, 'monthly')
on conflict do nothing;

-- ---------- RO TESTERS (the testing device/kit used — a catalog, not
-- free text, so the same device is recorded consistently and this data
-- can actually be studied over time) ----------
create table if not exists ro_testers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text,
  make text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- RO WATER QUALITY LOG ----------
-- readings is an array of whichever ro_parameters the staff member
-- actually recorded that visit — not every active parameter needs a
-- value every time (e.g. Bacteria/HPC might be monthly while
-- Conductivity is daily). Each entry: {parameter_id, name, unit, value, pass}.
create table if not exists ro_water_quality (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  log_time time not null default current_time,
  tester_id uuid references ro_testers(id),
  tester_name text,
  readings jsonb not null default '[]',
  remarks text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ro_date on ro_water_quality (log_date);

-- ---------- MACHINES (autoclaves AND the RO system share one list) ----------
create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null unique,
  label text,
  machine_type text not null default 'autoclave' check (machine_type in ('autoclave','ro','flash_sterilizer','facility_equipment')),
  scheduled_hours_per_day numeric not null default 24,
  -- Which QA tests this machine is configured for (the Sterilizer QA Testing
  -- Log only offers tests present here). Not every sterilizer is pre-vacuum,
  -- so Bowie-Dick may not apply to all of them — this default is just a safe
  -- starting point; confirm/adjust per real machine in Admin. RO-01 is seeded
  -- with '{}' below since it isn't a sterilizer.
  applicable_tests text[] not null default '{Bowie-Dick,BI,Dummy}',
  -- Which weekday QA testing is expected on this machine (autoclave/flash
  -- sterilizer only) — superuser-editable in Admin. Default Monday for
  -- every machine as a starting point; adjust per machine as needed.
  qa_schedule_day text check (qa_schedule_day in ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- EQUIPMENT DOWNTIME (autoclaves + RO system) ----------
create table if not exists equipment_downtime (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null,
  machine_type text not null default 'autoclave',
  downtime_reason text,     -- captured at intake — free-text-capable via 'Other'
  time_broken timestamptz not null,
  time_reported timestamptz not null,
  time_biomed_response timestamptz,
  time_up timestamptz,
  root_cause_category text check (root_cause_category in ('Mechanical Failure','BI/CI Failure - Quarantine','Scheduled PM Overrun','Other')),
  remarks text,
  reported_by text,
  status text not null default 'Open' check (status in ('Open','Resolved')),
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_equipment_downtime_time_broken on equipment_downtime (time_broken);

-- ---------- BRUSHES (master list — registration generates the ID) ----------
create table if not exists brushes (
  id uuid primary key default gen_random_uuid(),
  brush_id text not null unique,
  type text,
  date_first_used date not null default current_date,
  active boolean not null default true,
  registered_by text,
  created_at timestamptz not null default now()
);

-- ---------- CLEANING BRUSH LOG ----------
create table if not exists brush_logs (
  id uuid primary key default gen_random_uuid(),
  brush_id text not null,
  log_date date not null default current_date,
  cleaned_inspected boolean not null default true,
  condition text not null check (condition in ('Good','Worn','Damaged')),
  replaced boolean not null default false,
  remarks text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_brush_logs_date on brush_logs (log_date);

-- ---------- STERILIZATION CYCLE LOG ----------
-- One row per cycle. Logged in two passes, mirroring how the floor
-- actually works: start the cycle and record parameters/load contents
-- immediately, then come back and close it out once the cycle,
-- flush, dry, and cooldown are done.
--
-- Regular autoclaves (AC-01/02/03) use boil/jacket/chamber pressure,
-- temperature set point, and exposure time. The flash sterilizer
-- (FS-01) additionally tracks immediate-use-vs-storage disposition,
-- and for immediate use: patient/procedure/surgeon/OR/reason, since
-- flash cycles are usually an urgent single-instrument response.
create table if not exists sterilization_cycles (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null,
  machine_type text not null default 'autoclave',
  cycle_number text,
  includes_implants boolean not null default false,  -- policy: implant loads must be accompanied by a BI test (bi_reason='Implant Load Test')

  -- Start
  operator_start text not null,
  time_start timestamptz not null,
  cycle_type text,                    -- flash sterilizer: Unwrapped Non-Porous / Unwrapped Porous / Terminal-Wrapped
  boil_pressure text,
  jacket_pressure text,
  chamber_pressure text,
  temperature_set_point text,         -- 121°C/132°C/138°C for autoclaves, 121°C/132°C/135°C for the flash sterilizer
  exposure_time_minutes text,         -- 4/15/20/25/30/45 minutes
  load_contents text[],               -- up to 20 free-text items, packs/individual items listed separately

  -- End
  status text not null default 'In Progress' check (status in ('In Progress','Completed')),
  operator_end text,
  time_end timestamptz,
  time_knob_to_flush timestamptz,
  chemical_indicator_result text check (chemical_indicator_result in ('Pass','Fail','Unavailable')),
  time_knob_to_drying timestamptz,
  time_knob_off_hatch_open timestamptz,
  cooldown_start timestamptz,
  cooldown_end timestamptz,
  class1_tape_changed boolean,        -- "did all autoclave tapes change to dark stripes in all packs applied?"

  -- Flash sterilizer (FS-01) only
  usage_disposition text check (usage_disposition in ('For Storage','For Immediate Use')),
  patient_number text,
  procedure_name text,
  surgeon text,
  operating_room text,
  flash_reason text[],                -- Dropped/Critical Instrument, Additional Unanticipated Need, Set Incomplete, Other
  time_delivered_to_sterile_field timestamptz,
  received_by text,
  storage_end_time timestamptz,       -- 'For Storage' disposition only

  remarks text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cycles_machine_time on sterilization_cycles (machine_id, time_start);
create index if not exists idx_cycles_status on sterilization_cycles (status);

-- ---------- STERILIZER QA TESTING LOG (v2 — per-machine cards) ----------
-- Per AAMI/ANSI ST79. Bowie-Dick, BI, and Dummy/CI are three fully
-- independent tests now (not one flexible "test session" row) — each
-- has its own card in the UI with its own Save. Bowie-Dick and Dummy
-- are single-entry (status is set to 'Completed' the moment they're
-- saved). BI is genuinely two-stage: "Initiate Test" inserts the row
-- with status='Incubating'; once the expected incubation window has
-- passed, "Log Result" on that same row captures the outcome and
-- flips status to 'Completed'. This replaces the old single-row
-- "Weekly Complete Test" composite — doing all three tests on a
-- machine in one session now just means saving all three cards.
create table if not exists sterilizer_qa_tests (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null,
  -- Set only when this BI test was initiated inline from an implant-load
  -- cycle in the Cycle Log, rather than from the QA Testing page directly.
  -- Lets a completed cycle keep tracking "BI verification pending" against
  -- this exact test, not just "some BI test for this machine somewhere".
  cycle_id uuid references sterilization_cycles(id),
  date_of_test date not null default current_date,
  time_of_test time not null default current_time,
  operator text not null,
  test_type text not null check (test_type in ('Bowie-Dick','BI','Dummy')),
  status text not null default 'Completed' check (status in ('Incubating','Completed')),

  -- Bowie-Dick
  bd_temperature text,
  bd_exposure_time text,
  bd_drying_time text,
  bd_serial_lot text,
  bd_result text check (bd_result in ('Pass','Fail')),
  bd_fail_action text[],           -- multi-select: steps taken can overlap
  bd_fail_action_other text,
  bd_remarks text,

  -- BI — stage 1: Initiate Test
  -- bi_type matters clinically: different BI products read in genuinely
  -- different windows. The 1-hour Preliminary Read only applies to the
  -- 24-hour type — a rapid BI's "final" read basically is its only read.
  bi_type text check (bi_type in ('Minutes Result','4-6 Hours Result','24 Hours Result')),
  bi_reason text check (bi_reason in ('Routine Scheduled Test','Implant Load Test','After Sterilizer Repair','Other')),
  bi_incubation_date date,
  bi_time_in_incubator time,
  bi_serial_lot text,
  bi_chamber_location text,
  bi_expected_incubation_hours text,  -- set at Initiate (type-informed default, still editable), drives the due/overdue indicator

  -- BI — optional 1-hour Preliminary Read (24-hour type only)
  bi_prelim_result text check (bi_prelim_result in ('Preliminary PASS - No color change','Preliminary FAIL - Color change')),
  bi_prelim_read_at timestamptz,

  -- BI — stage 2: Log Result (filled in once the incubation window has passed)
  bi_time_out_incubator time,
  bi_test_vial_result text check (bi_test_vial_result in ('Positive Growth','Negative Growth')),
  bi_control_result text check (bi_control_result in ('Positive Growth','Negative Growth')),
  bi_final_result text check (bi_final_result in ('FINAL PASS','FINAL FAIL','Other')),
  bi_fail_action text[],
  bi_fail_action_other text,
  bi_remarks text,
  bi_early_read boolean not null default false,  -- true if logged before the full incubation window lapsed (24-hour type override)

  -- Dummy/CI — Level 1 tape (equipment validation, matches the real form's
  -- Pass/Fail/Unavailable) AND a chemical indicator sandwiched inside the
  -- same challenge pack (sterility-relevant), tracked as two separate
  -- results per backlog item #4.
  dummy_result text check (dummy_result in ('Pass','Fail','Unavailable')),
  dummy_ci_result text check (dummy_ci_result in ('Pass','Fail')),
  dummy_fail_action text[],
  dummy_fail_action_other text,
  dummy_remarks text,

  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_qa_tests_machine_date on sterilizer_qa_tests (machine_id, date_of_test);
create index if not exists idx_qa_tests_incubating on sterilizer_qa_tests (test_type, status) where test_type = 'BI' and status = 'Incubating';

-- ---------- INSTRUMENT MAINTENANCE LOG ----------
create table if not exists instrument_maintenance (
  id uuid primary key default gen_random_uuid(),
  -- Out/Returned lifecycle — matches Equipment Downtime/Cycle Log/Handover's
  -- pattern. Was previously a flat "action" field mixing sending-out and
  -- returning options as separate, unlinked rows — that made turnaround
  -- time uncomputable and put "Finished X" in the same picker as "For X"
  -- on the entry form. Now it's one row per trip: action_out captures why
  -- it left, status/returned_at/returned_by track the return against that
  -- same row.
  action_out text not null check (action_out in (
    'For Physical / Functional Repair','For Rust Removal Soaking','For Ultrasonic Cleaning','For Lubrication','Other'
  )),
  status text not null default 'Out' check (status in ('Out','Returned')),
  returned_at timestamptz,
  returned_by_id uuid references staff(id),
  returned_by_name text,
  return_notes text,
  -- 'individual': one instrument (instrument_name required).
  -- 'set': a whole set/tray at once (set_tray_name + item_count required
  -- instead) — backlog item #5. Remarks stays a single field either way.
  entry_mode text not null default 'individual' check (entry_mode in ('individual','set')),
  instrument_name text,
  serial_lot_number text,
  from_tray_set boolean not null default false,
  tray_case_number text,
  set_tray_name text,
  item_count integer,
  remarks text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now(),
  constraint instrument_maintenance_mode_fields check (
    (entry_mode = 'individual' and instrument_name is not null) or
    (entry_mode = 'set' and set_tray_name is not null and item_count is not null)
  )
);
create index if not exists idx_instrument_maint_date on instrument_maintenance (created_at);

-- ---------- SCHEDULE EXCEPTIONS (holidays, December break, maintenance, closures) ----------
-- Superuser-managed. Any date range in here is excluded from missed-log
-- detection and from KPI denominators — CSSD doesn't operate weekends,
-- and these are the non-weekend exceptions on top of that.
create table if not exists schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_type text not null check (exception_type in ('Holiday','December Break','Maintenance','Quarantine Closure','Other')),
  date_from date not null,
  date_to date not null,
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint valid_range check (date_to >= date_from)
);
create index if not exists idx_exceptions_range on schedule_exceptions (date_from, date_to);

-- ---------- INSTRUMENT HANDOVER (7th logbook — merges the old separate
-- Releasing/Receiving Google Forms into one two-stage record) ----------
-- A department sends items to CSSD for sterilization (Intake, status=
-- 'Processing'); once sterilized and packed, CSSD marks it Released.
-- Same open/resolve pattern as equipment_downtime and sterilization_cycles.
-- No photo proof and no per-department blocking-while-open by design —
-- a department can legitimately send several batches in one day.
-- ---------- CSSD HOUSEKEEPING LOG (9th logbook) ----------
-- A real checklist form — task groups with a 3-state status per item
-- (Cleaned/Done, Not Cleaned/Not Done, N/A), stored as JSONB arrays
-- rather than one column per task (matches the RO readings pattern —
-- keeps the schema stable if a task list ever needs a tweak). Terminal
-- Cleaning is a conditional deeper section, only required when that
-- disposition is chosen. No photo evidence — by request, this app has
-- no file-upload infrastructure and that was deliberately descoped.
create table if not exists housekeeping_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  cleaning_type text not null check (cleaning_type in (
    'Daily/Routine Cleaning','Terminal Cleaning','Between Cases',
    'Floor Scrubbing only','Floor Scrubbing with Routine Cleaning','Floor Scrubbing with Terminal Cleaning',
    'After Maintenance Repairs','After Major Repairs','Other'
  )),
  cleaning_type_other text,
  tasks jsonb not null default '[]',                    -- [{item, status}] — hand hygiene through floor mopped
  sterilization_equipment jsonb not null default '[]',   -- [{item, status}]
  post_cleaning_tasks jsonb not null default '[]',       -- [{item, status}]
  has_terminal_cleaning boolean not null default false,
  terminal_cleaning_tasks jsonb,                         -- [{item, status}], only when has_terminal_cleaning
  terminal_cleaning_completed_by text,                   -- housekeeping staff name — not a CSSD staff account
  inspected_by text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_housekeeping_date on housekeeping_logs (log_date);

-- ---------- TEMPERATURE & HUMIDITY LOG (8th logbook) ----------
-- Two fixed CSSD storage areas, seeded with the international standard
-- range (20-24°C, 20-60% RH). A small catalog table (not a full
-- RO-Parameters-style system) since this only needs two areas —
-- still admin-addable if a third area is ever needed.
create table if not exists temp_humidity_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  temp_min numeric not null default 20,
  temp_max numeric not null default 24,
  humidity_min numeric not null default 20,
  humidity_max numeric not null default 60,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into temp_humidity_locations (name, sort_order) values
  ('Disinfection / Packing / Autoclave Area', 1),
  ('Sterile Instrument / Packs Storage', 2)
on conflict do nothing;

create table if not exists temp_humidity_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references temp_humidity_locations(id),
  location_name text not null,
  log_date date not null default current_date,
  log_time time not null default current_time,
  temperature_c numeric not null,
  humidity_pct numeric not null,
  temp_pass boolean not null,
  humidity_pass boolean not null,
  remarks text,
  time_reported_abnormality timestamptz,   -- only relevant when temp_pass/humidity_pass is false
  abnormality_action text[],               -- multi-select: steps taken can overlap
  abnormality_action_other text,
  staff_id uuid references staff(id),
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_temp_humidity_date on temp_humidity_logs (log_date);

create table if not exists instrument_handovers (
  id uuid primary key default gen_random_uuid(),
  department text not null check (department in ('ER','OPD','OR','WARD 2nd Floor','WARD 3rd Floor','Other')),
  submitted_by_name text,             -- external department staff's name, typed at the public portal — not a CSSD staff account
  department_other text,
  load_contents text,
  status text not null default 'Processing' check (status in ('Processing','Released')),
  received_by_id uuid references staff(id),
  received_by_name text,
  received_at timestamptz not null default now(),
  released_by_id uuid references staff(id),
  released_by_name text,
  released_at timestamptz,
  remarks text,
  created_at timestamptz not null default now()
);
create index if not exists idx_handovers_status on instrument_handovers (status);

-- ---------- PENDING EXCEPTIONS (approval queue — backlog item #6/#13 approval workflow) ----------
-- Any logged-in user can request a Closure/Exception via the retrospective
-- popup; a non-superuser's request lands here instead of the live
-- schedule_exceptions table until a superuser approves it (moves it over)
-- or declines it (deletes it). A superuser's own request skips this
-- queue entirely and goes straight to schedule_exceptions.
create table if not exists pending_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_type text not null check (exception_type in ('Holiday','December Break','Maintenance','Quarantine Closure','Other')),
  date_from date not null,
  date_to date not null,
  reason text,
  requested_by text not null,
  requested_by_id uuid references staff(id),
  created_at timestamptz not null default now(),
  constraint pending_valid_range check (date_to >= date_from)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- No Supabase Auth login is used (PIN check happens in-app), so
-- RLS is enabled with open policies scoped to this app's tables.
-- Do not reuse this project's anon key for anything else.
-- ============================================================
alter table staff enable row level security;
alter table app_meta enable row level security;
alter table logbook_assignments enable row level security;
alter table ro_parameters enable row level security;
alter table ro_testers enable row level security;
alter table ro_water_quality enable row level security;
alter table machines enable row level security;
alter table equipment_downtime enable row level security;
alter table brushes enable row level security;
alter table brush_logs enable row level security;
alter table sterilization_cycles enable row level security;
alter table sterilizer_qa_tests enable row level security;
alter table instrument_maintenance enable row level security;
alter table housekeeping_logs enable row level security;
alter table temp_humidity_locations enable row level security;
alter table temp_humidity_logs enable row level security;
alter table instrument_handovers enable row level security;
alter table schedule_exceptions enable row level security;
alter table pending_exceptions enable row level security;

create policy "allow all - staff" on staff for all using (true) with check (true);
create policy "allow all - app_meta" on app_meta for all using (true) with check (true);
create policy "allow all - logbook_assignments" on logbook_assignments for all using (true) with check (true);
create policy "allow all - ro_parameters" on ro_parameters for all using (true) with check (true);
create policy "allow all - ro_testers" on ro_testers for all using (true) with check (true);
create policy "allow all - ro_water_quality" on ro_water_quality for all using (true) with check (true);
create policy "allow all - machines" on machines for all using (true) with check (true);
create policy "allow all - equipment_downtime" on equipment_downtime for all using (true) with check (true);
create policy "allow all - brushes" on brushes for all using (true) with check (true);
create policy "allow all - brush_logs" on brush_logs for all using (true) with check (true);
create policy "allow all - sterilization_cycles" on sterilization_cycles for all using (true) with check (true);
create policy "allow all - sterilizer_qa_tests" on sterilizer_qa_tests for all using (true) with check (true);
create policy "allow all - instrument_maintenance" on instrument_maintenance for all using (true) with check (true);
create policy "allow all - housekeeping_logs" on housekeeping_logs for all using (true) with check (true);
create policy "allow all - temp_humidity_locations" on temp_humidity_locations for all using (true) with check (true);
create policy "allow all - temp_humidity_logs" on temp_humidity_logs for all using (true) with check (true);
create policy "allow all - instrument_handovers" on instrument_handovers for all using (true) with check (true);
create policy "allow all - schedule_exceptions" on schedule_exceptions for all using (true) with check (true);
create policy "allow all - pending_exceptions" on pending_exceptions for all using (true) with check (true);

-- ============================================================
-- SEED: your actual team
-- Everyone starts on the default PIN (0000, unchanged) — each person
-- personalizes their own PIN and security questions the first time
-- they log in, per the flow above.
-- ============================================================
insert into staff (name, pin, pin_changed, role, job_title, shift_start, shift_end) values
  ('Ralp',            '0000', false, 'superuser', 'Operating Room Nurse Manager',        null,     null),
  ('DX',              '0000', false, 'superuser', 'Clinical Support Services Manager',   null,     null),
  ('Anthony Canales', '0000', false, 'superuser', 'CSSD Coordinator',                    '07:00',  '15:00'),
  ('Joshua Mabilang', '0000', false, 'user',      'SPD Tech',                            '09:00',  '17:00'),
  ('John Guiapar',    '0000', false, 'user',      'SPD Tech',                            '09:00',  '17:00')
on conflict do nothing;

-- Default logbook assignees per the described roles: Anthony handles
-- RO, autoclave downtime, and QA testing by default (anyone can still
-- log an entry); cycle logs, brush logs, and instrument maintenance
-- are shared across everyone (no single default assignee).
insert into logbook_assignments (logbook, staff_id)
  select 'ro', id from staff where name = 'Anthony Canales'
  on conflict (logbook) do update set staff_id = excluded.staff_id;
insert into logbook_assignments (logbook, staff_id)
  select 'equipment', id from staff where name = 'Anthony Canales'
  on conflict (logbook) do update set staff_id = excluded.staff_id;
insert into logbook_assignments (logbook, staff_id)
  select 'qa', id from staff where name = 'Anthony Canales'
  on conflict (logbook) do update set staff_id = excluded.staff_id;

insert into machines (machine_id, label, machine_type, scheduled_hours_per_day, applicable_tests, qa_schedule_day) values
  ('AC-01', '250L Autoclave #1', 'autoclave', 24, '{BI,Dummy}', 'Monday'),
  ('AC-02', '250L Autoclave #2', 'autoclave', 24, '{BI,Dummy}', 'Monday'),
  ('AC-03', '24L Tabletop Autoclave', 'autoclave', 24, '{BI,Dummy}', 'Monday'),
  ('FS-01', 'Statim 5000 Flash Sterilizer', 'flash_sterilizer', 24, '{BI,Dummy}', 'Monday'),
  ('RO-01', 'CSSD RO Water System', 'ro', 24, '{}', null),
  ('AIRCON-01', 'Aircon Unit #1 (Autoclave Area)', 'facility_equipment', 24, '{}', null),
  ('AIRCON-02', 'Aircon Unit #2 (Sterile Instrument/Packs Storage)', 'facility_equipment', 24, '{}', null),
  ('US-01', 'Ultrasonic Machine', 'facility_equipment', 24, '{}', null),
  ('BI-INC-01', 'BI Incubator', 'facility_equipment', 24, '{}', null),
  ('SEALER-M-01', 'Sealer Pouch Machine (Manual)', 'facility_equipment', 24, '{}', null),
  ('SEALER-C-01', 'Sealer Pouch Machine (Conveyor)', 'facility_equipment', 24, '{}', null),
  ('PUMP-01', 'Water Pump', 'facility_equipment', 24, '{}', null),
  ('TANK-01', 'Water Tank', 'facility_equipment', 24, '{}', null)
on conflict do nothing;
