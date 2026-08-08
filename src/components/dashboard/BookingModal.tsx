'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Calendar, User, Phone, DollarSign, UserCheck, Trash2, Ban, Key } from 'lucide-react'
import { assignTherapist } from '@/utils/booking/assignTherapist'
import { reassignTherapists } from '@/utils/booking/reassignTherapists'
import { getOperatingHoursForDate, OperatingHoursInfo } from '@/utils/booking/operatingHours'
import { Reservation, Therapist } from './CalendarView'
import { SupabaseClient } from '@supabase/supabase-js'
import { UserSim } from '@/app/providers'
import { toLocalDateString, toLocalTimeString, toUIDateString } from '@/utils/booking/dateUtils'
import { useLanguage } from '@/app/LanguageContext'
import { formatUSPhone, stripPhone } from '@/utils/phoneFormatter'
import PinAuthModal, { PinAuthResult } from '../common/PinAuthModal'

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  supabase: SupabaseClient
  therapists: Therapist[]
  reservations: Reservation[]
  currentUserId: string
  currentUserRole: UserSim['role']
  isWalkIn?: boolean

  // 수정 모드일 때 전달받을 예약 정보
  selectedReservation?: Reservation | null
  // 신규 등록 시 미리 클릭한 시간/마사지사 정보
  initialTime?: Date | null
  initialTherapistId?: number | null
  defaultDate?: string
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
  initialTherapistId,
  defaultDate,
  isWalkIn = false
}: BookingModalProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [price, setPrice] = useState(80) // 기본 $80
  const [pricingPlans, setPricingPlans] = useState<any[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [date, setDate] = useState('')
  const [startHour, setStartHour] = useState(9)
  const [startMinute, setStartMinute] = useState(0)
  const [endHour, setEndHour] = useState(10)
  const [endMinute, setEndMinute] = useState(0)
  const [therapistId, setTherapistId] = useState<string>('auto') // 'auto' 또는 마사지사 ID
  const [secondaryTherapistId, setSecondaryTherapistId] = useState<string>('auto') // 'auto' 또는 보조 마사지사 ID
  const [delayMinutes, setDelayMinutes] = useState(30) // 콤보 요금제: 습식 종료 후 건식 시작까지 대기시간
  const [delayMinutesDraft, setDelayMinutesDraft] = useState('30')

  // 동반인 동시 예약용 상태 추가
  const [personCount, setPersonCount] = useState(1)
  const [activeTab, setActiveTab] = useState(0)

  // PIN 인증 모달 관련 상태
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinActionTitle, setPinActionTitle] = useState('')
  const [pendingAction, setPendingAction] = useState<((performer: PinAuthResult) => Promise<void>) | null>(null)
  const [companions, setCompanions] = useState<{
    planId: string
    price: number
    startHour: number
    startMinute: number
    endHour: number
    endMinute: number
    therapistId: string
    secondaryTherapistId: string
    delayMinutes: number
    lockerNumber?: string
  }[]>([
    { planId: '', price: 80, startHour: 9, startMinute: 0, endHour: 10, endMinute: 0, therapistId: 'auto', secondaryTherapistId: 'auto', delayMinutes: 30, lockerNumber: '' }
  ])
  const [isSamePlanApplied, setIsSamePlanApplied] = useState(true)
  const [isSameTimeApplied, setIsSameTimeApplied] = useState(true)
  const [lockerNumber, setLockerNumber] = useState('')
  const [isCheckedIn, setIsCheckedIn] = useState(false)
  const [opInfo, setOpInfo] = useState<OperatingHoursInfo | null>(null)

  useEffect(() => {
    if (!isOpen || !date) return
    const fetchOperatingHours = async () => {
      const info = await getOperatingHoursForDate(supabase, date)
      setOpInfo(info)
    }
    fetchOperatingHours()
  }, [date, isOpen, supabase])

  const hasFormChanges = () => {
    if (!selectedReservation) return true // New booking counts as change

    const tzo = -new Date().getTimezoneOffset()
    const dif = tzo >= 0 ? '+' : '-'
    const pad = (num: number) => String(Math.floor(Math.abs(num))).padStart(2, '0')
    const offset = `${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`
    
    const sHourStr = String(startHour).padStart(2, '0')
    const sMinStr = String(startMinute).padStart(2, '0')
    const eHourStr = String(endHour).padStart(2, '0')
    const eMinStr = String(endMinute).padStart(2, '0')

    const newStartISO = `${date}T${sHourStr}:${sMinStr}:00${offset}`
    const newEndISO = `${date}T${eHourStr}:${eMinStr}:00${offset}`

    const isNameDiff = (selectedReservation.customer_name || '').trim() !== customerName.trim()
    const isPhoneDiff = stripPhone(selectedReservation.customer_phone || '') !== stripPhone(customerPhone)
    const isPriceDiff = Number(selectedReservation.price) !== Number(price)
    const isPlanDiff = selectedReservation.pricing_plan_id !== (selectedPlanId ? Number(selectedPlanId) : null)
    
    const isStartDiff = new Date(selectedReservation.start_time).getTime() !== new Date(newStartISO).getTime()
    const isEndDiff = new Date(selectedReservation.end_time).getTime() !== new Date(newEndISO).getTime()
    
    const isTherapistDiff = selectedReservation.therapist_id !== (therapistId === 'auto' ? null : Number(therapistId))
    const isSecTherapistDiff = (selectedReservation as any).secondary_therapist_id !== (secondaryTherapistId === 'auto' ? null : Number(secondaryTherapistId))
    
    const isReqDiff = !!selectedReservation.is_requested !== (therapistId !== 'auto')
    const isReqSecDiff = !!selectedReservation.is_requested_secondary !== (secondaryTherapistId !== 'auto')

    const isDelayDiff = ((selectedReservation as any).delay_minutes ?? 30) !== delayMinutes

    return isNameDiff || isPhoneDiff || isPriceDiff || isPlanDiff || isStartDiff || isEndDiff || isTherapistDiff || isSecTherapistDiff || isReqDiff || isReqSecDiff || isDelayDiff
  }

  interface GuestProposal {
    name: string
    status: 'wet_failed' | 'dry_failed' | 'all_failed' | 'success'
    proposals: { hour: number; minute: number; timeStr: string }[]
  }

  interface TimeProposal {
    guests: GuestProposal[]
  }
  const [pendingProposal, setPendingProposal] = useState<TimeProposal | null>(null)

  const getLocalTimezoneOffsetString = () => {
    const tzo = -new Date().getTimezoneOffset()
    const dif = tzo >= 0 ? '+' : '-'
    const pad = (num: number) => String(Math.floor(Math.abs(num))).padStart(2, '0')
    return `${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`
  }

  const getISOStringFromLocal = (targetHour: number, targetMinute: number) => {
    const hStr = String(targetHour).padStart(2, '0')
    const mStr = String(targetMinute).padStart(2, '0')
    const offset = getLocalTimezoneOffsetString()
    return `${date}T${hStr}:${mStr}:00${offset}`
  }

  const commitDelayMinutes = () => {
    const parsed = Number(delayMinutesDraft)
    const normalized = Number.isFinite(parsed) ? Math.max(5, Math.min(120, parsed)) : 5
    setDelayMinutes(normalized)
    setDelayMinutesDraft(String(normalized))
  }

  useEffect(() => {
    setDelayMinutesDraft(String(delayMinutes))
  }, [delayMinutes])

  const simulateGroupAssignment = (slotH: number, slotMin: number, comps: typeof companions = companions): boolean => {
    const therapistTimelines = new Map<number, { startMs: number; endMs: number }[]>()
    therapists.forEach(t => therapistTimelines.set(t.id, []))

    for (const res of reservations) {
      if (res.status !== 'confirmed') continue
      if (isEditMode && selectedReservation && res.id === selectedReservation.id) continue

      const resStartObj = new Date(res.start_time)
      const resDateStr = toLocalDateString(resStartObj)
      if (resDateStr !== date) continue

      const plan = res.pricing_plan_id ? pricingPlans.find(p => p.id === res.pricing_plan_id) : null
      const isCombo = plan?.category === 'combo'

      const resStartMs = resStartObj.getTime()
      const resEndMs = new Date(res.end_time).getTime()

      if (isCombo && plan) {
        const bathDur = plan.bath_duration_minutes || 60
        const massageDur = plan.massage_duration_minutes || 60
        const resDelayMin = (res as any).delay_minutes ?? 30
        if (res.secondary_therapist_id) {
          const subId = Number(res.secondary_therapist_id)
          const wetSegments = therapistTimelines.get(subId) || []
          wetSegments.push({ startMs: resStartMs, endMs: resStartMs + bathDur * 60000 })
          therapistTimelines.set(subId, wetSegments)
        }
        if (res.therapist_id) {
          const mainId = Number(res.therapist_id)
          const drySegments = therapistTimelines.get(mainId) || []
          const dryStart = resStartMs + (bathDur + resDelayMin) * 60000
          drySegments.push({ startMs: dryStart, endMs: dryStart + massageDur * 60000 })
          therapistTimelines.set(mainId, drySegments)
        }
      } else {
        if (res.therapist_id) {
          const mainId = Number(res.therapist_id)
          const segments = therapistTimelines.get(mainId) || []
          segments.push({ startMs: resStartMs, endMs: resEndMs })
          therapistTimelines.set(mainId, segments)
        }
      }
    }

    const scanStartISO = getISOStringFromLocal(slotH, slotMin)
    const scanStartMs = new Date(scanStartISO).getTime()

    interface AssignmentTask {
      guestIdx: number
      role: 'wet' | 'dry'
      startMs: number
      endMs: number
      requestedTherapistId: number | null
    }
    const tasks: AssignmentTask[] = []

    for (let i = 0; i < personCount; i++) {
      const comp = comps[i]
      const compPlan = pricingPlans.find(p => p.id.toString() === comp.planId)
      if (!compPlan) return false

      const compIsCombo = compPlan.category === 'combo'
      const bathDur = compPlan.bath_duration_minutes || 60
      const massageDur = compPlan.massage_duration_minutes || 60
      const duration = compPlan.duration_minutes + (compIsCombo ? comp.delayMinutes : 0)

      if (compIsCombo) {
        tasks.push({
          guestIdx: i,
          role: 'dry',
          startMs: scanStartMs + (bathDur + comp.delayMinutes) * 60000,
          endMs: scanStartMs + (bathDur + comp.delayMinutes) * 60000 + massageDur * 60000,
          requestedTherapistId: comp.therapistId === 'auto' ? null : Number(comp.therapistId)
        })
        tasks.push({
          guestIdx: i,
          role: 'wet',
          startMs: scanStartMs,
          endMs: scanStartMs + bathDur * 60000,
          requestedTherapistId: comp.secondaryTherapistId === 'auto' ? null : Number(comp.secondaryTherapistId)
        })
      } else {
        tasks.push({
          guestIdx: i,
          role: compPlan.category === 'wet' ? 'wet' : 'dry',
          startMs: scanStartMs,
          endMs: scanStartMs + duration * 60000,
          requestedTherapistId: comp.therapistId === 'auto' ? null : Number(comp.therapistId)
        })
      }
    }

    // 콤보의 상호 의존 마사지사 배정을 위해 그리디하게 마사지사들 스캔
    const assignedByGuest = new Map<number, number[]>()
    for (const task of tasks) {
      let matchedTherapistId: number | null = null
      const guestAssignments = assignedByGuest.get(task.guestIdx) || []

      for (const t of therapists) {
        if (task.requestedTherapistId !== null && t.id !== task.requestedTherapistId) continue
        if (guestAssignments.includes(t.id)) continue
        if (!t.is_active) continue
        if (task.role === 'wet' && t.massage_type !== 'wet' && t.massage_type !== 'both') continue
        if (task.role === 'dry' && t.massage_type !== 'dry' && t.massage_type !== 'both') continue

        const testDate = new Date(task.startMs)
        const h = testDate.getHours()
        const min = testDate.getMinutes()
        const segDur = (task.endMs - task.startMs) / 60000

        const schedType = daySchedules[t.id]
        let scheduleOk = false
        if (schedType === 'full') scheduleOk = true
        else if (schedType === 'am_half' && (h * 60 + min) >= 990) scheduleOk = true
        else if (schedType === 'pm_half' && (h * 60 + min + segDur) <= 990) scheduleOk = true

        if (!scheduleOk) continue

        const currentSegments = therapistTimelines.get(t.id) || []
        const hasOverlap = currentSegments.some(seg => seg.startMs < task.endMs && seg.endMs > task.startMs)
        if (hasOverlap) continue

        matchedTherapistId = t.id
        break
      }

      if (matchedTherapistId === null) {
        return false
      }

      const segments = therapistTimelines.get(matchedTherapistId) || []
      segments.push({ startMs: task.startMs, endMs: task.endMs })
      therapistTimelines.set(matchedTherapistId, segments)
      assignedByGuest.set(task.guestIdx, [...guestAssignments, matchedTherapistId])
    }

    return true
  }

  // 각 게스트의 개별 시작 시간을 사용하는 그룹 배정 시뮬레이션
  // (simulateGroupAssignment와 달리, 하나의 공통 시작 시간이 아닌 각 companion의 개별 시간으로 검증)
  const simulateCurrentAssignment = (comps: typeof companions): boolean => {
    const therapistTimelines = new Map<number, { startMs: number; endMs: number }[]>()
    therapists.forEach(t => therapistTimelines.set(t.id, []))

    // 기존 DB 예약들의 타임라인 구축
    for (const res of reservations) {
      if (res.status !== 'confirmed') continue
      if (isEditMode && selectedReservation && res.id === selectedReservation.id) continue

      const resStartObj = new Date(res.start_time)
      const resDateStr = toLocalDateString(resStartObj)
      if (resDateStr !== date) continue

      const plan = res.pricing_plan_id ? pricingPlans.find(p => p.id === res.pricing_plan_id) : null
      const resIsCombo = plan?.category === 'combo'

      const resStartMs = resStartObj.getTime()
      const resEndMs = new Date(res.end_time).getTime()

      if (resIsCombo && plan) {
        const bathDur = plan.bath_duration_minutes || 60
        const massageDur = plan.massage_duration_minutes || 60
        const resDelayMin = (res as any).delay_minutes ?? 30
        if (res.secondary_therapist_id) {
          const subId = Number(res.secondary_therapist_id)
          const wetSegments = therapistTimelines.get(subId) || []
          wetSegments.push({ startMs: resStartMs, endMs: resStartMs + bathDur * 60000 })
          therapistTimelines.set(subId, wetSegments)
        }
        if (res.therapist_id) {
          const mainId = Number(res.therapist_id)
          const drySegments = therapistTimelines.get(mainId) || []
          const dryStart = resStartMs + (bathDur + resDelayMin) * 60000
          drySegments.push({ startMs: dryStart, endMs: dryStart + massageDur * 60000 })
          therapistTimelines.set(mainId, drySegments)
        }
      } else {
        if (res.therapist_id) {
          const mainId = Number(res.therapist_id)
          const segments = therapistTimelines.get(mainId) || []
          segments.push({ startMs: resStartMs, endMs: resEndMs })
          therapistTimelines.set(mainId, segments)
        }
      }
    }

    // 각 게스트별 개별 시간으로 배정 태스크 빌드
    interface AssignmentTask {
      guestIdx: number
      role: 'wet' | 'dry'
      startMs: number
      endMs: number
      requestedTherapistId: number | null
    }
    const tasks: AssignmentTask[] = []

    for (let i = 0; i < personCount; i++) {
      const comp = comps[i]
      const compPlan = pricingPlans.find(p => p.id.toString() === comp.planId)
      if (!compPlan) return false

      // 각 게스트의 개별 시작 시간 사용
      const compStartISO = getISOStringFromLocal(comp.startHour, comp.startMinute)
      const compStartMs = new Date(compStartISO).getTime()

      const compIsCombo = compPlan.category === 'combo'
      const bathDur = compPlan.bath_duration_minutes || 60
      const massageDur = compPlan.massage_duration_minutes || 60
      const duration = compPlan.duration_minutes + (compIsCombo ? (comp.delayMinutes ?? 30) : 0)

      if (compIsCombo) {
        tasks.push({
          guestIdx: i,
          role: 'dry',
          startMs: compStartMs + (bathDur + (comp.delayMinutes ?? 30)) * 60000,
          endMs: compStartMs + (bathDur + (comp.delayMinutes ?? 30)) * 60000 + massageDur * 60000,
          requestedTherapistId: comp.therapistId === 'auto' ? null : Number(comp.therapistId)
        })
        tasks.push({
          guestIdx: i,
          role: 'wet',
          startMs: compStartMs,
          endMs: compStartMs + bathDur * 60000,
          requestedTherapistId: comp.secondaryTherapistId === 'auto' ? null : Number(comp.secondaryTherapistId)
        })
      } else {
        tasks.push({
          guestIdx: i,
          role: compPlan.category === 'wet' ? 'wet' : 'dry',
          startMs: compStartMs,
          endMs: compStartMs + duration * 60000,
          requestedTherapistId: comp.therapistId === 'auto' ? null : Number(comp.therapistId)
        })
      }
    }

    // 그리디 배정 시뮬레이션
    const assignedByGuest = new Map<number, number[]>()
    for (const task of tasks) {
      let matchedTherapistId: number | null = null
      const guestAssignments = assignedByGuest.get(task.guestIdx) || []

      for (const t of therapists) {
        if (task.requestedTherapistId !== null && t.id !== task.requestedTherapistId) continue
        if (guestAssignments.includes(t.id)) continue
        if (!t.is_active) continue
        if (task.role === 'wet' && t.massage_type !== 'wet' && t.massage_type !== 'both') continue
        if (task.role === 'dry' && t.massage_type !== 'dry' && t.massage_type !== 'both') continue

        const testDate = new Date(task.startMs)
        const h = testDate.getHours()
        const min = testDate.getMinutes()
        const segDur = (task.endMs - task.startMs) / 60000

        const schedType = daySchedules[t.id]
        let scheduleOk = false
        if (schedType === 'full') scheduleOk = true
        else if (schedType === 'am_half' && (h * 60 + min) >= 990) scheduleOk = true
        else if (schedType === 'pm_half' && (h * 60 + min + segDur) <= 990) scheduleOk = true

        if (!scheduleOk) continue

        const currentSegments = therapistTimelines.get(t.id) || []
        const hasOverlap = currentSegments.some(seg => seg.startMs < task.endMs && seg.endMs > task.startMs)
        if (hasOverlap) continue

        matchedTherapistId = t.id
        break
      }

      if (matchedTherapistId === null) {
        return false
      }

      const segments = therapistTimelines.get(matchedTherapistId) || []
      segments.push({ startMs: task.startMs, endMs: task.endMs })
      therapistTimelines.set(matchedTherapistId, segments)
      assignedByGuest.set(task.guestIdx, [...guestAssignments, matchedTherapistId])
    }

    return true
  }

  const scanGuestProposals = (companionsToCheck: typeof companions = companions): GuestProposal[] => {
    const results: GuestProposal[] = []

    for (let i = 0; i < personCount; i++) {
      const comp = companionsToCheck[i]
      const displayName = i === 0 ? customerName : `${customerName} (동반 ${i})`
      const compPlan = pricingPlans.find(p => p.id.toString() === comp.planId)
      if (!compPlan) continue

      const compIsCombo = compPlan.category === 'combo'
      const duration = compPlan.duration_minutes + (compIsCombo ? comp.delayMinutes : 0)

      let guestStatus: GuestProposal['status'] = 'success'
      // 원래 시점의 가용성 판단
      const checkTargetStartISO = getISOStringFromLocal(comp.startHour, comp.startMinute)
      const checkTargetStartMs = new Date(checkTargetStartISO).getTime()

      let isWetOk = false
      let isDryOk = false

      const checkAvailabilityForSegment = (type: 'wet' | 'dry', testStartMs: number, segDur: number) => {
        const testEndMs = testStartMs + segDur * 60000
        const blocked: number[] = []
        for (let j = 0; j < personCount; j++) {
          if (j === i) continue
          const other = companionsToCheck[j]
          const otherPlan = pricingPlans.find(p => p.id.toString() === other.planId)
          if (!otherPlan) continue
          const otherIsCombo = otherPlan.category === 'combo'
          const otherBaseStartISO = getISOStringFromLocal(other.startHour, other.startMinute)
          const otherBaseStartMs = new Date(otherBaseStartISO).getTime()
          const otherDur = otherPlan.duration_minutes + (otherIsCombo ? other.delayMinutes : 0)
          const otherEndMs = otherBaseStartMs + otherDur * 60000

          const isOtherMain = other.therapistId && other.therapistId !== 'auto'
          const isOtherSub = other.secondaryTherapistId && other.secondaryTherapistId !== 'auto'

          if (isOtherMain || isOtherSub) {
            let otherStartMs = otherBaseStartMs
            let otherEndMsVal = otherEndMs
            if (otherIsCombo) {
              const otherBathDur = otherPlan.bath_duration_minutes || 60
              if (isOtherSub) {
                otherEndMsVal = otherStartMs + otherBathDur * 60000
              } else {
                otherStartMs = otherStartMs + (otherBathDur + other.delayMinutes) * 60000
              }
            }
            if (otherStartMs < testEndMs && otherEndMsVal > testStartMs) {
              if (isOtherMain && other.therapistId) blocked.push(Number(other.therapistId))
              if (isOtherSub && other.secondaryTherapistId) blocked.push(Number(other.secondaryTherapistId))
            }
          }
        }

        const candidates = therapists.filter(t => {
          if (blocked.includes(t.id)) return false
          if (type === 'wet' && t.massage_type !== 'wet' && t.massage_type !== 'both') return false
          if (type === 'dry' && t.massage_type !== 'dry' && t.massage_type !== 'both') return false

          const testDate = new Date(testStartMs)
          const h = testDate.getHours()
          const min = testDate.getMinutes()

          const schedType = daySchedules[t.id]
          if (schedType === 'full') return true
          if (schedType === 'am_half') return (h * 60 + min) >= 990
          if (schedType === 'pm_half') return (h * 60 + min + segDur) <= 990
          return false
        })

        const freeCandidates = candidates.filter(t => {
          return !reservations.some(res => {
            const isMain = res.therapist_id === t.id
            const isSub = (res as any).secondary_therapist_id === t.id
            if (!isMain && !isSub) return false
            if (res.status !== 'confirmed') return false
            if (isEditMode && selectedReservation && res.id === selectedReservation.id) return false

            const plan = res.pricing_plan_id ? pricingPlans.find(p => p.id === res.pricing_plan_id) : null
            const isCombo = plan?.category === 'combo'

            let resStartMs = new Date(res.start_time).getTime()
            let resEndMs = new Date(res.end_time).getTime()

            if (isCombo) {
              const resBathDur = plan?.bath_duration_minutes || 60
              const baseStart = new Date(res.start_time)
              if (isSub) {
                resStartMs = baseStart.getTime()
                resEndMs = baseStart.getTime() + resBathDur * 60000
              } else {
                const resDelayMin = (res as any).delay_minutes ?? 30
                resStartMs = baseStart.getTime() + (resBathDur + resDelayMin) * 60000
                resEndMs = new Date(res.end_time).getTime()
              }
            }
            return resStartMs < testEndMs && resEndMs > testStartMs
          })
        })

        return freeCandidates.length > 0
      }

      if (compIsCombo) {
        const bathDur = compPlan.bath_duration_minutes || 60
        const massageDur = compPlan.massage_duration_minutes || 60
        isWetOk = checkAvailabilityForSegment('wet', checkTargetStartMs, bathDur)
        isDryOk = checkAvailabilityForSegment('dry', checkTargetStartMs + (bathDur + comp.delayMinutes) * 60000, massageDur)
      } else {
        const cat = compPlan.category
        if (cat === 'wet') isWetOk = checkAvailabilityForSegment('wet', checkTargetStartMs, duration)
        else if (cat === 'dry') isDryOk = checkAvailabilityForSegment('dry', checkTargetStartMs, duration)
      }

      if (compIsCombo) {
        if (!isWetOk && !isDryOk) guestStatus = 'all_failed'
        else if (!isWetOk) guestStatus = 'wet_failed'
        else if (!isDryOk) guestStatus = 'dry_failed'
      } else {
        if (compPlan.category === 'wet' && !isWetOk) guestStatus = 'wet_failed'
        if (compPlan.category === 'dry' && !isDryOk) guestStatus = 'dry_failed'
      }

      const allSlots: { h: number; min: number; diff: number }[] = []
      const targetMinVal = comp.startHour * 60 + comp.startMinute

      for (let currentMin = 540; currentMin <= 1440; currentMin += 10) {
        const h = Math.floor(currentMin / 60)
        const min = currentMin % 60
        if (h === comp.startHour && min === comp.startMinute) continue

        allSlots.push({
          h,
          min,
          diff: Math.abs(currentMin - targetMinVal)
        })
      }

      allSlots.sort((a, b) => a.diff - b.diff)

      const proposals: GuestProposal['proposals'] = []

      for (const slot of allSlots) {
        // 그룹 전원 배정 시뮬레이션 적용!
        const pass = simulateGroupAssignment(slot.h, slot.min, companionsToCheck)

        if (pass) {
          const sHourStr = String(slot.h).padStart(2, '0')
          const sMinStr = String(slot.min).padStart(2, '0')

          const scanStartISO = getISOStringFromLocal(slot.h, slot.min)
          const scanStartMs = new Date(scanStartISO).getTime()
          const endObj = new Date(scanStartMs + duration * 60000)
          const eHourStr = String(endObj.getHours()).padStart(2, '0')
          const eMinStr = String(endObj.getMinutes()).padStart(2, '0')

          proposals.push({
            hour: slot.h,
            minute: slot.min,
            timeStr: `${sHourStr}:${sMinStr} ~ ${eHourStr}:${eMinStr}`
          })
          if (proposals.length >= 2) break
        }
      }

      results.push({
        name: displayName,
        status: guestStatus,
        proposals
      })
    }

    return results
  }

  const handlePersonCountChange = (newCount: number) => {
    setPersonCount(newCount)
    setCompanions(prev => {
      const updated = [...prev]
      if (newCount > prev.length) {
        const base = prev[0] || { planId: '', price: 80, startHour: 9, startMinute: 0, endHour: 10, endMinute: 0, therapistId: 'auto', secondaryTherapistId: 'auto', delayMinutes: 30, lockerNumber: '' }
        for (let i = prev.length; i < newCount; i++) {
          updated.push({
            planId: isSamePlanApplied ? base.planId : '',
            price: isSamePlanApplied ? base.price : 80,
            startHour: isSameTimeApplied ? base.startHour : 9,
            startMinute: isSameTimeApplied ? base.startMinute : 0,
            endHour: isSameTimeApplied ? base.endHour : 10,
            endMinute: isSameTimeApplied ? base.endMinute : 0,
            therapistId: 'auto',
            secondaryTherapistId: 'auto',
            delayMinutes: isSameTimeApplied ? base.delayMinutes : 30,
            lockerNumber: ''
          })
        }
      } else if (newCount < prev.length) {
        updated.splice(newCount)
      }
      return updated
    })

    if (activeTab >= newCount) {
      setActiveTab(newCount - 1)
    }
  }

  const handleApplyGuestProposal = (guestIdx: number, hour: number, minute: number) => {
    setCompanions(prev => {
      if (prev.length <= guestIdx) return prev
      const updated = [...prev]
      const planId = updated[guestIdx].planId

      updated[guestIdx].startHour = hour
      updated[guestIdx].startMinute = minute

      const plan = pricingPlans.find(p => p.id.toString() === planId)
      const duration = plan ? (plan.duration_minutes + (plan.category === 'combo' ? (updated[guestIdx].delayMinutes ?? 30) : 0)) : 90

      let eh = hour
      let em = minute + duration
      if (em >= 60) {
        eh += Math.floor(em / 60)
        em = em % 60
      }
      updated[guestIdx].endHour = eh
      updated[guestIdx].endMinute = em

      // 0번 탭(예약자 본인)이 수정되고 동일 시간 적용이 켜져있다면 다른 탭 동기화
      if (guestIdx === 0 && isSameTimeApplied) {
        for (let j = 1; j < updated.length; j++) {
          updated[j].startHour = hour
          updated[j].startMinute = minute

          const otherPlan = pricingPlans.find(p => p.id.toString() === updated[j].planId)
          const otherDur = otherPlan ? (otherPlan.duration_minutes + (otherPlan.category === 'combo' ? (updated[j].delayMinutes ?? 30) : 0)) : 90

          let oeh = hour
          let oem = minute + otherDur
          if (oem >= 60) {
            oeh += Math.floor(oem / 60)
            oem = oem % 60
          }
          updated[j].endHour = oeh
          updated[j].endMinute = oem
        }
      }

      // 만약 현재 활성화된 탭의 값을 바꾼 것이라면, 개별 상태 변수에도 즉시 반영
      if (guestIdx === activeTab) {
        setStartHour(hour)
        setStartMinute(minute)

        let activeEh = hour
        let activeEm = minute + duration
        if (activeEm >= 60) {
          activeEh += Math.floor(activeEm / 60)
          activeEm = activeEm % 60
        }
        setEndHour(activeEh)
        setEndMinute(activeEm)
      } else if (guestIdx === 0 && isSameTimeApplied && activeTab > 0) {
        // 본인 변경에 따라 현재 활성화된 탭의 시간도 동기화
        const activePlan = pricingPlans.find(p => p.id.toString() === updated[activeTab].planId)
        const activeDur = activePlan ? (activePlan.duration_minutes + (activePlan.category === 'combo' ? (updated[activeTab].delayMinutes ?? 30) : 0)) : 90
        setStartHour(hour)
        setStartMinute(minute)

        let activeEh = hour
        let activeEm = minute + activeDur
        if (activeEm >= 60) {
          activeEh += Math.floor(activeEm / 60)
          activeEm = activeEm % 60
        }
        setEndHour(activeEh)
        setEndMinute(activeEm)
      }

      return updated
    })
  }

  const handleCloseProposal = () => {
    setPendingProposal(null)
  }

  // 1. activeTab 또는 개별 상태 변수 변경 시 companions 배열의 해당 요소 자동 저장 및 0번 탭에서의 일괄 동기화
  useEffect(() => {
    if (!isOpen) return
    setCompanions(prev => {
      if (prev.length <= activeTab) return prev
      const updated = [...prev]
      const current = updated[activeTab]
      if (
        current.planId !== selectedPlanId ||
        current.price !== price ||
        current.startHour !== startHour ||
        current.startMinute !== startMinute ||
        current.endHour !== endHour ||
        current.endMinute !== endMinute ||
        current.therapistId !== therapistId ||
        current.secondaryTherapistId !== secondaryTherapistId ||
        current.delayMinutes !== delayMinutes ||
        current.lockerNumber !== lockerNumber
      ) {
        updated[activeTab] = {
          planId: selectedPlanId,
          price,
          startHour,
          startMinute,
          endHour,
          endMinute,
          therapistId,
          secondaryTherapistId,
          delayMinutes,
          lockerNumber
        }

        // 0번 탭(예약자 본인) 수정 시 일괄 적용 룰 전파
        if (activeTab === 0) {
          for (let i = 1; i < updated.length; i++) {
            if (isSamePlanApplied) {
              updated[i].planId = selectedPlanId
              updated[i].price = price
            }
            if (isSameTimeApplied) {
              updated[i].startHour = startHour
              updated[i].startMinute = startMinute
              updated[i].endHour = endHour
              updated[i].endMinute = endMinute
              updated[i].delayMinutes = delayMinutes
            }
          }
        }
      }
      return updated
    })
  }, [
    selectedPlanId,
    price,
    startHour,
    startMinute,
    endHour,
    endMinute,
    therapistId,
    secondaryTherapistId,
    delayMinutes,
    lockerNumber,
    activeTab,
    isOpen,
    isSamePlanApplied,
    isSameTimeApplied
  ])

  // 2. activeTab 변경 시 선택된 탭의 버퍼 데이터를 단일 상태들로 즉시 복사 로드
  useEffect(() => {
    if (!isOpen || companions.length <= activeTab) return
    const current = companions[activeTab]
    setSelectedPlanId(current.planId)
    setPrice(current.price)
    setStartHour(current.startHour)
    setStartMinute(current.startMinute)
    setEndHour(current.endHour)
    setEndMinute(current.endMinute)
    setTherapistId(current.therapistId)
    setSecondaryTherapistId(current.secondaryTherapistId)
    setDelayMinutes(current.delayMinutes)
    setLockerNumber(current.lockerNumber || '')
  }, [activeTab, isOpen])



  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { language, t } = useLanguage()

  // 취소 조작 관련 상태
  const [isCancelling, setIsCancelling] = useState(false)
  const [selectedCancelType, setSelectedCancelType] = useState<'request' | 'noshow' | 'normal'>('normal')

  // 마사지사 날짜별 근무 일정 맵핑 상태
  const [daySchedules, setDaySchedules] = useState<Record<number, string | null>>({})

  // 실시간 고객 검색 / 자동완성 관련 상태
  interface CustomerSuggestion {
    name: string
    phone: string
    totalCount: number
    cancelCount: number
    isBlacklisted: boolean
    blacklistReason?: string
  }
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeInput, setActiveInput] = useState<'name' | 'phone' | null>(null)
  const [selectedFromSuggestion, setSelectedFromSuggestion] = useState(false)

  useEffect(() => {
    if (selectedFromSuggestion) {
      setShowSuggestions(false)
      return
    }

    const queryValue = activeInput === 'name' ? customerName : customerPhone
    const cleanQuery = queryValue ? queryValue.trim() : ''

    console.log('[Autocomplete] Triggered. activeInput:', activeInput, 'queryValue:', queryValue, 'cleanQuery:', cleanQuery)

    if (cleanQuery.length < 1) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        console.log('[Autocomplete] Fetching DB for:', cleanQuery)
        // 1. reservations 테이블에서 검색
        // 1. reservations 테이블에서 검색 (동반인은 배제)
        let dbQuery = supabase
          .from('reservations')
          .select('customer_name, customer_phone, status')
          .not('customer_name', 'ilike', '%(동반%')

        if (activeInput === 'name') {
          dbQuery = dbQuery.ilike('customer_name', `%${cleanQuery}%`)
        } else {
          const stripped = stripPhone(cleanQuery)
          dbQuery = dbQuery.ilike('customer_phone', `%${stripped}%`)
        }

        const { data: resData, error: resErr } = await dbQuery.limit(80)
        if (resErr) {
          console.error('[Autocomplete] Reservations error:', resErr)
          throw resErr
        }
        console.log('[Autocomplete] Reservations fetch success. Count:', resData?.length)

        // 2. blacklists 테이블에서 전체 조회 (에러 나더라도 전체 흐름 차단 방지)
        let blData: any[] = []
        try {
          const { data, error } = await supabase
            .from('blacklists')
            .select('name, phone, reason')
          if (error) {
            console.warn('[Autocomplete] Blacklist check warning:', error.message)
          } else if (data) {
            blData = data
          }
        } catch (blCatchErr) {
          console.warn('[Autocomplete] Blacklist catch warning:', blCatchErr)
        }

        // 예약 데이터를 활용하여 고객별 통계 집계
        const clientMap = new Map<string, { name: string; phone: string; total: number; cancel: number }>()

        if (resData) {
          resData.forEach((item: any) => {
            if (item.customer_name && item.customer_name.includes('(동반')) return

            const rawPhone = item.customer_phone || ''
            const formattedPhone = formatUSPhone(rawPhone)
            const key = `${item.customer_name}_${formattedPhone}`

            if (!clientMap.has(key)) {
              clientMap.set(key, {
                name: item.customer_name || '',
                phone: formattedPhone,
                total: 0,
                cancel: 0
              })
            }
            const current = clientMap.get(key)!
            current.total += 1
            if (item.status === 'cancelled') {
              current.cancel += 1
            }
          })
        }

        const blacklistNameMap = new Set(blData.map(b => b.name?.trim().toLowerCase()))
        const blacklistPhoneMap = new Set(blData.map(b => stripPhone(b.phone || '')))

        // 최종 제안 데이터 구성
        const list: CustomerSuggestion[] = Array.from(clientMap.values()).map(c => {
          const nameLower = c.name.trim().toLowerCase()
          const phoneStripped = stripPhone(c.phone)
          const isBl = blacklistNameMap.has(nameLower) || blacklistPhoneMap.has(phoneStripped)
          const blItem = blData.find(b => b.name?.trim().toLowerCase() === nameLower || stripPhone(b.phone || '') === phoneStripped)
          return {
            name: c.name,
            phone: c.phone,
            totalCount: c.total,
            cancelCount: c.cancel,
            isBlacklisted: isBl,
            blacklistReason: blItem?.reason || undefined
          }
        })

        // 검색 결과가 없는 경우, 블랙리스트 여부 실시간 확인 가능하도록 처리
        if (list.length === 0) {
          const matchedBl = blData.find(b => {
            if (activeInput === 'name') {
              return b.name?.toLowerCase().includes(cleanQuery.toLowerCase())
            } else {
              return stripPhone(b.phone || '').includes(stripPhone(cleanQuery))
            }
          })
          if (matchedBl) {
            list.push({
              name: matchedBl.name || cleanQuery,
              phone: formatUSPhone(matchedBl.phone || ''),
              totalCount: 0,
              cancelCount: 0,
              isBlacklisted: true,
              blacklistReason: matchedBl.reason || undefined
            })
          }
        }

        console.log('[Autocomplete] Final suggestions count:', list.length)
        setSuggestions(list)
        setShowSuggestions(list.length > 0)
      } catch (err) {
        console.error('[Autocomplete] Fatal search error:', err)
      }
    }, 200)

    return () => clearTimeout(delayDebounceFn)
  }, [customerName, customerPhone, activeInput, selectedFromSuggestion])

  const [blacklistRecords, setBlacklistRecords] = useState<any[]>([])

  const fetchBlacklists = async () => {
    try {
      const { data, error } = await supabase
        .from('blacklists')
        .select('name, phone, reason')
      if (!error && data) {
        setBlacklistRecords(data)
      }
    } catch (err) {
      console.warn('Failed to pre-fetch blacklists:', err)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchBlacklists()
    }
  }, [isOpen])

  // 입력 완료된 이름 / 번호 기준 고객 실시간 통계 및 블랙리스트 판별
  const getClientStats = () => {
    if (!customerName.trim() && !customerPhone.trim()) return null

    const nameQuery = customerName.trim().toLowerCase()
    const phoneQuery = stripPhone(customerPhone)

    if (nameQuery.length < 1 && phoneQuery.length < 1) return null

    // 1. 예약 내역 매칭
    let matched = reservations || []
    if (nameQuery && phoneQuery) {
      matched = matched.filter(
        r =>
          r.customer_name?.trim().toLowerCase() === nameQuery &&
          stripPhone(r.customer_phone || '') === phoneQuery
      )
    } else if (nameQuery) {
      matched = matched.filter(
        r => r.customer_name?.trim().toLowerCase() === nameQuery
      )
    } else if (phoneQuery) {
      matched = matched.filter(
        r => stripPhone(r.customer_phone || '') === phoneQuery
      )
    }

    // 2. 블랙리스트 매칭
    const blItem = blacklistRecords.find(b => {
      const bName = b.name?.trim().toLowerCase()
      const bPhone = stripPhone(b.phone || '')
      if (nameQuery && phoneQuery) {
        return bName === nameQuery || bPhone === phoneQuery
      } else if (nameQuery) {
        return bName === nameQuery
      } else {
        return bPhone === phoneQuery
      }
    })

    // 매칭된 정보도 없고 블랙리스트도 아니면 노출 안함
    if (matched.length === 0 && !blItem) return null

    let totalCount = matched.length
    let cancelCount = 0
    let penaltyPoints = 0

    matched.forEach(r => {
      if (r.status === 'cancelled') {
        cancelCount += 1
        penaltyPoints += Number(r.penalty_points || 0)
      }
    })

    // 등급 정의: 페널티 점수 혹은 블랙리스트 여부
    let level: 'normal' | 'warning' | 'danger' = 'normal'
    if (blItem || penaltyPoints >= 5) {
      level = 'danger'
    } else if (penaltyPoints >= 3) {
      level = 'warning'
    }

    const repName = matched.length > 0 ? matched[0].customer_name : (blItem?.name || customerName)
    const repPhone = matched.length > 0 ? formatUSPhone(matched[0].customer_phone || '') : formatUSPhone(blItem?.phone || customerPhone)

    return {
      name: repName,
      phone: repPhone,
      totalCount,
      cancelCount,
      penaltyPoints,
      level,
      blacklistReason: blItem?.reason || undefined
    }
  }

  const clientStats = getClientStats()


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

  const suggestionsContainerRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        suggestionsContainerRef.current &&
        !suggestionsContainerRef.current.contains(target) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(target) &&
        phoneInputRef.current &&
        !phoneInputRef.current.contains(target)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const isTherapistOverlapping = (tId: number, targetDateStr: string, targetStartMin: number, targetEndMin: number) => {
    // 1. 현재 모달 내 다른 탭에서 해당 마사지사를 동일 시간대에 이미 선점했는지 체크
    if (!isEditMode && companions.length > 1) {
      for (let i = 0; i < companions.length; i++) {
        if (i === activeTab) continue // 현재 편집 중인 탭은 제외
        const comp = companions[i]
        if (!comp.planId) continue

        const compPlan = pricingPlans.find(p => p.id.toString() === comp.planId)
        if (!compPlan) continue

        const compIsCombo = compPlan.category === 'combo'
        const compBathDur = compPlan.bath_duration_minutes || 60
        const compMassageDur = compPlan.massage_duration_minutes || 60

        const isCompMain = comp.therapistId === tId.toString()
        const isCompSub = comp.secondaryTherapistId === tId.toString()
        if (!isCompMain && !isCompSub) continue

        let compStartMin = comp.startHour * 60 + comp.startMinute
        let compEndMin = compStartMin + compPlan.duration_minutes + (compIsCombo ? (comp.delayMinutes ?? 30) : 0)

        if (compIsCombo) {
          if (isCompSub) {
            compEndMin = compStartMin + compBathDur
          } else {
            compStartMin = compStartMin + compBathDur + (comp.delayMinutes ?? 30)
            compEndMin = compStartMin + compMassageDur
          }
        }

        // 겹침 여부 판단 (정수 범위 겹침 식)
        if (compStartMin < targetEndMin && compEndMin > targetStartMin) {
          return true // 다른 동반인 탭에서 이미 예약 선점함!
        }
      }
    }

    // 2. 기존 DB 예약들과의 시간 겹침 체크
    const overlapping = reservations.filter(res => {
      const isMain = res.therapist_id === tId
      const isSub = (res as any).secondary_therapist_id === tId
      if (!isMain && !isSub) return false
      if (res.status !== 'confirmed') return false
      if (isEditMode && selectedReservation && res.id === selectedReservation.id) return false

      const resStartObj = new Date(res.start_time)
      const resEndObj = new Date(res.end_time)

      // 날짜 대조: res.start_time의 로컬 날짜가 targetDateStr 과 다른 경우 즉시 배제
      const resDateStr = toLocalDateString(resStartObj)
      if (resDateStr !== targetDateStr) return false

      const plan = res.pricing_plan_id ? pricingPlans.find(p => p.id === res.pricing_plan_id) : null
      const isCombo = plan?.category === 'combo'

      // 현지 브라우저 로컬 기준으로 시/분을 오차 없이 정수 누적 분(Minutes)으로 추출
      let resStartMin = resStartObj.getHours() * 60 + resStartObj.getMinutes()
      let resEndMin = resEndObj.getHours() * 60 + resEndObj.getMinutes()

      if (isCombo && plan) {
        const bathDur = plan.bath_duration_minutes || 60
        const massageDur = plan.massage_duration_minutes || 60
        if (isSub) {
          // 습식 담당 마사지사는 콤보 시작부터 bath_duration 까지만 바쁨
          resEndMin = resStartMin + bathDur
        } else {
          // 건식 담당 마사지사는 콤보 시작 + bath_duration + 지연시간 이후부터 바쁨
          const resDelayMin = (res as any).delay_minutes ?? 30
          resStartMin = resStartMin + bathDur + resDelayMin
          resEndMin = resStartMin + massageDur
        }
      }

      return resStartMin < targetEndMin && resEndMin > targetStartMin
    })
    return overlapping.length > 0
  }

  const checkTherapistAvailability = (tId: number, specificStartMin?: number, specificEndMin?: number) => {
    const type = daySchedules[tId]

    // 기본은 미정(null), 미정일 때는 가용하지 않음
    if (!type) {
      return { available: false, reason: language === 'ko' ? '미정' : 'TBD' }
    }
    if (type === 'off') {
      return { available: false, reason: t('schedule.off_duty') }
    }

    let startMinutes = specificStartMin
    let endMinutes = specificEndMin

    if (startMinutes === undefined || endMinutes === undefined) {
      startMinutes = startHour * 60 + startMinute
      endMinutes = endHour * 60 + endMinute
    }

    const boundary = 16 * 60 + 30 // 16:30 ➡️ 990분

    if (type === 'am_half') {
      if (startMinutes < boundary) {
        return {
          available: false,
          reason: language === 'ko' ? '오전반차 (반차휴무)' : 'AM Off (Half-day)'
        }
      }
    }

    if (type === 'pm_half') {
      if (endMinutes > boundary) {
        return {
          available: false,
          reason: language === 'ko' ? '오후반차 (반차휴무)' : 'PM Off (Half-day)'
        }
      }
    }

    // 기존 예약 겹침 확인 (targetDateStr = date, startMinutes, endMinutes 사용)
    const isBusy = isTherapistOverlapping(tId, date, startMinutes, endMinutes)
    if (isBusy) {
      return { available: false, reason: language === 'ko' ? '시간 중복' : 'Time Conflict' }
    }

    return { available: true, reason: t('schedule.on_duty') }
  }

  // 예약 성공 결과를 저장하는 상태 (결과 화면 전환용)
  interface SuccessResultItem {
    customerName: string
    therapistName: string
    timeStr: string
  }
  const [successResult, setSuccessResult] = useState<{
    date: string
    items: SuccessResultItem[]
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

  const fetchPricingPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing_plans')
        .select('*')
        .order('id', { ascending: true })
      if (error) throw error
      if (data) setPricingPlans(data)
    } catch (err) {
      console.error('Failed to fetch pricing plans in BookingModal:', err)
    }
  }

  const updateEndTimeWithPlan = (h: number, m: number, planIdStr: string) => {
    const plan = pricingPlans.find(p => p.id.toString() === planIdStr)
    const isPlanCombo = plan?.category === 'combo'
    const duration = plan ? plan.duration_minutes + (isPlanCombo ? 30 : 0) : 60
    const startTotalMinutes = h * 60 + m
    const endTotalMinutes = startTotalMinutes + duration
    let eh = Math.floor(endTotalMinutes / 60)
    let em = endTotalMinutes % 60
    if (eh >= 24) {
      eh = 24
      em = 0
    }
    setEndHour(eh)
    setEndMinute(em)
  }

  const handlePlanChange = (planIdStr: string) => {
    setSelectedPlanId(planIdStr)
    setTherapistId('auto')
    setSecondaryTherapistId('auto')
    
    if (activeTab > 0) {
      setIsSamePlanApplied(false)
    }

    const plan = pricingPlans.find(p => p.id.toString() === planIdStr)
    if (plan) {
      setPrice(Number(plan.price))

      const isPlanCombo = plan.category === 'combo'
      const duration = plan.duration_minutes + (isPlanCombo ? 30 : 0)

      const startTotalMinutes = startHour * 60 + startMinute
      const endTotalMinutes = startTotalMinutes + duration
      let eh = Math.floor(endTotalMinutes / 60)
      let em = endTotalMinutes % 60
      if (eh >= 24) {
        eh = 24
        em = 0
      }
      setEndHour(eh)
      setEndMinute(em)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchPricingPlans()
    }
  }, [isOpen])

  useEffect(() => {
    const roundTo10Minutes = (min: number) => Math.floor(min / 10) * 10

    if (isOpen) {
      setErrorMsg(null)
      setSuccessResult(null) // 매번 모달이 새로 열릴 때 성공 팝업 초기화
      setIsCancelling(false)
      setSelectedCancelType('normal')

      if (isEditMode && selectedReservation) {
        // 수정 모드
        setCustomerName(selectedReservation.customer_name)

        let phoneVal = selectedReservation.customer_phone || ''
        if (!phoneVal) {
          // 동반인의 경우 주 예약자의 번호 찾기 (동반 표시 괄호 패턴 제거)
          const mainCustomerName = selectedReservation.customer_name.replace(/\s*\(동반.*?\)\s*$/, '').trim()
          const mainRes = reservations.find(r => {
            const nameCleaned = r.customer_name.replace(/\s*\(동반.*?\)\s*$/, '').trim()
            return nameCleaned === mainCustomerName && r.customer_phone
          })
          if (mainRes) {
            phoneVal = mainRes.customer_phone || ''
          }
        }
        setCustomerPhone(formatUSPhone(phoneVal))
        setPrice(Number(selectedReservation.price))
        setSelectedPlanId(selectedReservation.pricing_plan_id?.toString() || '')
        setLockerNumber((selectedReservation as any).locker_number || '')
        setIsCheckedIn(!!(selectedReservation as any).is_checked_in)

        const start = new Date(selectedReservation.start_time)
        const end = new Date(selectedReservation.end_time)

        const sh = start.getHours()
        const sm = roundTo10Minutes(start.getMinutes())
        const eh = end.getHours()
        const em = roundTo10Minutes(end.getMinutes())

        setDate(toLocalDateString(start))
        setStartHour(sh)
        setStartMinute(sm)
        setEndHour(eh)
        setEndMinute(em)
        const initTherapistId = (selectedReservation.is_requested && selectedReservation.therapist_id)
          ? selectedReservation.therapist_id.toString()
          : 'auto'
        const initSecTherapistId = ((selectedReservation as any).is_requested_secondary && (selectedReservation as any).secondary_therapist_id)
          ? (selectedReservation as any).secondary_therapist_id.toString()
          : 'auto'

        setTherapistId(initTherapistId)
        setSecondaryTherapistId(initSecTherapistId)

        setPersonCount(1)
        setActiveTab(0)
        setCompanions([{
          planId: selectedReservation.pricing_plan_id?.toString() || '',
          price: Number(selectedReservation.price),
          startHour: sh,
          startMinute: sm,
          endHour: eh,
          endMinute: em,
          therapistId: initTherapistId,
          secondaryTherapistId: initSecTherapistId,
          delayMinutes: (selectedReservation as any).delay_minutes ?? 30
        }])
        setDelayMinutes((selectedReservation as any).delay_minutes ?? 30)
      } else {
        // 신규 등록 모드
        setCustomerName('')
        setCustomerPhone('')
        setPrice(80)
        setSelectedPlanId('')
        setTherapistId(initialTherapistId?.toString() || 'auto')
        setSecondaryTherapistId('auto')
        setLockerNumber('')
        setIsCheckedIn(false)

        let sh = 9
        let sm = 0
        let eh = 10
        let em = 30

        if (initialTime) {
          sh = initialTime.getHours()
          sm = roundTo10Minutes(initialTime.getMinutes())
          setDate(toLocalDateString(initialTime))
          setStartHour(sh)
          setStartMinute(sm)

          const defaultEnd = getDefaultEndTime(sh, sm)
          eh = defaultEnd.endHour
          em = defaultEnd.endMinute
          setEndHour(eh)
          setEndMinute(em)
        } else {
          setDate(defaultDate || toLocalDateString(new Date()))
          setStartHour(9)
          setStartMinute(0)
          setEndHour(10)
          setEndMinute(30)
        }

        setPersonCount(1)
        setActiveTab(0)
        setIsSamePlanApplied(true)
        setIsSameTimeApplied(true)
        setDelayMinutes(30)
        setLockerNumber('')
        setCompanions([{
          planId: '',
          price: 80,
          startHour: sh,
          startMinute: sm,
          endHour: eh,
          endMinute: em,
          therapistId: initialTherapistId?.toString() || 'auto',
          secondaryTherapistId: 'auto',
          delayMinutes: 30,
          lockerNumber: ''
        }])
      }
    }
  }, [isOpen, isEditMode, selectedReservation, initialTime, initialTherapistId, pricingPlans.length, defaultDate])


  if (!isOpen) return null

  // 요금제 정보 및 카테고리 도출
  const selectedPlan = pricingPlans.find(p => p.id.toString() === selectedPlanId)
  const planCategory = selectedPlan?.category || 'dry'
  const isCombo = planCategory === 'combo'



  // 콤보 마사지 시작/종료 세그먼트 시간대 계산 (수동 조합 - 브라우저 타임존 오차 방지)
  const comboTimes = (() => {
    if (!selectedPlan || selectedPlan.category !== 'combo') return null
    const bathDur = selectedPlan.bath_duration_minutes || 60
    const massageDur = selectedPlan.massage_duration_minutes || 60

    // 시작 시각
    const bathStartISO = getISOStringFromLocal(startHour, startMinute)
    const bathStartMs = new Date(bathStartISO).getTime()

    const offset = getLocalTimezoneOffsetString()

    // 습식 종료 시각 (시작 + bathDur)
    const bathEndMs = bathStartMs + bathDur * 60000
    const bathEnd = new Date(bathEndMs)
    const bathEndISO = `${date}T${String(bathEnd.getHours()).padStart(2, '0')}:${String(bathEnd.getMinutes()).padStart(2, '0')}:00${offset}`

    // 건식 시작 시각 (습식 종료 + delayMinutes)
    const dryStartMs = bathEndMs + delayMinutes * 60000
    const dryStart = new Date(dryStartMs)
    const dryStartISO = `${date}T${String(dryStart.getHours()).padStart(2, '0')}:${String(dryStart.getMinutes()).padStart(2, '0')}:00${offset}`

    // 건식 종료 시각 (건식 시작 + massageDur)
    const dryEndMs = dryStartMs + massageDur * 60000
    const dryEnd = new Date(dryEndMs)
    const dryEndISO = `${date}T${String(dryEnd.getHours()).padStart(2, '0')}:${String(dryEnd.getMinutes()).padStart(2, '0')}:00${offset}`

    return {
      bathStartISO,
      bathEndISO,
      dryStartISO,
      dryEndISO
    }
  })()

  // 2. 권한 검사 (모든 가입된 직원 상호 수정 허용)
  const isOwner = selectedReservation?.created_by === currentUserId
  const isManager = currentUserRole === 'manager'
  const isLeader = currentUserRole === 'leader'
  const isStaff = currentUserRole === 'staff'
  const canModify = isManager || isLeader || isStaff

  // 선택된 마사지사의 오늘자 예약 범위 리스트 반환
  const getTherapistScheduleList = (targetId: string, roleType: 'wet' | 'dry') => {
    if (targetId === 'auto' || !date) return []

    const selectedTherapistId = Number(targetId)

    // 이 날짜의 이 마사지사의 확정된 예약들 필터링
    const selectedDayRes = reservations.filter(res => {
      const isMain = res.therapist_id === selectedTherapistId
      const isSub = (res as any).secondary_therapist_id === selectedTherapistId
      if ((!isMain && !isSub) || res.status !== 'confirmed') return false

      const resDateStr = toLocalDateString(new Date(res.start_time))
      return resDateStr === date
    })

    return selectedDayRes
      .map(res => {
        let start = new Date(res.start_time)
        let end = new Date(res.end_time)

        // 콤보 요금제일 경우, 습식/건식 역할에 부합하는 타임 세그먼트로 보정
        const resPlan = pricingPlans.find(p => p.id === res.pricing_plan_id)
        if (resPlan && resPlan.category === 'combo') {
          const bathDur = resPlan.bath_duration_minutes || 60
          const massageDur = resPlan.massage_duration_minutes || 60

          if (roleType === 'wet' && (res as any).secondary_therapist_id === selectedTherapistId) {
            // 습식 타임세그먼트: 시작 시점 ~ 시작 + 습식시간
            end = new Date(start.getTime() + bathDur * 60000)
          } else if (roleType === 'dry' && res.therapist_id === selectedTherapistId) {
            // 건식 타임세그먼트: 시작 + 습식시간 + 대기시간 ~ 시작 + 습식시간 + 대기시간 + 건식시간
            const resDelayMin = (res as any).delay_minutes ?? 30
            start = new Date(start.getTime() + (bathDur + resDelayMin) * 60000)
            end = new Date(start.getTime() + massageDur * 60000)
          }
        }

        const isSelf = selectedReservation && res.id === selectedReservation.id
        const labelSuffix = isSelf ? (language === 'ko' ? ' (현재 예약)' : ' (Current)') : ''
        return {
          id: res.id,
          customerName: `${res.customer_name}${labelSuffix}`,
          timeStr: `${toLocalTimeString(start)} ~ ${toLocalTimeString(end)}`,
          isSelf
        }
      })
      .sort((a, b) => a.timeStr.localeCompare(b.timeStr))
  }

  const scheduleList = getTherapistScheduleList(therapistId, planCategory === 'wet' ? 'wet' : 'dry')

  // 3. 시간 포맷 도우미 (ISO String 변환 - 브라우저 타임존 오차 방지 수동 조합)
  const getISODateStrings = () => {
    const sHourStr = String(startHour).padStart(2, '0')
    const sMinStr = String(startMinute).padStart(2, '0')
    const eHourStr = String(endHour).padStart(2, '0')
    const eMinStr = String(endMinute).padStart(2, '0')
    const offset = getLocalTimezoneOffsetString()

    return {
      startTimeISO: `${date}T${sHourStr}:${sMinStr}:00${offset}`,
      endTimeISO: `${date}T${eHourStr}:${eMinStr}:00${offset}`
    }
  }

  const isFormLocked = isEditMode && isCheckedIn && !canModify

  // PIN을 사용하여 실제 DB의 employee.id (UUID)를 찾는 함수
  const getEmployeeUuidByPin = async (pin: string): Promise<string | null> => {
    if (pin === '7717') {
      // 마스터 매니저 UUID 조회 (없으면 null 반환)
      try {
        const { data } = await supabase
          .from('employee')
          .select('id')
          .eq('role', 'manager')
          .limit(1)
          .maybeSingle()
        return data?.id || null
      } catch {
        return null
      }
    }
    try {
      const { data } = await supabase
        .from('employee')
        .select('id')
        .eq('pin_code', pin)
        .maybeSingle()
      return data?.id || null
    } catch {
      return null
    }
  }

  const executeCheckIn = async (cleanedLocker: string, performer: PinAuthResult) => {
    if (!selectedReservation) return
    setLoading(true)
    setErrorMsg(null)

    try {
      const performerUuid = await getEmployeeUuidByPin(performer.pin)
      const hasChanges = hasFormChanges()

      if (hasChanges) {
        if (opInfo) {
          if (opInfo.is_closed) {
            setErrorMsg(language === 'ko' ? '선택하신 날짜는 휴무일로 지정되어 예약 변경 및 체크인이 불가능합니다.' : 'Check-in cannot be processed on a holiday.')
            return
          }
          const openHour = parseInt(opInfo.open_time.split(':')[0], 10)
          const closeHour = parseInt(opInfo.close_time.split(':')[0], 10)
          if (startHour < openHour || startHour > closeHour || endHour > closeHour) {
            setErrorMsg(language === 'ko'
              ? `예약 시간은 영업시간(${opInfo.open_time} ~ ${opInfo.close_time}) 내에서만 가능합니다.`
              : `Reservation time must be within operating hours (${opInfo.open_time} ~ ${opInfo.close_time}).`)
            return
          }
        }

        const tzo = -new Date().getTimezoneOffset()
        const dif = tzo >= 0 ? '+' : '-'
        const pad = (num: number) => String(Math.floor(Math.abs(num))).padStart(2, '0')
        const offset = `${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`

        const sHourStr = String(startHour).padStart(2, '0')
        const sMinStr = String(startMinute).padStart(2, '0')
        const eHourStr = String(endHour).padStart(2, '0')
        const eMinStr = String(endMinute).padStart(2, '0')

        const startTimeISO = `${date}T${sHourStr}:${sMinStr}:00${offset}`
        const endTimeISO = `${date}T${eHourStr}:${eMinStr}:00${offset}`

        const assignedId = therapistId === 'auto' ? null : Number(therapistId)
        const assignedSecondaryId = secondaryTherapistId === 'auto' ? null : Number(secondaryTherapistId)

        const { error } = await supabase
          .from('reservations')
          .update({
            customer_name: customerName,
            customer_phone: stripPhone(customerPhone),
            start_time: startTimeISO,
            end_time: endTimeISO,
            price,
            pricing_plan_id: selectedPlanId ? Number(selectedPlanId) : null,
            therapist_id: assignedId,
            secondary_therapist_id: assignedSecondaryId,
            delay_minutes: delayMinutes,
            status: 'confirmed',
            is_requested: therapistId !== 'auto',
            is_requested_secondary: secondaryTherapistId !== 'auto',
            is_checked_in: true,
            locker_number: cleanedLocker
          })
          .eq('id', selectedReservation.id)

        if (error) throw error

        await supabase
          .from('reservation_logs')
          .insert({
            reservation_id: selectedReservation.id,
            performed_by: performerUuid,
            action: 'update',
            log_type: 'reservation',
            details: `[수행자: ${performer.userName}] 변경 후 체크인 완료 (라커 번호: ${cleanedLocker})`
          })

        // 변경 건이 있는 체크인이므로, 해당 예약 건의 시작 시간부터 당일 재배정 실시
        await reassignTherapists(supabase, date, startTimeISO, language)

      } else {
        const { error } = await supabase
          .from('reservations')
          .update({
            is_checked_in: true,
            locker_number: cleanedLocker
          })
          .eq('id', selectedReservation.id)

        if (error) throw error

        await supabase
          .from('reservation_logs')
          .insert({
            reservation_id: selectedReservation.id,
            performed_by: performerUuid,
            action: 'update',
            log_type: 'reservation',
            details: `[수행자: ${performer.userName}] 체크인 완료 (라커 번호: ${cleanedLocker})`
          })
      }

      setIsCheckedIn(true)
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to check in.')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckIn = async () => {
    if (!selectedReservation) return
    const cleanedLocker = lockerNumber.trim()
    if (!cleanedLocker) {
      setErrorMsg(language === 'ko' ? '라커 번호를 입력해 주세요.' : 'Please enter locker number.')
      return
    }

    setPinActionTitle(language === 'ko' ? '체크인 PIN 인증' : 'Check-In PIN Auth')
    setPendingAction(() => (performer: PinAuthResult) => executeCheckIn(cleanedLocker, performer))
    setPinModalOpen(true)
  }

  // 4. 예약 등록 / 수정 처리 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 영업시간 및 휴무일 최종 검증
    if (opInfo) {
      if (opInfo.is_closed) {
        setErrorMsg(language === 'ko' ? '선택하신 날짜는 휴무일로 지정되어 예약이 불가능합니다.' : 'Reservations cannot be made on a holiday.')
        return
      }
      
      const openHour = parseInt(opInfo.open_time.split(':')[0], 10)
      const closeHour = parseInt(opInfo.close_time.split(':')[0], 10)
      
      if (startHour < openHour || startHour > closeHour || endHour > closeHour) {
        setErrorMsg(language === 'ko' 
          ? `예약 시간은 영업시간(${opInfo.open_time} ~ ${opInfo.close_time}) 내에서만 가능합니다.` 
          : `Reservation time must be within operating hours (${opInfo.open_time} ~ ${opInfo.close_time}).`)
        return
      }
    }

    if (!isWalkIn && !customerName.trim()) {
      setErrorMsg(language === 'ko' ? '고객 이름을 입력해 주세요.' : 'Please enter client name.')
      return
    }
    if (!selectedPlanId) {
      setErrorMsg(language === 'ko' ? '요금제 및 마사지 코스를 선택해 주세요.' : 'Please select a pricing plan.')
      return
    }
    if (startHour * 60 + startMinute >= endHour * 60 + endMinute) {
      setErrorMsg(language === 'ko' ? '종료 시간은 시작 시간보다 늦어야 합니다.' : 'End time must be later than start time.')
      return
    }

    const [y, m, d] = date.split('-').map(Number)
    const bookingStart = new Date(y, m - 1, d, startHour, startMinute, 0, 0)
    const now = new Date()
    const isTimeChanged = !selectedReservation || new Date(selectedReservation.start_time).getTime() !== bookingStart.getTime()

    if (isTimeChanged && bookingStart < now) {
      const msg = language === 'ko' ? '과거 시간으로 예약할 수 없습니다.' : 'Cannot book for a past time.'
      setErrorMsg(msg)
      alert(msg)
      return
    }

    // Walk-in 접수 시 라커번호 입력 검증
    if (isWalkIn && !isEditMode) {
      const activeCompanions = [...companions]
      if (activeCompanions.length > activeTab) {
        activeCompanions[activeTab] = {
          planId: selectedPlanId,
          price,
          startHour,
          startMinute,
          endHour,
          endMinute,
          therapistId,
          secondaryTherapistId,
          delayMinutes,
          lockerNumber
        }
      }
      for (let i = 0; i < personCount; i++) {
        const comp = activeCompanions[i]
        const compLocker = comp.lockerNumber
        if (!compLocker || !compLocker.trim()) {
          setErrorMsg(
            language === 'ko'
              ? `${i === 0 ? '예약자' : `동반인 ${i}`}의 라커 번호를 입력해 주세요.`
              : `Please enter locker number for ${i === 0 ? 'main guest' : `guest ${i}`}.`
          )
          return
        }
      }
    }

    // PIN 입력 전에 그룹 배정 가능 여부 사전 검증 (신규 + 수정 모드 공통)
    // simulateCurrentAssignment: 각 게스트의 개별 시간으로 그리디 배정 시뮬레이션 수행
    {
      const updatedCompanions = [...companions]
      updatedCompanions[activeTab] = {
        planId: selectedPlanId,
        price,
        startHour,
        startMinute,
        endHour,
        endMinute,
        therapistId,
        secondaryTherapistId,
        delayMinutes,
        lockerNumber
      }

      // isSameTimeApplied인 경우 다른 탭도 동기화
      if (activeTab === 0 && isSameTimeApplied) {
        for (let i = 1; i < updatedCompanions.length; i++) {
          updatedCompanions[i] = {
            ...updatedCompanions[i],
            startHour,
            startMinute,
            endHour,
            endMinute,
            delayMinutes
          }
        }
      }

      console.log('[handleSubmit] 그룹 배정 시뮬레이션 시작 - isEditMode:', isEditMode, 'personCount:', personCount)
      const groupOk = simulateCurrentAssignment(updatedCompanions)
      console.log('[handleSubmit] 그룹 배정 시뮬레이션 결과 - groupOk:', groupOk)

      if (!groupOk) {
        // 시뮬레이션 실패: 대안 시간 상세 내역 생성
        const guestProposals = scanGuestProposals(updatedCompanions)
        console.log('[handleSubmit] 대안 시간 제안 표시 - PIN 모달 열지 않음', JSON.stringify(guestProposals))
        setErrorMsg(language === 'ko' ? '요청하신 시간에 모든 인원을 배정할 수 없습니다.' : 'Cannot assign all guests at requested time.')
        setPendingProposal({ guests: guestProposals })
        return
      }
      console.log('[handleSubmit] 사전 검증 통과 - PIN 모달 열기 진행')
    }

    setPinActionTitle(
      isEditMode
        ? (language === 'ko' ? '예약 수정 PIN 인증' : 'Update Booking PIN Auth')
        : isWalkIn
          ? (language === 'ko' ? 'Walk-in 접수 PIN 인증' : 'Walk-In Booking PIN Auth')
          : (language === 'ko' ? '신규 예약 PIN 인증' : 'New Booking PIN Auth')
    )
    setPendingAction(() => (performer: PinAuthResult) => executeSubmit(performer))
    setPinModalOpen(true)
  }

  const executeSubmit = async (performer: PinAuthResult) => {
    setLoading(true)
    setErrorMsg(null)

    try {
      const { startTimeISO, endTimeISO } = getISODateStrings()
      const performerUuid = await getEmployeeUuidByPin(performer.pin)

      // [동기식 companions 상태 강제 동기화 보정]
      let activeCompanions = [...companions]
      if (activeCompanions.length > activeTab) {
        activeCompanions[activeTab] = {
          planId: selectedPlanId,
          price,
          startHour,
          startMinute,
          endHour,
          endMinute,
          therapistId,
          secondaryTherapistId,
          delayMinutes,
          lockerNumber
        }

        if (activeTab === 0) {
          for (let i = 1; i < activeCompanions.length; i++) {
            if (isSamePlanApplied) {
              activeCompanions[i].planId = selectedPlanId
              activeCompanions[i].price = price
            }
            if (isSameTimeApplied) {
              activeCompanions[i].startHour = startHour
              activeCompanions[i].startMinute = startMinute
              activeCompanions[i].endHour = endHour
              activeCompanions[i].endMinute = endMinute
              activeCompanions[i].delayMinutes = delayMinutes
            }
          }
        }
      }

      if (isEditMode && selectedReservation) {
        // ==========================================
        // [수정 모드 처리 - 단일 건 100% 호환 보존]
        // ==========================================
        let assignedId: number | null = null
        let assignedName = ''
        let assignedSecondaryId: number | null = null
        let assignedSecondaryName = ''

        const isTimeChanged =
          selectedReservation.start_time !== startTimeISO ||
          selectedReservation.end_time !== endTimeISO

        const isTherapistChanged =
          therapistId === 'auto'
            ? selectedReservation.therapist_id !== null
            : Number(therapistId) !== selectedReservation.therapist_id

        const isSecondaryTherapistChanged =
          secondaryTherapistId === 'auto'
            ? (selectedReservation as any).secondary_therapist_id !== null
            : Number(secondaryTherapistId) !== (selectedReservation as any).secondary_therapist_id

        const isValidationRequired = isTimeChanged || isTherapistChanged || isSecondaryTherapistChanged

        if (isValidationRequired) {
          const dryStart = (isCombo && comboTimes) ? comboTimes.dryStartISO : startTimeISO
          const dryEnd = (isCombo && comboTimes) ? comboTimes.dryEndISO : endTimeISO
          const bathStart = (isCombo && comboTimes) ? comboTimes.bathStartISO : startTimeISO
          const bathEnd = (isCombo && comboTimes) ? comboTimes.bathEndISO : endTimeISO

          const reqTherapistId = therapistId === 'auto' ? undefined : Number(therapistId)
          const mainCategory = isCombo ? 'dry' : planCategory

          const assignResult = await assignTherapist({
            supabase,
            startTime: dryStart,
            endTime: dryEnd,
            price,
            therapistId: reqTherapistId,
            excludeReservationId: selectedReservation.id,
            category: mainCategory
          })

          if (!assignResult.success || !assignResult.therapistId) {
            setErrorMsg(assignResult.error || (language === 'ko' ? '마사지사 배정에 실패했습니다.' : 'Failed to assign therapist.'))
            setLoading(false)
            return
          }

          assignedId = assignResult.therapistId
          assignedName = assignResult.therapistName || ''

          if (isCombo) {
            const reqSecondaryId = secondaryTherapistId === 'auto' ? undefined : Number(secondaryTherapistId)

            const assignSecondaryResult = await assignTherapist({
              supabase,
              startTime: bathStart,
              endTime: bathEnd,
              price,
              therapistId: reqSecondaryId,
              excludeReservationId: selectedReservation.id,
              category: 'wet',
              excludeTherapistIds: [assignedId]
            })

            if (!assignSecondaryResult.success || !assignSecondaryResult.therapistId) {
              setErrorMsg(assignSecondaryResult.error || (language === 'ko' ? '습식 담당 마사지사 배정에 실패했습니다.' : 'Failed to assign wet therapist.'))
              setLoading(false)
              return
            }

            assignedSecondaryId = assignSecondaryResult.therapistId
            assignedSecondaryName = assignSecondaryResult.therapistName || ''
          }
        } else {
          assignedId = selectedReservation.therapist_id
          assignedName = therapists.find(t => t.id === assignedId)?.name || ''
          assignedSecondaryId = (selectedReservation as any).secondary_therapist_id || null
          assignedSecondaryName = therapists.find(t => t.id === assignedSecondaryId)?.name || ''
        }

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
            pricing_plan_id: selectedPlanId ? Number(selectedPlanId) : null,
            therapist_id: assignedId,
            secondary_therapist_id: assignedSecondaryId,
            delay_minutes: delayMinutes,
            status: 'confirmed',
            is_requested: therapistId !== 'auto',
            is_requested_secondary: secondaryTherapistId !== 'auto'
          })
          .eq('id', selectedReservation.id)

        if (error) throw error

        // 기존 예약 시작 시간과 변경 후 예약 시작 시간 중 더 빠른 시간을 기준점으로 재배정 실행
        const earliestStart = new Date(selectedReservation.start_time).getTime() < new Date(startTimeISO).getTime()
          ? selectedReservation.start_time
          : startTimeISO
        await reassignTherapists(supabase, date, earliestStart, language)

        await supabase.from('reservation_logs').insert({
          reservation_id: selectedReservation.id,
          action: 'update',
          log_type: 'reservation',
          performed_by: performerUuid,
          details: `[수행자: ${performer.userName}] ${detailsText}`
        })

        const editTherapist = therapists.find(t => t.id === assignedId)
        const editSecTherapist = assignedSecondaryId ? therapists.find(t => t.id === assignedSecondaryId) : null

        // 습식 & 건식 마사지사 순서 정렬
        const editTherapistName = editSecTherapist
          ? `${editSecTherapist.name} & ${editTherapist?.name || ''}`
          : (editTherapist?.name || '')

        const sHourStr = String(startHour).padStart(2, '0')
        const sMinStr = String(startMinute).padStart(2, '0')
        const eHourStr = String(endHour).padStart(2, '0')
        const eMinStr = String(endMinute).padStart(2, '0')

        setSuccessResult({
          date,
          items: [{
            customerName,
            therapistName: editTherapistName,
            timeStr: `${sHourStr}:${sMinStr} ~ ${eHourStr}:${eMinStr}`
          }],
          isEdit: true
        })

      } else {
        // ==========================================
        // [신규 등록 모드 - 다중 예약 및 동시 배정 처리]
        // ==========================================
        const insertPayloads: any[] = []
        
        // 1. 모든 예약자 및 동반인의 개별 서비스 세그먼트 수집
        interface ServiceSegment {
          guestIndex: number
          type: 'wet' | 'dry'
          price: number
          startTimeISO: string
          endTimeISO: string
          requestedTherapistId?: number
          startMs: number
          endMs: number
        }

        const segmentsToAssign: ServiceSegment[] = []
        const offset = getLocalTimezoneOffsetString()

        for (let i = 0; i < personCount; i++) {
          const comp = activeCompanions[i]
          const compPlan = pricingPlans.find(p => p.id.toString() === comp.planId)
          if (!compPlan) {
            setErrorMsg(language === 'ko' ? `${i === 0 ? '예약자' : `동반인 ${i}`}의 요금제를 선택해 주세요.` : `Please select a pricing plan for ${i === 0 ? 'main guest' : `guest ${i}`}.`)
            setLoading(false)
            return
          }

          const compIsCombo = compPlan.category === 'combo'

          // 시간대 빌드 (브라우저 타임존 오차 방지 수동 조합)
          const sHourStr = String(comp.startHour).padStart(2, '0')
          const sMinStr = String(comp.startMinute).padStart(2, '0')
          const eHourStr = String(comp.endHour).padStart(2, '0')
          const eMinStr = String(comp.endMinute).padStart(2, '0')

          const compStartISO = `${date}T${sHourStr}:${sMinStr}:00${offset}`
          const compEndISO = `${date}T${eHourStr}:${eMinStr}:00${offset}`

          const compStartMs = new Date(compStartISO).getTime()
          const compEndMs = new Date(compEndISO).getTime()

          if (compIsCombo) {
            const bathDur = compPlan.bath_duration_minutes || 60
            const bathStart = compStartISO
            const bathEndObj = new Date(compStartMs + bathDur * 60000)
            const bathEnd = `${date}T${String(bathEndObj.getHours()).padStart(2, '0')}:${String(bathEndObj.getMinutes()).padStart(2, '0')}:00${offset}`

            const dryStartObj = new Date(compStartMs + (bathDur + (comp.delayMinutes ?? 30)) * 60000)
            const dryStart = `${date}T${String(dryStartObj.getHours()).padStart(2, '0')}:${String(dryStartObj.getMinutes()).padStart(2, '0')}:00${offset}`
            const dryEnd = compEndISO

            // 콤보의 습식(wet) 세그먼트
            segmentsToAssign.push({
              guestIndex: i,
              type: 'wet',
              price: Number(compPlan.bath_price || 0),
              startTimeISO: bathStart,
              endTimeISO: bathEnd,
              requestedTherapistId: comp.secondaryTherapistId === 'auto' ? undefined : Number(comp.secondaryTherapistId),
              startMs: compStartMs,
              endMs: new Date(bathEnd).getTime()
            })

            // 콤보의 건식(dry) 세그먼트
            segmentsToAssign.push({
              guestIndex: i,
              type: 'dry',
              price: Number(compPlan.massage_price || 0),
              startTimeISO: dryStart,
              endTimeISO: dryEnd,
              requestedTherapistId: comp.therapistId === 'auto' ? undefined : Number(comp.therapistId),
              startMs: new Date(dryStart).getTime(),
              endMs: compEndMs
            })
          } else {
            // 단일 요금제 세그먼트
            const isWet = compPlan.category === 'wet'
            const segPrice = isWet 
              ? Number(compPlan.bath_price || compPlan.price || 0)
              : Number(compPlan.massage_price || compPlan.price || 0)

            segmentsToAssign.push({
              guestIndex: i,
              type: isWet ? 'wet' : 'dry',
              price: segPrice,
              startTimeISO: compStartISO,
              endTimeISO: compEndISO,
              requestedTherapistId: comp.therapistId === 'auto' ? undefined : Number(comp.therapistId),
              startMs: compStartMs,
              endMs: compEndMs
            })
          }
        }

        // 2. 금액(price) 기준 내림차순 정렬 (동일 금액이면 예약 정렬 유지)
        segmentsToAssign.sort((a, b) => b.price - a.price)

        // 3. 정렬된 서비스 세그먼트 순으로 마사지사 배정 실행
        interface GuestAssignmentResult {
          assignedId: number | null
          assignedName: string
          assignedSecondaryId: number | null
          assignedSecondaryName: string
        }

        const guestResults: GuestAssignmentResult[] = Array.from({ length: personCount }, () => ({
          assignedId: null,
          assignedName: '',
          assignedSecondaryId: null,
          assignedSecondaryName: ''
        }))

        // 선점 마사지사 관리
        const assignedSegments: { therapistId: number; startMs: number; endMs: number; guestIndex: number }[] = []

        for (const seg of segmentsToAssign) {
          // A. 다른 예약자들 중 이 세그먼트 시간대와 겹치는 선점 마사지사 ID 수집
          const blockedTherapists = [
            ...assignedSegments
              .filter(segment => segment.startMs < seg.endMs && segment.endMs > seg.startMs)
              .map(segment => segment.therapistId)
          ]

          // B. 콤보 상품인 경우, 동일한 손님(guestIndex)의 다른 세그먼트에 이미 배정된 마사지사 ID 제외 추가
          const sameGuestAssignments = assignedSegments.filter(s => s.guestIndex === seg.guestIndex)
          sameGuestAssignments.forEach(s => {
            if (!blockedTherapists.includes(s.therapistId)) {
              blockedTherapists.push(s.therapistId)
            }
          })

          // C. 마사지사 배정
          const assignResult = await assignTherapist({
            supabase,
            startTime: seg.startTimeISO,
            endTime: seg.endTimeISO,
            price: seg.price,
            therapistId: seg.requestedTherapistId,
            category: seg.type,
            excludeTherapistIds: blockedTherapists
          })

          if (!assignResult.success || !assignResult.therapistId) {
            console.error(`Companion assignment error (Category: ${seg.type}, Guest: ${seg.guestIndex}):`, assignResult.error)
            const errMsg = seg.type === 'wet'
              ? (language === 'ko' ? '습식 마사지사 배정에 실패했습니다.' : 'Failed to assign wet therapist.')
              : (language === 'ko' ? '건식 마사지사 배정에 실패했습니다.' : 'Failed to assign dry therapist.')
            setErrorMsg(assignResult.error || errMsg)
            
            const guestProposals = scanGuestProposals()
            setPendingProposal({
              guests: guestProposals
            })
            setLoading(false)
            return
          }

          const assignedTherapistId = assignResult.therapistId
          const assignedTherapistName = assignResult.therapistName || ''

          // D. 결과를 guestResults에 매핑
          if (seg.type === 'wet') {
            const comp = activeCompanions[seg.guestIndex]
            const compPlan = pricingPlans.find(p => p.id.toString() === comp.planId)
            if (compPlan && compPlan.category === 'combo') {
              guestResults[seg.guestIndex].assignedSecondaryId = assignedTherapistId
              guestResults[seg.guestIndex].assignedSecondaryName = assignedTherapistName
            } else {
              guestResults[seg.guestIndex].assignedId = assignedTherapistId
              guestResults[seg.guestIndex].assignedName = assignedTherapistName
            }
          } else {
            guestResults[seg.guestIndex].assignedId = assignedTherapistId
            guestResults[seg.guestIndex].assignedName = assignedTherapistName
          }

          // E. 선점 정보 기록
          assignedSegments.push({
            therapistId: assignedTherapistId,
            startMs: seg.startMs,
            endMs: seg.endMs,
            guestIndex: seg.guestIndex
          })
        }

        // 4. 배정이 정상 완료되면 insertPayloads 구성
        for (let i = 0; i < personCount; i++) {
          const comp = activeCompanions[i]
          const compPlan = pricingPlans.find(p => p.id.toString() === comp.planId)
          if (!compPlan) continue

          const sHourStr = String(comp.startHour).padStart(2, '0')
          const sMinStr = String(comp.startMinute).padStart(2, '0')
          const eHourStr = String(comp.endHour).padStart(2, '0')
          const eMinStr = String(comp.endMinute).padStart(2, '0')

          const compStartISO = `${date}T${sHourStr}:${sMinStr}:00${offset}`
          const compEndISO = `${date}T${eHourStr}:${eMinStr}:00${offset}`

          const nameClean = customerName.trim()
          const targetName = nameClean
            ? (i === 0 ? nameClean : `${nameClean} (동반 ${i})`)
            : (i === 0 ? "Walk-in" : `Walk-in (동반 ${i})`)
          const resResult = guestResults[i]

          insertPayloads.push({
            customer_name: targetName,
            customer_phone: stripPhone(customerPhone),
            start_time: compStartISO,
            end_time: compEndISO,
            price: comp.price,
            pricing_plan_id: Number(comp.planId),
            therapist_id: resResult.assignedId,
            secondary_therapist_id: resResult.assignedSecondaryId,
            delay_minutes: comp.delayMinutes,
            created_by: performerUuid,
            status: 'confirmed',
            is_checked_in: isWalkIn,
            locker_number: isWalkIn ? (comp.lockerNumber || '').trim() : null,
            is_requested: comp.therapistId !== 'auto',
            is_requested_secondary: comp.secondaryTherapistId !== 'auto',
            is_walk_in: isWalkIn
          })
        }

        const { data: insertedData, error } = await supabase
          .from('reservations')
          .insert(insertPayloads)
          .select()

        if (error) throw error

        // 신규 등록된 예약건들 중 가장 이른 시작 시간을 기준으로 당일 재배정 실행
        if (insertPayloads.length > 0) {
          const earliestStart = insertPayloads.reduce((min, cur) => 
            new Date(cur.start_time).getTime() < new Date(min).getTime() ? cur.start_time : min, 
            insertPayloads[0].start_time
          )
          await reassignTherapists(supabase, date, earliestStart, language)
        }

        // 신규 등록 이력 로깅
        if (insertedData && Array.isArray(insertedData)) {
          for (const row of insertedData) {
            await supabase.from('reservation_logs').insert({
              reservation_id: row.id,
              action: 'create',
              log_type: 'reservation',
              performed_by: performerUuid,
              details: `[수행자: ${performer.userName}] 예약을 신규 등록함. (대상: ${row.customer_name})`
            })
          }
        }

        const successItems = insertPayloads.map(payload => {
          const mainTherapist = therapists.find(t => t.id === payload.therapist_id)
          const mainSecTherapist = payload.secondary_therapist_id ? therapists.find(t => t.id === payload.secondary_therapist_id) : null

          // 습식 & 건식 마사지사 순서 정렬
          const therapistDisplayName = mainSecTherapist
            ? `${mainSecTherapist.name} & ${mainTherapist?.name || ''}`
            : (mainTherapist?.name || '')

          const payloadStart = new Date(payload.start_time)
          const payloadEnd = new Date(payload.end_time)
          const sHourStr = String(payloadStart.getHours()).padStart(2, '0')
          const sMinStr = String(payloadStart.getMinutes()).padStart(2, '0')
          const eHourStr = String(payloadEnd.getHours()).padStart(2, '0')
          const eMinStr = String(payloadEnd.getMinutes()).padStart(2, '0')

          return {
            customerName: payload.customer_name,
            therapistName: therapistDisplayName,
            timeStr: `${sHourStr}:${sMinStr} ~ ${eHourStr}:${eMinStr}`
          }
        })

        setSuccessResult({
          date,
          items: successItems,
          isEdit: false
        })
      }

    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || (language === 'ko' ? '예약 처리 중 오류가 발생했습니다.' : 'An error occurred while saving booking.'))
    } finally {
      setLoading(false)
    }
  }

  // 5. 예약 취소 처리 핸들러 (Soft Cancel)
  const executeCancel = async (performer: PinAuthResult) => {
    if (!selectedReservation) return
    setLoading(true)
    setErrorMsg(null)

    try {
      const performerUuid = await getEmployeeUuidByPin(performer.pin)

      const penaltyPoints = selectedCancelType === 'request'
        ? 1
        : selectedCancelType === 'noshow'
          ? 3
          : 0

      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'cancelled',
          cancellation_type: selectedCancelType,
          penalty_points: penaltyPoints
        })
        .eq('id', selectedReservation.id)

      if (error) throw error

      // 예약 취소/노쇼 완료 시, 해당 취소된 예약의 시작 시간을 기준으로 당일 후속 예약 재배정 실행
      await reassignTherapists(supabase, date, selectedReservation.start_time, language)

      // 이력 로그 기록
      const cancelTypeTransKey = selectedCancelType === 'request'
        ? 'booking.modal.cancel.type_request'
        : selectedCancelType === 'noshow'
          ? 'booking.modal.cancel.type_noshow'
          : 'booking.modal.cancel.type_normal'

      const detailsText = JSON.stringify({
        key: 'log.reservation.cancel',
        params: { name: `${selectedReservation.customer_name} (${t(cancelTypeTransKey)})` }
      })

      await supabase.from('reservation_logs').insert({
        reservation_id: selectedReservation.id,
        action: 'cancel',
        log_type: 'reservation',
        performed_by: performerUuid,
        details: `[수행자: ${performer.userName}] ${detailsText}`
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

  // 5. 예약 취소 처리 핸들러 (Soft Cancel)
  const handleCancelReservation = async () => {
    if (!selectedReservation) return
    if (!isCancelling) {
      setIsCancelling(true)
      return
    }

    setPinActionTitle(language === 'ko' ? '예약 취소 PIN 인증' : 'Cancel Booking PIN Auth')
    setPendingAction(() => (performer: PinAuthResult) => executeCancel(performer))
    setPinModalOpen(true)
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/30 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-md bg-stone-50 border border-stone-200 rounded-3xl shadow-2xl p-6 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-inner">
              <UserCheck className="w-7 h-7" />
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-stone-800">
              {successResult.isEdit
                ? (language === 'ko' ? '예약 변경 완료' : 'Booking Updated')
                : (language === 'ko' ? '예약 접수 완료' : 'Booking Registered')}
            </h2>
            <p className="text-xs text-stone-500">
              {language === 'ko' ? '실시간 마사지사 배정 및 DB 저장이 정상 완료되었습니다.' : 'Real-time therapist assignment and database save completed successfully.'}
            </p>
          </div>

          {/* 성공 메시지 상세 디테일 (고객명, 시간, 배정 마사지사 각각 렌더링) */}
          <div className="w-full bg-white border border-stone-200 rounded-2xl p-5 text-xs text-stone-600 leading-relaxed text-left space-y-3.5 shadow-inner max-h-72 overflow-y-auto scrollbar-thin">
            <div className="flex justify-between items-center pb-2.5 border-b border-stone-200">
              <span className="font-bold text-stone-700">
                {successResult.isEdit
                  ? (language === 'ko' ? '✏️ 변경 완료 정보' : '✏️ Updated Info')
                  : (language === 'ko' ? '📋 접수 완료 정보' : '📋 Registered Info')}
              </span>
              <span className="text-[10px] text-stone-400 font-mono font-semibold">
                {toUIDateString(successResult.date)}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {successResult.items.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1 p-3.5 bg-stone-50/50 rounded-xl border border-stone-200/50">
                  <div className="flex justify-between items-center text-[11px] font-bold text-stone-850">
                    <span className="flex items-center gap-1.5 text-stone-800">👤 {item.customerName}</span>
                    <span className="font-mono text-emerald-800">{item.timeStr}</span>
                  </div>
                  <div className="text-[10px] text-stone-500 font-medium pl-4.5 mt-0.5">
                    {language === 'ko' ? '배정 마사지사' : 'Therapist'}: <span className="font-bold text-stone-700">{item.therapistName}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirmClose}
            className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white shadow-md py-3 text-xs font-bold transition-all animate-none"
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
  const startOpHour = opInfo ? parseInt(opInfo.open_time.split(':')[0], 10) : 9
  const endOpHour = opInfo ? parseInt(opInfo.close_time.split(':')[0], 10) : 21
  const hoursRangeLength = endOpHour - startOpHour + 1
  const opHoursArray = Array.from({ length: Math.max(1, hoursRangeLength) }, (_, i) => i + startOpHour)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/30 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-stone-50 border border-stone-200 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between py-3.5 px-5 border-b border-stone-200 bg-stone-100">
          <h2 className="text-lg font-bold tracking-tight text-stone-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-700" />
            {isEditMode ? t('booking.modal.edit') : isWalkIn ? (language === 'ko' ? 'Walk-in 접수' : 'Walk-In Registration') : t('booking.modal.new')}
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 px-5 space-y-3.5 relative">
          {opInfo?.is_closed && (
            <div className="p-3 text-xs font-bold rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center gap-2">
              🚨 {language === 'ko' ? '선택하신 날짜는 휴무일로 지정되어 예약 접수가 불가능합니다.' : 'Selected date is marked as holiday. Booking is disabled.'}
            </div>
          )}

          <div className={opInfo?.is_closed ? "opacity-60 pointer-events-none select-none" : ""}>
            {errorMsg && (
              <div className="p-3 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                ⚠️ {errorMsg}
              </div>
            )}

          {/* 고객명 */}
          <div className={`relative ${activeInput === 'name' && showSuggestions && suggestions.length > 0 ? 'z-30' : 'z-10'}`}>
            <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
              {isWalkIn ? (language === 'ko' ? '고객명 (선택)' : 'Client Name (Optional)') : t('booking.modal.client_name')}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                <User className="w-4 h-4" />
              </span>
              <input
                ref={nameInputRef}
                type="text"
                disabled={!canModify || isFormLocked}
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value)
                  setActiveInput('name')
                  setSelectedFromSuggestion(false)
                }}
                onFocus={() => {
                  setActiveInput('name')
                  if (suggestions.length > 0) setShowSuggestions(true)
                }}
                placeholder={language === 'ko' ? '고객 성함을 기입해 주세요' : 'Enter client name'}
                className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3.5 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
              />
            </div>

            {/* 이름 기준 검색 결과 제안 */}
            {activeInput === 'name' && showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsContainerRef}
                className="absolute left-0 right-0 z-50 mt-1 bg-white border border-stone-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-stone-100"
              >
                {suggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault() // prevent input from losing focus immediately
                      setCustomerName(item.name)
                      setCustomerPhone(item.phone)
                      setSelectedFromSuggestion(true)
                      setShowSuggestions(false)
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-stone-800 flex items-center gap-1.5">
                        <span>{item.name}</span>
                        {item.isBlacklisted && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            <Ban className="w-2.5 h-2.5 text-rose-600" />
                            {language === 'ko' ? '블랙리스트' : 'Blacklist'}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">{item.phone}</div>
                    </div>
                    <div className="text-right text-[10px] text-stone-500">
                      <div>
                        {language === 'ko' ? '예약' : 'Booked'}: <span className="font-semibold text-emerald-600">{item.totalCount}회</span>
                      </div>
                      {item.cancelCount > 0 && (
                        <div className="mt-0.5">
                          {language === 'ko' ? '취소' : 'Cancelled'}: <span className="font-semibold text-rose-500">{item.cancelCount}회</span>
                        </div>
                      )}
                      {item.isBlacklisted && item.blacklistReason && (
                        <div className="text-rose-500 font-medium text-[9px] mt-0.5 truncate max-w-[120px]" title={item.blacklistReason}>
                          {item.blacklistReason}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 연락처 */}
          <div className={`relative ${activeInput === 'phone' && showSuggestions && suggestions.length > 0 ? 'z-30' : 'z-10'}`}>
            <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
              {isWalkIn ? (language === 'ko' ? '전화번호 (선택)' : 'Phone Number (Optional)') : t('list.table.phone')}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                <Phone className="w-4 h-4" />
              </span>
              <input
                ref={phoneInputRef}
                type="text"
                disabled={!canModify || isFormLocked}
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(formatUSPhone(e.target.value))
                  setActiveInput('phone')
                  setSelectedFromSuggestion(false)
                }}
                onFocus={() => {
                  setActiveInput('phone')
                  if (suggestions.length > 0) setShowSuggestions(true)
                }}
                placeholder={language === 'ko' ? '예: 123-456-7890' : 'e.g. 123-456-7890'}
                maxLength={12} // US 포맷 123-456-7890 총 12자 제한
                className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3.5 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
              />
            </div>

            {/* 전화번호 기준 검색 결과 제안 */}
            {activeInput === 'phone' && showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsContainerRef}
                className="absolute left-0 right-0 z-50 mt-1 bg-white border border-stone-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-stone-100"
              >
                {suggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault() // prevent input from losing focus immediately
                      setCustomerName(item.name)
                      setCustomerPhone(item.phone)
                      setSelectedFromSuggestion(true)
                      setShowSuggestions(false)
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-stone-800 flex items-center gap-1.5">
                        <span>{item.name}</span>
                        {item.isBlacklisted && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            <Ban className="w-2.5 h-2.5 text-rose-600" />
                            {language === 'ko' ? '블랙리스트' : 'Blacklist'}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">{item.phone}</div>
                    </div>
                    <div className="text-right text-[10px] text-stone-500">
                      <div>
                        {language === 'ko' ? '예약' : 'Booked'}: <span className="font-semibold text-emerald-600">{item.totalCount}회</span>
                      </div>
                      {item.cancelCount > 0 && (
                        <div className="mt-0.5">
                          {language === 'ko' ? '취소' : 'Cancelled'}: <span className="font-semibold text-rose-500">{item.cancelCount}회</span>
                        </div>
                      )}
                      {item.isBlacklisted && item.blacklistReason && (
                        <div className="text-rose-500 font-medium text-[9px] mt-0.5 truncate max-w-[120px]" title={item.blacklistReason}>
                          {item.blacklistReason}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 고객 통계 및 주의 대상 실시간 표시 */}
          {clientStats && (
            <div className={`p-3.5 rounded-xl border text-xs flex flex-col gap-1.5 transition-all ${clientStats.level === 'danger'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : clientStats.level === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50/50 border-emerald-200/60 text-emerald-800'
              }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <span className="text-stone-700">👤 {clientStats.name} ({clientStats.phone || '-'})</span>
                  {clientStats.level === 'danger' && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-extrabold animate-pulse">
                      🚨 {language === 'ko' ? '경고 (블랙리스트)' : 'Danger (Blacklist)'}
                    </span>
                  )}
                  {clientStats.level === 'warning' && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                      ⚠️ {language === 'ko' ? '주의 대상' : 'Warning'}
                    </span>
                  )}
                  {clientStats.level === 'normal' && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px]">
                      ✓ {language === 'ko' ? '일반 고객' : 'Regular'}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[10px] text-stone-500">
                  {language === 'ko' ? `누적 페널티: ${clientStats.penaltyPoints}점` : `Penalty: ${clientStats.penaltyPoints} pts`}
                </span>
              </div>
              <div className="text-[11px] text-stone-500 flex gap-4 mt-0.5 border-t border-stone-200/60 pt-1.5">
                <span>
                  {language === 'ko' ? '총 예약 횟수' : 'Total Booked'}: <strong className="text-stone-700 font-semibold">{clientStats.totalCount}회</strong>
                </span>
                <span>
                  {language === 'ko' ? '취소 횟수' : 'Cancelled'}: <strong className="text-rose-600 font-semibold">{clientStats.cancelCount}회</strong>
                </span>
                {clientStats.blacklistReason && (
                  <span className="text-rose-500 font-medium truncate max-w-[200px]" title={clientStats.blacklistReason}>
                    {language === 'ko' ? `사유: ${clientStats.blacklistReason}` : `Reason: ${clientStats.blacklistReason}`}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 예약 인원 (신규 등록 시에만 노출) */}
          {!isEditMode && (
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                {language === 'ko' ? '예약 인원' : 'Number of Guests'}
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-stone-200 rounded-xl bg-white overflow-hidden h-[44px]">
                  <button
                    type="button"
                    onClick={() => handlePersonCountChange(Math.max(1, personCount - 1))}
                    disabled={personCount <= 1}
                    className="px-4 h-full text-stone-600 hover:bg-stone-50 font-bold transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={personCount}
                    onChange={(e) => {
                      const val = Math.min(10, Math.max(1, Number(e.target.value) || 1))
                      handlePersonCountChange(val)
                    }}
                    className="w-12 text-center text-sm font-extrabold text-stone-850 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => handlePersonCountChange(Math.min(10, personCount + 1))}
                    disabled={personCount >= 10}
                    className="px-4 h-full text-stone-600 hover:bg-stone-50 font-bold transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    +
                  </button>
                </div>
                <span className="text-xs text-stone-500 font-medium">
                  {language === 'ko' ? '명 (본인 포함 최대 10명)' : 'people (Max 10 including yourself)'}
                </span>
              </div>
            </div>
          )}

          {/* 예약 일자 */}
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
              {language === 'ko' ? '예약 날짜' : 'Booking Date'}
            </label>
            <div className="relative">
              <input
                type="date"
                disabled={!canModify || isFormLocked}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className={`w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-stone-800 flex justify-between items-center pointer-events-none min-h-[42px] font-medium ${!canModify || isFormLocked ? 'opacity-50' : ''}`}>
                <span className="absolute left-3 text-emerald-700">
                  <Calendar className="w-4 h-4" />
                </span>
                <span>{date ? toUIDateString(date) : (language === 'ko' ? '날짜 선택' : 'Select Date')}</span>
              </div>
            </div>
          </div>

          {/* 일행 개별 탭 메뉴 바 및 일괄 적용 제어 장치 */}
          {!isEditMode && personCount > 1 && (
            <div className="border-t border-stone-200/80 pt-4 mt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                {/* 탭 목록 */}
                <div className="flex flex-wrap gap-1.5 bg-stone-100 p-1 rounded-xl max-w-max border border-stone-200/50">
                  {Array.from({ length: personCount }).map((_, idx) => {
                    const isSelected = activeTab === idx
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveTab(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isSelected
                            ? 'bg-white text-emerald-850 shadow-xs border border-stone-200/20'
                            : 'text-stone-500 hover:text-stone-850 hover:bg-stone-50/50'
                          }`}
                      >
                        👤 {idx === 0
                          ? (customerName.trim() || (language === 'ko' ? '예약자 본인' : 'Main Guest'))
                          : (language === 'ko' ? `동반인 ${idx}` : `Guest ${idx}`)}
                      </button>
                    )
                  })}
                </div>

                {/* 동기화 옵션 */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-bold text-stone-600 bg-stone-100/40 border border-stone-200/30 p-2.5 rounded-xl">
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-stone-800">
                    <input
                      type="checkbox"
                      checked={isSamePlanApplied}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setIsSamePlanApplied(checked)
                        if (checked) {
                          // 본인 요금제로 동반인들 일괄 동기화
                          setCompanions(prev => prev.map((c, i) => i === 0 ? c : { ...c, planId: prev[0].planId, price: prev[0].price }))
                        }
                      }}
                      className="rounded text-emerald-700 focus:ring-emerald-500 w-3.5 h-3.5"
                    />
                    <span>{language === 'ko' ? '동일 요금제 적용' : 'Same Plan'}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-stone-800">
                    <input
                      type="checkbox"
                      checked={isSameTimeApplied}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setIsSameTimeApplied(checked)
                        if (checked) {
                          // 본인 시간대로 동반인들 일괄 동기화
                          setCompanions(prev => prev.map((c, i) => i === 0 ? c : {
                            ...c,
                            startHour: prev[0].startHour,
                            startMinute: prev[0].startMinute,
                            endHour: prev[0].endHour,
                            endMinute: prev[0].endMinute
                          }))
                        }
                      }}
                      className="rounded text-emerald-700 focus:ring-emerald-500 w-3.5 h-3.5"
                    />
                    <span>{language === 'ko' ? '동일 시간 적용' : 'Same Time'}</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* 요금제 및 마사지 코스 선택 (종료시간보다 위에 노출) */}
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
              {language === 'ko' ? '요금제 및 마사지 코스 선택' : 'Select Pricing Plan & Course'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                <DollarSign className="w-4 h-4" />
              </span>
              <select
                disabled={!canModify || isFormLocked}
                value={selectedPlanId}
                onChange={(e) => handlePlanChange(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3 py-3 text-sm text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
              >
                <option value="">
                  {language === 'ko' ? '-- 요금제를 선택해 주세요 --' : '-- Select Pricing Plan --'}
                </option>
                {pricingPlans.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} (${Number(plan.price).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            {selectedPlanId && (
              <p className="text-[10px] text-emerald-700 mt-1.5 font-bold">
                {language === 'ko'
                  ? `✓ 금액: $${price} / 서비스 시간: ${pricingPlans.find(p => p.id.toString() === selectedPlanId)?.duration_minutes}분 (종료시간 자동 설정)`
                  : `✓ Price: $${price} / Duration: ${pricingPlans.find(p => p.id.toString() === selectedPlanId)?.duration_minutes} mins (End time set automatically)`}
              </p>
            )}
          </div>

          {/* 예약 시간 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">{t('booking.modal.start_time')}</label>
              <div className="flex gap-2">
                <select
                  disabled={!canModify || isFormLocked}
                  value={startHour}
                  onChange={(e) => {
                    const newHour = Number(e.target.value)
                    setStartHour(newHour)
                    updateEndTimeWithPlan(newHour, startMinute, selectedPlanId)
                    if (activeTab > 0) {
                      setIsSameTimeApplied(false)
                    }
                  }}
                  className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-3 text-xs text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
                >
                  {opHoursArray.map(h => (
                    <option key={h} value={h}>
                      {language === 'ko' ? `${h}시` : `${String(h).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
                <select
                  disabled={!canModify || isFormLocked}
                  value={startMinute}
                  onChange={(e) => {
                    const newMinute = Number(e.target.value)
                    setStartMinute(newMinute)
                    updateEndTimeWithPlan(startHour, newMinute, selectedPlanId)
                    if (activeTab > 0) {
                      setIsSameTimeApplied(false)
                    }
                  }}
                  className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-3 text-xs text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
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
              <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                {language === 'ko' ? '종료 시간 (자동 계산)' : 'End Time (Auto)'}
              </label>
              <div className="flex gap-2">
                <select
                  disabled={true}
                  value={endHour}
                  className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-3 text-xs text-stone-500 cursor-not-allowed focus:outline-none"
                >
                  {opHoursArray.map(h => (
                    <option key={h} value={h}>
                      {language === 'ko' ? `${h}시` : `${String(h).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
                <select
                  disabled={true}
                  value={endMinute}
                  className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-3 text-xs text-stone-500 cursor-not-allowed focus:outline-none"
                >
                  {[0, 10, 20, 30, 40, 50].map(m => (
                    <option key={m} value={m}>
                      {language === 'ko' ? `${m}분` : `${String(m).padStart(2, '0')} min`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 콤보 요금제 - 대기시간 설정 */}
          {isCombo && (
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-stone-600 uppercase tracking-wider">
                {t('booking.modal.delay_minutes')}
              </label>
              <input
                type="number"
                min="5"
                max="120"
                value={delayMinutesDraft}
                onChange={(e) => {
                  const nextValue = e.target.value
                  setDelayMinutesDraft(nextValue)
                  if (nextValue !== '') {
                    const parsed = Number(nextValue)
                    if (Number.isFinite(parsed)) {
                      setDelayMinutes(parsed)
                      if (activeTab > 0) {
                        setIsSameTimeApplied(false)
                      }
                    }
                  }
                }}
                onBlur={commitDelayMinutes}
                disabled={!canModify || isFormLocked}
                className="w-16 bg-white border border-stone-200 rounded-lg px-2 py-2 text-xs text-stone-800 focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
              />
              <span className="text-xs text-stone-500">분</span>
            </div>
          )}

          {/* Walk-in일 때 라커번호 입력칸 노출 */}
          {isWalkIn && !isEditMode && (
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
                🔑 {language === 'ko' ? '라커 번호 (필수)' : 'Locker Number (Required)'}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                  <Key className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder={language === 'ko' ? '라커 번호 입력' : 'Enter Locker Number'}
                  value={lockerNumber}
                  disabled={!canModify || isFormLocked}
                  onChange={(e) => setLockerNumber(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3.5 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500/80 transition-colors disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* 마사지사 배정 (버튼 리스트 형태) */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-stone-600 mb-1.5 uppercase tracking-wider">
              {t('booking.modal.therapist')}
            </label>

            {!selectedPlanId ? (
              <div className="rounded-xl border border-dashed border-stone-200 bg-stone-100/40 p-5 text-center">
                <p className="text-xs text-stone-500 font-extrabold flex items-center justify-center gap-1.5">
                  ⚠️ {language === 'ko' ? '요금제 및 마사지 코스를 먼저 선택해 주세요.' : 'Please select a course first.'}
                </p>
              </div>
            ) : planCategory !== 'combo' ? (
              // 1. 단일 서비스 (건식 또는 습식)
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-stone-400 uppercase">
                  {planCategory === 'dry' ? '🧘‍♂️ 건식 마사지사 목록' : '🧴 습식 마사지사 목록'}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {/* 자동 선택 버튼 */}
                  <button
                    type="button"
                    disabled={!canModify || isFormLocked}
                    onClick={() => setTherapistId('auto')}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-extrabold text-center transition-all ${therapistId === 'auto'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                  >
                    ✨ {language === 'ko' ? '자동 선택' : 'Auto Assign'}
                  </button>

                  {/* 마사지사 리스트 */}
                  {(planCategory === 'dry'
                    ? therapists.filter(t => t.massage_type === 'dry' || t.massage_type === 'both')
                    : therapists.filter(t => t.massage_type === 'wet' || t.massage_type === 'both')
                  ).map(t => {
                    const avail = checkTherapistAvailability(t.id)
                    const isDbActive = t.is_active
                    const isSelectable = isDbActive && avail.available
                    const isSelected = therapistId === t.id.toString()

                    let statusText = ''
                    if (!isDbActive) statusText = language === 'ko' ? '비활성' : 'Inactive'
                    else if (!avail.available) statusText = avail.reason

                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!canModify || !isSelectable || isFormLocked}
                        onClick={() => setTherapistId(t.id.toString())}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-center transition-all relative ${isSelected
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                            : !isSelectable
                              ? 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed line-through'
                              : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                          }`}
                      >
                        <div>{t.name}</div>
                        {statusText && (
                          <div className="text-[8px] font-medium opacity-80 mt-0.5">
                            {statusText}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              // 2. 콤보 서비스 (습식 + 건식 구분 선택)
              <div className="space-y-4 border border-stone-200 bg-stone-100/40 p-4 rounded-2xl">
                {/* 습식 마사지사 선택 섹션 */}
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold text-sky-800 uppercase flex items-center gap-1">
                    🧴 {language === 'ko' ? '습식 담당 마사지사 선택' : 'Select Wet Therapist'}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* 습식 자동 선택 */}
                    <button
                      type="button"
                      disabled={!canModify || isFormLocked}
                      onClick={() => setSecondaryTherapistId('auto')}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-extrabold text-center transition-all ${secondaryTherapistId === 'auto'
                          ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                    >
                      ✨ {language === 'ko' ? '습식 자동 선택' : 'Wet Auto'}
                    </button>

                    {therapists.filter(t => t.massage_type === 'wet' || t.massage_type === 'both').map(t => {
                      const startMin = startHour * 60 + startMinute
                      const bathDur = selectedPlan?.bath_duration_minutes || 60
                      const avail = checkTherapistAvailability(t.id, startMin, startMin + bathDur)
                      const isDbActive = t.is_active
                      const isAssignedToOther = therapistId === t.id.toString()
                      const isSelectable = isDbActive && avail.available && !isAssignedToOther
                      const isSelected = secondaryTherapistId === t.id.toString()

                      let statusText = ''
                      if (!isDbActive) statusText = language === 'ko' ? '비활성' : 'Inactive'
                      else if (isAssignedToOther) statusText = language === 'ko' ? '건식에 지정됨' : 'Assigned in Dry'
                      else if (!avail.available) statusText = avail.reason

                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={!canModify || !isSelectable || isFormLocked}
                          onClick={() => setSecondaryTherapistId(t.id.toString())}
                          className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-center transition-all relative ${isSelected
                              ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                              : !isSelectable
                                ? 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed line-through'
                                : 'bg-white border-stone-200 text-sky-700 hover:bg-stone-50'
                            }`}
                        >
                          <div>{t.name}</div>
                          {statusText && (
                            <div className="text-[8px] font-medium opacity-80 mt-0.5">
                              {statusText}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 건식 마사지사 선택 섹션 */}
                <div className="space-y-2 pt-3 border-t border-stone-200">
                  <span className="text-[10px] font-extrabold text-amber-800 uppercase flex items-center gap-1">
                    🧘‍♂️ {language === 'ko' ? '건식 담당 마사지사 선택' : 'Select Dry Therapist'}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* 건식 자동 선택 */}
                    <button
                      type="button"
                      disabled={!canModify || isFormLocked}
                      onClick={() => setTherapistId('auto')}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-extrabold text-center transition-all ${therapistId === 'auto'
                          ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                    >
                      ✨ {language === 'ko' ? '건식 자동 선택' : 'Dry Auto'}
                    </button>

                    {therapists.filter(t => t.massage_type === 'dry' || t.massage_type === 'both').map(t => {
                      const startMin = startHour * 60 + startMinute
                      const bathDur = selectedPlan?.bath_duration_minutes || 60
                      const massageDur = selectedPlan?.massage_duration_minutes || 60
                      const dryStartMin = startMin + bathDur + delayMinutes
                      const avail = checkTherapistAvailability(t.id, dryStartMin, dryStartMin + massageDur)
                      const isDbActive = t.is_active
                      const isAssignedToOther = secondaryTherapistId === t.id.toString()
                      const isSelectable = isDbActive && avail.available && !isAssignedToOther
                      const isSelected = therapistId === t.id.toString()

                      let statusText = ''
                      if (!isDbActive) statusText = language === 'ko' ? '비활성' : 'Inactive'
                      else if (isAssignedToOther) statusText = language === 'ko' ? '습식에 지정됨' : 'Assigned in Wet'
                      else if (!avail.available) statusText = avail.reason

                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={!canModify || !isSelectable || isFormLocked}
                          onClick={() => setTherapistId(t.id.toString())}
                          className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-center transition-all relative ${isSelected
                              ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-xs'
                              : !isSelectable
                                ? 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed line-through'
                                : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                            }`}
                        >
                          <div>{t.name}</div>
                          {statusText && (
                            <div className="text-[8px] font-medium opacity-80 mt-0.5">
                              {statusText}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 선택한 마사지사의 오늘자 예약 현황 (리스트) */}
          {planCategory !== 'combo' ? (
            therapistId !== 'auto' && (
              <div className="rounded-xl border border-stone-200 bg-stone-100 p-4 space-y-2">
                <span className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                  {language === 'ko' ? '선택한 마사지사의 오늘 예약 선점 현황' : 'Current Bookings of Chosen Therapist Today'}
                </span>
                {getTherapistScheduleList(therapistId, planCategory === 'wet' ? 'wet' : 'dry').length === 0 ? (
                  <p className="text-xs text-emerald-600 font-medium">
                    {language === 'ko' ? '✓ 오늘 비어있는 상태입니다. (자유롭게 예약 가능)' : '✓ Fully available today.'}
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                    {getTherapistScheduleList(therapistId, planCategory === 'wet' ? 'wet' : 'dry').map(item => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between text-xs rounded-lg p-2 font-medium border ${item.isSelf
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold'
                            : 'bg-rose-50 border border-rose-200 text-rose-700'
                          }`}
                      >
                        <span>{language === 'ko' ? `👤 ${item.customerName} 고객님` : `👤 Client ${item.customerName}`}</span>
                        <span className="font-mono text-[11px] font-semibold">{item.timeStr}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            // 콤보일 때 습식 & 건식 마사지사 스케줄을 각각 렌더링
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {secondaryTherapistId !== 'auto' && (
                <div className="rounded-xl border border-stone-200 bg-stone-100 p-3 space-y-2">
                  <span className="block text-[9px] font-extrabold text-sky-800 uppercase tracking-wider">
                    {language === 'ko' ? '🧴 습식 담당 오늘 예약 선점 현황' : 'Wet Therapist Bookings Today'}
                  </span>
                  {getTherapistScheduleList(secondaryTherapistId, 'wet').length === 0 ? (
                    <p className="text-[11px] text-emerald-600 font-medium">
                      {language === 'ko' ? '✓ 오늘 비어있는 상태입니다.' : '✓ Fully available.'}
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin">
                      {getTherapistScheduleList(secondaryTherapistId, 'wet').map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between text-[11px] rounded-lg p-1.5 font-medium border ${item.isSelf
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold'
                              : 'bg-rose-50/75 border-rose-200 text-rose-700'
                            }`}
                        >
                          <span>{item.customerName}</span>
                          <span className="font-mono text-[10px]">{item.timeStr}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {therapistId !== 'auto' && (
                <div className="rounded-xl border border-stone-200 bg-stone-100 p-3 space-y-2">
                  <span className="block text-[9px] font-extrabold text-amber-800 uppercase tracking-wider">
                    {language === 'ko' ? '🧘‍♂️ 건식 담당 오늘 예약 선점 현황' : 'Dry Therapist Bookings Today'}
                  </span>
                  {getTherapistScheduleList(therapistId, 'dry').length === 0 ? (
                    <p className="text-[11px] text-emerald-600 font-medium">
                      {language === 'ko' ? '✓ 오늘 비어있는 상태입니다.' : '✓ Fully available.'}
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin">
                      {getTherapistScheduleList(therapistId, 'dry').map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between text-[11px] rounded-lg p-1.5 font-medium border ${item.isSelf
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold'
                              : 'bg-rose-50/75 border-rose-200 text-rose-700'
                            }`}
                        >
                          <span>{item.customerName}</span>
                          <span className="font-mono text-[10px]">{item.timeStr}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </form>

        {/* 푸터 액션 */}
        {isCancelling ? (
          <div className="py-3.5 px-5 border-t border-stone-200 bg-stone-100 flex flex-col gap-3 w-full animate-in slide-in-from-bottom duration-250">
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="font-bold text-rose-700">⚠️ {t('booking.modal.cancel.type_label')}</span>
              <div className="grid grid-cols-3 gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCancelType('normal')}
                  className={`flex flex-col items-center justify-center rounded-xl p-3 border text-xs font-bold transition-all ${selectedCancelType === 'normal'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-stone-200 bg-white hover:bg-stone-100 text-stone-600'
                    }`}
                >
                  <span>{t('booking.modal.cancel.type_normal')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCancelType('request')}
                  className={`flex flex-col items-center justify-center rounded-xl p-3 border text-xs font-bold transition-all ${selectedCancelType === 'request'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-stone-200 bg-white hover:bg-stone-100 text-stone-600'
                    }`}
                >
                  <span>{t('booking.modal.cancel.type_request')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCancelType('noshow')}
                  className={`flex flex-col items-center justify-center rounded-xl p-3 border text-xs font-bold transition-all ${selectedCancelType === 'noshow'
                      ? 'border-rose-600 bg-rose-50 text-rose-700'
                      : 'border-stone-200 bg-white hover:bg-stone-100 text-stone-600'
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
                className="rounded-xl border border-stone-200 bg-stone-200 text-stone-700 hover:bg-stone-300 px-4 py-3 text-xs font-bold transition-all animate-none"
              >
                {t('booking.modal.cancel.back_btn')}
              </button>
              <button
                type="button"
                onClick={handleCancelReservation}
                disabled={loading}
                className="rounded-xl bg-rose-700 hover:bg-rose-600 text-white shadow-sm shadow-rose-900/10 px-5 py-3 text-xs font-bold transition-all disabled:opacity-50"
              >
                {loading ? (language === 'ko' ? '처리 중...' : 'Processing...') : t('booking.modal.cancel.confirm_btn')}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-3.5 px-5 border-t border-stone-200 bg-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* 예약 취소 버튼 (수정 모드이면서 RLS 권한 권한 소지 시 노출) */}
            {isEditMode && canModify && selectedReservation.status === 'confirmed' ? (
              <button
                type="button"
                onClick={handleCancelReservation}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-3 text-xs font-bold transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> {t('booking.modal.cancel_booking')}
              </button>
            ) : (
              <div />
            )}

            {/* 🔑 라커키 체크인 영역 (수정 모드일 때만 노출) */}
            {isEditMode && (
              <div className="flex items-center gap-2 bg-white border border-stone-200/80 rounded-xl px-3 py-1.5 shadow-sm">
                <span className="text-xs font-bold text-stone-600 flex items-center gap-1">
                  🔑 {language === 'ko' ? '라커번호' : 'Locker'}:
                </span>
                <input
                  type="text"
                  placeholder={language === 'ko' ? '번호' : 'No.'}
                  value={lockerNumber}
                  disabled={isFormLocked || loading}
                  onChange={(e) => setLockerNumber(e.target.value)}
                  className="w-16 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-xs text-center font-bold text-stone-800 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
                {isCheckedIn ? (
                  <span className="px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1">
                    ✓ {language === 'ko' ? '체크인 완료' : 'Checked In'}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleCheckIn}
                    disabled={!canModify || loading || !!opInfo?.is_closed}
                    className="rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer animate-none"
                  >
                    {language === 'ko' ? '체크인' : 'Check In'}
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-stone-200 bg-stone-200 text-stone-700 hover:bg-stone-300 px-4 py-3 text-xs font-bold transition-all"
              >
                {t('booking.modal.close')}
              </button>
              {canModify && !isFormLocked && (
                <button
                  onClick={handleSubmit}
                  disabled={loading || !!opInfo?.is_closed}
                  className="rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-900/10 px-6 py-3 text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {loading
                    ? (language === 'ko' ? '처리 중...' : 'Processing...')
                    : isEditMode
                      ? t('therapist.save')
                      : isWalkIn
                        ? (language === 'ko' ? '체크인 및 접수' : 'Check-In & Book')
                        : (language === 'ko' ? '예약 접수하기' : 'Book Now')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 대안 시간대 예약자별 맞춤 추천 팝업 */}
      {pendingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-stone-50 rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-stone-200/60 animate-in zoom-in-95 duration-200 flex flex-col gap-5 relative">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200/50 pb-3 pr-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-850 text-sm leading-tight">
                    {language === 'ko' ? '예약자별 맞춤 대안 시간 추천' : 'Guest-Wise Alternative Time Recommendations'}
                  </h3>
                  <p className="text-[10px] text-stone-400 font-medium">
                    {language === 'ko' ? '각 예약자별로 가능한 대체 시간을 선택하여 적용할 수 있습니다.' : 'Adjust schedules for each guest using available recommendations.'}
                  </p>
                </div>
              </div>
            </div>

            {/* X Close icon button absolute */}
            <button
              type="button"
              onClick={handleCloseProposal}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-600 p-2 rounded-xl transition-all"
              aria-label="Close alternative popup"
            >
              <X className="w-4 h-4" />
            </button>

            {/* 예약자별 현황 및 맞춤 추천 버튼 리스트 */}
            <div className="flex flex-col gap-3.5 max-h-80 overflow-y-auto scrollbar-thin pr-1">
              {pendingProposal.guests.map((g, idx) => {
                let statusLabel = ''
                let statusColor = ''
                if (g.status === 'success') {
                  statusLabel = language === 'ko' ? '✓ 배정 가능' : '✓ Available'
                  statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200/60'
                } else if (g.status === 'wet_failed') {
                  statusLabel = language === 'ko' ? '🧴 습식 마사지사 부족' : '🧴 Wet Therapist Shortage'
                  statusColor = 'text-sky-800 bg-sky-50 border-sky-200/60'
                } else if (g.status === 'dry_failed') {
                  statusLabel = language === 'ko' ? '🧘‍♂️ 건식 마사지사 부족' : '🧘‍♂️ Dry Therapist Shortage'
                  statusColor = 'text-amber-800 bg-amber-50 border-amber-200/60'
                } else {
                  statusLabel = language === 'ko' ? '⚠️ 습식 & 건식 부족' : '⚠️ Wet & Dry Shortage'
                  statusColor = 'text-rose-700 bg-rose-50 border-rose-200/60'
                }

                // 현재 이 손님의 시간대 폼 상태값 가져오기
                const currentComp = companions[idx]
                const currentStr = currentComp
                  ? `${String(currentComp.startHour).padStart(2, '0')}:${String(currentComp.startMinute).padStart(2, '0')} ~ ${String(currentComp.endHour).padStart(2, '0')}:${String(currentComp.endMinute).padStart(2, '0')}`
                  : ''

                return (
                  <div key={idx} className="p-4 bg-white border border-stone-200 rounded-2xl flex flex-col gap-2.5 shadow-sm">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-stone-800">👤 {g.name}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>

                    <div className="text-[10px] text-stone-400 font-medium">
                      {language === 'ko' ? `현재 요청 시간: ${currentStr}` : `Requested: ${currentStr}`}
                    </div>

                    {/* 추천 시간대 (최대 2개 버튼 제공) */}
                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="text-[9px] text-stone-500 font-bold uppercase tracking-wider">
                        {language === 'ko' ? '💡 추천 시간대 (선택 시 해당 탭에 즉시 반영)' : '💡 Recommended Slots (Click to apply)'}
                      </div>
                      {g.proposals.length === 0 ? (
                        <div className="text-[10px] text-stone-400 font-bold bg-stone-50 py-2 text-center rounded-xl border border-dashed border-stone-200">
                          {language === 'ko' ? '추천 가능한 대안 시간이 없습니다.' : 'No alternative slots found today.'}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          {g.proposals.map((p, pIdx) => {
                            const isCurrentlySelected = currentComp && currentComp.startHour === p.hour && currentComp.startMinute === p.minute
                            return (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => handleApplyGuestProposal(idx, p.hour, p.minute)}
                                className={`flex-1 py-2 px-2.5 rounded-xl border text-[11px] font-mono font-bold text-center transition-all ${isCurrentlySelected
                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-inner'
                                    : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100 hover:border-stone-300'
                                  }`}
                              >
                                {p.timeStr}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-3 border-t border-stone-200/50 pt-3.5">
              <button
                type="button"
                onClick={() => setPendingProposal(null)}
                className="w-full py-3.5 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 border border-stone-200/50 rounded-xl transition-all"
              >
                {language === 'ko' ? '취소 및 직접 변경' : 'Cancel & Modify Direct'}
              </button>
              <button
                type="button"
                onClick={handleCloseProposal}
                className="w-full py-3.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 rounded-xl transition-all shadow-md shadow-emerald-950/10"
              >
                {language === 'ko' ? '대안 시간 적용 완료' : 'Apply Alternatives & Close'}
              </button>
            </div>

          </div>
        </div>
      )}
      {pinModalOpen && (
        <PinAuthModal
          isOpen={pinModalOpen}
          actionTitle={pinActionTitle}
          onSuccess={async (result) => {
            setPinModalOpen(false)
            if (pendingAction) {
              await pendingAction(result)
            }
          }}
          onCancel={() => {
            setPinModalOpen(false)
            setPendingAction(null)
          }}
        />
      )}
    </div>
  )
}
