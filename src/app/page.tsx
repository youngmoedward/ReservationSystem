'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim, UserSim } from './providers'
import { useLanguage } from './LanguageContext'
import CalendarView, { Reservation, Therapist } from '@/components/dashboard/CalendarView'
import ListView from '@/components/dashboard/ListView'
import BookingModal from '@/components/dashboard/BookingModal'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Plus } from 'lucide-react'
import { toLocalDateString } from '@/utils/booking/dateUtils'

export default function Home() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { language, t } = useLanguage()

  // 1. 상태 관리
  const getTodayStr = () => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${date}`
  }

  const getOneMonthLaterStr = () => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const date = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${date}`
  }

  const [calendarViewMode, setCalendarViewMode] = useState<'day' | 'week' | 'month' | 'table' | 'card'>('day')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  const [startDate, setStartDate] = useState(getTodayStr())
  const [endDate, setEndDate] = useState(getOneMonthLaterStr())
  const [employees, setEmployees] = useState<UserSim[]>([])

  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  
  // 예약 등록/수정 모달 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null)
  const [initialTime, setInitialTime] = useState<Date | null>(null)
  const [initialTherapistId, setInitialTherapistId] = useState<number | null>(null)

  // 2. 데이터 페칭 (마사지사 & 예약 목록 & 직원 목록)
  const fetchData = async () => {
    setLoading(true)
    try {
      // 마사지사 로드
      const { data: therapistData, error: tError } = await supabase
        .from('therapists')
        .select('*')
        .order('id', { ascending: true })

      if (tError) throw tError
      if (therapistData) setTherapists(therapistData as Therapist[])

      // 직원 목록 로드
      const { data: employeeData, error: eError } = await supabase
        .from('employee')
        .select('id, name, role')

      if (eError) throw eError
      if (employeeData) setEmployees(employeeData as UserSim[])

      // 예약 목록 로드 (취소된 예약 포함 전체 또는 기간 필터링)
      let query = supabase.from('reservations').select('*')
      if (calendarViewMode === 'table' || calendarViewMode === 'card') {
        const start = new Date(`${startDate}T00:00:00`)
        const end = new Date(`${endDate}T23:59:59`)
        query = query.gte('start_time', start.toISOString()).lte('start_time', end.toISOString())
      }

      const { data: reservationData, error: rError } = await query

      if (rError) throw rError
      if (reservationData) {
        setReservations(reservationData as Reservation[])
      }

    } catch (err) {
      console.error('Data fetching error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, calendarViewMode])

  // 3. 모달 액션 핸들러
  const handleSelectReservation = (res: Reservation) => {
    setSelectedRes(res)
    setInitialTime(null)
    setInitialTherapistId(null)
    setIsModalOpen(true)
  }

  const handleAddReservationAt = (time: Date, therapistId?: number) => {
    setSelectedRes(null)
    setInitialTime(time)
    setInitialTherapistId(therapistId || null)
    setIsModalOpen(true)
  }

  const handleOpenNewReservation = () => {
    setSelectedRes(null)
    setInitialTime(null)
    setInitialTherapistId(null)
    setIsModalOpen(true)
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 달력 전용 서브 제어 바 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-100/40 p-4 rounded-xl border border-stone-200">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
              <span className="text-blue-700">📅</span> {t('calendar.title')}
            </h2>
          </div>
 
          <div className="flex items-center gap-2 flex-wrap self-stretch sm:self-auto justify-between sm:justify-end w-full sm:w-auto">
            <div className="flex bg-stone-100 border border-stone-200 rounded-xl p-0.5 shadow-inner">
              {(['day', 'week', 'month', 'table', 'card'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setCalendarViewMode(mode)}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all ${
                    calendarViewMode === mode
                      ? 'bg-white text-stone-850 border border-stone-200 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  {mode === 'day' 
                    ? t('calendar.mode.day') 
                    : mode === 'week' 
                    ? t('calendar.mode.week') 
                    : mode === 'month' 
                    ? t('calendar.mode.month') 
                    : mode === 'table' 
                    ? t('calendar.mode.table') 
                    : t('calendar.mode.card')}
                </button>
              ))}
            </div>
            
            {currentUser.role !== 'therapist' && (
              <button
                onClick={handleOpenNewReservation}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-900/10 px-4 py-2 text-xs font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <Plus className="w-4 h-4" /> {t('calendar.new_booking')}
              </button>
            )}
          </div>
        </div>

        {/* 캘린더/리스트 렌더링 */}
        {loading ? (
          <div className="h-96 flex items-center justify-center border border-slate-900 bg-slate-900/10 rounded-2xl">
            <span className="text-xs text-slate-400 animate-pulse font-medium">{t('user.syncing')}</span>
          </div>
        ) : (calendarViewMode === 'table' || calendarViewMode === 'card') ? (
          <ListView
            reservations={currentUser.role === 'therapist'
              ? reservations.filter(r => r.therapist_id === currentUser.therapistId)
              : reservations}
            therapists={currentUser.role === 'therapist'
              ? therapists.filter(t => t.id === currentUser.therapistId)
              : therapists}
            employees={employees}
            onSelectReservation={handleSelectReservation}
            currentUserId={currentUser.id}
            currentUserRole={currentUser.role}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            viewType={calendarViewMode === 'table' ? 'table' : 'card'}
            onViewTypeChange={(type) => setCalendarViewMode(type)}
          />
        ) : (
          <CalendarView
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            reservations={currentUser.role === 'therapist'
              ? reservations.filter(r => r.therapist_id === currentUser.therapistId)
              : reservations}
            therapists={currentUser.role === 'therapist'
              ? therapists.filter(t => t.id === currentUser.therapistId)
              : therapists}
            onSelectReservation={handleSelectReservation}
            onAddReservationAt={handleAddReservationAt}
            viewMode={calendarViewMode as any}
          />
        )}
      </div>

      {/* 예약 등록/수정 모달 바인딩 */}
      <BookingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchData}
        supabase={supabase}
        therapists={therapists}
        reservations={reservations}
        currentUserId={currentUser.id}
        currentUserRole={currentUser.role}
        selectedReservation={selectedRes}
        initialTime={initialTime}
        initialTherapistId={initialTherapistId}
        defaultDate={toLocalDateString(currentDate)}
      />
    </DashboardLayout>
  )
}
