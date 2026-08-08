'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { toLocalDateString } from '@/utils/booking/dateUtils'
import { Calendar as CalendarIcon, Clock, AlertTriangle, Save, Trash2, Edit, Info, Settings } from 'lucide-react'

// 요일 인덱스를 이름으로 맵핑하는 상수
const DAY_NAMES_KO = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface DefaultHours {
  id?: number
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

interface ExceptionHours {
  id?: number
  date: string
  open_time: string | null
  close_time: string | null
  is_closed: boolean
  description: string | null
}

export default function OperatingHoursPage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { language, t } = useLanguage()

  // 권한 제어 변수 (오직 manager 역할만 관리 가능)
  const canModify = currentUser?.role === 'manager'

  // 달력 연/월 상태 (현지 기준)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [defaultHoursList, setDefaultHoursList] = useState<DefaultHours[]>([])
  const [exceptionsList, setExceptionsList] = useState<ExceptionHours[]>([])
  const [loading, setLoading] = useState(true)

  // 모달 제어 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDateStr, setSelectedDateStr] = useState('')
  const [modalOpenTime, setModalOpenTime] = useState('09:00')
  const [modalCloseTime, setModalCloseTime] = useState('21:00')
  const [modalIsClosed, setModalIsClosed] = useState(false)
  const [modalDescription, setModalDescription] = useState('')
  const [activeExceptionId, setActiveExceptionId] = useState<number | null>(null)

  // 탭 제어 상태 ('calendar' | 'defaults')
  const [activeTab, setActiveTab] = useState<'calendar' | 'defaults'>('calendar')

  // 기본 영업시간 편집 폼 상태 (defaults 탭 용)
  const [editingDefaults, setEditingDefaults] = useState<DefaultHours[]>([])

  // 데이터 로드
  const fetchAllData = async () => {
    setLoading(true)
    try {
      // 1. 기본 영업시간 fetch
      const { data: defaults, error: dfError } = await supabase
        .from('operating_hours_default')
        .select('*')
        .order('day_of_week', { ascending: true })

      if (dfError) throw dfError
      if (defaults) {
        setDefaultHoursList(defaults)
        setEditingDefaults(JSON.parse(JSON.stringify(defaults))) // 딥 카피
      }

      // 2. 예외 영업시간 fetch
      const { data: exceptions, error: exError } = await supabase
        .from('operating_hours_exceptions')
        .select('*')

      if (exError) throw exError
      if (exceptions) {
        setExceptionsList(exceptions)
      }
    } catch (err) {
      console.error('Failed to fetch operating hours data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // 연/월 이동
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  // 특정 날짜 클릭 시 모달 열기
  const handleDateClick = (dateStr: string) => {
    setSelectedDateStr(dateStr)

    // 기존에 해당 날짜 예외 정보가 있는지 확인
    const existing = exceptionsList.find(ex => ex.date === dateStr)
    const d = new Date(dateStr + 'T00:00:00')
    const jsDay = d.getDay()
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1
    const dayDefault = defaultHoursList.find(df => df.day_of_week === dayOfWeek)

    if (existing) {
      setActiveExceptionId(existing.id || null)
      setModalOpenTime(existing.open_time ? existing.open_time.substring(0, 5) : '09:00')
      setModalCloseTime(existing.close_time ? existing.close_time.substring(0, 5) : '21:00')
      setModalIsClosed(existing.is_closed)
      setModalDescription(existing.description || '')
    } else {
      setActiveExceptionId(null)
      setModalOpenTime(dayDefault ? dayDefault.open_time.substring(0, 5) : '09:00')
      setModalCloseTime(dayDefault ? dayDefault.close_time.substring(0, 5) : '21:00')
      setModalIsClosed(dayDefault ? dayDefault.is_closed : false)
      setModalDescription('')
    }

    setIsModalOpen(true)
  }

  // 예외 정보 저장 (관리자 전용)
  const handleSaveException = async () => {
    if (!canModify) return
    try {
      const payload = {
        date: selectedDateStr,
        open_time: modalIsClosed ? null : `${modalOpenTime}:00`,
        close_time: modalIsClosed ? null : `${modalCloseTime}:00`,
        is_closed: modalIsClosed,
        description: modalDescription.trim() || null
      }

      let error
      if (activeExceptionId) {
        // 수정
        const { error: updErr } = await supabase
          .from('operating_hours_exceptions')
          .update(payload)
          .eq('id', activeExceptionId)
        error = updErr
      } else {
        // 추가
        const { error: insErr } = await supabase
          .from('operating_hours_exceptions')
          .insert(payload)
        error = insErr
      }

      if (error) throw error

      alert(language === 'ko' ? '예외 영업 일정이 성공적으로 저장되었습니다.' : 'Exception schedule saved successfully.')
      setIsModalOpen(false)
      fetchAllData()
    } catch (err: any) {
      console.error(err)
      alert(err.message || '요청 처리에 실패했습니다.')
    }
  }

  // 예외 정보 삭제 (관리자 전용)
  const handleDeleteException = async () => {
    if (!canModify || !activeExceptionId) return
    if (!confirm(language === 'ko' ? '해당 날짜의 예외 일정을 삭제하고 기본 영업시간으로 돌리겠습니까?' : 'Delete exception and restore default hours?')) return

    try {
      const { error } = await supabase
        .from('operating_hours_exceptions')
        .delete()
        .eq('id', activeExceptionId)

      if (error) throw error

      alert(language === 'ko' ? '예외 일정이 삭제되었습니다.' : 'Exception schedule deleted.')
      setIsModalOpen(false)
      fetchAllData()
    } catch (err: any) {
      console.error(err)
      alert(err.message || '삭제에 실패했습니다.')
    }
  }

  // 요일별 기본 영업시간 일괄 저장 (관리자 전용)
  const handleSaveDefaults = async () => {
    if (!canModify) return
    try {
      for (const item of editingDefaults) {
        const { error } = await supabase
          .from('operating_hours_default')
          .update({
            open_time: `${item.open_time.substring(0, 5)}:00`,
            close_time: `${item.close_time.substring(0, 5)}:00`,
            is_closed: item.is_closed
          })
          .eq('day_of_week', item.day_of_week)

        if (error) throw error
      }

      alert(language === 'ko' ? '기본 영업시간 설정이 저장되었습니다.' : 'Default operating hours saved successfully.')
      fetchAllData()
    } catch (err: any) {
      console.error(err)
      alert(err.message || '저장 중 오류가 발생했습니다.')
    }
  }

  // 달력 날짜 목록 연산
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const startDay = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()

  const prevMonthDays = new Date(year, month, 0).getDate()
  const prevDaysArray = Array.from({ length: startDay === 0 ? 6 : startDay - 1 }, (_, i) => prevMonthDays - (startDay === 0 ? 6 : startDay - 1) + 1 + i) // 월요일 시작 정렬
  const currentDaysArray = Array.from({ length: totalDays }, (_, i) => i + 1)
  
  const totalSlots = 42
  const nextDaysCount = totalSlots - (prevDaysArray.length + currentDaysArray.length)
  const nextDaysArray = Array.from({ length: nextDaysCount > 0 ? nextDaysCount : 0 }, (_, i) => i + 1)

  const dayHeaders = language === 'ko'
    ? ['월', '화', '수', '목', '금', '토', '일']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <DashboardLayout>
      <div className="space-y-6 text-stone-800">
        
        {/* 상단 타이틀 및 탭 전환 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-stone-200 gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-black tracking-tight text-blue-950 flex items-center gap-2">
              <Clock className="w-5.5 h-5.5 text-blue-800" />
              {language === 'ko' ? '서비스 운영 및 예외시간 관리' : 'Service Operating Hours'}
            </h2>
            <p className="text-xs text-stone-500 font-medium">
              {language === 'ko' 
                ? '스파의 기본 요일별 영업시간 및 휴무일, 단축근무 예외일을 한눈에 조율하고 검증합니다.' 
                : 'Manage weekly baseline operating hours and holiday/shortened exceptions.'}
            </p>
          </div>

          {/* 탭 버튼 */}
          <div className="flex bg-stone-200/60 p-1.5 rounded-2xl border border-stone-300/40 text-xs font-bold w-fit">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'calendar'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              {language === 'ko' ? '운영 캘린더' : 'Operating Calendar'}
            </button>
            <button
              onClick={() => setActiveTab('defaults')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'defaults'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              {language === 'ko' ? '기본 영업시간 설정' : 'Default Operating Hours'}
            </button>
          </div>
        </div>

        {/* 탭 분기: 1. 운영 캘린더 탭 */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            
            {/* 달력 컨트롤러 */}
            <div className="flex items-center justify-between bg-stone-100 border border-stone-200/80 rounded-2xl p-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePrevMonth}
                  className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 active:scale-95 transition-all cursor-pointer font-bold text-stone-700"
                >
                  &larr;
                </button>
                <h3 className="text-base font-black text-stone-800 font-mono tracking-wide">
                  {year}년 {month + 1}월
                </h3>
                <button
                  onClick={handleNextMonth}
                  className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 active:scale-95 transition-all cursor-pointer font-bold text-stone-700"
                >
                  &rarr;
                </button>
              </div>

              {/* 범례 표시 */}
              <div className="hidden md:flex items-center gap-4 text-[10.5px] font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-500/10 border border-emerald-500/30"></span>
                  <span className="text-stone-500">{language === 'ko' ? '오늘' : 'Today'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-yellow-500/15 border border-yellow-500/35"></span>
                  <span className="text-stone-500">{language === 'ko' ? '단축/연장근무' : 'Shortened Hours'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-rose-500/15 border border-rose-500/35"></span>
                  <span className="text-stone-500">{language === 'ko' ? '전일 휴무' : 'Holiday'}</span>
                </div>
              </div>
            </div>

            {/* 캘린더 그리드 */}
            <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-sm">
              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-100 text-center py-3 text-xs font-bold text-stone-600">
                {dayHeaders.map((day, idx) => (
                  <div key={idx} className={idx === 5 ? 'text-blue-600' : idx === 6 ? 'text-rose-600' : ''}>
                    {day}
                  </div>
                ))}
              </div>

              {/* 날짜 셀 그리드 */}
              <div className="grid grid-cols-7 divide-x divide-y divide-stone-200">
                {/* 이전달 날짜 */}
                {prevDaysArray.map(day => (
                  <div key={`prev-${day}`} className="p-3 min-h-[110px] bg-stone-50/40 text-stone-300 text-xs font-bold text-left select-none">
                    {day}
                  </div>
                ))}

                {/* 이번달 날짜 */}
                {currentDaysArray.map(day => {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const isToday = toLocalDateString(new Date()) === dateStr

                  // 해당 날짜의 예외 조회
                  const exception = exceptionsList.find(ex => ex.date === dateStr)

                  // 요일 구하기
                  const d = new Date(dateStr + 'T00:00:00')
                  const jsDay = d.getDay()
                  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1
                  const dayDefault = defaultHoursList.find(df => df.day_of_week === dayOfWeek)

                  // 렌더링용 정보 매핑
                  let isClosed = dayDefault ? dayDefault.is_closed : false
                  let openTime = dayDefault ? dayDefault.open_time.substring(0, 5) : '09:00'
                  let closeTime = dayDefault ? dayDefault.close_time.substring(0, 5) : '21:00'
                  let isException = false
                  let description = ''

                  if (exception) {
                    isClosed = exception.is_closed
                    openTime = exception.open_time ? exception.open_time.substring(0, 5) : ''
                    closeTime = exception.close_time ? exception.close_time.substring(0, 5) : ''
                    isException = true
                    description = exception.description || ''
                  }

                  return (
                    <div
                      key={`curr-${day}`}
                      onClick={() => handleDateClick(dateStr)}
                      className={`p-2.5 min-h-[110px] text-xs text-left flex flex-col justify-between transition-colors cursor-pointer group hover:bg-stone-50 ${
                        isToday ? 'bg-emerald-500/5' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-black text-[12.5px] ${
                          isToday 
                            ? 'text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md shadow-xs' 
                            : (dayOfWeek === 5 ? 'text-blue-600' : dayOfWeek === 6 ? 'text-rose-600' : 'text-stone-500')
                        }`}>
                          {day}
                        </span>

                        {isException && (
                          <span className="text-[10px] px-1.5 py-0.5 font-bold rounded bg-purple-50 text-purple-600 border border-purple-100">
                            {language === 'ko' ? '예외' : 'Exc'}
                          </span>
                        )}
                      </div>

                      {/* 상태 정보 렌더링 */}
                      <div className="mt-2.5 space-y-1">
                        {isClosed ? (
                          <div className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200/60 font-black text-center text-[10px]">
                            {language === 'ko' ? '전일 휴무' : 'Holiday'}
                          </div>
                        ) : (
                          <div className={`px-2 py-1 rounded border font-semibold text-center text-[10px] ${
                            isException
                              ? 'bg-yellow-50 text-yellow-800 border-yellow-200/80 font-bold'
                              : 'bg-stone-50 text-stone-600 border-stone-200/50'
                          }`}>
                            <div className="flex items-center justify-center gap-1 font-mono">
                              <Clock className="w-3 h-3 text-stone-400" />
                              {openTime}~{closeTime}
                            </div>
                          </div>
                        )}

                        {description && (
                          <div className="text-[9.5px] text-stone-400 truncate font-medium pl-0.5" title={description}>
                            💬 {description}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* 다음달 날짜 */}
                {nextDaysArray.map(day => (
                  <div key={`next-${day}`} className="p-3 min-h-[110px] bg-stone-50/40 text-stone-300 text-xs font-bold text-left select-none">
                    {day}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 탭 분기: 2. 기본 영업시간 설정 탭 */}
        {activeTab === 'defaults' && (
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-5">
            <div className="space-y-1">
              <h3 className="text-base font-black text-stone-800">
                {language === 'ko' ? '요일별 기본 영업시간 관리' : 'Weekly Base Operating Hours'}
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                {language === 'ko' 
                  ? '특정 예외 데이터가 없는 평소의 영업 요일별 표준 시작/종료 시간을 조정합니다.' 
                  : 'Adjust default standard opening and closing times for each weekday.'}
              </p>
            </div>

            {/* 기본 영업시간 리스트 테이블 */}
            <div className="divide-y divide-stone-150 border border-stone-200/80 rounded-2xl overflow-hidden text-xs">
              {editingDefaults.map((item, idx) => {
                const dayLabel = language === 'ko' ? DAY_NAMES_KO[item.day_of_week] : DAY_NAMES_EN[item.day_of_week]
                return (
                  <div key={item.day_of_week} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 bg-stone-50/30 hover:bg-stone-50/80 transition-colors">
                    <div className="w-28 font-black text-stone-700">
                      {dayLabel}
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {/* 휴무 여부 선택 */}
                      <label className="flex items-center gap-2 font-bold text-stone-600">
                        <input
                          type="checkbox"
                          disabled={!canModify}
                          checked={item.is_closed}
                          onChange={(e) => {
                            const updated = [...editingDefaults]
                            updated[idx].is_closed = e.target.checked
                            setEditingDefaults(updated)
                          }}
                          className="w-4 h-4 rounded text-blue-600 border-stone-300 focus:ring-blue-500 cursor-pointer"
                        />
                        {language === 'ko' ? '기본 휴무일' : 'Closed by default'}
                      </label>

                      {/* 시작 및 종료 시간 입력 */}
                      {!item.is_closed && (
                        <div className="flex items-center gap-2 font-mono">
                          <input
                            type="time"
                            disabled={!canModify}
                            value={item.open_time.substring(0, 5)}
                            onChange={(e) => {
                              const updated = [...editingDefaults]
                              updated[idx].open_time = e.target.value
                              setEditingDefaults(updated)
                            }}
                            className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 font-bold"
                          />
                          <span className="text-stone-400 font-sans">~</span>
                          <input
                            type="time"
                            disabled={!canModify}
                            value={item.close_time.substring(0, 5)}
                            onChange={(e) => {
                              const updated = [...editingDefaults]
                              updated[idx].close_time = e.target.value
                              setEditingDefaults(updated)
                            }}
                            className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 font-bold"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 관리자 저장 액션 */}
            {canModify && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveDefaults}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-800 hover:bg-blue-700 active:scale-95 text-white shadow-sm px-6 py-3 text-xs font-bold transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {language === 'ko' ? '기본 설정 일괄 저장' : 'Save Default Configuration'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 4. 예외 설정 및 조회 모달 */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/30 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-stone-50 border border-stone-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
              {/* 모달 헤더 */}
              <div className="flex items-center justify-between py-4 px-5 border-b border-stone-200 bg-stone-100">
                <h3 className="text-base font-black text-stone-800 flex items-center gap-1.5">
                  <CalendarIcon className="w-5 h-5 text-blue-900" />
                  {selectedDateStr} {language === 'ko' ? '영업시간 조율' : 'Operating Hours Detail'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* 모달 바디 */}
              <div className="p-5 overflow-y-auto space-y-4 text-xs font-medium text-stone-700">
                
                {/* 비-관리자 읽기 전용 경고 배너 */}
                {!canModify && (
                  <div className="p-3 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">{language === 'ko' ? '읽기 전용 상태' : 'Read-Only Mode'}</p>
                      <p className="text-[11px] text-blue-600 mt-0.5">
                        {language === 'ko' 
                          ? '일반 직원 계정은 영업 조율 조작 권한이 제한되며, 조회만 가능합니다.' 
                          : 'Staff accounts have read-only access to operating hours schedules.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* 휴무 여부 토글 */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider">
                    {language === 'ko' ? '영업 상태' : 'Operating Status'}
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={!canModify}
                      onClick={() => setModalIsClosed(false)}
                      className={`flex-1 py-3 text-center rounded-xl border text-xs font-bold transition-all ${
                        !modalIsClosed
                          ? 'border-blue-600 bg-blue-50 text-blue-800'
                          : 'border-stone-200 bg-white hover:bg-stone-50'
                      }`}
                    >
                      {language === 'ko' ? '영업일 (단축/연장 가능)' : 'Open (Shortened/Extended)'}
                    </button>
                    <button
                      type="button"
                      disabled={!canModify}
                      onClick={() => setModalIsClosed(true)}
                      className={`flex-1 py-3 text-center rounded-xl border text-xs font-bold transition-all ${
                        modalIsClosed
                          ? 'border-rose-600 bg-rose-50 text-rose-800'
                          : 'border-stone-200 bg-white hover:bg-stone-50'
                      }`}
                    >
                      {language === 'ko' ? '전일 휴무' : 'Full Holiday'}
                    </button>
                  </div>
                </div>

                {/* 시간 설정 필드 (휴무가 아닐 때만 렌더링) */}
                {!modalIsClosed && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                        {language === 'ko' ? '영업 시작 시각' : 'Open Time'}
                      </label>
                      <input
                        type="time"
                        disabled={!canModify}
                        value={modalOpenTime}
                        onChange={(e) => setModalOpenTime(e.target.value)}
                        className="w-full bg-white border border-stone-200 rounded-xl px-3 py-3 text-xs text-stone-800 focus:outline-none focus:border-blue-500 font-bold font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                        {language === 'ko' ? '영업 종료 시각' : 'Close Time'}
                      </label>
                      <input
                        type="time"
                        disabled={!canModify}
                        value={modalCloseTime}
                        onChange={(e) => setModalCloseTime(e.target.value)}
                        className="w-full bg-white border border-stone-200 rounded-xl px-3 py-3 text-xs text-stone-800 focus:outline-none focus:border-blue-500 font-bold font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* 예외 상세 메모/설명 */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider">
                    {language === 'ko' ? '예외 사유 / 메모' : 'Exception Reason / Note'}
                  </label>
                  <textarea
                    disabled={!canModify}
                    rows={3}
                    placeholder={language === 'ko' ? '예: 추석 연휴 휴무, 시스템 공사 단축근무 등' : 'e.g. Christmas holiday, System maintenance shortened work'}
                    value={modalDescription}
                    onChange={(e) => setModalDescription(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl p-3 text-xs text-stone-800 focus:outline-none focus:border-blue-500 placeholder:text-stone-400 font-semibold"
                  />
                </div>
              </div>

              {/* 모달 푸터 액션 (CUD는 오직 manager만 활성화) */}
              <div className="py-3.5 px-5 border-t border-stone-200 bg-stone-100 flex items-center justify-between gap-3">
                {canModify && activeExceptionId ? (
                  <button
                    type="button"
                    onClick={handleDeleteException}
                    className="inline-flex items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {language === 'ko' ? '삭제' : 'Delete'}
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border border-stone-200 bg-white hover:bg-stone-50 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                  >
                    {language === 'ko' ? '닫기' : 'Close'}
                  </button>

                  {canModify && (
                    <button
                      type="button"
                      onClick={handleSaveException}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-blue-800 hover:bg-blue-700 active:scale-95 text-white shadow-sm px-5 py-2.5 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {language === 'ko' ? '저장' : 'Save'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
