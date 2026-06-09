'use client'

import React, { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, DollarSign, Users, Percent, Trophy, Clock, Info, ShieldAlert, BarChart3, PieChart } from 'lucide-react'
import { Reservation, Therapist } from '../dashboard/CalendarView'
import { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDateString } from '@/utils/booking/dateUtils'

interface StatsManagerProps {
  supabase: SupabaseClient
  currentUserId: string
}

interface TherapistStats {
  id: number
  name: string
  isActive: boolean
  isPremiumTarget: boolean
  count: number
  revenue: number
  cancelledCount: number
}

interface TimeSlotStats {
  label: string
  count: number
  revenue: number
}

export default function StatsManager({ supabase, currentUserId }: StatsManagerProps) {
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateString(new Date()))
  const [activeMetric, setActiveMetric] = useState<'count' | 'revenue'>('count')
  
  const [loading, setLoading] = useState(true)
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])

  // 1. 기간 범위 계산
  const getPeriodRange = () => {
    const baseDate = new Date(selectedDate)
    
    if (periodType === 'daily') {
      const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0)
      const end = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59, 999)
      return { start, end }
    } else if (periodType === 'weekly') {
      const day = baseDate.getDay()
      // 월요일 시작으로 가공 (Sunday=0, Monday=1, ..., Saturday=6)
      const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(baseDate.setDate(diff))
      
      const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0, 0)
      const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999)
      return { start, end }
    } else { // monthly
      const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 0, 0, 0, 0)
      const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999)
      return { start, end }
    }
  }

  const { start: periodStart, end: periodEnd } = getPeriodRange()

  // 2. 데이터 가져오기
  const fetchData = async () => {
    setLoading(true)
    try {
      // 마사지사 목록 가져오기
      const { data: therapistData, error: tError } = await supabase
        .from('therapists')
        .select('*')
        .order('id', { ascending: true })

      if (tError) throw tError
      setTherapists((therapistData as Therapist[]) || [])

      // 해당 기간 내 예약 목록 가져오기 (확정 + 취소 전체)
      const { data: reservationData, error: rError } = await supabase
        .from('reservations')
        .select('*')
        .gte('start_time', periodStart.toISOString())
        .lte('start_time', periodEnd.toISOString())

      if (rError) throw rError
      setReservations((reservationData as Reservation[]) || [])
    } catch (error) {
      console.error('Error fetching statistics data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, selectedDate])

  // 3. 날짜 이동 핸들러
  const handlePrevPeriod = () => {
    const d = new Date(selectedDate)
    if (periodType === 'daily') {
      d.setDate(d.getDate() - 1)
    } else if (periodType === 'weekly') {
      d.setDate(d.getDate() - 7)
    } else {
      d.setMonth(d.getMonth() - 1)
    }
    setSelectedDate(toLocalDateString(d))
  }

  const handleNextPeriod = () => {
    const d = new Date(selectedDate)
    if (periodType === 'daily') {
      d.setDate(d.getDate() + 1)
    } else if (periodType === 'weekly') {
      d.setDate(d.getDate() + 7)
    } else {
      d.setMonth(d.getMonth() + 1)
    }
    setSelectedDate(toLocalDateString(d))
  }

  // 4. 기간 텍스트 라벨 포맷
  const getPeriodLabel = () => {
    const startStr = toLocalDateString(periodStart)
    const endStr = toLocalDateString(periodEnd)
    
    if (periodType === 'daily') {
      return `${startStr} (일간)`
    } else if (periodType === 'weekly') {
      return `${startStr} ~ ${endStr} (주간)`
    } else {
      const year = periodStart.getFullYear()
      const month = periodStart.getMonth() + 1
      return `${year}년 ${month}월 (월간)`
    }
  }

  // ===================================================
  // [데이터 통계 및 분석 연산]
  // ===================================================

  // 예약 분할
  const confirmedRes = reservations.filter(r => r.status === 'confirmed')
  const cancelledRes = reservations.filter(r => r.status === 'cancelled')

  // KPI 요약 메트릭 계산
  const totalBookings = confirmedRes.length
  const totalRevenue = confirmedRes.reduce((sum, r) => sum + Number(r.price), 0)
  const premiumBookings = confirmedRes.filter(r => r.is_premium).length
  const premiumRatio = totalBookings > 0 ? Math.round((premiumBookings / totalBookings) * 100) : 0
  const cancellationRate = reservations.length > 0 ? Math.round((cancelledRes.length / reservations.length) * 100) : 0

  // 마사지사별 실적 집계
  const therapistStatsList: TherapistStats[] = therapists.map(t => {
    const tBookings = confirmedRes.filter(r => r.therapist_id === t.id)
    const tCancelled = cancelledRes.filter(r => r.therapist_id === t.id)
    const tRevenue = tBookings.reduce((sum, r) => sum + Number(r.price), 0)

    return {
      id: t.id,
      name: t.name,
      isActive: t.is_active,
      isPremiumTarget: t.is_premium_target,
      count: tBookings.length,
      revenue: tRevenue,
      cancelledCount: tCancelled.length
    }
  })

  // 정렬 순서 적용 (선택 정렬 메트릭 기준 내림차순)
  const sortedTherapistStats = [...therapistStatsList].sort((a, b) => {
    if (activeMetric === 'count') {
      if (b.count !== a.count) return b.count - a.count
      return b.revenue - a.revenue // 동률 시 매출 우선
    } else {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue
      return b.count - a.count // 동률 시 건수 우선
    }
  })

  // 최우수 마사지사 (건수 기준 탑)
  const topTherapist = [...therapistStatsList].sort((a, b) => b.count - a.count)[0]

  // 최우수 매출 마사지사 (매출 기준 탑)
  const topRevenueTherapist = [...therapistStatsList].sort((a, b) => b.revenue - a.revenue)[0]

  // 최대값 계산 (막대 퍼센트 비례 렌더링용)
  const maxTherapistCount = Math.max(...therapistStatsList.map(t => t.count), 1)
  const maxTherapistRevenue = Math.max(...therapistStatsList.map(t => t.revenue), 1)

  // ===================================================
  // [트렌드 시계열 분석 차트 데이터 생성]
  // ===================================================
  const getTrendData = (): TimeSlotStats[] => {
    if (periodType === 'daily') {
      // 시간대별 분포 (9시 ~ 24시)
      const hourSlots = Array.from({ length: 16 }, (_, i) => i + 9) // 9 ~ 24
      return hourSlots.map(hour => {
        const slotBookings = confirmedRes.filter(r => {
          const rDate = new Date(r.start_time)
          return rDate.getHours() === hour
        })
        const rev = slotBookings.reduce((sum, r) => sum + Number(r.price), 0)
        return {
          label: `${String(hour).padStart(2, '0')}시`,
          count: slotBookings.length,
          revenue: rev
        }
      })
    } else if (periodType === 'weekly') {
      // 요일별 분포 (월 ~ 일)
      const dayNames = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
      return dayNames.map((name, index) => {
        // Javascript Date getDay: 0=Sun, 1=Mon, ..., 6=Sat
        const targetDayVal = index === 6 ? 0 : index + 1 // 월요일=1, ..., 일요일=0
        const slotBookings = confirmedRes.filter(r => {
          const rDate = new Date(r.start_time)
          return rDate.getDay() === targetDayVal
        })
        const rev = slotBookings.reduce((sum, r) => sum + Number(r.price), 0)
        return {
          label: name.slice(0, 3), // '월요일' -> '월요일' 또는 '월'
          count: slotBookings.length,
          revenue: rev
        }
      })
    } else {
      // 월간 일별 분포 (1일 ~ 마지막날)
      const daysCount = periodEnd.getDate()
      return Array.from({ length: daysCount }, (_, i) => i + 1).map(day => {
        const slotBookings = confirmedRes.filter(r => {
          const rDate = new Date(r.start_time)
          return rDate.getDate() === day
        })
        const rev = slotBookings.reduce((sum, r) => sum + Number(r.price), 0)
        return {
          label: `${day}일`,
          count: slotBookings.length,
          revenue: rev
        }
      })
    }
  }

  const trendStats = getTrendData()
  const maxTrendCount = Math.max(...trendStats.map(s => s.count), 1)
  const maxTrendRevenue = Math.max(...trendStats.map(s => s.revenue), 1)

  return (
    <div className="space-y-6">
      {/* 기간 선택 컨트롤러 */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/40 p-4 rounded-xl border border-slate-800 backdrop-blur-md">
        {/* 단위 선택 */}
        <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-inner">
          {(['daily', 'weekly', 'monthly'] as const).map(type => (
            <button
              key={type}
              onClick={() => setPeriodType(type)}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-all capitalize ${
                periodType === type
                  ? 'bg-slate-900 text-indigo-400 border border-slate-850 shadow'
                  : 'bg-transparent text-slate-500 hover:text-slate-350'
              }`}
            >
              {type === 'daily' ? '일간' : type === 'weekly' ? '주간' : '월간'}
            </button>
          ))}
        </div>

        {/* 날짜 네비게이터 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevPeriod}
            className="p-2 rounded-xl bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-850 rounded-xl px-4 py-2 min-w-[180px] justify-center relative group">
            <CalendarIcon className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-slate-200 font-mono">{getPeriodLabel()}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          <button
            onClick={handleNextPeriod}
            className="p-2 rounded-xl bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center border border-slate-900 bg-slate-900/10 rounded-2xl">
          <span className="text-xs text-slate-400 animate-pulse font-medium">통계 데이터를 로딩하는 중...</span>
        </div>
      ) : (
        <>
          {/* KPI 요약 메트릭 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 총 확정 예약 건수 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 flex items-center justify-between shadow-lg shadow-slate-950/20">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">총 예약 건수</span>
                <span className="text-2xl font-black text-slate-100 font-mono tracking-tight">{totalBookings}건</span>
                <span className="text-[9px] text-slate-500 block">취소건: {cancelledRes.length}건 (비율 {cancellationRate}%)</span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-450 shadow-inner">
                <BarChart3 className="w-5 h-5" />
              </div>
            </div>

            {/* 총 매출액 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 flex items-center justify-between shadow-lg shadow-slate-950/20">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">총 매출액</span>
                <span className="text-2xl font-black text-indigo-400 font-mono tracking-tight">{totalRevenue.toLocaleString()}원</span>
                <span className="text-[9px] text-slate-500 block">확정된 예약 기준 정산 금액</span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-450 shadow-inner">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            {/* 고급 코스 점유율 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 flex items-center justify-between shadow-lg shadow-slate-950/20">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">고급 마사지 비중</span>
                <span className="text-2xl font-black text-amber-500 font-mono tracking-tight">{premiumRatio}%</span>
                <span className="text-[9px] text-slate-500 block">10만원 이상 코스: {premiumBookings}건</span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-550 shadow-inner">
                <Percent className="w-5 h-5" />
              </div>
            </div>

            {/* 최다 예약 마사지사 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 flex items-center justify-between shadow-lg shadow-slate-950/20">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">우수 마사지사 (최다건)</span>
                <span className="text-2xl font-black text-slate-100 tracking-tight">
                  {topTherapist && topTherapist.count > 0 ? `${topTherapist.name}` : '없음'}
                </span>
                <span className="text-[9px] text-slate-500 block">
                  {topTherapist && topTherapist.count > 0 ? `누적 배정: ${topTherapist.count}건 / ${topTherapist.revenue.toLocaleString()}원` : '데이터가 없습니다.'}
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 shadow-inner">
                <Trophy className="w-5 h-5 animate-pulse" />
              </div>
            </div>
          </div>

          {/* 차트 영역 분할 레이아웃 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 1. 마사지사별 예약/매출 비교 가로 막대 차트 (7열) */}
            <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300">마사지사별 실적 현황 랭킹</h3>
                </div>
                
                {/* 정렬 메트릭 토글 */}
                <div className="flex bg-slate-950 border border-slate-850 rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveMetric('count')}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded transition-all ${
                      activeMetric === 'count'
                        ? 'bg-slate-900 text-indigo-400 shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
                        : 'bg-transparent text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    예약 건수순
                  </button>
                  <button
                    onClick={() => setActiveMetric('revenue')}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded transition-all ${
                      activeMetric === 'revenue'
                        ? 'bg-slate-900 text-indigo-400 shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
                        : 'bg-transparent text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    매출액순
                  </button>
                </div>
              </div>

              {/* 랭킹 리스트 가로 바 차트 */}
              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                {sortedTherapistStats.map((item, index) => {
                  // 바 퍼센트 계산
                  const countPercent = Math.min((item.count / maxTherapistCount) * 100, 100)
                  const revenuePercent = Math.min((item.revenue / maxTherapistRevenue) * 100, 100)
                  
                  const isTop = activeMetric === 'count' 
                    ? topTherapist && item.id === topTherapist.id && item.count > 0
                    : topRevenueTherapist && item.id === topRevenueTherapist.id && item.revenue > 0

                  return (
                    <div 
                      key={item.id} 
                      className={`p-3 rounded-lg border transition-all ${
                        isTop 
                          ? 'bg-amber-500/5 border-amber-500/30' 
                          : 'bg-slate-950/20 border-slate-850 hover:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                            index === 0 
                              ? 'bg-amber-500 text-slate-950 font-black' 
                              : index === 1 
                              ? 'bg-slate-400 text-slate-950' 
                              : index === 2 
                              ? 'bg-amber-700/50 text-amber-200' 
                              : 'bg-slate-900 text-slate-500'
                          }`}>
                            {index + 1}
                          </span>
                          <span className="font-bold text-slate-200">{item.name}</span>
                          {!item.isActive && (
                            <span className="text-[9px] bg-slate-900 text-slate-600 px-1 py-0.2 rounded">휴무</span>
                          )}
                          {item.isPremiumTarget && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1 py-0.2 rounded font-semibold">고급담당</span>
                          )}
                        </div>
                        <div className="text-right font-mono text-[11px] font-semibold text-slate-350">
                          <span className={activeMetric === 'count' ? 'text-indigo-450 font-extrabold' : 'text-slate-400'}>
                            {item.count}건
                          </span>
                          <span className="mx-1.5 text-slate-700">|</span>
                          <span className={activeMetric === 'revenue' ? 'text-emerald-450 font-extrabold' : 'text-slate-400'}>
                            {item.revenue.toLocaleString()}원
                          </span>
                        </div>
                      </div>

                      {/* 커스텀 그래프 막대 */}
                      <div className="w-full h-2 rounded-full bg-slate-950/80 overflow-hidden relative border border-slate-900">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop 
                              ? 'bg-gradient-to-r from-amber-500 to-yellow-400' 
                              : 'bg-gradient-to-r from-indigo-600 to-purple-500'
                          }`}
                          style={{ width: `${activeMetric === 'count' ? countPercent : revenuePercent}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 2. 기간 내 시간/요일/일별 세로 막대 트렌드 차트 (5열) */}
            <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/40 p-5 flex flex-col justify-between space-y-4">
              <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300">
                    {periodType === 'daily' ? '시간대별' : periodType === 'weekly' ? '요일별' : '일별'} 예약 건수 추이
                  </h3>
                </div>
                
                <span className="text-[10px] text-slate-500 font-medium">
                  단위: 예약 건수
                </span>
              </div>

              {/* 세로 막대 그래프 영역 */}
              <div className="flex-1 min-h-[260px] flex items-end justify-between gap-1.5 pt-6 pb-2 px-1 relative">
                {/* 배경 가이드 라인 (3단) */}
                <div className="absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between pointer-events-none">
                  <div className="border-t border-slate-850/50 w-full" />
                  <div className="border-t border-slate-850/50 w-full" />
                  <div className="border-t border-slate-850/50 w-full" />
                </div>

                {trendStats.map((slot, index) => {
                  const heightPercent = Math.min((slot.count / maxTrendCount) * 80, 80) // 최대 80% 높이
                  
                  return (
                    <div 
                      key={index} 
                      className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
                    >
                      {/* Hover 시 툴팁 말풍선 */}
                      <div className="absolute bottom-full mb-2 bg-slate-950 border border-slate-800 text-[10px] text-slate-200 px-2 py-1 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap text-center">
                        <p className="font-bold text-indigo-400">{slot.label}</p>
                        <p className="font-mono text-slate-300">확정: {slot.count}건</p>
                        <p className="font-mono text-emerald-450">{slot.revenue.toLocaleString()}원</p>
                      </div>

                      {/* 세로 막대 기둥 */}
                      <div 
                        className={`w-full rounded-t transition-all duration-300 ${
                          slot.count > 0 
                            ? 'bg-gradient-to-t from-indigo-650 via-indigo-500 to-indigo-400 group-hover:from-indigo-550 group-hover:to-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.2)]' 
                            : 'bg-slate-950/20 border border-slate-900'
                        }`}
                        style={{ height: slot.count > 0 ? `${heightPercent + 5}%` : '4%' }}
                      />
                      
                      {/* X축 레이블 */}
                      <span className="text-[9px] text-slate-500 font-mono mt-2 scale-90 origin-top whitespace-nowrap block">
                        {periodType === 'monthly' && Number(slot.label.replace('일', '')) % 5 !== 1 && Number(slot.label.replace('일', '')) !== trendStats.length
                          ? '' // 월간 뷰일 때는 5일 간격으로 X축 텍스트 출력하여 가독성 확보
                          : slot.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* 차트 추가 요약 */}
              <div className="bg-slate-950/40 rounded-lg border border-slate-850 p-3 flex items-center gap-2.5 text-[11px] text-slate-400">
                <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <p className="leading-relaxed">
                  {periodType === 'daily' 
                    ? '오늘 예약은 시간대별로 균등히 배정되는 경향을 보입니다. 정리가 필요한 시간대를 분석하여 직원을 추가 배치하십시오.' 
                    : periodType === 'weekly'
                    ? '요일별 예약 분포를 통해 주말 및 특정 요일의 쏠림 현상을 분석하고 마사지사 휴무 일정을 조율할 수 있습니다.' 
                    : '월별 누적 예약을 통해 매달 전체 예약의 활성화 주기 및 계절별 예약 추이를 한눈에 추적합니다.'}
                </p>
              </div>

            </div>
          </div>

          {/* 3. 취소 내역 분석용 관리 알림 (전체 보기 데이터 기반) */}
          {cancelledRes.length > 0 && (
            <div className="rounded-xl border border-rose-500/10 bg-rose-500/5 p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-rose-400">⚠️ 예약 취소 알림 및 분석</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  이 기간 동안 총 <span className="font-bold text-rose-400 font-mono">{cancelledRes.length}건</span>의 예약이 취소되었습니다. 취소된 예약으로 인한 예상 기회비용 손실액은 약 <span className="font-bold text-rose-400 font-mono">{cancelledRes.reduce((sum, r) => sum + Number(r.price), 0).toLocaleString()}원</span>입니다. 잦은 취소 시간대 또는 취소 사유를 파악하여 예약 예치금(노쇼 방지) 등의 도입을 고려해 주십시오.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
