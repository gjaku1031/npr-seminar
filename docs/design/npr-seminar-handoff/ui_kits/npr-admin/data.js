/* npr 입시설명회 시드 데이터 — v3 (캠퍼스·단위·학번·모/부 연락처·담임·로그·스캐너) */
(function () {
  const CAMPUSES = ['송파캠퍼스', '위례캠퍼스', '광진캠퍼스'];
  /* 캠퍼스별 발신번호·문의전화 */
  const CAMPUS_INFO = {
    '송파캠퍼스': { sender: '02-413-2652', inquiry: '02-413-2652' },
    '위례캠퍼스': { sender: '02-425-2652', inquiry: '02-425-2652' },
    '광진캠퍼스': { sender: '02-422-2652', inquiry: '02-422-2652' },
  };

  /* 단위 판별 — 반명 접두 규칙 (운영 엑셀 수식과 동일한 IF 순서) */
  function unitOf(cn) {
    if (!cn || cn === '비재원생') return '';
    const s = (p) => cn.indexOf(p) === 0;
    if (s('과초6') || s('과고1') || s('과고2') || s('과고3') || s('과예중1') || s('과예고1') || s('과1') || s('과2') || s('과3')) return '과학';
    if (s('예고1')) return '예고1';
    if (s('예1S') || s('예1영')) return '특목';
    if (s('예1')) return '예중1';
    if (s('초6') || s('초5')) return '특목';
    if (s('중1') || s('중2') || s('중3')) return '특목';
    if (s('초3')) return '초등';
    if (cn[0] === '4' || cn[0] === '5' || cn[0] === '6') return '초등';
    if (s('고1') || s('고2') || s('고3')) return '고등';
    if (cn[0] === '1') return '중등1';
    if (cn[0] === '2') return '중등2';
    if (cn[0] === '3') return '중등3';
    return '';
  }
  /* 단위 탭 → 단위 값 매칭 (특목 탭은 예중1·예고1 포함) */
  const UNIT_TABS = ['전체', '초등', '중1', '중2', '중3', '특목', '고등', '과학'];
  function unitMatchesTab(unit, tab) {
    if (tab === '전체') return true;
    if (tab === '중1') return unit === '중등1';
    if (tab === '중2') return unit === '중등2';
    if (tab === '중3') return unit === '중등3';
    if (tab === '특목') return unit === '특목' || unit === '예중1' || unit === '예고1';
    return unit === tab;
  }

  const teachers = [
    { id: 't1', name: '김민서' }, { id: 't2', name: '박준영' }, { id: 't3', name: '이도현' },
    { id: 't4', name: '한지원' }, { id: 't5', name: '오세라' }, { id: 't6', name: '남기태' },
  ];
  const tn = (id) => (teachers.find((t) => t.id === id) || {}).name || '';

  /* 반: 이름 규칙이 단위를 결정 */
  const classes = [
    { id: 'c1', name: '고1A', teacherId: 't1', campus: '송파캠퍼스' },
    { id: 'c2', name: '고2A', teacherId: 't1', campus: '송파캠퍼스' },
    { id: 'c3', name: '1A', teacherId: 't2', campus: '송파캠퍼스' },
    { id: 'c4', name: '2A', teacherId: 't2', campus: '송파캠퍼스' },
    { id: 'c5', name: '초3A', teacherId: 't3', campus: '송파캠퍼스' },
    { id: 'c6', name: '4A', teacherId: 't3', campus: '송파캠퍼스' },
    { id: 'c7', name: '중1S', teacherId: 't4', campus: '송파캠퍼스' },
    { id: 'c8', name: '과고1A', teacherId: 't4', campus: '송파캠퍼스' },
    { id: 'c9', name: '고1B', teacherId: 't5', campus: '위례캠퍼스' },
    { id: 'c10', name: '3B', teacherId: 't5', campus: '위례캠퍼스' },
    { id: 'c11', name: '5B', teacherId: 't6', campus: '위례캠퍼스' },
    { id: 'c12', name: '중2S', teacherId: 't6', campus: '위례캠퍼스' },
    { id: 'c13', name: '과1B', teacherId: 't5', campus: '위례캠퍼스' },
    { id: 'c14', name: '고3C', teacherId: 't6', campus: '광진캠퍼스' },
    { id: 'c15', name: '2C', teacherId: 't4', campus: '광진캠퍼스' },
    { id: 'c16', name: '6C', teacherId: 't2', campus: '광진캠퍼스' },
    { id: 'c17', name: '초6T', teacherId: 't3', campus: '광진캠퍼스' },
    { id: 'c18', name: '과2C', teacherId: 't1', campus: '광진캠퍼스' },
  ].map((c) => ({ ...c, teacherName: tn(c.teacherId), unit: unitOf(c.name) }));

  /* 재원생 30명 — 학번·모/부 연락처·캠퍼스·담임 */
  const NAMES = ['김수민', '이서연', '박도윤', '최지우', '정하은', '강민준', '조은우', '윤서아', '임시우', '한예린', '오지호', '서다인', '신재이', '권보라', '황민재', '송지안', '전유나', '홍성민', '문채원', '양준서', '배소율', '백현우', '남주하', '심규진', '노아인', '하태양', '구슬비', '변지훈', '설아라', '추민성'];
  const SCHOOLS = { 고: ['한빛고', '송파고', '위례고', '광진고'], 중: ['가람중', '미림중', '위례중', '자양중'], 초: ['가람초', '한솔초', '위례초', '광남초'] };
  const gradeOf = (cn) => { const u = unitOf(cn); if (u === '고등' || u === '과학' && cn.indexOf('과고') === 0) return '고' + (cn.match(/\d/) || ['1'])[0]; if (u === '초등' || u === '특목' && cn.indexOf('초') === 0) return '초' + (cn.match(/\d/) || ['4'])[0]; return '중' + (cn.match(/\d/) || ['1'])[0]; };
  const students = NAMES.map((name, i) => {
    const cls = classes[i % classes.length];
    const grade = gradeOf(cls.name);
    const pool = SCHOOLS[grade[0]] || SCHOOLS['중'];
    return {
      id: 'stu' + (i + 1),
      no: String(240101 + i * 7),
      name,
      school: pool[i % pool.length],
      grade,
      classId: cls.id, className: cls.name, teacherName: cls.teacherName, campus: cls.campus, unit: cls.unit,
      motherPhone: `010-${3200 + i * 13}-${6100 + i * 11}`,
      fatherPhone: `010-${5100 + i * 17}-${2200 + i * 9}`,
    };
  });

  const sessions = [
    {
      id: 'ss1', title: '2026 대학교 입시 설명회', campus: '전체', date: '8월 21일 (금)', round: '1회차', time: '11:00',
      place: '송파 교통회관 2층 대강당', capacity: 800, desc: '수시·정시 전략과 학부모 대입 로드맵.', attendField: true, active: true, ended: false,
      surveySms: '[npr] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기·사진 남기기: {설문링크}',
    },
  ];

  /* 예약 시드 — reservedBy(모/부/모,부)·source(웹앱/수동)·logs[]·scannerNo */
  let rc = 1;
  const mk = (stIdx, sessionId, opt) => {
    const st = students[stIdx];
    const r = {
      id: 'r' + (rc++), code: `NPR-${sessionId.toUpperCase()}-${String(1000 + rc).slice(1)}`,
      sessionId, studentId: st.id, name: st.name, school: st.school, grade: st.grade,
      className: st.className, teacherName: st.teacherName, campus: st.campus, unit: st.unit,
      phone: st.motherPhone, channel: opt.source === '수동' ? 'manual' : 'mobile',
      status: opt.status || 'reserved', reservedBy: opt.by || '모', source: opt.source || '웹앱',
      attendCount: 1, member: true, time: opt.at,
      scannerNo: opt.scannerNo || null, enteredAt: opt.enteredAt || null,
      logs: opt.logs,
    };
    return r;
  };
  const reservations = [
    mk(0, 'ss1', { by: '모', source: '웹앱', logs: [{ label: '웹앱 예약', at: '07/12(일) 10:23:41' }], at: '07/12(일) 10:23' }),
    mk(1, 'ss1', { by: '부', source: '웹앱', status: 'entered', scannerNo: 1, enteredAt: '07/16(수) 13:58:41', logs: [{ label: '웹앱 예약', at: '07/11(토) 21:05:17' }], at: '07/11(토) 21:05' }),
    mk(2, 'ss1', { by: '모,부', source: '웹앱', logs: [{ label: '웹앱 예약', at: '07/13(월) 09:41:02' }], at: '07/13(월) 09:41' }),
    mk(3, 'ss1', { by: '모', source: '수동', logs: [{ label: '수동 예약', at: '07/13(월) 14:12:55' }], at: '07/13(월) 14:12' }),
    mk(4, 'ss1', { by: '모', source: '웹앱', status: 'cancelled', logs: [{ label: '웹앱 예약', at: '07/10(금) 18:30:12' }, { label: '웹앱 예약 취소', at: '07/14(화) 08:02:33' }], at: '07/10(금)' }),
    mk(5, 'ss1', { by: '부', source: '웹앱', status: 'entered', scannerNo: 2, enteredAt: '07/16(수) 14:02:09', logs: [{ label: '웹앱 예약', at: '07/12(일) 11:47:28' }], at: '07/12(일)' }),
    mk(6, 'ss1', { by: '모', source: '수동', status: 'cancelled', logs: [{ label: '수동 예약', at: '07/12(일) 15:20:44' }, { label: '수동 예약 취소', at: '07/15(수) 10:11:05' }], at: '07/12(일)' }),
    mk(7, 'ss1', { by: '모', source: '웹앱', logs: [{ label: '웹앱 예약', at: '07/14(화) 20:18:36' }], at: '07/14(화)' }),
    mk(8, 'ss1', { by: '모,부', source: '웹앱', status: 'entered', scannerNo: 1, enteredAt: '07/16(수) 14:05:57', logs: [{ label: '웹앱 예약', at: '07/13(월) 19:22:10' }], at: '07/13(월)' }),
    mk(9, 'ss1', { by: '모', source: '웹앱', logs: [{ label: '웹앱 예약', at: '07/15(수) 08:55:19' }], at: '07/15(수)' }),
    mk(10, 'ss1', { by: '부', source: '수동', logs: [{ label: '수동 예약', at: '07/15(수) 13:40:27' }], at: '07/15(수)' }),
    mk(12, 'ss1', { by: '모', source: '웹앱', status: 'entered', scannerNo: 3, enteredAt: '07/16(수) 14:11:33', logs: [{ label: '웹앱 예약', at: '07/14(화) 12:09:48' }], at: '07/14(화)' }),
    mk(14, 'ss1', { by: '모', source: '웹앱', logs: [{ label: '웹앱 예약', at: '07/14(화) 16:33:21' }], at: '07/14(화)' }),
    mk(15, 'ss1', { by: '모', source: '수동', logs: [{ label: '수동 예약', at: '07/15(수) 09:27:14' }], at: '07/15(수)' }),
    mk(20, 'ss1', { by: '부', source: '웹앱', logs: [{ label: '웹앱 예약', at: '07/15(수) 17:44:52' }], at: '07/15(수)' }),
  ];
  /* 비재원생 2명 (전화예약·선생님 예약 경유) */
  reservations.push(
    { id: 'r' + (rc++), code: 'NPR-SS1-0901', sessionId: 'ss1', studentId: null, name: '유가온', school: '잠실중', grade: '중3', className: '비재원생', teacherName: '', campus: '송파캠퍼스', unit: '', phone: '010-7781-4420', channel: 'manual', status: 'reserved', reservedBy: '', source: '전화예약', attendCount: 1, member: false, time: '07/14(화)', scannerNo: null, enteredAt: null, logs: [{ label: '수동 예약', at: '07/14(화) 11:02:18' }] },
    { id: 'r' + (rc++), code: 'NPR-SS1-0902', sessionId: 'ss1', studentId: null, name: '민서준', school: '광남고', grade: '고1', className: '비재원생', teacherName: '', campus: '광진캠퍼스', unit: '', phone: '010-6642-1193', channel: 'manual', status: 'entered', reservedBy: '', source: '선생님 예약', attendCount: 2, member: false, time: '07/13(월)', scannerNo: 2, enteredAt: '07/16(수) 13:49:20', logs: [{ label: '수동 예약', at: '07/13(월) 17:26:40' }] }
  );

  const smsTemplates = [
    { id: 'tpl1', name: '예약 확정 + QR', body: '[npr] {학생명} 학부모님, {설명회명} 예약이 확정되었습니다.\n일시: {일시}\n장소: {장소}\n입장 QR: {QR링크}' },
    { id: 'tpl2', name: '전일 리마인드', body: '[npr] 내일 {일시} {설명회명}이 진행됩니다. 입장 QR을 준비해 주세요. {QR링크}' },
    { id: 'tpl3', name: '만족도 설문 요청', body: '[npr] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기·사진 남기기: {설문링크}' },
    { id: 'tpl4', name: '취소 안내', body: '[npr] {설명회명} 예약이 취소되었습니다. 문의: {문의전화}' },
  ];
  const smsLogs = [
    { id: 'l1', when: '07/15(수) 18:00', to: 11, template: '전일 리마인드', session: '2026 대학교 입시 설명회', campus: '송파캠퍼스', ok: 11, fail: 0, auto: true },
    { id: 'l2', when: '07/12(일) 10:24', to: 1, template: '예약 확정 + QR', session: '2026 대학교 입시 설명회', campus: '송파캠퍼스', ok: 1, fail: 0 },
  ];

  const devices = [
    { id: 'd1', label: '스캐너 #1 · 송파 입구', model: 'iPad Pro 11" (4th)', scannerNo: 1, on: true, battery: 82, last: '방금 전' },
    { id: 'd2', label: '스캐너 #2 · 위례 입구', model: 'iPad Air 5', scannerNo: 2, on: true, battery: 64, last: '1분 전' },
    { id: 'd3', label: '스캐너 #3 · 광진 입구', model: 'Galaxy Tab S9', scannerNo: 3, on: true, battery: 51, last: '방금 전' },
    { id: 'd4', label: '예비', model: 'iPad 9', scannerNo: 4, on: false, battery: 100, last: '어제' },
  ];

  /* 만족도 설문 응답 — 캠퍼스·단위·반·담임·별점·후기·사진 */
  const surveyResponses = [
    { id: 'sv1', sessionId: 'ss1', campus: '송파캠퍼스', unit: '고등', student: '이서연', className: '고1A', teacherName: '김민서', phone: '010-3213-6111', rating: 5, comment: '입시 전략이 구체적이라 좋았어요. 특히 수시 최저지원 라인 설명과 학과별 합격 데이터가 인상적이었고, 상담 연계까지 바로 안내받을 수 있어 만족스러웠습니다.', photo: true, photoName: '현장사진_01.jpg' },
    { id: 'sv2', sessionId: 'ss1', campus: '위례캠퍼스', unit: '고등', student: '강민준', className: '고1B', teacherName: '오세라', phone: '010-3265-6155', rating: 4, comment: '주차 안내가 조금 아쉬웠습니다.', photo: false },
    { id: 'sv3', sessionId: 'ss1', campus: '송파캠퍼스', unit: '중등1', student: '박도윤', className: '1A', teacherName: '박준영', phone: '010-3226-6122', rating: 5, comment: '', photo: false },
    { id: 'sv4', sessionId: 'ss1', campus: '광진캠퍼스', unit: '초등', student: '전유나', className: '6C', teacherName: '박준영', phone: '010-3408-6276', rating: 4, comment: '자료를 미리 받고 싶어요.', photo: true, photoName: '현장사진_02.jpg' },
    { id: 'sv5', sessionId: 'ss1', campus: '송파캠퍼스', unit: '과학', student: '조은우', className: '과고1A', teacherName: '한지원', phone: '010-3278-6166', rating: 3, comment: '', photo: false },
    { id: 'sv6', sessionId: 'ss1', campus: '위례캠퍼스', unit: '특목', student: '서다인', className: '중2S', teacherName: '남기태', phone: '010-3343-6221', rating: 5, comment: '상담 연계가 특히 유용했어요.', photo: true, photoName: '현장사진_03.jpg' },
  ];

  window.NPR_DATA = { CAMPUSES, CAMPUS_INFO, UNIT_TABS, unitOf, unitMatchesTab, teachers, classes, students, sessions, reservations, smsTemplates, smsLogs, devices, surveyResponses };
})();
