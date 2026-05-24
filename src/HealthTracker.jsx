import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Scale, UtensilsCrossed, Clock, Target, Plus, Trash2, TrendingDown, TrendingUp, Flame, Settings, X, Camera, Sparkles, Loader2, Edit3, Key, Download, Upload, Activity, Zap, Heart, AlertCircle, Lightbulb, Droplet } from 'lucide-react';

const storage = {
  get: (key) => {
    try {
      const v = localStorage.getItem(key);
      return v ? { value: v } : null;
    } catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
};

export default function HealthTracker() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState([]);
  const [meals, setMeals] = useState([]);
  const [goals, setGoals] = useState({
    targetWeight: 65, dailyCalories: 1800, fastingHours: 16,
    protein: 100, carbs: 200, fat: 60,
  });
  const [apiKey, setApiKey] = useState('');
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [mealInput, setMealInput] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '', type: '아침', image: null });
  const [goalInput, setGoalInput] = useState(goals);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const fileInputRef = useRef(null);
  const importFileRef = useRef(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const w = storage.get('weights');
      const m = storage.get('meals');
      const g = storage.get('goals');
      const k = storage.get('apiKey');
      if (w?.value) setWeights(JSON.parse(w.value));
      if (m?.value) setMeals(JSON.parse(m.value));
      if (g?.value) { const pg = JSON.parse(g.value); setGoals(pg); setGoalInput(pg); }
      if (k?.value) setApiKey(k.value);
    } catch (e) { console.log('로드 실패:', e); }
    finally { setLoading(false); }
  }, []);

  const save = (key, value) => storage.set(key, typeof value === 'string' ? value : JSON.stringify(value));

  const exportData = () => {
    const data = { weights, meals, goals, exportedAt: new Date().toISOString(), version: 1 };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-journal-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.weights) { setWeights(data.weights); save('weights', data.weights); }
      if (data.meals) { setMeals(data.meals); save('meals', data.meals); }
      if (data.goals) { setGoals(data.goals); save('goals', data.goals); }
      alert('데이터를 불러왔어요!');
    } catch (err) { alert('파일을 읽을 수 없어요: ' + err.message); }
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const addWeight = () => {
    if (!weightInput) return;
    const newEntry = { id: Date.now(), weight: parseFloat(weightInput), date: new Date().toISOString() };
    const updated = [...weights, newEntry].sort((a, b) => new Date(a.date) - new Date(b.date));
    setWeights(updated);
    save('weights', updated);
    setWeightInput('');
    setShowWeightModal(false);
  };

  const deleteWeight = (id) => {
    const updated = weights.filter(w => w.id !== id);
    setWeights(updated);
    save('weights', updated);
  };

  const saveApiKey = () => {
    setApiKey(apiKeyInput);
    save('apiKey', apiKeyInput);
    setShowApiKeyModal(false);
  };

  const getMealTypeByTime = () => {
    const hour = new Date().getHours();
    if (hour < 10) return '아침';
    if (hour < 14) return '점심';
    if (hour < 18) return '간식';
    return '저녁';
  };

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!apiKey) {
      setAnalysisError('AI 분석을 사용하려면 먼저 API 키를 설정해주세요. (우상단 🔑)');
      const reader = new FileReader();
      reader.onload = () => {
        setMealInput({ name: '', calories: '', protein: '', carbs: '', fat: '', type: getMealTypeByTime(), image: reader.result });
        setShowMealModal(true);
      };
      reader.readAsDataURL(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const base64Data = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = () => rej(new Error('이미지 읽기 실패'));
        reader.readAsDataURL(file);
      });
      const mediaType = file.type || 'image/jpeg';
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
              { type: 'text', text: `이 식사 사진을 분석해서 다음 정보를 JSON으로만 응답하세요. 다른 텍스트나 마크다운 코드블록 없이 순수 JSON만 출력하세요.

{
  "name": "음식 이름 (한국어)",
  "calories": 숫자,
  "protein": 숫자(g),
  "carbs": 숫자(g),
  "fat": 숫자(g),
  "confidence": "high" | "medium" | "low",
  "notes": "추정 근거 (한국어, 한 문장)"
}

일반적인 1인분 기준, 보이는 양에 맞춰 조정.` }
            ]
          }]
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 오류 (${response.status}): ${errText.slice(0, 150)}`);
      }
      const data = await response.json();
      const textBlocks = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      let cleaned = textBlocks.replace(/```json\s*|```\s*/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(cleaned);
      const previewUrl = `data:${mediaType};base64,${base64Data}`;
      setMealInput({
        name: parsed.name || '',
        calories: String(Math.round(parsed.calories || 0)),
        protein: String(Math.round(parsed.protein || 0)),
        carbs: String(Math.round(parsed.carbs || 0)),
        fat: String(Math.round(parsed.fat || 0)),
        type: getMealTypeByTime(),
        image: previewUrl,
        confidence: parsed.confidence,
        notes: parsed.notes,
      });
      setShowMealModal(true);
    } catch (e) {
      console.error(e);
      setAnalysisError(e.message || '분석 실패. 직접 입력해주세요.');
      setMealInput({ name: '', calories: '', protein: '', carbs: '', fat: '', type: getMealTypeByTime(), image: null });
      setShowMealModal(true);
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addMeal = () => {
    if (!mealInput.name || !mealInput.calories) return;
    const newMeal = {
      id: Date.now(),
      name: mealInput.name,
      calories: parseFloat(mealInput.calories) || 0,
      protein: parseFloat(mealInput.protein) || 0,
      carbs: parseFloat(mealInput.carbs) || 0,
      fat: parseFloat(mealInput.fat) || 0,
      type: mealInput.type,
      image: mealInput.image || null,
      date: new Date().toISOString(),
    };
    const updated = [...meals, newMeal];
    setMeals(updated);
    save('meals', updated);
    setMealInput({ name: '', calories: '', protein: '', carbs: '', fat: '', type: '아침', image: null });
    setShowMealModal(false);
    setAnalysisError(null);
  };

  const deleteMeal = (id) => {
    const updated = meals.filter(m => m.id !== id);
    setMeals(updated);
    save('meals', updated);
  };

  const saveGoals = () => {
    const newGoals = {
      targetWeight: parseFloat(goalInput.targetWeight) || 65,
      dailyCalories: parseFloat(goalInput.dailyCalories) || 1800,
      fastingHours: parseFloat(goalInput.fastingHours) || 16,
      protein: parseFloat(goalInput.protein) || 100,
      carbs: parseFloat(goalInput.carbs) || 200,
      fat: parseFloat(goalInput.fat) || 60,
    };
    setGoals(newGoals);
    save('goals', newGoals);
    setShowGoalsModal(false);
  };

  const lastMeal = useMemo(() => {
    if (meals.length === 0) return null;
    return [...meals].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  }, [meals]);

  const fastingElapsed = lastMeal ? (now - new Date(lastMeal.date).getTime()) / 1000 : 0;
  const fastingHoursTotal = fastingElapsed / 3600;
  const fastingHours = Math.floor(fastingElapsed / 3600);
  const fastingMinutes = Math.floor((fastingElapsed % 3600) / 60);
  const fastingSeconds = Math.floor(fastingElapsed % 60);
  const fastingProgress = Math.min((fastingHoursTotal / goals.fastingHours) * 100, 100);
  const fastingGoalMet = fastingHoursTotal >= goals.fastingHours;

  const fastingHistory = useMemo(() => {
    if (meals.length < 2) return [];
    const sorted = [...meals].sort((a, b) => new Date(a.date) - new Date(b.date));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const start = new Date(sorted[i - 1].date).getTime();
      const end = new Date(sorted[i].date).getTime();
      const hours = (end - start) / 1000 / 3600;
      if (hours >= 4) gaps.push({ id: start, start, end, hours, metGoal: hours >= goals.fastingHours });
    }
    return gaps.reverse();
  }, [meals, goals.fastingHours]);

  const today = new Date().toDateString();
  const todayMeals = meals.filter(m => new Date(m.date).toDateString() === today);
  const todayTotals = todayMeals.reduce((acc, m) => ({
    calories: acc.calories + m.calories,
    protein: acc.protein + m.protein,
    carbs: acc.carbs + m.carbs,
    fat: acc.fat + m.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const latestWeight = weights[weights.length - 1]?.weight;
  const firstWeight = weights[0]?.weight;
  const weightDiff = latestWeight && firstWeight ? latestWeight - firstWeight : 0;

  const weightChartData = weights.map(w => ({
    date: new Date(w.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
    weight: w.weight,
  }));

  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toDateString();
      const dayMeals = meals.filter(m => new Date(m.date).toDateString() === dStr);
      const cal = dayMeals.reduce((s, m) => s + m.calories, 0);
      days.push({
        date: d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
        calories: Math.round(cal),
        metGoal: cal > 0 && cal <= goals.dailyCalories,
      });
    }
    return days;
  }, [meals, goals.dailyCalories]);

  const calorieGoalPct = Math.min((todayTotals.calories / goals.dailyCalories) * 100, 100);
  const weightGoalAchieved = latestWeight ? latestWeight <= goals.targetWeight : false;

  // === 💡 인사이트 엔진 ===
  const insights = useMemo(() => {
    const items = [];

    // 1. 공복 단계 분석
    if (lastMeal) {
      const h = fastingHoursTotal;
      if (h < 4) {
        items.push({ color: '#d4a574', icon: 'utensils', title: '소화·흡수 단계',
          body: `식사 후 ${h.toFixed(1)}시간 경과. 혈당과 인슐린이 상승해 영양소가 세포로 들어가는 중이에요. 가벼운 산책이 혈당 안정에 도움됩니다.`,
          action: '식후 10~15분 산책' });
      } else if (h < 8) {
        items.push({ color: '#d4a574', icon: 'droplet', title: '저장 모드',
          body: `${h.toFixed(1)}시간 경과. 인슐린이 떨어지면서 글리코겐(저장된 당)이 에너지로 쓰이기 시작했어요. 아직 지방 연소까지는 시간이 더 필요해요.`,
          action: '물 한 컵 마시기' });
      } else if (h < 12) {
        items.push({ color: '#c89878', icon: 'flame', title: '지방 연소 시작',
          body: `${h.toFixed(1)}시간 경과. 글리코겐이 거의 소진되어 지방을 분해해 에너지로 쓰는 '지방 산화' 단계에 진입했어요. 케톤체가 만들어지기 시작합니다.`,
          action: '단백질 위주의 가벼운 운동 권장' });
      } else if (h < 16) {
        items.push({ color: '#7a9b8e', icon: 'zap', title: '케토시스 진입',
          body: `${h.toFixed(1)}시간 경과. 본격적인 케토시스 상태로, 지방 분해가 활발해지고 인슐린 민감도가 개선되는 시간이에요. 정신이 또렷해지는 느낌이 들 수 있어요.`,
          action: '수분과 전해질(소금 약간) 보충' });
      } else if (h < 24) {
        items.push({ color: '#5b8c5a', icon: 'sparkles', title: '✨ 자가포식(오토파지) 진행 중',
          body: `${h.toFixed(1)}시간 경과. 세포가 손상되거나 오래된 단백질·미토콘드리아를 분해해 재활용하는 '자가포식' 단계예요. 노벨상 받은 그 기능이 지금 작동 중! 성장호르몬 분비도 늘어납니다.`,
          action: '무리한 운동보다 휴식 권장' });
      } else if (h < 48) {
        items.push({ color: '#5b8c5a', icon: 'heart', title: '심층 회복 모드',
          body: `${h.toFixed(1)}시간 경과. 자가포식이 더 강하게 활성화되고 면역세포 일부가 재생되는 단계예요. 단, 24시간 이상 공복은 사람에 따라 부담이 될 수 있으니 몸 상태를 잘 살피세요.`,
          action: '어지러움 있으면 단식 종료' });
      } else {
        items.push({ color: '#c87060', icon: 'alert', title: '장기 공복 주의',
          body: `${h.toFixed(1)}시간 경과. 48시간 이상의 단식은 의학적 감독 없이 권장되지 않아요. 전해질 불균형 위험이 있어요.`,
          action: '천천히 식사 재개' });
      }
    }

    // 2. 최근 식사 영향 분석
    if (lastMeal && fastingHoursTotal < 4) {
      const m = lastMeal;
      const fatPct = m.calories > 0 ? ((m.fat || 0) * 9) / m.calories * 100 : 0;
      const carbPct = m.calories > 0 ? ((m.carbs || 0) * 4) / m.calories * 100 : 0;
      const proteinPct = m.calories > 0 ? ((m.protein || 0) * 4) / m.calories * 100 : 0;

      if (fatPct > 40 && m.fat > 25) {
        items.push({ color: '#c87060', icon: 'alert', title: '고지방 식사 후 영향',
          body: `"${m.name}"의 지방 비율이 약 ${Math.round(fatPct)}%로 높았어요. 지방은 4~6시간 천천히 소화되어 포만감을 길게 주지만, 소화 부담과 함께 혈중 중성지방이 일시적으로 오를 수 있어요.`,
          action: '다음 식사는 단백질·채소 위주로 균형 맞추기' });
      } else if (carbPct > 60 && m.carbs > 50) {
        items.push({ color: '#d4a574', icon: 'flame', title: '고탄수화물 식사 후',
          body: `"${m.name}"의 탄수화물 비율이 약 ${Math.round(carbPct)}%였어요. 혈당이 빠르게 오르고 2~3시간 후 떨어지면서 졸음이나 단것이 당길 수 있어요. 식후 산책이 혈당 스파이크를 30~40% 완화합니다.`,
          action: '15분 산책 또는 가벼운 스트레칭' });
      } else if (proteinPct > 30 && m.protein > 25) {
        items.push({ color: '#7a9b8e', icon: 'heart', title: '단백질 충분한 식사',
          body: `"${m.name}"으로 단백질 ${m.protein}g 섭취. 근육 합성에 좋은 양이고 포만감도 오래 가요. 단백질은 식이성 발열효과가 높아 소화에 칼로리를 많이 써요.`,
          action: '수분 충분히 (단백질 대사에 필요)' });
      } else if (m.calories > 0 && fatPct >= 20 && fatPct <= 35 && carbPct >= 40 && carbPct <= 55 && proteinPct >= 15 && proteinPct <= 30) {
        items.push({ color: '#5b8c5a', icon: 'sparkles', title: '균형 잡힌 식사',
          body: `"${m.name}"은 탄수 ${Math.round(carbPct)}% / 단백질 ${Math.round(proteinPct)}% / 지방 ${Math.round(fatPct)}%로 이상적인 비율이에요. 혈당이 완만하게 오르고 영양소가 골고루 흡수돼요.`,
          action: '이런 비율 자주 유지하기' });
      }
    }

    // 3. 오늘 총량 분석
    if (todayMeals.length > 0) {
      const pct = (todayTotals.calories / goals.dailyCalories) * 100;
      if (pct > 110) {
        items.push({ color: '#c87060', icon: 'alert', title: '오늘 칼로리 초과',
          body: `목표 ${goals.dailyCalories}kcal를 ${Math.round(todayTotals.calories - goals.dailyCalories)}kcal 초과했어요. 한 끼 정도는 괜찮지만, 내일은 조금 줄이거나 활동량을 늘려서 보완해보세요.`,
          action: '내일 가벼운 운동 30분' });
      } else if (pct >= 85 && pct <= 100 && todayMeals.length >= 2) {
        items.push({ color: '#5b8c5a', icon: 'sparkles', title: '오늘 칼로리 잘 맞췄어요',
          body: `목표의 ${Math.round(pct)}%로 이상적인 범위예요. 꾸준한 칼로리 관리는 체중 변화에 가장 큰 영향을 줘요.`,
          action: '지금 페이스 유지' });
      }
      const hour = new Date().getHours();
      if (hour >= 18 && todayTotals.protein < goals.protein * 0.6 && todayTotals.calories > goals.dailyCalories * 0.5) {
        items.push({ color: '#d4a574', icon: 'alert', title: '단백질이 부족해요',
          body: `오늘 단백질 ${Math.round(todayTotals.protein)}g으로 목표의 ${Math.round((todayTotals.protein/goals.protein)*100)}%만 섭취했어요. 단백질 부족은 근육 합성을 어렵게 하고 다음 날 포만감도 떨어뜨려요.`,
          action: '저녁이나 간식에 계란/두부/닭가슴살 추가' });
      }
    }

    // 4. 체중 트렌드 분석
    if (weights.length >= 3) {
      const recent = weights.slice(-7);
      if (recent.length >= 3) {
        const trend = recent[recent.length - 1].weight - recent[0].weight;
        const days = (new Date(recent[recent.length - 1].date) - new Date(recent[0].date)) / (1000 * 60 * 60 * 24);
        if (days > 0) {
          const weeklyRate = (trend / days) * 7;
          if (weeklyRate < -1) {
            items.push({ color: '#c87060', icon: 'alert', title: '체중 감소 속도가 빨라요',
              body: `최근 기준 주당 ${Math.abs(weeklyRate).toFixed(1)}kg씩 감소 중. 건강한 감량은 주당 0.5~1kg이 권장돼요. 너무 빠른 감량은 근손실과 요요로 이어질 수 있어요.`,
              action: '칼로리 조금 늘리거나 단백질 강화' });
          } else if (weeklyRate <= -0.3 && weeklyRate >= -1) {
            items.push({ color: '#5b8c5a', icon: 'sparkles', title: '건강한 감량 페이스',
              body: `주당 ${Math.abs(weeklyRate).toFixed(2)}kg씩 감소 중. 지속 가능한 이상적인 속도예요. 이 속도로 가면 한 달 후 약 ${Math.abs(weeklyRate * 4).toFixed(1)}kg 감량 예상.`,
              action: '지금 패턴 유지' });
          } else if (weeklyRate > 0.3) {
            items.push({ color: '#d4a574', icon: 'alert', title: '체중이 증가 추세',
              body: `최근 주당 ${weeklyRate.toFixed(2)}kg씩 증가. 칼로리 섭취가 소비보다 많거나 운동량이 줄었을 수 있어요. 일주일치 식사 기록을 다시 살펴보세요.`,
              action: '간식 또는 가공식품 줄이기' });
          }
        }
      }
    }

    // 5. 공복 패턴 분석
    if (fastingHistory.length >= 3) {
      const recent = fastingHistory.slice(0, 5);
      const avgHours = recent.reduce((s, h) => s + h.hours, 0) / recent.length;
      const successRate = recent.filter(h => h.metGoal).length / recent.length * 100;
      if (successRate >= 70) {
        items.push({ color: '#7a9b8e', icon: 'heart', title: '공복 루틴이 안정적',
          body: `최근 ${recent.length}번 중 ${Math.round(successRate)}%가 목표 달성. 평균 ${avgHours.toFixed(1)}시간 공복 유지 중이에요. 인슐린 민감도와 대사 유연성이 개선되고 있을 가능성이 높아요.`,
          action: '단백질 섭취는 식사 창 안에서 모으기' });
      }
    }

    return items;
  }, [lastMeal, fastingHoursTotal, todayMeals, todayTotals, goals, weights, fastingHistory]);

  if (loading) return <div style={styles.loading}><div style={styles.loadingDot}></div></div>;

  return (
    <div style={styles.app}>
      <style>{globalStyles}</style>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
      <input ref={importFileRef} type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />

      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <div style={styles.brandKicker}>HEALTH JOURNAL</div>
            <h1 style={styles.brandTitle}>오늘의 기록</h1>
            <p style={styles.brandDate}>
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.iconBtn} onClick={() => { setApiKeyInput(apiKey); setShowApiKeyModal(true); }} title="API 키">
              <Key size={18} />
            </button>
            <button style={styles.iconBtn} onClick={() => { setGoalInput(goals); setShowGoalsModal(true); }}>
              <Settings size={20} />
            </button>
          </div>
        </div>
        <nav style={styles.tabs}>
          {[
            { id: 'dashboard', label: '대시보드' },
            { id: 'weight', label: '체중' },
            { id: 'meals', label: '식사' },
            { id: 'fasting', label: '공복' },
            { id: 'data', label: '백업' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ ...styles.tab, ...(activeTab === t.id ? styles.tabActive : {}) }}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={styles.main}>
        {activeTab === 'dashboard' && (
          <>
            {insights.length > 0 && (
              <div style={styles.insightSection}>
                <div style={styles.insightHeader}>
                  <Lightbulb size={16} />
                  <span>지금 내 몸의 상태</span>
                </div>
                <div style={styles.insightGrid}>
                  {insights.map((ins, idx) => <InsightCard key={idx} insight={ins} />)}
                </div>
              </div>
            )}

            <div style={styles.grid}>
              <div style={{ ...styles.card, ...styles.cardWeight }}>
                <div style={styles.cardHeader}><Scale size={18} /><span>현재 체중</span></div>
                <div style={styles.bigNum}>
                  {latestWeight ? latestWeight.toFixed(1) : '—'}
                  <span style={styles.unit}>kg</span>
                </div>
                <div style={styles.cardFooter}>
                  {weightDiff !== 0 && weights.length > 1 ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: weightDiff < 0 ? '#5b8c5a' : '#c87060' }}>
                      {weightDiff < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                      {Math.abs(weightDiff).toFixed(1)}kg
                    </span>
                  ) : <span style={{ opacity: 0.5 }}>변화 없음</span>}
                  <span style={{ opacity: 0.6 }}>목표 {goals.targetWeight}kg</span>
                </div>
              </div>

              <div style={{ ...styles.card, ...styles.cardCalories }}>
                <div style={styles.cardHeader}><Flame size={18} /><span>오늘의 칼로리</span></div>
                <div style={styles.bigNum}>
                  {Math.round(todayTotals.calories)}
                  <span style={styles.unit}>/ {goals.dailyCalories}</span>
                </div>
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${calorieGoalPct}%`, background: calorieGoalPct > 100 ? '#c87060' : '#d4a574' }} />
                </div>
                <div style={styles.cardFooter}><span style={{ opacity: 0.6 }}>{Math.round(calorieGoalPct)}% 섭취</span></div>
              </div>

              <div style={{ ...styles.card, ...styles.cardFasting }}>
                <div style={styles.cardHeader}><Clock size={18} /><span>공복 시간 (자동)</span></div>
                {lastMeal ? (
                  <>
                    <div style={styles.bigNum}>
                      {String(fastingHours).padStart(2, '0')}:{String(fastingMinutes).padStart(2, '0')}
                      <span style={styles.unit}>:{String(fastingSeconds).padStart(2, '0')}</span>
                    </div>
                    <div style={styles.progressBar}>
                      <div style={{ ...styles.progressFill, width: `${fastingProgress}%`, background: '#7a9b8e' }} />
                    </div>
                    <div style={styles.cardFooter}>
                      <span style={{ opacity: 0.6 }}>목표 {goals.fastingHours}시간</span>
                      {fastingGoalMet && <span style={styles.badge}>달성 ✓</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ ...styles.bigNum, opacity: 0.4 }}>—</div>
                    <div style={styles.cardFooter}><span style={{ opacity: 0.6 }}>식사 기록 후 자동 시작</span></div>
                  </>
                )}
              </div>

              <div style={{ ...styles.card, ...styles.cardGoals }}>
                <div style={styles.cardHeader}><Target size={18} /><span>오늘의 달성</span></div>
                <div style={styles.goalList}>
                  <GoalItem label="칼로리 목표" achieved={todayTotals.calories > 0 && todayTotals.calories <= goals.dailyCalories} />
                  <GoalItem label={`공복 ${goals.fastingHours}시간`} achieved={fastingGoalMet || fastingHistory.some(h => new Date(h.end).toDateString() === today && h.metGoal)} />
                  <GoalItem label="단백질 충족" achieved={todayTotals.protein >= goals.protein} />
                  <GoalItem label="목표 체중 도달" achieved={weightGoalAchieved} />
                </div>
              </div>

              <div style={{ ...styles.card, ...styles.cardWide }}>
                <div style={styles.cardHeader}><Scale size={18} /><span>체중 추이</span></div>
                {weightChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={weightChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#e8ddd0" />
                      <XAxis dataKey="date" stroke="#a89683" style={{ fontSize: 11 }} />
                      <YAxis stroke="#a89683" style={{ fontSize: 11 }} domain={['dataMin - 1', 'dataMax + 1']} />
                      <Tooltip contentStyle={{ background: '#fef8f0', border: '1px solid #d4a574', borderRadius: 4, fontSize: 12 }} />
                      <Line type="monotone" dataKey="weight" stroke="#8b6f47" strokeWidth={2.5} dot={{ fill: '#8b6f47', r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div style={styles.empty}>체중을 기록해보세요</div>}
              </div>

              <div style={{ ...styles.card, ...styles.cardWide }}>
                <div style={styles.cardHeader}><Flame size={18} /><span>최근 7일 칼로리</span></div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={last7Days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#e8ddd0" />
                    <XAxis dataKey="date" stroke="#a89683" style={{ fontSize: 11 }} />
                    <YAxis stroke="#a89683" style={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#fef8f0', border: '1px solid #d4a574', borderRadius: 4, fontSize: 12 }} />
                    <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                      {last7Days.map((entry, idx) => (
                        <Cell key={idx} fill={entry.metGoal ? '#7a9b8e' : entry.calories > goals.dailyCalories ? '#c87060' : '#d4a574'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ ...styles.card, ...styles.cardWide }}>
                <div style={styles.cardHeader}><UtensilsCrossed size={18} /><span>오늘의 영양소</span></div>
                <div style={styles.macroGrid}>
                  <MacroBar label="단백질" value={todayTotals.protein} goal={goals.protein} color="#7a9b8e" unit="g" />
                  <MacroBar label="탄수화물" value={todayTotals.carbs} goal={goals.carbs} color="#d4a574" unit="g" />
                  <MacroBar label="지방" value={todayTotals.fat} goal={goals.fat} color="#c89878" unit="g" />
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'weight' && (
          <div>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>체중 기록</h2>
              <button style={styles.primaryBtn} onClick={() => setShowWeightModal(true)}>
                <Plus size={16} /> 기록 추가
              </button>
            </div>
            {weightChartData.length > 0 && (
              <div style={{ ...styles.card, marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={weightChartData} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#e8ddd0" />
                    <XAxis dataKey="date" stroke="#a89683" style={{ fontSize: 11 }} />
                    <YAxis stroke="#a89683" style={{ fontSize: 11 }} domain={['dataMin - 1', 'dataMax + 1']} />
                    <Tooltip contentStyle={{ background: '#fef8f0', border: '1px solid #d4a574', borderRadius: 4, fontSize: 12 }} />
                    <Line type="monotone" dataKey="weight" stroke="#8b6f47" strokeWidth={3} dot={{ fill: '#8b6f47', r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div style={styles.list}>
              {[...weights].reverse().map(w => (
                <div key={w.id} style={styles.listItem}>
                  <div>
                    <div style={styles.listMain}>{w.weight.toFixed(1)} kg</div>
                    <div style={styles.listSub}>
                      {new Date(w.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                      {' · '}
                      {new Date(w.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button style={styles.deleteBtn} onClick={() => deleteWeight(w.id)}><Trash2 size={14} /></button>
                </div>
              ))}
              {weights.length === 0 && <div style={styles.empty}>아직 기록이 없어요</div>}
            </div>
          </div>
        )}

        {activeTab === 'meals' && (
          <div>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>식사 기록</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...styles.primaryBtn, background: '#7a9b8e' }} onClick={() => fileInputRef.current?.click()} disabled={analyzing}>
                  {analyzing ? <Loader2 size={16} className="spin" /> : <Camera size={16} />}
                  {analyzing ? '분석 중...' : '사진'}
                </button>
                <button style={styles.primaryBtn} onClick={() => {
                  setMealInput({ name: '', calories: '', protein: '', carbs: '', fat: '', type: getMealTypeByTime(), image: null });
                  setShowMealModal(true);
                }}>
                  <Edit3 size={16} /> 입력
                </button>
              </div>
            </div>
            <div style={styles.aiHint}>
              <Sparkles size={14} />
              <span>{apiKey ? '사진을 찍으면 AI가 자동으로 분석해요' : 'API 키 설정 후 사진 자동 분석 가능 (우상단 🔑)'}</span>
            </div>
            <div style={{ ...styles.card, marginBottom: 20 }}>
              <div style={styles.cardHeader}><span>오늘 합계</span></div>
              <div style={styles.summaryRow}>
                <div><div style={styles.summaryNum}>{Math.round(todayTotals.calories)}</div><div style={styles.summaryLabel}>kcal</div></div>
                <div><div style={styles.summaryNum}>{Math.round(todayTotals.protein)}</div><div style={styles.summaryLabel}>단백질g</div></div>
                <div><div style={styles.summaryNum}>{Math.round(todayTotals.carbs)}</div><div style={styles.summaryLabel}>탄수g</div></div>
                <div><div style={styles.summaryNum}>{Math.round(todayTotals.fat)}</div><div style={styles.summaryLabel}>지방g</div></div>
              </div>
            </div>
            <div style={styles.list}>
              {[...meals].reverse().map(m => (
                <div key={m.id} style={styles.listItem}>
                  {m.image && <img src={m.image} alt={m.name} style={styles.mealThumb} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.mealHead}>
                      <span style={styles.mealType}>{m.type}</span>
                      <span style={styles.listMain}>{m.name}</span>
                    </div>
                    <div style={styles.listSub}>
                      {Math.round(m.calories)}kcal · 단백질 {m.protein}g · 탄수 {m.carbs}g · 지방 {m.fat}g
                    </div>
                    <div style={styles.listMeta}>
                      {new Date(m.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                      {' · '}
                      {new Date(m.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button style={styles.deleteBtn} onClick={() => deleteMeal(m.id)}><Trash2 size={14} /></button>
                </div>
              ))}
              {meals.length === 0 && <div style={styles.empty}>아직 기록이 없어요</div>}
            </div>
          </div>
        )}

        {activeTab === 'fasting' && (
          <div>
            <h2 style={styles.sectionTitle}>공복 유지</h2>
            <div style={styles.aiHint}>
              <Sparkles size={14} />
              <span>마지막 식사 시각부터 자동으로 추적해요</span>
            </div>
            <div style={{ ...styles.card, textAlign: 'center', padding: '40px 20px', marginBottom: 20 }}>
              {lastMeal ? (
                <>
                  <div style={styles.fastingTimer}>
                    {String(fastingHours).padStart(2, '0')}
                    <span style={styles.timerColon}>:</span>
                    {String(fastingMinutes).padStart(2, '0')}
                    <span style={styles.timerColon}>:</span>
                    {String(fastingSeconds).padStart(2, '0')}
                  </div>
                  <div style={{ marginBottom: 8, opacity: 0.7, fontSize: 14 }}>
                    마지막 식사: <strong>{lastMeal.name}</strong>
                  </div>
                  <div style={{ marginBottom: 16, opacity: 0.5, fontSize: 12 }}>
                    {new Date(lastMeal.date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}부터
                  </div>
                  <div style={{ marginBottom: 16, opacity: 0.8 }}>
                    {fastingGoalMet ? `✨ 목표 달성! ${goals.fastingHours}시간 돌파` : `목표까지 ${(goals.fastingHours - fastingHoursTotal).toFixed(1)}시간`}
                  </div>
                  <div style={{ ...styles.progressBar, marginBottom: 8, height: 10 }}>
                    <div style={{ ...styles.progressFill, width: `${fastingProgress}%`, background: fastingGoalMet ? '#7a9b8e' : '#d4a574' }} />
                  </div>
                </>
              ) : (
                <>
                  <Clock size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                  <div style={{ fontSize: 16, marginBottom: 8, opacity: 0.7 }}>아직 식사 기록이 없어요</div>
                  <div style={{ fontSize: 13, opacity: 0.5 }}>첫 식사 기록 후 자동 시작됩니다</div>
                </>
              )}
            </div>

            {lastMeal && (
              <div style={{ ...styles.card, marginBottom: 20 }}>
                <div style={styles.cardHeader}><Activity size={18} /><span>공복 단계</span></div>
                <FastingStages currentHours={fastingHoursTotal} />
              </div>
            )}

            <h3 style={{ ...styles.sectionTitle, fontSize: 16 }}>지난 공복 (4시간 이상)</h3>
            <div style={styles.list}>
              {fastingHistory.map(h => (
                <div key={h.id} style={styles.listItem}>
                  <div>
                    <div style={styles.listMain}>
                      {h.hours.toFixed(1)}시간
                      {h.metGoal && <span style={{ ...styles.badge, marginLeft: 8 }}>달성 ✓</span>}
                    </div>
                    <div style={styles.listSub}>
                      {new Date(h.start).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' → '}
                      {new Date(h.end).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {fastingHistory.length === 0 && <div style={styles.empty}>아직 기록이 없어요</div>}
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div>
            <h2 style={styles.sectionTitle}>데이터 백업</h2>
            <div style={styles.aiHint}>
              <Sparkles size={14} />
              <span>가끔 백업해두면 폰을 바꿔도 데이터를 복원할 수 있어요</span>
            </div>
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={styles.cardHeader}><Download size={18} /><span>내보내기</span></div>
              <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 16px' }}>
                모든 기록을 JSON 파일로 저장해요. 체중 {weights.length}개, 식사 {meals.length}개.
              </p>
              <button style={{ ...styles.primaryBtn, width: '100%', justifyContent: 'center' }} onClick={exportData}>
                <Download size={16} /> JSON 파일로 다운로드
              </button>
            </div>
            <div style={styles.card}>
              <div style={styles.cardHeader}><Upload size={18} /><span>불러오기</span></div>
              <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 16px' }}>
                백업한 JSON 파일을 선택하면 기존 데이터를 덮어써요.
              </p>
              <button style={{ ...styles.primaryBtn, background: '#7a9b8e', width: '100%', justifyContent: 'center' }} onClick={() => importFileRef.current?.click()}>
                <Upload size={16} /> 파일에서 불러오기
              </button>
            </div>
            <div style={{ ...styles.card, marginTop: 16, background: 'rgba(122, 155, 142, 0.08)', border: 'none' }}>
              <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
                <strong>💡 데이터 안전 안내</strong><br />
                데이터는 휴대폰 브라우저에 저장돼요. 브라우저 데이터 삭제나 앱 제거 시 사라질 수 있으니 주기적으로 백업하세요.
              </div>
            </div>
          </div>
        )}
      </main>

      {showWeightModal && (
        <Modal title="체중 기록" onClose={() => setShowWeightModal(false)}>
          <label style={styles.label}>체중 (kg)</label>
          <input type="number" step="0.1" style={styles.input} value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="65.5" autoFocus />
          <button style={{ ...styles.primaryBtn, width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={addWeight}>저장</button>
        </Modal>
      )}

      {showMealModal && (
        <Modal title={mealInput.image ? "AI 분석 결과 확인" : "식사 기록"} onClose={() => { setShowMealModal(false); setAnalysisError(null); }}>
          {analysisError && <div style={styles.errorBox}>{analysisError}</div>}
          {mealInput.image && (
            <div style={styles.analysisPreview}>
              <img src={mealInput.image} alt="식사" style={styles.previewImg} />
              {mealInput.notes && (
                <div style={styles.analysisNote}>
                  <Sparkles size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{mealInput.notes}</span>
                </div>
              )}
              {mealInput.confidence && (
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
                  AI 신뢰도: {mealInput.confidence === 'high' ? '높음' : mealInput.confidence === 'medium' ? '보통' : '낮음'} · 값을 수정할 수 있어요
                </div>
              )}
            </div>
          )}
          <label style={styles.label}>구분</label>
          <div style={styles.typeRow}>
            {['아침', '점심', '저녁', '간식'].map(t => (
              <button key={t} onClick={() => setMealInput({ ...mealInput, type: t })} style={{ ...styles.typeBtn, ...(mealInput.type === t ? styles.typeBtnActive : {}) }}>{t}</button>
            ))}
          </div>
          <label style={styles.label}>음식 이름</label>
          <input style={styles.input} value={mealInput.name} onChange={e => setMealInput({ ...mealInput, name: e.target.value })} />
          <label style={styles.label}>칼로리 (kcal)</label>
          <input type="number" style={styles.input} value={mealInput.calories} onChange={e => setMealInput({ ...mealInput, calories: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><label style={styles.label}>단백질g</label><input type="number" style={styles.input} value={mealInput.protein} onChange={e => setMealInput({ ...mealInput, protein: e.target.value })} /></div>
            <div><label style={styles.label}>탄수g</label><input type="number" style={styles.input} value={mealInput.carbs} onChange={e => setMealInput({ ...mealInput, carbs: e.target.value })} /></div>
            <div><label style={styles.label}>지방g</label><input type="number" style={styles.input} value={mealInput.fat} onChange={e => setMealInput({ ...mealInput, fat: e.target.value })} /></div>
          </div>
          <button style={{ ...styles.primaryBtn, width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={addMeal}>저장</button>
        </Modal>
      )}

      {showGoalsModal && (
        <Modal title="목표 설정" onClose={() => setShowGoalsModal(false)}>
          <label style={styles.label}>목표 체중 (kg)</label>
          <input type="number" step="0.1" style={styles.input} value={goalInput.targetWeight} onChange={e => setGoalInput({ ...goalInput, targetWeight: e.target.value })} />
          <label style={styles.label}>하루 칼로리 (kcal)</label>
          <input type="number" style={styles.input} value={goalInput.dailyCalories} onChange={e => setGoalInput({ ...goalInput, dailyCalories: e.target.value })} />
          <label style={styles.label}>공복 시간 (시간)</label>
          <input type="number" style={styles.input} value={goalInput.fastingHours} onChange={e => setGoalInput({ ...goalInput, fastingHours: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><label style={styles.label}>단백질g</label><input type="number" style={styles.input} value={goalInput.protein} onChange={e => setGoalInput({ ...goalInput, protein: e.target.value })} /></div>
            <div><label style={styles.label}>탄수g</label><input type="number" style={styles.input} value={goalInput.carbs} onChange={e => setGoalInput({ ...goalInput, carbs: e.target.value })} /></div>
            <div><label style={styles.label}>지방g</label><input type="number" style={styles.input} value={goalInput.fat} onChange={e => setGoalInput({ ...goalInput, fat: e.target.value })} /></div>
          </div>
          <button style={{ ...styles.primaryBtn, width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={saveGoals}>저장</button>
        </Modal>
      )}

      {showApiKeyModal && (
        <Modal title="Anthropic API 키" onClose={() => setShowApiKeyModal(false)}>
          <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.6, marginBottom: 12 }}>
            사진 자동 분석을 사용하려면 Anthropic API 키가 필요해요.<br />
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#8b6f47' }}>console.anthropic.com</a>에서 발급받을 수 있어요.
          </div>
          <div style={{ ...styles.errorBox, fontSize: 12, background: 'rgba(212, 165, 116, 0.15)', color: '#8b6f47' }}>
            ⚠️ 키는 이 휴대폰 브라우저에만 저장되며 분석 시에만 Anthropic 서버로 전송돼요. 공용 기기에서는 사용하지 마세요.
          </div>
          <label style={styles.label}>API 키 (sk-ant-...)</label>
          <input type="password" style={styles.input} value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="sk-ant-api03-..." />
          <button style={{ ...styles.primaryBtn, width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={saveApiKey}>저장</button>
          {apiKey && (
            <button style={{ ...styles.primaryBtn, width: '100%', justifyContent: 'center', marginTop: 8, background: 'transparent', color: '#c87060', border: '1px solid #c87060' }} onClick={() => { setApiKey(''); setApiKeyInput(''); save('apiKey', ''); }}>키 삭제</button>
          )}
        </Modal>
      )}
    </div>
  );
}

function InsightCard({ insight }) {
  const iconMap = {
    flame: <Flame size={16} />, droplet: <Droplet size={16} />, zap: <Zap size={16} />,
    sparkles: <Sparkles size={16} />, heart: <Heart size={16} />, alert: <AlertCircle size={16} />,
    utensils: <UtensilsCrossed size={16} />, activity: <Activity size={16} />,
  };
  return (
    <div style={{ ...styles.insightCard, borderLeft: `3px solid ${insight.color}` }}>
      <div style={{ ...styles.insightCardHeader, color: insight.color }}>
        {iconMap[insight.icon] || <Lightbulb size={16} />}
        <span style={styles.insightCardTitle}>{insight.title}</span>
      </div>
      <div style={styles.insightCardBody}>{insight.body}</div>
      {insight.action && (
        <div style={{ ...styles.insightAction, color: insight.color }}>→ {insight.action}</div>
      )}
    </div>
  );
}

function FastingStages({ currentHours }) {
  const stages = [
    { label: '소화', range: '0~4h', max: 4, color: '#d4a574' },
    { label: '저장', range: '4~8h', max: 8, color: '#d4a574' },
    { label: '지방연소', range: '8~12h', max: 12, color: '#c89878' },
    { label: '케토시스', range: '12~16h', max: 16, color: '#7a9b8e' },
    { label: '자가포식', range: '16~24h', max: 24, color: '#5b8c5a' },
    { label: '심층회복', range: '24h+', max: 48, color: '#5b8c5a' },
  ];
  return (
    <div style={styles.stagesContainer}>
      {stages.map((stage, idx) => {
        const prevMax = idx === 0 ? 0 : stages[idx - 1].max;
        const isActive = currentHours >= prevMax && currentHours < stage.max;
        const isPassed = currentHours >= stage.max;
        const opacity = isActive ? 1 : isPassed ? 0.85 : 0.3;
        return (
          <div key={stage.label} style={{
            ...styles.stageItem, opacity,
            background: isActive ? `${stage.color}22` : 'transparent',
            border: isActive ? `1px solid ${stage.color}` : '1px solid transparent',
          }}>
            <div style={{ ...styles.stageDot, background: isPassed || isActive ? stage.color : '#e8ddd0' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 500 }}>{stage.label}</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{stage.range}</div>
            </div>
            {isActive && <span style={{ ...styles.badge, background: stage.color, marginLeft: 'auto' }}>지금</span>}
          </div>
        );
      })}
    </div>
  );
}

function GoalItem({ label, achieved }) {
  return (
    <div style={styles.goalItem}>
      <div style={{ ...styles.goalDot, background: achieved ? '#7a9b8e' : '#e8ddd0' }}>{achieved && '✓'}</div>
      <span style={{ opacity: achieved ? 1 : 0.55 }}>{label}</span>
    </div>
  );
}

function MacroBar({ label, value, goal, color, unit }) {
  const pct = Math.min((value / goal) * 100, 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <span><strong>{Math.round(value)}</strong> / {goal}{unit}</span>
      </div>
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: 22 }}>{title}</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; }
  input:focus { outline: none; border-color: #8b6f47 !important; }
  button { cursor: pointer; font-family: inherit; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
`;

const styles = {
  app: { minHeight: '100vh', background: 'linear-gradient(180deg, #fef8f0 0%, #f5ebd9 100%)', fontFamily: "'Inter', -apple-system, sans-serif", color: '#3d2f1f', paddingBottom: 40 },
  loading: { minHeight: '100vh', background: '#fef8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loadingDot: { width: 12, height: 12, borderRadius: '50%', background: '#8b6f47', animation: 'pulse 1.2s ease-in-out infinite' },
  header: { padding: '32px 24px 0', maxWidth: 1200, margin: '0 auto' },
  headerInner: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  brandKicker: { fontSize: 11, letterSpacing: '0.2em', color: '#8b6f47', fontWeight: 600, marginBottom: 4 },
  brandTitle: { fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 36, margin: 0, color: '#3d2f1f', letterSpacing: '-0.02em' },
  brandDate: { margin: '4px 0 0', opacity: 0.6, fontSize: 13 },
  iconBtn: { background: 'rgba(139, 111, 71, 0.08)', border: 'none', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b6f47', transition: 'background 0.2s' },
  tabs: { display: 'flex', gap: 4, borderBottom: '1px solid #e8ddd0', overflowX: 'auto' },
  tab: { background: 'none', border: 'none', padding: '12px 16px', fontSize: 14, color: '#a89683', fontWeight: 500, borderBottom: '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' },
  tabActive: { color: '#3d2f1f', borderBottom: '2px solid #8b6f47' },
  main: { maxWidth: 1200, margin: '0 auto', padding: '24px' },
  insightSection: { marginBottom: 24, animation: 'slideIn 0.5s ease-out' },
  insightHeader: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#8b6f47', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 },
  insightGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 },
  insightCard: { background: '#fefaf2', border: '1px solid #e8ddd0', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(139, 111, 71, 0.04)' },
  insightCardHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  insightCardTitle: { fontSize: 14, fontWeight: 600, fontFamily: "'Fraunces', serif" },
  insightCardBody: { fontSize: 13, lineHeight: 1.6, opacity: 0.85, color: '#3d2f1f' },
  insightAction: { fontSize: 12, fontWeight: 500, marginTop: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: 6, display: 'inline-block' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, animation: 'fadeIn 0.4s ease-out' },
  card: { background: '#fefaf2', border: '1px solid #e8ddd0', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(139, 111, 71, 0.04)' },
  cardWide: { gridColumn: 'span 2', minWidth: 0 },
  cardWeight: { borderTop: '3px solid #8b6f47' },
  cardCalories: { borderTop: '3px solid #d4a574' },
  cardFasting: { borderTop: '3px solid #7a9b8e' },
  cardGoals: { borderTop: '3px solid #c89878' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, opacity: 0.7, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  bigNum: { fontFamily: "'Fraunces', serif", fontSize: 42, fontWeight: 500, lineHeight: 1.1, letterSpacing: '-0.02em' },
  unit: { fontSize: 16, opacity: 0.5, marginLeft: 4, fontWeight: 400 },
  cardFooter: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 12 },
  progressBar: { height: 6, background: '#f0e5d3', borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: 3, transition: 'width 0.5s ease' },
  badge: { background: '#7a9b8e', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500 },
  goalList: { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 },
  goalItem: { display: 'flex', alignItems: 'center', gap: 10 },
  goalDot: { width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 600, flexShrink: 0 },
  empty: { padding: 32, textAlign: 'center', opacity: 0.4, fontStyle: 'italic' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  sectionTitle: { fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 500, margin: 0 },
  primaryBtn: { background: '#8b6f47', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.2s' },
  aiHint: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(122, 155, 142, 0.12)', color: '#5a7a6e', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  listItem: { background: '#fefaf2', border: '1px solid #e8ddd0', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  mealThumb: { width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid #e8ddd0', flexShrink: 0 },
  listMain: { fontWeight: 500, fontSize: 15 },
  listSub: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  listMeta: { fontSize: 11, opacity: 0.45, marginTop: 2 },
  mealHead: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  mealType: { background: '#f0e5d3', color: '#8b6f47', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500 },
  deleteBtn: { background: 'none', border: 'none', color: '#c87060', opacity: 0.5, padding: 6, transition: 'opacity 0.2s' },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, textAlign: 'center' },
  summaryNum: { fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500 },
  summaryLabel: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  macroGrid: { display: 'flex', flexDirection: 'column', gap: 14 },
  fastingTimer: { fontFamily: "'Fraunces', serif", fontSize: 56, fontWeight: 400, letterSpacing: '-0.02em', marginBottom: 12, fontVariantNumeric: 'tabular-nums' },
  timerColon: { opacity: 0.3, margin: '0 4px' },
  stagesContainer: { display: 'flex', flexDirection: 'column', gap: 8 },
  stageItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, transition: 'all 0.3s' },
  stageDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(61, 47, 31, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16, animation: 'fadeIn 0.2s' },
  modal: { background: '#fefaf2', borderRadius: 16, padding: 24, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(61, 47, 31, 0.2)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  label: { display: 'block', fontSize: 12, fontWeight: 500, opacity: 0.7, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { width: '100%', padding: '10px 14px', background: '#fff', border: '1px solid #e8ddd0', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', color: '#3d2f1f', transition: 'border-color 0.2s' },
  typeRow: { display: 'flex', gap: 6, marginBottom: 8 },
  typeBtn: { flex: 1, background: '#fff', border: '1px solid #e8ddd0', padding: '8px 12px', borderRadius: 8, fontSize: 13, color: '#3d2f1f', transition: 'all 0.2s' },
  typeBtnActive: { background: '#8b6f47', color: '#fff', borderColor: '#8b6f47' },
  analysisPreview: { background: 'rgba(122, 155, 142, 0.08)', borderRadius: 12, padding: 12, marginBottom: 4 },
  previewImg: { width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 8 },
  analysisNote: { display: 'flex', gap: 6, fontSize: 12, color: '#5a7a6e', lineHeight: 1.5 },
  errorBox: { background: 'rgba(200, 112, 96, 0.12)', color: '#a8543e', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 4 },
};
