alter table sheet_mappings
  alter column schema_version set default 3;

-- Existing non-v3 mappings must be prepared and explicitly re-enabled.
-- Deliveries and attempt history are intentionally left untouched.
update sheet_mappings
   set reservation_sheet_title='예약명단',
       reservation_sheet_id=1777564107,
       schema_fingerprint='1428b95585de0ca4734d1fadab8ae141f6f7e8c2f371e4c6f3aad1ddece7751d',
       schema_version=3,
       enabled=false,
       circuit_status='BLOCKED',
       block_reason_code='GOOGLE_SHEETS_V3_PREPARE_REQUIRED',
       last_validated_at=null,
       dispatch_lease_owner=null,
       dispatch_lease_expires_at=null,
       updated_at=now()
 where schema_version<>3
    or schema_fingerprint<>'1428b95585de0ca4734d1fadab8ae141f6f7e8c2f371e4c6f3aad1ddece7751d'
    or reservation_sheet_title<>'예약명단'
    or reservation_sheet_id<>1777564107;
