'use client'

import React, { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, DollarSign, Users, Percent, Trophy, Clock, Info, ShieldAlert, BarChart3, PieChart } from 'lucide-react'
import { Reservation, Therapist } from '../dashboard/CalendarView'
import { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDateString, toUIDateString } from '@/utils/booking/dateUtils'
import { useLanguage } from '@/app/LanguageContext'

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
  const { t, language } = useLanguage()
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
      if (reservationData) {
        const mapped = (reservationData as Reservation[]).map(r => ({
          ...r,
          is_premium: Number(r.price) >= 120
        }))
        setReservations(mapped)
      } else {
        setReservations([])
      }
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
    const startStr = toUIDateString(periodStart)
    const endStr = toUIDateString(periodEnd)
    
    if (periodType === 'daily') {
      return `${startStr} (${t('stats.period.daily')})`
    } else if (periodType === 'weekly') {
      return `${startStr} ~ ${endStr} (${t('stats.period.weekly')})`
    } else {
      const year = periodStart.getFullYear()
      const month = periodStart.getMonth() + 1
      return `${String(month).padStart(2, '0')}-${year} (${t('stats.period.monthly')})`
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
          label: language === 'ko' ? `${String(hour).padStart(2, '0')}시` : `${String(hour).padStart(2, '0')}:00`,
          count: slotBookings.length,
          revenue: rev
        }
      })
    } else if (periodType === 'weekly') {
      // 요일별 분포 (월 ~ 일)
      const dayNames = language === 'ko'
        ? ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
        : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      return dayNames.map((name, index) => {
        // Javascript Date getDay: 0=Sun, 1=Mon, ..., 6=Sat
        const targetDayVal = index === 6 ? 0 : index + 1 // 월요일=1, ..., 일요일=0
        const slotBookings = confirmedRes.filter(r => {
          const rDate = new Date(r.start_time)
          return rDate.getDay() === targetDayVal
        })
        const rev = slotBookings.reduce((sum, r) => sum + Number(r.price), 0)
        return {
          label: name.slice(0, 3), // '월요일' -> '월요일' 또는 '월' / 'Mon'
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
          label: language === 'ko' ? `${day}일` : `${day}`,
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
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-stone-100/40 p-4 rounded-xl border border-stone-200 backdrop-blur-md">
        {/* 단위 선택 */}
        <div className="flex bg-stone-200/50 border border-stone-200 rounded-xl p-0.5 shadow-inner">
          {(['daily', 'weekly', 'monthly'] as const).map(type => (
            <button
              key={type}
              onClick={() => setPeriodType(type)}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-all capitalize ${
                periodType === type
                  ? 'bg-white text-emerald-700 border border-stone-300/80 shadow-sm'
                  : 'bg-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {type === 'daily' ? t('stats.period.daily') : type === 'weekly' ? t('stats.period.weekly') : t('stats.period.monthly')}
            </button>
          ))}
        </div>

        {/* 날짜 네비게이터 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevPeriod}
            className="p-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2 min-w-[180px] justify-center relative group">
            <CalendarIcon className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-bold text-stone-800 font-mono">{getPeriodLabel()}</span>
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
            className="p-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center border border-stone-200 bg-stone-100/20 rounded-2xl">
          <span className="text-xs text-stone-500 animate-pulse font-medium">{t('stats.loading')}</span>
        </div>
      ) : (
        <>
          {/* KPI 요약 메트릭 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 총 확정 예약 건수 */}
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">{t('stats.kpi.total_bookings')}</span>
                <span className="text-2xl font-black text-stone-800 font-mono tracking-tight">
                  {totalBookings}{language === 'ko' ? '건' : ''}
                </span>
                <span className="text-[9px] text-stone-500 block">
                  {t('stats.kpi.cancelled_label')
                    .replace('{count}', cancelledRes.length.toString())
                    .replace('{rate}', cancellationRate.toString())}
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-inner">
                <BarChart3 className="w-5 h-5" />
              </div>
            </div>

            {/* 총 매출액 */}
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">{t('stats.kpi.total_revenue')}</span>
                <span className="text-2xl font-black text-emerald-700 font-mono tracking-tight">
                  ${totalRevenue.toLocaleString()}
                </span>
                <span className="text-[9px] text-stone-500 block">{t('stats.kpi.revenue_label')}</span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-inner">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            {/* 고급 코스 점유율 */}
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">{t('stats.kpi.premium_ratio')}</span>
                <span className="text-2xl font-black text-amber-700 font-mono tracking-tight">{premiumRatio}%</span>
                <span className="text-[9px] text-stone-500 block">
                  {t('stats.kpi.premium_label').replace('{count}', premiumBookings.toString())}
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-inner">
                <PieChart className="w-5 h-5" />
              </div>
            </div>

            {/* 최다 예약 마사지사 */}
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">{t('stats.kpi.top_therapist')}</span>
                <span className="text-2xl font-black text-stone-800 tracking-tight">
                  {topTherapist && topTherapist.count > 0 ? `${topTherapist.name}` : t('stats.kpi.none')}
                </span>
                <span className="text-[9px] text-stone-500 block">
                  {topTherapist && topTherapist.count > 0 
                    ? t('stats.kpi.top_therapist_label')
                        .replace('{count}', topTherapist.count.toString())
                        .replace('{revenue}', topTherapist.revenue.toLocaleString())
                    : t('stats.kpi.no_data')}
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-inner">
                <Trophy className="w-5 h-5 animate-pulse" />
              </div>
            </div>
          </div>

          {/* 차트 영역 분할 레이아웃 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 1. 마사지사별 예약/매출 비교 가로 막대 차트 (7열) */}
            <div className="lg:col-span-7 rounded-xl border border-stone-200 bg-stone-100/40 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
                <div className="flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-xs font-bold text-stone-700">{t('stats.chart.ranking_title')}</h3>
                </div>
                
                {/* 정렬 메트릭 토글 */}
                <div className="flex bg-stone-200/50 border border-stone-200 rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveMetric('count')}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded transition-all ${
                      activeMetric === 'count'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'bg-transparent text-stone-500 hover:text-stone-850'
                    }`}
                  >
                    {t('stats.chart.sort.count')}
                  </button>
                  <button
                    onClick={() => setActiveMetric('revenue')}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded transition-all ${
                      activeMetric === 'revenue'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'bg-transparent text-stone-500 hover:text-stone-850'
                    }`}
                  >
                    {t('stats.chart.sort.revenue')}
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
                          ? 'bg-amber-50 border-amber-200' 
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                            index === 0 
                              ? 'bg-amber-100 text-amber-800 font-bold border border-amber-200' 
                              : index === 1 
                              ? 'bg-stone-200 text-stone-700 border border-stone-300' 
                              : index === 2 
                              ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                              : 'bg-stone-100 text-stone-500'
                          }`}>
                            {index + 1}
                          </span>
                          <span className="font-bold text-stone-800">{item.name}</span>
                          {!item.isActive && (
                            <span className="text-[9px] bg-stone-200 text-stone-500 px-1 py-0.2 rounded">{t('stats.chart.off_duty')}</span>
                          )}
                          {item.isPremiumTarget && (
                            <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.2 rounded font-semibold">{t('stats.chart.premium_role')}</span>
                          )}
                        </div>
                        <div className="text-right font-mono text-[11px] font-semibold text-stone-700">
                          <span className={activeMetric === 'count' ? 'text-emerald-700 font-extrabold' : 'text-stone-500'}>
                            {item.count}{language === 'ko' ? '건' : ''}
                          </span>
                          <span className="mx-1.5 text-stone-300">|</span>
                          <span className={activeMetric === 'revenue' ? 'text-emerald-700 font-extrabold' : 'text-stone-500'}>
                            ${item.revenue.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* 커스텀 그래프 막대 */}
                      <div className="w-full h-2 rounded-full bg-stone-200 overflow-hidden relative border border-stone-300">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop 
                              ? 'bg-gradient-to-r from-amber-600 to-amber-400' 
                              : 'bg-gradient-to-r from-emerald-600 to-emerald-500'
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
            <div className="lg:col-span-5 rounded-xl border border-stone-200 bg-stone-100/40 p-5 flex flex-col justify-between space-y-4">
              <div className="border-b border-stone-200 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-xs font-bold text-stone-700">
                    {t('stats.chart.trend_title')
                      .replace('{period}', periodType === 'daily' ? t('stats.chart.trend.hour') : periodType === 'weekly' ? t('stats.chart.trend.day') : t('stats.chart.trend.date'))}
                  </h3>
                </div>
                
                <span className="text-[10px] text-stone-500 font-medium">
                  {t('stats.chart.trend.unit')}
                </span>
              </div>

              {/* 세로 막대 그래프 영역 */}
              <div className="flex-1 min-h-[260px] flex items-end justify-between gap-1.5 pt-6 pb-2 px-1 relative">
                {/* 배경 가이드 라인 (3단) */}
                <div className="absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between pointer-events-none">
                  <div className="border-t border-stone-200 w-full" />
                  <div className="border-t border-stone-200 w-full" />
                  <div className="border-t border-stone-200 w-full" />
                </div>

                {trendStats.map((slot, index) => {
                  const heightPercent = Math.min((slot.count / maxTrendCount) * 80, 80) // 최대 80% 높이
                  
                  return (
                    <div 
                      key={index} 
                      className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
                    >
                      {/* Hover 시 툴팁 말풍선 */}
                      <div className="absolute bottom-full mb-2 bg-white border border-stone-200 text-[10px] text-stone-700 px-2 py-1 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap text-center">
                        <p className="font-bold text-emerald-700">{slot.label}</p>
                        <p className="font-mono text-stone-700">{t('stats.chart.trend.confirmed').replace('{count}', slot.count.toString())}</p>
                        <p className="font-mono text-amber-700">${slot.revenue.toLocaleString()}</p>
                      </div>

                      {/* 세로 막대 기둥 */}
                      <div 
                        className={`w-full rounded-t transition-all duration-300 ${
                          slot.count > 0 
                            ? 'bg-gradient-to-t from-emerald-700 via-emerald-600 to-emerald-500 group-hover:from-emerald-600 group-hover:to-emerald-400 shadow-sm' 
                            : 'bg-stone-200/50 border border-stone-300'
                        }`}
                        style={{ height: slot.count > 0 ? `${heightPercent + 5}%` : '4%' }}
                      />
                      
                      {/* X축 레이블 */}
                      <span className="text-[9px] text-stone-500 font-mono mt-2 scale-90 origin-top whitespace-nowrap block">
                        {periodType === 'monthly' && Number(slot.label.replace('일', '')) % 5 !== 1 && Number(slot.label.replace('일', '')) !== trendStats.length
                          ? '' // 월간 뷰일 때는 5일 간격으로 X축 텍스트 출력하여 가독성 확보
                          : slot.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* 차트 추가 요약 */}
              <div className="bg-white rounded-lg border border-stone-200 p-3 flex items-center gap-2.5 text-[11px] text-stone-600">
                <Info className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                <p className="leading-relaxed">
                  {periodType === 'daily' 
                    ? t('stats.chart.trend.daily_desc') 
                    : periodType === 'weekly'
                    ? t('stats.chart.trend.weekly_desc') 
                    : t('stats.chart.trend.monthly_desc')}
                </p>
              </div>

            </div>
          </div>

          {/* 3. 취소 내역 분석용 관리 알림 (전체 보기 데이터 기반) */}
          {cancelledRes.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-700 flex-shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-rose-700">{t('stats.warning.cancellation_title')}</h4>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  {t('stats.warning.cancellation_desc')
                    .replace('{count}', cancelledRes.length.toString())
                    .replace('{loss}', cancelledRes.reduce((sum, r) => sum + Number(r.price), 0).toLocaleString())}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

