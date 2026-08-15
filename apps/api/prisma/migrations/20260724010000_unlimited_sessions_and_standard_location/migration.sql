-- Standardize every historical/current Traffic Center venue spelling.
update seminar_sessions
   set place='서울시 예시회관 (예시로 100)',
       updated_at=now(),
       version=version+1
 where place like '%예시회관%'
   and place <> '서울시 예시회관 (예시로 100)';
