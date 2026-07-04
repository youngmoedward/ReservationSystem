'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from './providers'
import { useLanguage } from './LanguageContext'
import CalendarView, { Reservation, Therapist } from '@/components/dashboard/CalendarView'
import BookingModal from '@/components/dashboard/BookingModal'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Plus } from 'lucide-react'

export default function Home() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { t } = useLanguage()

  // 1. 상태 관리
  const [calendarViewMode, setCalendarViewMode] = useState<'day' | 'week' | 'month'>('day')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  
  // 예약 등록/수정 모달 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null)
  const [initialTime, setInitialTime] = useState<Date | null>(null)
  const [initialTherapistId, setInitialTherapistId] = useState<number | null>(null)

  // 2. 데이터 페칭 (마사지사 & 예약 목록)
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

      // 예약 목록 로드 (취소된 예약 포함 전체)
      const { data: reservationData, error: rError } = await supabase
        .from('reservations')
        .select('*')

      if (rError) throw rError
      if (reservationData) {
        const mapped = (reservationData as Reservation[]).map(r => ({
          ...r,
          is_premium: Number(r.price) >= 120
        }))
        setReservations(mapped)
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
  }, [])

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">📅 {t('calendar.title')}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-stretch sm:self-auto justify-between sm:justify-end w-full sm:w-auto">
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-inner">
              {(['day', 'week', 'month'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setCalendarViewMode(mode)}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all ${
                    calendarViewMode === mode
                      ? 'bg-slate-900 text-slate-100 border border-slate-850 shadow'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {mode === 'day' ? t('calendar.mode.day') : mode === 'week' ? t('calendar.mode.week') : t('calendar.mode.month')}
                </button>
              ))}
            </div>
            
            {currentUser.role !== 'therapist' && (
              <button
                onClick={handleOpenNewReservation}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 px-4 py-2 text-xs font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <Plus className="w-4 h-4" /> {t('calendar.new_booking')}
              </button>
            )}
          </div>
        </div>

        {/* 캘린더 렌더링 */}
        {loading ? (
          <div className="h-96 flex items-center justify-center border border-slate-900 bg-slate-900/10 rounded-2xl">
            <span className="text-xs text-slate-400 animate-pulse font-medium">{t('user.syncing')}</span>
          </div>
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
            viewMode={calendarViewMode}
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
      />
    </DashboardLayout>
  )
}
