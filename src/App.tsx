import React, { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Calculator, Trash2, Copy, LogOut, Calendar } from 'lucide-react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function AppContent() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [processingTime, setProcessingTime] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyInputSuccess, setCopyInputSuccess] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [isAddingToCalendar, setIsAddingToCalendar] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const now = new Date();
    const currentMinutes = now.getMinutes();
    const currentHours = now.getHours();
    
    const roundedMinutes = Math.ceil(currentMinutes / 5) * 5;
    let hours = currentHours;
    let minutes = roundedMinutes;
    
    if (minutes >= 60) {
      hours = (hours + 1) % 24;
      minutes = 0;
    }

    const roundedDate = new Date(now);
    roundedDate.setHours(hours, minutes);
    
    setSelectedDate(roundedDate);
    setSelectedHour(hours.toString().padStart(2, '0'));
    setSelectedMinute(minutes.toString().padStart(2, '0'));
  }, []);

  const login = useGoogleLogin({
    onSuccess: async (response) => {
      try {
        const result = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${response.access_token}`,
          },
        });
        const userInfo = await result.json();
        setUserEmail(userInfo.email);
        setUserAvatar(userInfo.picture);
        setAccessToken(response.access_token);
      } catch (error) {
        console.error('Error fetching user info:', error);
        setError('ログインに失敗しました。もう一度お試しください。');
      }
    },
    onError: (error) => {
      console.error('Login Failed:', error);
      setError('ログインに失敗しました。もう一度お試しください。');
    },
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
  });

  const handleLogout = () => {
    setAccessToken(null);
    setUserEmail(null);
    setUserAvatar(null);
  };

  const calculateSchedule = (input: string) => {
    setError('');
    const lines = input.trim().split('\n');
    
    if (lines.length < 1) {
      setError('少なくとも1つのイベントを入力してください。');
      return '';
    }

    let currentDate = new Date(selectedDate);
    currentDate.setHours(parseInt(selectedHour), parseInt(selectedMinute));
    let currentTimeInMinutes = parseInt(selectedHour) * 60 + parseInt(selectedMinute);
    const result = [];
    
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    };
    
    result.push(formatDate(currentDate));
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const eventMatch = line.match(/^(.+)[\s　](\d+)$/);
      if (!eventMatch) {
        setError(`${i+1}行目の形式が正しくありません。「イベント名 所要時間」の形式で入力してください。`);
        return '';
      }
      
      const eventName = eventMatch[1];
      const duration = parseInt(eventMatch[2]);
      
      if (isNaN(duration)) {
        setError(`${i+1}行目の所要時間が数値ではありません。`);
        return '';
      }
      
      const hours = Math.floor(currentTimeInMinutes / 60);
      const minutes = currentTimeInMinutes % 60;
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      if (hours >= 24) {
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + 1);
        currentTimeInMinutes = currentTimeInMinutes % (24 * 60);
        result.push('');
        result.push(formatDate(currentDate));
      }
      
      result.push(`${timeString} ${eventName}`);
      currentTimeInMinutes += duration;
    }
    
    const endHours = Math.floor(currentTimeInMinutes / 60);
    const endMinutes = currentTimeInMinutes % 60;
    
    if (endHours >= 24) {
      currentDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + 1);
      result.push('');
      result.push(formatDate(currentDate));
    }
    
    const finalTimeString = `${(endHours % 24).toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
    result.push(`${finalTimeString} 終了`);
    
    return result.join('\n');
  };

  const addToGoogleCalendar = async () => {
    if (!accessToken || !output) return;
    
    setIsAddingToCalendar(true);
    setError('');
    
    try {
      const lines = output.split('\n');
      let currentDate = null;
      let events = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        if (line.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
          currentDate = line;
          continue;
        }
        
        if (!currentDate || line.endsWith('終了')) continue;
        
        const [time, ...titleParts] = line.split(' ');
        const title = titleParts.join(' ');
        
        let endTime = null;
        let endDate = currentDate;
        let j = i + 1;
        
        while (j < lines.length && !endTime) {
          const nextLine = lines[j].trim();
          if (!nextLine) {
            j++;
            continue;
          }
          
          if (nextLine.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
            endDate = nextLine;
            j++;
            continue;
          }
          
          const [nextTime] = nextLine.split(' ');
          if (nextTime.match(/^\d{2}:\d{2}$/)) {
            endTime = nextTime;
            break;
          }
          
          j++;
        }
        
        if (!endTime) continue;
        
        const [startYear, startMonth, startDay] = currentDate.split('/');
        const [endYear, endMonth, endDay] = endDate.split('/');
        
        const event = {
          'summary': title,
          'start': {
            'dateTime': `${startYear}-${startMonth}-${startDay}T${time}:00+09:00`,
            'timeZone': 'Asia/Tokyo'
          },
          'end': {
            'dateTime': `${endYear}-${endMonth}-${endDay}T${endTime}:00+09:00`,
            'timeZone': 'Asia/Tokyo'
          }
        };

        try {
          const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(event)
          });

          if (!response.ok) {
            throw new Error(`カレンダーへの追加に失敗しました: ${response.statusText}`);
          }

          await response.json();
        } catch (error) {
          console.error('Error adding event to calendar:', error);
          throw error;
        }
      }

      alert('スケジュールをGoogleカレンダーに追加しました！');
    } catch (error) {
      console.error('Error in calendar operation:', error);
      setError(`カレンダーへの追加に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsAddingToCalendar(false);
    }
  };

  const handleCalculate = () => {
    const startTime = new Date();
    const result = calculateSchedule(input);
    setOutput(result);
    
    if (result) {
      const endTime = new Date();
      const time = endTime.getTime() - startTime.getTime();
      setProcessingTime(`処理時間: ${time} ミリ秒`);
    } else {
      setProcessingTime('');
    }
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
    setProcessingTime('');
    setCopySuccess(false);
    setCopyInputSuccess(false);
    
    const now = new Date();
    const currentMinutes = now.getMinutes();
    const roundedMinutes = Math.ceil(currentMinutes / 5) * 5;
    let hours = now.getHours();
    let minutes = roundedMinutes;
    
    if (minutes >= 60) {
      hours = (hours + 1) % 24;
      minutes = 0;
    }

    const roundedDate = new Date(now);
    roundedDate.setHours(hours, minutes);
    
    setSelectedDate(roundedDate);
    setSelectedHour(hours.toString().padStart(2, '0'));
    setSelectedMinute(minutes.toString().padStart(2, '0'));
  };

  const handleCopy = async () => {
    if (!output) return;
    
    try {
      await navigator.clipboard.writeText(output);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました: ', err);
    }
  };

  const handleCopyInput = async () => {
    if (!input) return;
    
    try {
      await navigator.clipboard.writeText(input);
      setCopyInputSuccess(true);
      setTimeout(() => setCopyInputSuccess(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました: ', err);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      const text = textarea.value;
      const lines = text.split('\n');
      const cursorPosition = textarea.selectionStart;
      
      const textUpToCursor = text.substring(0, cursorPosition);
      const currentLineNumber = (textUpToCursor.match(/\n/g) || []).length;
      
      if (e.key === 'ArrowUp' && currentLineNumber > 0) {
        const temp = lines[currentLineNumber];
        lines[currentLineNumber] = lines[currentLineNumber - 1];
        lines[currentLineNumber - 1] = temp;
        
        setInput(lines.join('\n'));
        
        const newPosition = lines.slice(0, currentLineNumber - 1).join('\n').length + 
          (currentLineNumber > 1 ? 1 : 0);
        
        setTimeout(() => {
          textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
      } else if (e.key === 'ArrowDown' && currentLineNumber < lines.length - 1) {
        const temp = lines[currentLineNumber];
        lines[currentLineNumber] = lines[currentLineNumber + 1];
        lines[currentLineNumber + 1] = temp;
        
        setInput(lines.join('\n'));
        
        const newPosition = lines.slice(0, currentLineNumber + 1).join('\n').length + 1;
        
        setTimeout(() => {
          textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-yellow-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.54 9.80334C12.0199 9.90749 11.5624 10.214 11.2683 10.6554C10.9742 11.0968 10.8675 11.637 10.9716 12.1571C11.0758 12.6772 11.3823 13.1347 11.8237 13.4288C12.2651 13.7229 12.8053 13.8296 13.3254 13.7255C14.3656 13.5172 15.2805 12.9042 15.8687 12.0213C16.457 11.1385 16.6704 10.0581 16.4621 9.0179C16.2538 7.97769 15.6408 7.06283 14.7579 6.47459C13.8751 5.88634 12.7947 5.6729 11.7545 5.88121C10.1942 6.19368 8.82192 7.11318 7.93956 8.43743C7.05719 9.76169 6.73702 11.3822 7.04949 12.9426C7.36195 14.5029 8.28146 15.8752 9.60572 16.7575C10.93 17.6399 12.5505 17.9601 14.1108 17.6476C16.1913 17.231 18.021 16.005 19.1975 14.2393C20.374 12.4736 20.8008 10.3129 20.3842 8.23247C19.9676 6.15204 18.7416 4.32233 16.9759 3.14584C15.2102 1.96935 13.0495 1.54246 10.9691 1.95908C8.36856 2.47986 6.08142 4.01236 4.61081 6.21946C3.1402 8.42656 2.60659 11.1275 3.12736 13.728C3.64814 16.3285 5.18064 18.6157 7.38774 20.0863C9.59484 21.5569 12.2957 22.0905 14.8963 21.5697C17.4527 21.0615 19.7723 19.7302 21.5005 17.7791C21.692 17.5845 21.8416 17.3527 21.9402 17.0981C22.0387 16.8435 22.084 16.5714 22.0734 16.2986C22.0628 16.0257 21.9964 15.758 21.8784 15.5118C21.7603 15.2656 21.5931 15.0462 21.3871 14.867C21.181 14.6879 20.9405 14.5529 20.6803 14.4702C20.4201 14.3876 20.1457 14.3591 19.874 14.3865C19.6024 14.4139 19.3392 14.4967 19.1008 14.6297C18.8623 14.7627 18.6536 14.9431 18.4875 15.1598" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div>
              <h1 className="text-xl font-bold text-gray-800">EZCalGo</h1>
              <p className="text-xs text-gray-500">イジカルゴ</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {!accessToken ? (
              <button
                onClick={() => login()}
                className="px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2 shadow-md hover:shadow-lg"
              >
                <img
                  src="https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png"
                  alt="Google"
                  className="w-4 h-4"
                />
                ログイン
              </button>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative group">
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt="User Avatar"
                      className="w-8 h-8 rounded-full border-2 border-yellow-200 transition-all duration-300 hover:border-yellow-400"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                      <span className="text-yellow-600 text-sm font-semibold">
                        {userEmail?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="absolute right-0 top-full mt-2 bg-white p-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 whitespace-nowrap">
                    <span className="text-sm text-gray-700">{userEmail}</span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  ログアウト
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-3xl mx-auto px-4 mt-4">
          <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6">
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  開始日:
                </label>
                <input
                  type="date"
                  value={selectedDate.toISOString().split('T')[0]}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all duration-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  開始時刻:
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedHour}
                    onChange={(e) => setSelectedHour(e.target.value)}
                    className="flex-1 p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all duration-300"
                  >
                    {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                      <option key={hour} value={hour.toString().padStart(2, '0')}>
                        {hour.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="self-center text-gray-500">:</span>
                  <select
                    value={selectedMinute}
                    onChange={(e) => setSelectedMinute(e.target.value)}
                    className="flex-1 p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all duration-300"
                  >
                    {Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => (
                      <option key={minute} value={minute.toString().padStart(2, '0')}>
                        {minute.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="schedule-input" className="block text-sm font-medium text-gray-700">
                  スケジュール入力:
                </label>
                <button
                  onClick={handleCopyInput}
                  disabled={!input}
                  className="text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
                >
                  <Copy className="w-4 h-4" />
                  コピー
                  {copyInputSuccess && (
                    <span className="text-emerald-600 transition-opacity animate-fade-in-out ml-1">
                      ✓
                    </span>
                  )}
                </button>
              </div>
              <textarea
                ref={textareaRef}
                id="schedule-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full h-48 p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all duration-300 font-mono"
                placeholder="例:
読書 30
ストレッチ 15
メールチェック 20"
              />
              <div className="mt-4 gap-3 flex flex-start items-center">
                <button
                  onClick={handleCalculate}
                  className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-6 py-2.5 rounded-xl font-medium hover:from-yellow-500 hover:to-yellow-600 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  作成
                </button>
                <button
                  onClick={handleClear}
                  className="bg-gray-500 text-white px-6 py-2.5 rounded-xl hover:bg-gray-600 transition-all duration-300 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  クリア
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="schedule-output" className="block text-sm font-medium text-gray-700 mb-2">
                出力結果:
              </label>
              <div
                id="schedule-output"
                className="w-full min-h-[100px] p-4 bg-gray-50 border border-gray-200 rounded-xl font-mono whitespace-pre-wrap transition-all duration-300"
              >
                {output}
              </div>

              {error && (
                <p className="text-red-600 font-medium mt-2">{error}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  onClick={handleCopy}
                  disabled={!output}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-4 py-2.5 rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  結果をコピー
                </button>
                {accessToken && (
                  <button
                    onClick={addToGoogleCalendar}
                    disabled={!output || isAddingToCalendar}
                    className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2.5 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 shadow-md hover:shadow-lg flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    {isAddingToCalendar ? '追加中...' : 'カレンダーに追加'}
                  </button>
                )}
                {copySuccess && (
                  <span className="text-emerald-600 transition-opacity animate-fade-in-out">
                    コピーしました！
                  </span>
                )}
              </div>

              {processingTime && (
                <p className="text-sm text-gray-500 mt-4 text-right">{processingTime}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  );
}

export default App;