-- ============================================================
-- Migration: BI type + Preliminary Read, multi-select fail actions
-- for all three QA tests, corrected Dummy tape wording.
--
-- This changes bd_fail_action/bi_fail_action from text to text[], and
-- changes dummy_result's allowed values — both are column-type/constraint
-- changes, not purely additive. Per the app's pre-launch status
-- confirmed earlier in this build, this migration drops and re-adds
-- those specific columns rather than attempting an in-place data
-- conversion. If you've since started logging real QA data, stop and
-- ask for a data-preserving version instead of running this.
-- ============================================================

-- New BI fields
alter table sterilizer_qa_tests add column if not exists bi_type text check (bi_type in ('Minutes Result','4-6 Hours Result','24 Hours Result'));
alter table sterilizer_qa_tests add column if not exists bi_prelim_result text check (bi_prelim_result in ('Preliminary PASS - No color change','Preliminary FAIL - Color change'));
alter table sterilizer_qa_tests add column if not exists bi_prelim_read_at timestamptz;

-- Fail-action fields become multi-select (text[]) across all three tests
alter table sterilizer_qa_tests drop column if exists bd_fail_action;
alter table sterilizer_qa_tests add column bd_fail_action text[];
alter table sterilizer_qa_tests add column if not exists bd_fail_action_other text;

alter table sterilizer_qa_tests drop column if exists bi_fail_action;
alter table sterilizer_qa_tests add column bi_fail_action text[];
alter table sterilizer_qa_tests add column if not exists bi_fail_action_other text;

alter table sterilizer_qa_tests add column if not exists dummy_fail_action text[];
alter table sterilizer_qa_tests add column if not exists dummy_fail_action_other text;
alter table sterilizer_qa_tests add column if not exists dummy_remarks text;

-- Dummy tape result: was 'Checked & Changed'/'Invalid / Not Changed',
-- now matches the real form's Pass/Fail/Unavailable.
alter table sterilizer_qa_tests drop constraint if exists sterilizer_qa_tests_dummy_result_check;
update sterilizer_qa_tests set dummy_result = null where dummy_result is not null; -- old values don't map cleanly; pre-launch, safe to clear
alter table sterilizer_qa_tests add constraint sterilizer_qa_tests_dummy_result_check check (dummy_result in ('Pass','Fail','Unavailable'));
