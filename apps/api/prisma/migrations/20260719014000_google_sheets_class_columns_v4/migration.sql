begin;

-- The 예약명단 visible projection now carries separate current 수학반 and
-- 과학반 columns (A:M). Existing workbooks must be explicitly prepared with
-- the new header before writes resume; no production workbook is mutated by a
-- database migration.
update sheet_mappings
   set schema_fingerprint='a89087d355e8b9e1cd1039fabc1fa715d8473ebf08ed55f164a844f437b789be',
       schema_version=4,
       enabled=false,
       circuit_status='BLOCKED',
       block_reason_code='GOOGLE_SHEETS_V4_CLASS_COLUMNS_PREPARE_REQUIRED',
       last_validated_at=null,
       dispatch_lease_owner=null,
       dispatch_lease_expires_at=null,
       updated_at=now()
 where schema_version<>4
    or schema_fingerprint<>'a89087d355e8b9e1cd1039fabc1fa715d8473ebf08ed55f164a844f437b789be'
    or enabled=true;

commit;
