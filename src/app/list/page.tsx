'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim, UserSim } from '../providers'
import { useLanguage } from '@/app/LanguageContext'
import ListView from '@/components/dashboard/ListView'
import BookingModal from '@/components/dashboard/BookingModal'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Reservation, Therapist } from '@/components/dashboard/CalendarView'
import { Plus } from 'lucide-react'

export default function ListPage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { t } = useLanguage()

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

  const [startDate, setStartDate] = useState(getTodayStr())
  const [endDate, setEndDate] = useState(getOneMonthLaterStr())
  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [employees, setEmployees] = useState<UserSim[]>([])
  const [loading, setLoading] = useState(true)

  // 예약 등록/수정 모달 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null)

  // 2. 데이터 페칭
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

      // 예약 목록 로드 (로컬 기간 범위 필터)
      const start = new Date(`${startDate}T00:00:00`)
      const end = new Date(`${endDate}T23:59:59`)

      const { data: reservationData, error: rError } = await supabase
        .from('reservations')
        .select('*')
        .gte('start_time', start.toISOString())
        .lte('start_time', end.toISOString())

      if (rError) throw rError
      if (reservationData) {
        const mapped = (reservationData as Reservation[]).map(r => ({
          ...r,
          is_premium: Number(r.price) >= 120
        }))
        setReservations(mapped)
      }

    } catch (err) {
      console.error('Data fetching error in ListPage:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

  // 3. 모달 액션 핸들러
  const handleSelectReservation = (res: Reservation) => {
    setSelectedRes(res)
    setIsModalOpen(true)
  }

  const handleOpenNewReservation = () => {
    setSelectedRes(null)
    setIsModalOpen(true)
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 리스트 전용 서브 제어 바 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">📋 {t('list.title')}</span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
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

        {/* 리스트 렌더링 */}
        {loading ? (
          <div className="h-96 flex items-center justify-center border border-slate-900 bg-slate-900/10 rounded-2xl">
            <span className="text-xs text-slate-400 animate-pulse font-medium">{t('user.syncing')}</span>
          </div>
        ) : (
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
      />
    </DashboardLayout>
  )
}
