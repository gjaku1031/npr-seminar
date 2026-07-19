begin;

alter table sheet_mappings
  alter column schema_version set default 4;

-- V4 adds the family-grain 예약집계 projection and append-only event 로그.
-- Every affected mapping remains disabled until the explicit prepare command
-- creates/validates the workbook tabs and their protected marker columns.
-- Deliveries and attempt history are intentionally left untouched.
update sheet_mappings
   set reservation_sheet_title='예약명단',
       reservation_sheet_id=1777564107,
       schema_fingerprint='ffb044e3773f51b25797d9dd79fc507b42900f0d49a19f768daba1f86bc2e522',
       schema_version=4,
       enabled=false,
       circuit_status='BLOCKED',
       block_reason_code='GOOGLE_SHEETS_V4_PREPARE_REQUIRED',
       last_validated_at=null,
       dispatch_lease_owner=null,
       dispatch_lease_expires_at=null,
       updated_at=now()
 where schema_version<>4
    or schema_fingerprint<>'ffb044e3773f51b25797d9dd79fc507b42900f0d49a19f768daba1f86bc2e522'
    or reservation_sheet_title<>'예약명단'
    or reservation_sheet_id<>1777564107
    or enabled=true;

commit;
