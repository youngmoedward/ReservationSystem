'use client'

import React, { useState, useEffect } from 'react'
import { X, Calendar, User, Phone, DollarSign, UserCheck, Trash2, Ban } from 'lucide-react'
import { assignTherapist } from '@/utils/booking/assignTherapist'
import { Reservation, Therapist } from './CalendarView'
import { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDateString, toLocalTimeString, toUIDateString } from '@/utils/booking/dateUtils'
import { useLanguage } from '@/app/LanguageContext'
import { formatUSPhone, stripPhone } from '@/utils/phoneFormatter'

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  supabase: SupabaseClient
  therapists: Therapist[]
  reservations: Reservation[]
  currentUserId: string
  currentUserRole: 'manager' | 'staff' | 'therapist'
  
  // 수정 모드일 때 전달받을 예약 정보
  selectedReservation?: Reservation | null
  // 신규 등록 시 미리 클릭한 시간/마사지사 정보
  initialTime?: Date | null
  initialTherapistId?: number | null
}

export default function BookingModal({
  isOpen,
  onClose,
  onSuccess,
  supabase,
  therapists,
  reservations,
  currentUserId,
  currentUserRole,
  selectedReservation,
  initialTime,
  initialTherapistId
}: BookingModalProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [price, setPrice] = useState(80) // 기본 $80
  const [date, setDate] = useState('')
  const [startHour, setStartHour] = useState(9)
  const [startMinute, setStartMinute] = useState(0)
  const [endHour, setEndHour] = useState(10)
  const [endMinute, setEndMinute] = useState(0)
  const [therapistId, setTherapistId] = useState<string>('auto') // 'auto' 또는 마사지사 ID

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { language, t } = useLanguage()
  
  // 취소 조작 관련 상태
  const [isCancelling, setIsCancelling] = useState(false)
  const [selectedCancelType, setSelectedCancelType] = useState<'request' | 'noshow'>('request')
  
  // 마사지사 날짜별 근무 일정 맵핑 상태
  const [daySchedules, setDaySchedules] = useState<Record<number, string | null>>({})

  const fetchDaySchedules = async (targetDate: string) => {
    if (!targetDate) return
    try {
      const { data, error } = await supabase
        .from('therapist_schedule')
        .select('therapist_id, availability_type')
        .eq('date', targetDate)

      if (error) throw error
      
      const mapping: Record<number, string | null> = {}
      if (data) {
        data.forEach((s: any) => {
          mapping[s.therapist_id] = s.availability_type
        })
      }
      setDaySchedules(mapping)
    } catch (err) {
      console.error('Failed to fetch day schedules in BookingModal:', err)
    }
  }

  useEffect(() => {
    if (isOpen && date) {
      fetchDaySchedules(date)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, date])

  const checkTherapistAvailability = (tId: number) => {
    const type = daySchedules[tId]
    
    // 기본은 미정(null), 미정일 때는 가용하지 않음
    if (!type) {
      return { available: false, reason: language === 'ko' ? '미정' : 'TBD' }
    }
    if (type === 'off') {
      return { available: false, reason: t('schedule.off_duty') }
    }
    
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = endHour * 60 + endMinute
    const boundary = 16 * 60 + 30 // 16:30
    
    if (type === 'am_half') {
      const ok = startMinutes >= boundary
      return { 
        available: ok, 
        reason: ok 
          ? (language === 'ko' ? '오전반차' : 'AM Off') 
          : (language === 'ko' ? '오전반차 (반차휴무)' : 'AM Off (Half-day)') 
      }
    }
    
    if (type === 'pm_half') {
      const ok = endMinutes <= boundary
      return { 
        available: ok, 
        reason: ok 
          ? (language === 'ko' ? '오후반차' : 'PM Off') 
          : (language === 'ko' ? '오후반차 (반차휴무)' : 'PM Off (Half-day)') 
      }
    }
    
    return { available: true, reason: t('schedule.on_duty') }
  }
  
  // 예약 성공 결과를 저장하는 상태 (결과 화면 전환용)
  const [successResult, setSuccessResult] = useState<{
    customerName: string
    therapistName: string
    date: string
    startTime: number
    startMinute: number
    endTime: number
    endMinute: number
    isEdit: boolean
  } | null>(null)
  
  const isEditMode = !!selectedReservation
  
  const getDefaultEndTime = (h: number, m: number) => {
    let eh = h + 1
    let em = m + 30
    if (em >= 60) {
      eh += 1
      em -= 60
    }
    if (eh >= 24) {
      eh = 24
      em = 0
    }
    return { endHour: eh, endMinute: em }
  }

  useEffect(() => {
    const roundTo10Minutes = (min: number) => Math.floor(min / 10) * 10

    if (isOpen) {
      setErrorMsg(null)
      setSuccessResult(null) // 매번 모달이 새로 열릴 때 성공 팝업 초기화
      setIsCancelling(false)
      setSelectedCancelType('request')
 
      if (isEditMode && selectedReservation) {
        // 수정 모드
        setCustomerName(selectedReservation.customer_name)
        setCustomerPhone(formatUSPhone(selectedReservation.customer_phone || ''))
        setPrice(Number(selectedReservation.price))
        
        const start = new Date(selectedReservation.start_time)
        const end = new Date(selectedReservation.end_time)
        
        setDate(toLocalDateString(start))
        setStartHour(start.getHours())
        setStartMinute(roundTo10Minutes(start.getMinutes()))
        setEndHour(end.getHours())
        setEndMinute(roundTo10Minutes(end.getMinutes()))
        setTherapistId(selectedReservation.therapist_id?.toString() || 'auto')
      } else {
        // 신규 등록 모드
        setCustomerName('')
        setCustomerPhone('')
        setPrice(80)
        setTherapistId(initialTherapistId?.toString() || 'auto')
        
        if (initialTime) {
          const sh = initialTime.getHours()
          const sm = roundTo10Minutes(initialTime.getMinutes())
          setDate(toLocalDateString(initialTime))
          setStartHour(sh)
          setStartMinute(sm)
          
          const { endHour: eh, endMinute: em } = getDefaultEndTime(sh, sm)
          setEndHour(eh)
          setEndMinute(em)
        } else {
          setDate(toLocalDateString(new Date()))
          setStartHour(9)
          setStartMinute(0)
          setEndHour(10)
          setEndMinute(30)
        }
      }
    }
  }, [isOpen, isEditMode, selectedReservation, initialTime, initialTherapistId])


  if (!isOpen) return null

  // 2. 권한 검사 (모든 가입된 직원 상호 수정 허용)
  const isOwner = selectedReservation?.created_by === currentUserId
  const isManager = currentUserRole === 'manager'
  const isStaff = currentUserRole === 'staff'
  const canModify = isManager || isStaff

  // 선택된 마사지사의 오늘자 예약 범위 리스트 반환
  const getTherapistScheduleList = () => {
    if (therapistId === 'auto' || !date) return []
 
    const selectedTherapistId = Number(therapistId)
    
    // 이 날짜의 이 마사지사의 확정된 예약들 필터링
    const selectedDayRes = reservations.filter(res => {
      if (res.therapist_id !== selectedTherapistId || res.status !== 'confirmed') return false
      
      // 만약 수정 모드인 경우, 자기 자신의 현재 예약은 제외
      if (isEditMode && selectedReservation && res.id === selectedReservation.id) {
        return false
      }
      
      const resDateStr = toLocalDateString(new Date(res.start_time))
      return resDateStr === date
    })
 
    return selectedDayRes
      .map(res => {
        const start = new Date(res.start_time)
        const end = new Date(res.end_time)
        return {
          id: res.id,
          customerName: res.customer_name,
          timeStr: `${toLocalTimeString(start)} ~ ${toLocalTimeString(end)}`
        }
      })
      .sort((a, b) => a.timeStr.localeCompare(b.timeStr))
  }
 
  const scheduleList = getTherapistScheduleList()

  // 3. 시간 포맷 도우미 (ISO String 변환)
  const getISODateStrings = () => {
    const [y, m, d] = date.split('-').map(Number)
    const start = new Date(y, m - 1, d, startHour, startMinute, 0, 0)
    const end = new Date(y, m - 1, d, endHour, endMinute, 0, 0)

    return {
      startTimeISO: start.toISOString(),
      endTimeISO: end.toISOString()
    }
  }

  // 4. 예약 등록 / 수정 처리 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim()) {
      setErrorMsg(language === 'ko' ? '고객 이름을 입력해 주세요.' : 'Please enter client name.')
      return
    }
    if (startHour >= endHour) {
      setErrorMsg(language === 'ko' ? '종료 시간은 시작 시간보다 늦어야 합니다.' : 'End time must be later than start time.')
      return
    }

    // [과거 시간 예약 제한 검증]
    const [y, m, d] = date.split('-').map(Number)
    const bookingStart = new Date(y, m - 1, d, startHour, 0, 0, 0)
    const now = new Date()
    const isTimeChanged = !selectedReservation || new Date(selectedReservation.start_time).getTime() !== bookingStart.getTime()

    if (isTimeChanged && bookingStart < now) {
      const msg = language === 'ko' ? '과거 시간으로 예약할 수 없습니다.' : 'Cannot book for a past time.'
      setErrorMsg(msg)
      alert(msg)
      return
    }


    setLoading(true)
    setErrorMsg(null)

    try {
      const { startTimeISO, endTimeISO } = getISODateStrings()
      
      // Check if currentUserId exists in employee table to avoid foreign key constraint violation
      let validatedUserId: string | null = null
      if (currentUserId) {
        const { data: empExists } = await supabase
          .from('employee')
          .select('id')
          .eq('id', currentUserId)
          .maybeSingle()
        if (empExists) {
          validatedUserId = currentUserId
        }
      }

      let assignedId: number | null = null
      let assignedName = ''

      // 변경 여부 확인 (수정 모드일 때만 작동, 신규 등록 시에는 무조건 변경된 것으로 간주하여 validation 진행)
      let isValidationRequired = true
      if (isEditMode && selectedReservation) {
        const isTimeChanged =
          selectedReservation.start_time !== startTimeISO ||
          selectedReservation.end_time !== endTimeISO

        const isTherapistChanged =
          therapistId === 'auto'
            ? selectedReservation.therapist_id !== null
            : Number(therapistId) !== selectedReservation.therapist_id

        isValidationRequired = isTimeChanged || isTherapistChanged
      }

      if (isValidationRequired) {
        // [자동 배정 / 수동 검증 단계]
        const reqTherapistId = therapistId === 'auto' ? undefined : Number(therapistId)

        const assignResult = await assignTherapist({
          supabase,
          startTime: startTimeISO,
          endTime: endTimeISO,
          price,
          therapistId: reqTherapistId,
          excludeReservationId: selectedReservation?.id
        })

        if (!assignResult.success || !assignResult.therapistId) {
          setErrorMsg(assignResult.error || (language === 'ko' ? '마사지사 배정에 실패했습니다.' : 'Failed to assign therapist.'))
          setLoading(false)
          return
        }

        assignedId = assignResult.therapistId
        assignedName = assignResult.therapistName || ''
      } else {
        // therapist, date, time이 모두 변경되지 않은 경우 (단순 이름, 연락처, 금액 등의 변경)
        assignedId = selectedReservation!.therapist_id
        assignedName = therapists.find(t => t.id === assignedId)?.name || ''
      }

      if (isEditMode && selectedReservation) {
        // [수정 모드 처리]
        const changesList: any[] = []
        if (selectedReservation.customer_name !== customerName) {
          changesList.push({
            key: 'log.reservation.val.change_client',
            params: { old: selectedReservation.customer_name, new: customerName }
          })
        }
        if (stripPhone(selectedReservation.customer_phone || '') !== stripPhone(customerPhone)) {
          changesList.push({
            key: 'log.reservation.val.change_phone',
            params: { 
              old: formatUSPhone(selectedReservation.customer_phone || ''), 
              new: formatUSPhone(customerPhone) 
            }
          })
        }
        if (Number(selectedReservation.price) !== price) {
          changesList.push({
            key: 'log.reservation.val.change_price',
            params: { old: Number(selectedReservation.price), new: price }
          })
        }
        if (selectedReservation.start_time !== startTimeISO || selectedReservation.end_time !== endTimeISO) {
          const oldStart = toLocalTimeString(new Date(selectedReservation.start_time))
          const oldEnd = toLocalTimeString(new Date(selectedReservation.end_time))
          const newStart = toLocalTimeString(new Date(startTimeISO))
          const newEnd = toLocalTimeString(new Date(endTimeISO))
          
          const oldDateStr = toLocalDateString(new Date(selectedReservation.start_time))
          const newDateStr = toLocalDateString(new Date(startTimeISO))
          
          if (oldDateStr === newDateStr) {
            changesList.push({
              key: 'log.reservation.val.change_time',
              params: { old: `${oldStart}~${oldEnd}`, new: `${newStart}~${newEnd}` }
            })
          } else {
            const oldUIDate = toUIDateString(new Date(selectedReservation.start_time))
            const newUIDate = toUIDateString(new Date(startTimeISO))
            changesList.push({
              key: 'log.reservation.val.change_date_time',
              params: { old: `${oldUIDate} ${oldStart}~${oldEnd}`, new: `${newUIDate} ${newStart}~${newEnd}` }
            })
          }
        }
        if (selectedReservation.therapist_id !== assignedId) {
          const oldTherapist = therapists.find(t => t.id === selectedReservation.therapist_id)?.name || 'Unassigned'
          changesList.push({
            key: 'log.reservation.val.change_therapist',
            params: { old: oldTherapist, new: assignedName }
          })
        }

        const detailsText = JSON.stringify({
          key: changesList.length > 0 ? 'log.reservation.update' : 'log.reservation.update_no_changes',
          params: {
            changes: changesList
          }
        })

        const { error } = await supabase
          .from('reservations')
          .update({
            customer_name: customerName,
            customer_phone: stripPhone(customerPhone),
            start_time: startTimeISO,
            end_time: endTimeISO,
            price,
            therapist_id: assignedId,
            status: 'confirmed'
          })
          .eq('id', selectedReservation.id)

        if (error) throw error

        // 이력 로그 기록
        await supabase.from('reservation_logs').insert({
          reservation_id: selectedReservation.id,
          action: 'update',
          performed_by: validatedUserId,
          details: detailsText
        })
      } else {
        // [신규 등록 모드 처리]
        const { data: insertedData, error } = await supabase
          .from('reservations')
          .insert({
            customer_name: customerName,
            customer_phone: stripPhone(customerPhone),
            start_time: startTimeISO,
            end_time: endTimeISO,
            price,
            therapist_id: assignedId,
            created_by: validatedUserId,
            status: 'confirmed'
          })
          .select()

        if (error) throw error

        // 신규 등록 시 이력 로그(create)는 남기지 않음
      }

      // 즉시 닫지 않고 성공 팝업 정보를 세팅합니다.
      setSuccessResult({
        customerName,
        therapistName: assignedName,
        date,
        startTime: startHour,
        startMinute: startMinute,
        endTime: endHour,
        endMinute: endMinute,
        isEdit: isEditMode
      })

    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || (language === 'ko' ? '예약 처리 중 오류가 발생했습니다.' : 'An error occurred while saving booking.'))
    } finally {
      setLoading(false)
    }
  }

  // 5. 예약 취소 처리 핸들러 (Soft Cancel)
  const handleCancelReservation = async () => {
    if (!selectedReservation) return
    if (!isCancelling) {
      setIsCancelling(true)
      return
    }

    setLoading(true)
    setErrorMsg(null)

    try {
      // Check if currentUserId exists in employee table to avoid foreign key constraint violation
      let validatedUserId: string | null = null
      if (currentUserId) {
        const { data: empExists } = await supabase
          .from('employee')
          .select('id')
          .eq('id', currentUserId)
          .maybeSingle()
        if (empExists) {
          validatedUserId = currentUserId
        }
      }

      const penaltyPoints = selectedCancelType === 'request' ? 1 : 3

      const { error } = await supabase
        .from('reservations')
        .update({ 
          status: 'cancelled',
          cancellation_type: selectedCancelType,
          penalty_points: penaltyPoints
        })
        .eq('id', selectedReservation.id)

      if (error) throw error

      // 이력 로그 기록
      const cancelTypeTransKey = selectedCancelType === 'request'
        ? 'booking.modal.cancel.type_request'
        : 'booking.modal.cancel.type_noshow'

      await supabase.from('reservation_logs').insert({
        reservation_id: selectedReservation.id,
        action: 'cancel',
        performed_by: validatedUserId,
        details: JSON.stringify({
          key: 'log.reservation.cancel',
          params: { name: `${selectedReservation.customer_name} (${t(cancelTypeTransKey)})` }
        })
      })

      onSuccess()
      onClose()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || (language === 'ko' ? '예약 취소 중 오류가 발생했습니다.' : 'An error occurred while cancelling booking.'))
    } finally {
      setLoading(false)
    }
  }

  // 성공 팝업 최종 확인 클릭 핸들러
  const handleConfirmClose = () => {
    onSuccess() // 대시보드 리로드 트리거
    onClose()   // 모달 닫기
    setSuccessResult(null)
  }

  // ==========================================
  // [성공 팝업 상태 렌더러 분기]
  // ==========================================
  if (successResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center space-y-5">
          {/* 성공 뱃지 */}
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-950/20 text-white text-xl font-bold animate-bounce">
            🎉
          </div>
          
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-slate-100">
              {successResult.isEdit 
                ? (language === 'ko' ? '예약 변경 완료' : 'Booking Updated') 
                : (language === 'ko' ? '예약 접수 완료' : 'Booking Registered')}
            </h2>
            <p className="text-xs text-slate-500">
              {language === 'ko' ? '실시간 마사지사 배정 및 DB 저장이 정상 완료되었습니다.' : 'Real-time therapist assignment and database save completed successfully.'}
            </p>
          </div>

          {/* 성공 메시지 상세 디테일 (고객명, 시간, 배정 마사지사) */}
          <div className="w-full bg-slate-950/60 border border-slate-850 rounded-xl p-4.5 text-xs text-slate-350 leading-relaxed text-left space-y-2.5">
            <p className="font-semibold text-slate-400">
              {successResult.isEdit 
                ? (language === 'ko' ? '✏️ 변경 완료 정보:' : '✏️ Updated Info:') 
                : (language === 'ko' ? '📋 접수 완료 정보:' : '📋 Registered Info:')}
            </p>
            <p className="text-slate-300 text-sm">
              {language === 'ko' ? (
                <>
                  고객 <span className="font-bold text-indigo-400">{successResult.customerName}</span>님이{' '}
                  마사지사 <span className="font-bold text-amber-400">{successResult.therapistName}</span>님에게{' '}
                  <span className="font-bold text-slate-200">{String(successResult.startTime).padStart(2, '0')}:{String(successResult.startMinute).padStart(2, '0')}</span>부터{' '}
                  <span className="font-bold text-slate-200">{String(successResult.endTime).padStart(2, '0')}:{String(successResult.endMinute).padStart(2, '0')}</span>까지 예약이{' '}
                  {successResult.isEdit ? '변경' : '등록'}되었습니다.
                </>
              ) : (
                <>
                  Booking for client <span className="font-bold text-indigo-400">{successResult.customerName}</span> with{' '}
                  therapist <span className="font-bold text-amber-400">{successResult.therapistName}</span> has been{' '}
                  {successResult.isEdit ? 'updated' : 'registered'} from{' '}
                  <span className="font-bold text-slate-200">{String(successResult.startTime).padStart(2, '0')}:{String(successResult.startMinute).padStart(2, '0')}</span> to{' '}
                  <span className="font-bold text-slate-200">{String(successResult.endTime).padStart(2, '0')}:{String(successResult.endMinute).padStart(2, '0')}</span>.
                </>
              )}
            </p>
            <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-850/80">
              {language === 'ko' ? `예약 날짜: ${toUIDateString(successResult.date)}` : `Booking Date: ${toUIDateString(successResult.date)}`}
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirmClose}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 py-2.5 text-xs font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            {language === 'ko' ? '확인' : 'Confirm'}
          </button>
        </div>
      </div>
    )
  }

  // ==========================================
  // [기본 입력 폼 렌더러]
  // ==========================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-950/20">
          <h2 className="text-lg font-bold tracking-tight text-slate-200 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-500" />
            {isEditMode ? t('booking.modal.edit') : t('booking.modal.new')}
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-slate-850 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* 권한 수정 제한 안내 */}
          {isEditMode && !canModify && (
            <div className="p-3 text-xs rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5 font-medium">
              <Ban className="w-4 h-4 flex-shrink-0" />
              <span>
                {language === 'ko' 
                  ? '본인 등록 예약이 아니므로 상세 수정이나 마사지사 재배치가 불가능합니다. (조회만 가능)' 
                  : 'This booking was registered by another staff; editing or re-assigning therapist is restricted. (Read-only)'}
              </span>
            </div>
          )}

          {/* 고객명 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">{t('booking.modal.client_name')}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                disabled={!canModify}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={language === 'ko' ? '고객 성함을 기입해 주세요' : 'Enter client name'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-3 text-sm text-slate-100 placeholder-slate-660 focus:outline-none focus:border-indigo-500/80 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* 연락처 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">{t('list.table.phone')}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                <Phone className="w-4 h-4" />
              </span>
              <input
                type="text"
                disabled={!canModify}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(formatUSPhone(e.target.value))}
                placeholder={language === 'ko' ? '예: 123-456-7890' : 'e.g. 123-456-7890'}
                maxLength={12} // US 포맷 123-456-7890 총 12자 제한
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-3 text-sm text-slate-100 placeholder-slate-660 focus:outline-none focus:border-indigo-500/80 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* 예약 일자 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
              {language === 'ko' ? '예약 날짜' : 'Booking Date'}
            </label>
            <div className="relative">
              <input
                type="date"
                disabled={!canModify}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-100 flex justify-between items-center pointer-events-none min-h-[42px] font-medium ${!canModify ? 'opacity-50' : ''}`}>
                <span className="absolute left-3 text-indigo-400">
                  <Calendar className="w-4 h-4" />
                </span>
                <span>{date ? toUIDateString(date) : (language === 'ko' ? '날짜 선택' : 'Select Date')}</span>
              </div>
            </div>
          </div>

          {/* 예약 시간 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">{t('booking.modal.start_time')}</label>
              <div className="flex gap-2">
                <select
                  disabled={!canModify}
                  value={startHour}
                  onChange={(e) => {
                    const newHour = Number(e.target.value)
                    setStartHour(newHour)
                    const { endHour: eh, endMinute: em } = getDefaultEndTime(newHour, startMinute)
                    setEndHour(eh)
                    setEndMinute(em)
                  }}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors disabled:opacity-50"
                >
                  {Array.from({ length: 16 }, (_, i) => i + 9).map(h => (
                    <option key={h} value={h}>
                      {language === 'ko' ? `${h}시` : `${String(h).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
                <select
                  disabled={!canModify}
                  value={startMinute}
                  onChange={(e) => {
                    const newMinute = Number(e.target.value)
                    setStartMinute(newMinute)
                    const { endHour: eh, endMinute: em } = getDefaultEndTime(startHour, newMinute)
                    setEndHour(eh)
                    setEndMinute(em)
                  }}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors disabled:opacity-50"
                >
                  {[0, 10, 20, 30, 40, 50].map(m => (
                    <option key={m} value={m}>
                      {language === 'ko' ? `${m}분` : `${String(m).padStart(2, '0')} min`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                {language === 'ko' ? '종료 시간' : 'End Time'}
              </label>
              <div className="flex gap-2">
                <select
                  disabled={!canModify}
                  value={endHour}
                  onChange={(e) => setEndHour(Number(e.target.value))}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors disabled:opacity-50"
                >
                  {Array.from({ length: 16 }, (_, i) => i + 9).map(h => (
                    <option key={h} value={h} disabled={h < startHour}>
                      {language === 'ko' ? `${h}시` : `${String(h).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
                <select
                  disabled={!canModify}
                  value={endMinute}
                  onChange={(e) => setEndMinute(Number(e.target.value))}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors disabled:opacity-50"
                >
                  {[0, 10, 20, 30, 40, 50].map(m => {
                    const isDisabled = startHour === endHour && m <= startMinute
                    return (
                      <option key={m} value={m} disabled={isDisabled}>
                        {language === 'ko' ? `${m}분` : `${String(m).padStart(2, '0')} min`}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* 마사지 금액 */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
              {t('booking.modal.price')}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                <DollarSign className="w-4 h-4" />
              </span>
              <input
                type="number"
                disabled={!canModify}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                step="10"
                min="10"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-3 text-sm text-slate-100 placeholder-slate-660 focus:outline-none focus:border-indigo-500/80 transition-colors disabled:opacity-50"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              {language === 'ko' 
                ? '* $120 이상인 고급 코스는 당일 전담 마사지사(고급 우선)에게 최우선 배정됩니다.' 
                : '* Premium courses of $120 or more are assigned to designated premium therapists first.'}
            </p>
          </div>

          {/* 마사지사 배정 (수동 지정 및 자동 배정 토글) */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">{t('booking.modal.therapist')}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-650">
                <UserCheck className="w-4 h-4" />
              </span>
              <select
                disabled={!canModify}
                value={therapistId}
                onChange={(e) => setTherapistId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors disabled:opacity-50"
              >
                <option value="auto">
                  {language === 'ko' ? '✨ 시스템 자동 지정 (가장 비어 있는 마사지사 매핑)' : '✨ Auto-Assign (Map most available therapist)'}
                </option>
                {therapists.map(t => {
                  const avail = checkTherapistAvailability(t.id)
                  const isDbActive = t.is_active
                  const isSelectable = isDbActive && avail.available

                  let statusText = ''
                  if (!isDbActive) {
                    statusText = language === 'ko' ? '비활성' : 'Inactive'
                  } else {
                    statusText = avail.reason
                  }

                  let statusSuffix = t.is_premium_target ? (language === 'ko' ? ' - 고급 담당' : ' - Premium') : ''

                  return (
                    <option key={t.id} value={t.id} disabled={!isSelectable}>
                      {t.name} ({statusText}{statusSuffix})
                    </option>
                  )
                })}
              </select>
            </div>
          </div>

          {/* 선택한 마사지사의 오늘자 예약 현황 (리스트) */}
          {therapistId !== 'auto' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {language === 'ko' ? '선택한 마사지사의 오늘 예약 선점 현황' : 'Current Bookings of Chosen Therapist Today'}
              </span>
              {scheduleList.length === 0 ? (
                <p className="text-xs text-emerald-400 font-medium">
                  {language === 'ko' ? '✓ 오늘 비어있는 상태입니다. (자유롭게 예약 가능)' : '✓ Fully available today.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                  {scheduleList.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-450 p-2 font-medium"
                    >
                      <span>{language === 'ko' ? `👤 ${item.customerName} 고객님` : `👤 Client ${item.customerName}`}</span>
                      <span className="font-mono text-[11px] font-semibold">{item.timeStr}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        {/* 푸터 액션 */}
        {isCancelling ? (
          <div className="p-5 border-t border-slate-800 bg-slate-950/20 flex flex-col gap-3 w-full animate-in slide-in-from-bottom duration-250">
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="font-bold text-rose-400">⚠️ {t('booking.modal.cancel.type_label')}</span>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCancelType('request')}
                  className={`flex flex-col items-center justify-center rounded-xl p-3 border text-xs font-bold transition-all ${
                    selectedCancelType === 'request'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-350 border-indigo-550/40'
                      : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400'
                  }`}
                >
                  <span>{t('booking.modal.cancel.type_request')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCancelType('noshow')}
                  className={`flex flex-col items-center justify-center rounded-xl p-3 border text-xs font-bold transition-all ${
                    selectedCancelType === 'noshow'
                      ? 'border-rose-500 bg-rose-500/10 text-rose-350 border-rose-550/40'
                      : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400'
                  }`}
                >
                  <span>{t('booking.modal.cancel.type_noshow')}</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-2">
              <button
                type="button"
                onClick={() => setIsCancelling(false)}
                className="rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 px-4 py-3 text-xs font-bold transition-all animate-none"
              >
                {t('booking.modal.cancel.back_btn')}
              </button>
              <button
                type="button"
                onClick={handleCancelReservation}
                disabled={loading}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/20 px-5 py-3 text-xs font-bold transition-all disabled:opacity-50"
              >
                {loading ? (language === 'ko' ? '처리 중...' : 'Processing...') : t('booking.modal.cancel.confirm_btn')}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 border-t border-slate-800 bg-slate-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* 예약 취소 버튼 (수정 모드이면서 권한 권한 소지 시 노출) */}
            {isEditMode && canModify && selectedReservation.status === 'confirmed' ? (
              <button
                type="button"
                onClick={handleCancelReservation}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/20 px-4 py-3 text-xs font-bold transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> {t('booking.modal.cancel_booking')}
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 px-4 py-3 text-xs font-bold transition-all"
              >
                {t('booking.modal.close')}
              </button>
              {canModify && (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 px-6 py-3 text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {loading 
                    ? (language === 'ko' ? '처리 중...' : 'Processing...') 
                    : isEditMode 
                      ? t('therapist.save') 
                      : (language === 'ko' ? '예약 접수하기' : 'Book Now')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
