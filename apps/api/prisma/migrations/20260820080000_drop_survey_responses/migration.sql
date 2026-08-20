-- 만족도 설문 기능을 걷어낸다.
--
-- 쓰기로 했다가 쓰지 않기로 정해진 기능이다. 화면·API·계약을 모두 지웠으므로 이 표만
-- 남으면 다음 사람이 "왜 있지"를 다시 조사하게 된다.
--
-- 운영 데이터가 0건인 것을 확인하고 지운다. 응답이 하나라도 있었다면 표를 남기고 코드만
-- 지웠을 것이다 — 지운 코드는 되살릴 수 있지만 지운 응답은 되살릴 수 없다.
do $$
declare remaining bigint;
begin
  select count(*) into remaining from survey_responses;
  if remaining > 0 then
    raise exception 'survey_responses still holds % rows; refusing to drop', remaining;
  end if;
end $$;

drop table if exists survey_responses;
