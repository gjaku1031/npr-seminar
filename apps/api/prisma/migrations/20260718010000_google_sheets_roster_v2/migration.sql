alter table sheet_mappings
  alter column schema_version set default 2;

-- Existing mappings must be explicitly prepared and re-enabled against the single-tab v2 workbook.
-- Deliveries are intentionally left untouched so pending/retry work resumes after activation.
update sheet_mappings
   set reservation_sheet_title='예약명단',
       reservation_sheet_id=1777564107,
       schema_fingerprint='416dd80e01708970c9c5fb2293da9caab29bf4f009c1a959dcfff53ce08e6de4',
       schema_version=2,
       enabled=false,
       circuit_status='BLOCKED',
       block_reason_code='GOOGLE_SHEETS_V2_PREPARE_REQUIRED',
       last_validated_at=null,
       dispatch_lease_owner=null,
       dispatch_lease_expires_at=null,
       updated_at=now()
 where schema_version<>2
    or schema_fingerprint<>'416dd80e01708970c9c5fb2293da9caab29bf4f009c1a959dcfff53ce08e6de4'
    or reservation_sheet_title<>'예약명단'
    or reservation_sheet_id<>1777564107;
