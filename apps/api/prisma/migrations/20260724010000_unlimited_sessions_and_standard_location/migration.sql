-- Standardize every historical/current Traffic Center venue spelling.
update seminar_sessions
   set place='서울시 교통회관 (올림픽로 319)',
       updated_at=now(),
       version=version+1
 where place like '%교통회관%'
   and place <> '서울시 교통회관 (올림픽로 319)';
