import { useState, useEffect, useRef } from 'react';
import {
  Users,
  Lightbulb,
  Clock,
  ArrowRight,
  CheckCircle2,
  Copy,
  RotateCcw,
  Star,
  Play,
  Pause,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ChevronRight,
  LogOut,
  Plus
} from 'lucide-react';

// 6·3·5 정석 가이드라인 단계 정의
const GUIDELINE_STEPS = [
  { step: 1, name: '주제 제시', action: '해결 과제와 목표, 배경 지식 공유', tip: '요구사항을 구체적으로 정의' },
  { step: 2, name: '첫 번째 작성', action: '기록지 첫 칸에 아이디어 3개 작성', tip: '기존 의견을 보기 전에 독립적으로 작성' },
  { step: 3, name: '기록지 교환', action: '오른쪽 사람에게 기록지 전달', tip: '누락 없이 한 방향으로 이동' },
  { step: 4, name: '발전 작성', action: '앞사람의 의견을 읽고 새로운 아이디어 추가', tip: '비판보다 확장 중심!' },
  { step: 5, name: '반복 완료', action: '여섯 번째 칸까지 같은 방식으로 진행', tip: '중간에 말을 섞지 않기' },
  { step: 6, name: '전체 공개', action: '완성된 기록지를 벽이나 게시판에 공유', tip: '발표보다 빠른 공유 우선' },
  { step: 7, name: '분류와 선별', action: '비슷한 의견끼리 묶고 실행 가능성 검토', tip: '초기에는 삭제 최소화' },
  { step: 8, name: '최종안 확정', action: '유망한 선택지를 골라 개선 방향 결정', tip: '팀 합의를 통한 1~3개 안 도출' },
];

interface IdeaItem {
  id: string;
  author: string;
  round: number;
  sheetIndex: number;
  content: string;
  starred?: boolean;
}

interface RoomState {
  roomCode: string;
  taskTopic: string;
  taskGoal: string;
  members: string[];
  currentRound: number; // 1 ~ 6
  status: 'SETUP' | 'TOPIC' | 'RUNNING' | 'RESULT';
  ideas: IdeaItem[];
  updatedAt: number;
}

const STORAGE_KEY_PREFIX = 'brainwriting_room_';
const CHANNEL_NAME = 'brainwriting_channel';

export default function App() {
  // 사용자 정보
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('bw_username') || '');
  const [roomInput, setRoomInput] = useState('');
  
  // 방 상태
  const [room, setRoom] = useState<RoomState | null>(null);
  const [mySheetIndex, setMySheetIndex] = useState<number>(0);

  // 입력 필드들
  const [topicInput, setTopicInput] = useState('');
  const [goalInput, setGoalInput] = useState('');
  const [idea1, setIdea1] = useState('');
  const [idea2, setIdea2] = useState('');
  const [idea3, setIdea3] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);

  // 5분 타이머 (300초)
  const [timeLeft, setTimeLeft] = useState(300);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // 동기화용 브로드캐스트 채널
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  // 채널 연결
  useEffect(() => {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const updatedRoom = event.data as RoomState;
        if (room && updatedRoom && updatedRoom.roomCode === room.roomCode) {
          setRoom(updatedRoom);
        }
      };
      broadcastRef.current = channel;
    } catch {
      // BroadcastChannel 미지원 환경 대응
    }
    return () => {
      broadcastRef.current?.close();
    };
  }, [room?.roomCode]);

  // 방 상태 저장 및 전송 헬퍼
  const saveRoomState = (newState: RoomState) => {
    setRoom(newState);
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + newState.roomCode, JSON.stringify(newState));
      broadcastRef.current?.postMessage(newState);
    } catch (e) {
      console.error('Save failed:', e);
    }
  };

  // 타이머 작동
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isTimerRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(timer);
  }, [isTimerRunning, timeLeft]);

  // 방 생성하기
  const handleCreateRoom = () => {
    const trimmedName = userName.trim() || '팀원 1';
    localStorage.setItem('bw_username', trimmedName);
    setUserName(trimmedName);

    const generatedCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newRoom: RoomState = {
      roomCode: generatedCode,
      taskTopic: '',
      taskGoal: '',
      members: [trimmedName],
      currentRound: 1,
      status: 'TOPIC',
      ideas: [],
      updatedAt: Date.now()
    };

    setMySheetIndex(0);
    saveRoomState(newRoom);
  };

  // 방 입장하기
  const handleJoinRoom = () => {
    const code = roomInput.trim().toUpperCase();
    if (!code) return;

    const trimmedName = userName.trim() || '새 팀원';
    localStorage.setItem('bw_username', trimmedName);
    setUserName(trimmedName);

    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + code);
    if (!raw) {
      // 새로운 방으로 바로 생성해 진입
      const newRoom: RoomState = {
        roomCode: code,
        taskTopic: '',
        taskGoal: '',
        members: [trimmedName],
        currentRound: 1,
        status: 'TOPIC',
        ideas: [],
        updatedAt: Date.now()
      };
      setMySheetIndex(0);
      saveRoomState(newRoom);
      return;
    }

    try {
      const parsed: RoomState = JSON.parse(raw);
      const members = parsed.members.includes(trimmedName) ? parsed.members : [...parsed.members, trimmedName];
      const memberIdx = members.indexOf(trimmedName);
      const updated: RoomState = {
        ...parsed,
        members,
        updatedAt: Date.now()
      };
      setMySheetIndex(memberIdx >= 0 ? memberIdx : 0);
      saveRoomState(updated);
    } catch {
      alert('방 데이터를 불러오지 못했습니다.');
    }
  };

  // 과제 시작하기 (1단계 완료 -> 2단계)
  const handleStartBrainwriting = () => {
    if (!room || !topicInput.trim()) return;
    const updated: RoomState = {
      ...room,
      taskTopic: topicInput.trim(),
      taskGoal: goalInput.trim(),
      currentRound: 1,
      status: 'RUNNING',
      updatedAt: Date.now()
    };
    setTimeLeft(300);
    setIsTimerRunning(true);
    saveRoomState(updated);
  };

  // 현재 라운드에서 내가 작성해야 할 '기록지 번호'
  // 6-3-5 원리: 라운드가 넘어갈 때마다 기록지를 시계방향(오른쪽)으로 넘김
  // 라운드 1: 내 시트(mySheetIndex)
  // 라운드 2: (mySheetIndex - 1 + 6) % 6 에서 건네받은 시트
  const currentSheetIndex = room ? (mySheetIndex - (room.currentRound - 1) + 60) % 6 : 0;

  // 앞사람이 작성한 아이디어들 (현재 내가 쥐고 있는 기록지에 누적된 아이디어)
  const previousIdeasOnThisSheet = room?.ideas.filter(
    (i) => i.sheetIndex === currentSheetIndex && i.round < room.currentRound
  ) || [];

  // 내가 이번 라운드에 제출했는지 여부
  const mySubmittedCurrentRound = room?.ideas.some(
    (i) => i.sheetIndex === currentSheetIndex && i.round === room.currentRound && i.author === userName
  );

  // 아이디어 3개 제출하기
  const handleSubmitIdeas = () => {
    if (!room) return;
    if (!idea1.trim() && !idea2.trim() && !idea3.trim()) {
      alert('적어도 하나 이상의 아이디어를 작성해주세요.');
      return;
    }

    const newIdeas: IdeaItem[] = [];
    if (idea1.trim()) {
      newIdeas.push({
        id: `idea_${Date.now()}_1`,
        author: userName || '익명',
        round: room.currentRound,
        sheetIndex: currentSheetIndex,
        content: idea1.trim()
      });
    }
    if (idea2.trim()) {
      newIdeas.push({
        id: `idea_${Date.now()}_2`,
        author: userName || '익명',
        round: room.currentRound,
        sheetIndex: currentSheetIndex,
        content: idea2.trim()
      });
    }
    if (idea3.trim()) {
      newIdeas.push({
        id: `idea_${Date.now()}_3`,
        author: userName || '익명',
        round: room.currentRound,
        sheetIndex: currentSheetIndex,
        content: idea3.trim()
      });
    }

    const updatedIdeas = [...room.ideas, ...newIdeas];
    const isLastRound = room.currentRound >= 6;

    const nextState: RoomState = {
      ...room,
      ideas: updatedIdeas,
      currentRound: isLastRound ? 6 : room.currentRound + 1,
      status: isLastRound ? 'RESULT' : 'RUNNING',
      updatedAt: Date.now()
    };

    // 폼 초기화
    setIdea1('');
    setIdea2('');
    setIdea3('');
    setTimeLeft(300);
    setIsTimerRunning(!isLastRound);

    saveRoomState(nextState);
  };

  // 아이디어 별표 토글 (7·8단계 선별용)
  const handleToggleStar = (id: string) => {
    if (!room) return;
    const updatedIdeas = room.ideas.map((item) =>
      item.id === id ? { ...item, starred: !item.starred } : item
    );
    saveRoomState({ ...room, ideas: updatedIdeas, updatedAt: Date.now() });
  };

  // 전체 결과 복사
  const handleCopyResults = () => {
    if (!room) return;
    let text = `[브레인라이팅 6·3·5 결과]\n주제: ${room.taskTopic}\n목표: ${room.taskGoal || '없음'}\n\n`;
    text += `총 도출 아이디어: ${room.ideas.length}개\n\n`;

    const starred = room.ideas.filter((i) => i.starred);
    if (starred.length > 0) {
      text += `★ 최종 선별 아이디어 (${starred.length}개):\n`;
      starred.forEach((item, idx) => {
        text += `${idx + 1}. ${item.content} (작성자: ${item.author})\n`;
      });
      text += '\n';
    }

    text += '전체 아이디어 목록:\n';
    room.ideas.forEach((item, idx) => {
      text += `${idx + 1}. [R${item.round}] ${item.content} (${item.author})\n`;
    });

    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  // 타이머 분:초 포맷
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // 현재 라운드 안내 가이드 문구 계산
  const getRoundGuide = (round: number) => {
    if (round === 1) {
      return {
        stage: '2단계: 첫 번째 작성',
        action: '기록지 첫 칸에 독립적으로 아이디어 3개를 작성하세요.',
        tip: '기존 의견을 보기 전에 자유롭게 적는 것이 중요합니다.'
      };
    } else if (round < 6) {
      return {
        stage: `3·4단계: 기록지 교환 & 발전 작성 (${round}회차)`,
        action: '앞사람이 적은 아이디어를 읽고, 새로운 아이디어를 덧붙여 확장하세요.',
        tip: '비판은 금물! 앞사람의 생각을 디딤돌 삼아 살을 붙여보세요. 중간에 말을 섞지 마세요.'
      };
    } else {
      return {
        stage: '5단계: 마지막 6회차 작성 완료',
        action: '마지막 빈칸을 채워 6명이 모두 발전시킨 완성형 기록지를 완성합니다.',
        tip: '제출 후 전체 공개 및 선별 단계로 이동합니다.'
      };
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans">
      {/* 1. 최상단 네비게이션 / 헤더 */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30 px-4 py-3 shadow-xs">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-sm">
              635
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-stone-900">브레인라이팅</h1>
              <p className="text-xs text-stone-500">6명이 3개씩 5분간 적는 아이디어 기법</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowGuidelinesModal(true)}
              className="px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md flex items-center space-x-1"
              title="6·3·5 기법 정석 절차 보기"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>정석 절차</span>
            </button>

            {room && (
              <button
                onClick={() => {
                  if (confirm('방에서 나가시겠습니까?')) {
                    setRoom(null);
                  }
                }}
                className="p-1.5 text-stone-400 hover:text-stone-600 rounded-md"
                title="나가기"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 컨테이너 (휴대폰 기준 폭 최적화) */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col">
        {/* 화면 1: 이름, 방 만들기, 방 입장하기 */}
        {!room && (
          <div className="my-auto py-6 space-y-6">
            <div className="text-center space-y-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                침묵을 깨는 모둠활동 도구
              </span>
              <h2 className="text-2xl font-black text-stone-900 tracking-tight">
                회의실의 정적을 깨는<br />
                <span className="text-blue-600">브레인라이팅 6·3·5</span>
              </h2>
              <p className="text-sm text-stone-600 max-w-sm mx-auto leading-relaxed">
                아이디어를 말로 하라면 얼어붙지만, 종이에 3개씩 적어 넘기면 누구나 자유롭게 쏟아냅니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  내 이름 또는 별칭
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="예: 팀원 A, 지민"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="pt-2 border-t border-stone-100 space-y-3">
                <button
                  onClick={handleCreateRoom}
                  className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 active:scale-[0.99] text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center space-x-2 shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>새 모둠 방 만들기</span>
                </button>

                <div className="flex items-center space-x-2 my-2">
                  <div className="flex-1 h-px bg-stone-200"></div>
                  <span className="text-xs text-stone-400 font-medium">또는 방 코드로 참여</span>
                  <div className="flex-1 h-px bg-stone-200"></div>
                </div>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    placeholder="방 코드 (예: ABCD)"
                    className="flex-1 px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-sm uppercase tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                  <button
                    onClick={handleJoinRoom}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors whitespace-nowrap"
                  >
                    입장
                  </button>
                </div>
              </div>
            </div>

            {/* 정석 원리 퀵 안내 카드 */}
            <div className="bg-stone-100/70 p-4 rounded-xl border border-stone-200 text-xs text-stone-600 space-y-1.5">
              <div className="font-bold text-stone-800 flex items-center space-x-1.5">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                <span>6·3·5 기법 규칙</span>
              </div>
              <p className="leading-normal">
                <strong>6명</strong>이 각각 <strong>3개</strong>의 아이디어를 <strong>5분</strong> 동안 적고, 옆 사람에게 넘겨 <strong>6회</strong> 반복합니다. 말을 섞지 않고 글과 확장으로 소통합니다.
              </p>
            </div>
          </div>
        )}

        {/* 화면 2: 팀의 과제를 입력하는 창 (1단계: 주제 제시) */}
        {room && room.status === 'TOPIC' && (
          <div className="my-auto py-4 space-y-5">
            {/* 가이드 배너 */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                1
              </div>
              <div>
                <h3 className="text-sm font-bold text-blue-900">1단계: 주제 제시</h3>
                <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
                  해결 과제와 목표를 공유합니다. <strong>주의할 점:</strong> 요구사항을 구체적으로 정의해야 좋은 아이디어가 나옵니다.
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100 text-xs">
                <span className="font-bold text-stone-500">방 코드: <span className="font-mono text-stone-900 text-sm">{room.roomCode}</span></span>
                <span className="text-stone-500">참여자: <strong>{room.members.join(', ')}</strong></span>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1.5">
                  해결해야 하는 팀의 과제 (필수)
                </label>
                <textarea
                  rows={2}
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="예: 우리 팀 모둠활동 시 침묵을 깨는 효과적인 아이디어 도출 방안"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  구체적 목표 및 요구 조건 (선택)
                </label>
                <input
                  type="text"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="예: 예산 0원, 오늘 바로 실행 가능한 방법"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleStartBrainwriting}
                  disabled={!topicInput.trim()}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-stone-300 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center space-x-2 shadow-xs"
                >
                  <span>과제 확정 & 브레인라이팅 시작</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-center">
              <p className="text-xs text-stone-500">
                시작하면 각자 5분 동안 아이디어 3개를 독립적으로 작성하게 됩니다.
              </p>
            </div>
          </div>
        )}

        {/* 화면 3: 팀원 A가 아이디어를 입력하는 창 (상단 팀의 과제 고정 + 6·3·5 절차) */}
        {room && room.status === 'RUNNING' && (
          <div className="space-y-4 pb-8">
            {/* 출력 요구사항 1: 맨 위에 팀의 과제 고정 헤더 */}
            <div className="bg-stone-900 text-white p-4 rounded-2xl shadow-md sticky top-16 z-20">
              <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                <span className="font-semibold text-amber-400 flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5" /> 팀의 해결 과제
                </span>
                <span className="font-mono bg-stone-800 px-2 py-0.5 rounded text-[11px] text-stone-300">
                  라운드 {room.currentRound} / 6
                </span>
              </div>
              <h2 className="text-base font-bold text-white leading-snug">
                {room.taskTopic}
              </h2>
              {room.taskGoal && (
                <p className="text-xs text-stone-300 mt-1 border-t border-stone-800 pt-1">
                  목표: {room.taskGoal}
                </p>
              )}
            </div>

            {/* 타이머 & 라운드 가이드 바 */}
            <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className={`w-4 h-4 ${timeLeft < 60 ? 'text-rose-500 animate-pulse' : 'text-stone-500'}`} />
                <span className={`font-mono text-base font-bold ${timeLeft < 60 ? 'text-rose-600' : 'text-stone-800'}`}>
                  {formatTime(timeLeft)}
                </span>
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="p-1 text-stone-500 hover:text-stone-800 rounded"
                  title={isTimerRunning ? '일시정지' : '계속'}
                >
                  {isTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => {
                    setTimeLeft(300);
                    setIsTimerRunning(false);
                  }}
                  className="p-1 text-stone-400 hover:text-stone-600 rounded"
                  title="5분 초기화"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 진행도 점 표시 */}
              <div className="flex items-center space-x-1">
                {[1, 2, 3, 4, 5, 6].map((r) => (
                  <div
                    key={r}
                    className={`w-2.5 h-2.5 rounded-full ${
                      r === room.currentRound
                        ? 'bg-blue-600 ring-2 ring-blue-200'
                        : r < room.currentRound
                        ? 'bg-emerald-500'
                        : 'bg-stone-200'
                    }`}
                    title={`${r}회차`}
                  />
                ))}
              </div>
            </div>

            {/* 현재 단계 가이드라인 & 주의할 점 (정석 절차 반영) */}
            {(() => {
              const guide = getRoundGuide(room.currentRound);
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-amber-900 font-bold">
                    <span>📌 {guide.stage}</span>
                    <span className="text-[11px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      작성자: {userName}
                    </span>
                  </div>
                  <p className="text-stone-700 leading-relaxed font-medium">
                    {guide.action}
                  </p>
                  <p className="text-amber-800 flex items-start space-x-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span><strong>주의할 점:</strong> {guide.tip}</span>
                  </p>
                </div>
              );
            })()}

            {/* 2회차 이상일 때: 앞사람이 작성한 아이디어 참고 영역 (브레인라이팅 핵심: 확장 작성) */}
            {room.currentRound > 1 && (
              <div className="bg-stone-100 rounded-2xl p-4 border border-stone-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-stone-700 flex items-center space-x-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-blue-600" />
                    <span>앞사람(이전 라운드)이 작성한 아이디어</span>
                  </h3>
                  <span className="text-[11px] text-stone-500">참고하여 새 아이디어 추가</span>
                </div>

                {previousIdeasOnThisSheet.length === 0 ? (
                  <p className="text-xs text-stone-500 italic bg-white p-3 rounded-xl border border-stone-200">
                    앞선 라운드에서 전달된 메모가 없습니다. 새로운 시각의 아이디어를 적어보세요!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {previousIdeasOnThisSheet.map((idea, idx) => (
                      <div
                        key={idea.id || idx}
                        className="bg-white p-3 rounded-xl border border-stone-200 text-xs shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1">
                          <span className="font-semibold text-stone-600">R{idea.round} 의견 ({idea.author})</span>
                          <span>#{idx + 1}</span>
                        </div>
                        <p className="text-stone-800 font-medium leading-relaxed">{idea.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 출력 요구사항 2: 사용자들이 자유롭게 아이디어 제시할 수 있는 창 (3칸) */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-stone-900 flex items-center space-x-1">
                  <span>✍️ {userName}님의 이번 라운드 아이디어 (3개)</span>
                </h3>
                <span className="text-[11px] text-stone-500">5분 동안 자유롭게 작성</span>
              </div>

              <div className="space-y-2.5">
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-400">1</span>
                  <input
                    type="text"
                    value={idea1}
                    onChange={(e) => setIdea1(e.target.value)}
                    placeholder="첫 번째 아이디어를 입력하세요..."
                    className="w-full pl-8 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-stone-900"
                  />
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-400">2</span>
                  <input
                    type="text"
                    value={idea2}
                    onChange={(e) => setIdea2(e.target.value)}
                    placeholder="두 번째 아이디어를 입력하세요..."
                    className="w-full pl-8 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-stone-900"
                  />
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-400">3</span>
                  <input
                    type="text"
                    value={idea3}
                    onChange={(e) => setIdea3(e.target.value)}
                    placeholder="세 번째 아이디어를 입력하세요..."
                    className="w-full pl-8 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-stone-900"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSubmitIdeas}
                  disabled={!idea1.trim() && !idea2.trim() && !idea3.trim()}
                  className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center space-x-2 shadow-xs"
                >
                  <span>
                    {room.currentRound >= 6
                      ? '마지막 아이디어 제출 & 결과 보기'
                      : '작성 완료 & 다음 사람에게 넘기기 (시계 방향)'}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* 한 기기로 모둠활동 시 참가자 변경 지원 버튼 */}
              <div className="pt-1 flex items-center justify-between text-[11px] text-stone-500 border-t border-stone-100">
                <span>한 기기로 함께 쓰는 중인가요?</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextMember = prompt('작성할 다음 팀원의 이름을 입력하세요:', userName);
                    if (nextMember && nextMember.trim()) {
                      setUserName(nextMember.trim());
                      setMySheetIndex((prev) => (prev + 1) % 6);
                    }
                  }}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  기록지 다음 사람에게 건네기
                </button>
              </div>
            </div>

            {/* 조기 종료 버튼 */}
            <div className="text-center pt-2">
              <button
                onClick={() => {
                  if (confirm('현재까지 작성된 아이디어를 가지고 전체 공개/선별 단계로 이동하시겠습니까?')) {
                    saveRoomState({ ...room, status: 'RESULT', updatedAt: Date.now() });
                  }
                }}
                className="text-xs text-stone-500 hover:text-stone-800 underline"
              >
                진행을 마치고 결과 전체 공개로 이동
              </button>
            </div>
          </div>
        )}

        {/* 화면 4: 6단계 전체 공개, 7단계 분류/선별, 8단계 최종안 확정 */}
        {room && room.status === 'RESULT' && (
          <div className="space-y-4 pb-12">
            {/* 상단 팀 과제 카드 */}
            <div className="bg-stone-900 text-white p-4 rounded-2xl shadow-sm">
              <span className="text-xs text-amber-400 font-bold block mb-1">🎯 팀의 과제</span>
              <h2 className="text-base font-bold leading-snug">{room.taskTopic}</h2>
              {room.taskGoal && <p className="text-xs text-stone-300 mt-1">목표: {room.taskGoal}</p>}
            </div>

            {/* 정석 6~8단계 가이드 배너 */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-950 space-y-1">
              <div className="font-bold flex items-center space-x-1 text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>6·7·8단계: 전체 공개, 분류와 선별, 최종안 확정</span>
              </div>
              <p className="leading-relaxed">
                모든 아이디어를 펼쳐놓고 확인합니다. <strong>★ 아이콘을 눌러</strong> 유망한 아이디어를 선별하고 우리 팀의 최종안을 결정하세요.
              </p>
            </div>

            {/* 요약 바 & 버튼 */}
            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-stone-200">
              <div className="text-xs">
                <span className="text-stone-500">도출된 총 아이디어: </span>
                <strong className="text-stone-900 font-bold text-sm">{room.ideas.length}개</strong>
                <span className="mx-2 text-stone-300">|</span>
                <span className="text-amber-600 font-bold">
                  선별됨: {room.ideas.filter((i) => i.starred).length}개
                </span>
              </div>

              <button
                onClick={handleCopyResults}
                className="px-3 py-1.5 text-xs font-bold bg-stone-900 text-white hover:bg-stone-800 rounded-lg flex items-center space-x-1.5 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedNotification ? '복사 완료!' : '결과 복사'}</span>
              </button>
            </div>

            {/* 선별된 유망 아이디어 섹션 (8단계 최종안) */}
            {room.ideas.some((i) => i.starred) && (
              <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-2.5">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-900">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                  <span>8단계: 우리 팀 최종 유망 후보안</span>
                </div>
                <div className="space-y-2">
                  {room.ideas
                    .filter((i) => i.starred)
                    .map((item, idx) => (
                      <div
                        key={item.id}
                        className="bg-white p-3 rounded-xl border border-amber-200 text-xs shadow-2xs flex items-start justify-between gap-2"
                      >
                        <div>
                          <div className="text-[11px] text-stone-400 mb-0.5">
                            후보 #{idx + 1} · 작성자: {item.author} (R{item.round})
                          </div>
                          <p className="text-stone-900 font-bold text-sm leading-snug">{item.content}</p>
                        </div>
                        <button
                          onClick={() => handleToggleStar(item.id)}
                          className="text-amber-500 hover:text-stone-400 p-1"
                        >
                          <Star className="w-4 h-4 fill-amber-400" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 전체 아이디어 목록 (6단계 전체 공개) */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-stone-700 px-1">
                전체 아이디어 기록지 ({room.ideas.length}개)
              </h3>

              {room.ideas.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-xs text-stone-500">
                  등록된 아이디어가 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {room.ideas.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border text-xs transition-all flex items-start justify-between gap-2.5 ${
                        item.starred
                          ? 'bg-amber-50/50 border-amber-300'
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 text-[11px] text-stone-400 mb-1">
                          <span className="font-semibold text-stone-700">#{idx + 1}</span>
                          <span>라운드 {item.round}</span>
                          <span>·</span>
                          <span>{item.author}</span>
                        </div>
                        <p className="text-stone-900 text-sm leading-relaxed">{item.content}</p>
                      </div>

                      <button
                        onClick={() => handleToggleStar(item.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          item.starred
                            ? 'text-amber-500 hover:text-amber-600 bg-amber-100/60'
                            : 'text-stone-300 hover:text-amber-500'
                        }`}
                        title={item.starred ? '선별 취소' : '유망 아이디어로 선별'}
                      >
                        <Star className={`w-4 h-4 ${item.starred ? 'fill-amber-400' : ''}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 다시 시작하기 버튼 */}
            <div className="pt-4 flex space-x-2">
              <button
                onClick={() => {
                  if (confirm('새로운 주제로 브레인라이팅을 다시 시작하시겠습니까?')) {
                    saveRoomState({
                      ...room,
                      status: 'TOPIC',
                      currentRound: 1,
                      ideas: [],
                      taskTopic: '',
                      taskGoal: '',
                      updatedAt: Date.now()
                    });
                  }
                }}
                className="flex-1 py-3 bg-stone-900 text-white font-bold rounded-xl text-xs hover:bg-stone-800 transition-colors"
              >
                새 주제로 다시 하기
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 정석 절차 안내 모달 */}
      {showGuidelinesModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900">브레인라이팅 6·3·5 정석 절차</h3>
                <p className="text-xs text-stone-500">6명이 각각 3개의 아이디어를 5분 동안 적고 교환</p>
              </div>
              <button
                onClick={() => setShowGuidelinesModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {GUIDELINE_STEPS.map((item) => (
                <div key={item.step} className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
                  <div className="flex items-center justify-between font-bold text-stone-900 mb-0.5">
                    <span>{item.step}단계. {item.name}</span>
                  </div>
                  <p className="text-stone-700 leading-snug">{item.action}</p>
                  <p className="text-blue-700 text-[11px] mt-1 font-medium">
                    ⚠️ 주의할 점: {item.tip}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowGuidelinesModal(false)}
              className="w-full py-2.5 bg-stone-900 text-white text-xs font-bold rounded-xl hover:bg-stone-800"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
