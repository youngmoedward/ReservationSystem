'use client'

import React, { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Therapist } from '../dashboard/CalendarView'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { UserPlus, Trash2, CheckCircle2, XCircle, Key, Edit, X, Lock } from 'lucide-react'
import { formatUSPhone, stripPhone } from '@/utils/phoneFormatter'
import PinAuthModal, { PinAuthResult } from '../common/PinAuthModal'

interface TherapistManagerProps {
  supabase: SupabaseClient
  therapists: Therapist[]
  onRefresh: () => void
}

export default function TherapistManager({
  supabase,
  therapists,
  onRefresh
}: TherapistManagerProps) {
  const { currentUser } = useUserSim()
  const { language } = useLanguage()
  
  // 마사지사 등록 상태
  const [newTherapistName, setNewTherapistName] = useState('')
  const [massageType, setMassageType] = useState<'dry' | 'wet' | 'both'>('both')
  const [phone, setPhone] = useState('')
  const [pinCode, setPinCode] = useState('2001')
  const [isAddingTherapist, setIsAddingTherapist] = useState(false)

  // 마사지사 정보 수정 상태
  const [editingTherapist, setEditingTherapist] = useState<Therapist | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editPinCode, setEditPinCode] = useState('')
  const [editMassageType, setEditMassageType] = useState<'dry' | 'wet' | 'both'>('both')

  // PIN 인증 모달 상태
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{
    type: 'add' | 'update' | 'delete' | 'toggle'
    title: string
    payload?: any
  } | null>(null)

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 변경 이력 로그 작성 헬퍼
  const writeLog = async (action: 'create' | 'update' | 'delete', details: string, performerName: string) => {
    try {
      await supabase.from('reservation_logs').insert({
        log_type: 'therapist',
        action,
        performed_by: performerName,
        details
      })
    } catch (logErr) {
      console.error('Failed to write audit log:', logErr)
    }
  }

  // 1. 등록 실행
  const executeAddTherapist = async (performer: PinAuthResult) => {
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { error: dbError } = await supabase
        .from('therapists')
        .insert({
          name: newTherapistName.trim(),
          is_active: true,
          massage_type: massageType,
          phone: stripPhone(phone) || null,
          pin_code: pinCode.trim() || '2001'
        })

      if (dbError) throw dbError

      await writeLog(
        'create',
        `마사지사 [${newTherapistName.trim()}] 신규 등록 (PIN: ${pinCode.trim()}, 유형: ${massageType})`,
        performer.userName
      )

      setSuccessMsg(language === 'ko' ? '마사지사가 성공적으로 등록되었습니다!' : 'Therapist registered successfully!')
      setNewTherapistName('')
      setPhone('')
      setPinCode(String(Math.floor(2000 + Math.random() * 8000)))
      setIsAddingTherapist(false)
      onRefresh()

      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      console.error('Add therapist error:', err)
      setErrorMsg(err.message || (language === 'ko' ? '마사지사 등록 중 오류가 발생했습니다.' : 'Failed to add therapist.'))
    } finally {
      setLoading(false)
    }
  }

  // 2. 수정 모달 열기
  const openEditModal = (t: Therapist) => {
    setEditingTherapist(t)
    setEditName(t.name)
    setEditPhone(t.phone ? formatUSPhone(t.phone) : '')
    setEditPinCode((t as any).pin_code || '2001')
    setEditMassageType((t.massage_type as 'dry' | 'wet' | 'both') || 'both')
  }

  // 3. 수정 실행
  const executeUpdateTherapist = async (performer: PinAuthResult) => {
    if (!editingTherapist) return
    setLoading(true)
    setErrorMsg(null)

    try {
      const { error } = await supabase
        .from('therapists')
        .update({
          name: editName.trim(),
          phone: stripPhone(editPhone) || null,
          pin_code: editPinCode.trim(),
          massage_type: editMassageType
        })
        .eq('id', editingTherapist.id)

      if (error) throw error

      await writeLog(
        'update',
        `마사지사 [${editingTherapist.name}] 정보 수정 (이름: ${editName}, PIN: ${editPinCode}, 유형: ${editMassageType})`,
        performer.userName
      )

      setSuccessMsg(language === 'ko' ? '마사지사 정보가 수정되었습니다!' : 'Therapist info updated!')
      setEditingTherapist(null)
      onRefresh()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      console.error('Update therapist error:', err)
      setErrorMsg(err.message || (language === 'ko' ? '마사지사 수정 중 오류가 발생했습니다.' : 'Failed to update therapist.'))
    } finally {
      setLoading(false)
    }
  }

  // 4. 활성화 토글 실행
  const executeToggleActive = async (performer: PinAuthResult, therapistId: number, currentStatus: boolean, name: string) => {
    setLoading(true)

    try {
      const nextStatus = !currentStatus
      const { error } = await supabase
        .from('therapists')
        .update({ is_active: nextStatus })
        .eq('id', therapistId)

      if (error) throw error

      await writeLog(
        'update',
        `마사지사 [${name}] 근무 상태 변경 (${nextStatus ? '근무 가능' : '휴무/비활성'})`,
        performer.userName
      )

      onRefresh()
    } catch (err: any) {
      console.error('Toggle active error:', err)
      alert(language === 'ko' ? '상태 변경 중 오류가 발생했습니다.' : 'Error toggling status.')
    } finally {
      setLoading(false)
    }
  }

  // 5. 삭제 실행
  const executeDeleteTherapist = async (performer: PinAuthResult, therapistId: number, name: string) => {
    setLoading(true)

    try {
      const { error } = await supabase
        .from('therapists')
        .delete()
        .eq('id', therapistId)

      if (error) throw error

      await writeLog('delete', `마사지사 [${name}] 완전히 삭제됨`, performer.userName)
      setSuccessMsg(language === 'ko' ? '마사지사가 삭제되었습니다.' : 'Therapist deleted.')
      onRefresh()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err: any) {
      console.error('Delete therapist error:', err)
      alert(language === 'ko' ? '마사지사 삭제 중 오류가 발생했습니다.' : 'Failed to delete therapist.')
    } finally {
      setLoading(false)
    }
  }

  // PIN 모달 성공 콜백
  const handlePinSuccess = (result: PinAuthResult) => {
    setPinModalOpen(false)
    if (!pendingAction) return

    if (pendingAction.type === 'add') {
      executeAddTherapist(result)
    } else if (pendingAction.type === 'update') {
      executeUpdateTherapist(result)
    } else if (pendingAction.type === 'toggle') {
      executeToggleActive(result, pendingAction.payload.id, pendingAction.payload.is_active, pendingAction.payload.name)
    } else if (pendingAction.type === 'delete') {
      executeDeleteTherapist(result, pendingAction.payload.id, pendingAction.payload.name)
    }
    setPendingAction(null)
  }

  // 폼 제출 트리거 (PIN 인증 요청)
  const triggerAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTherapistName.trim()) return
    setPendingAction({
      type: 'add',
      title: language === 'ko' ? `신규 마사지사 [${newTherapistName}] 등록` : `Add Therapist [${newTherapistName}]`
    })
    setPinModalOpen(true)
  }

  const triggerUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTherapist || !editName.trim()) return
    setPendingAction({
      type: 'update',
      title: language === 'ko' ? `마사지사 [${editName}] 정보 수정` : `Update Therapist [${editName}]`
    })
    setPinModalOpen(true)
  }

  const triggerToggle = (t: Therapist) => {
    setPendingAction({
      type: 'toggle',
      title: language === 'ko' ? `마사지사 [${t.name}] 상태 변경` : `Toggle Status [${t.name}]`,
      payload: t
    })
    setPinModalOpen(true)
  }

  const triggerDelete = (t: Therapist) => {
    if (!confirm(language === 'ko' ? `정말 [${t.name}] 마사지사를 삭제하시겠습니까?` : `Delete therapist [${t.name}]?`)) return
    setPendingAction({
      type: 'delete',
      title: language === 'ko' ? `마사지사 [${t.name}] 삭제` : `Delete Therapist [${t.name}]`,
      payload: t
    })
    setPinModalOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* 헤더 & 등록 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
        <div>
          <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <span>🧘‍♂️</span>
            <span>{language === 'ko' ? '마사지사 관리' : 'Therapist Management'}</span>
          </h3>
          <p className="text-xs text-stone-500 mt-1 font-semibold">
            {language === 'ko'
              ? '건식/습식 마사지사 명단 및 4자리 PIN 번호를 관리합니다.'
              : 'Manage wet/dry therapists and their 4-digit PIN numbers.'}
          </p>
        </div>

        <button
          onClick={() => setIsAddingTherapist(!isAddingTherapist)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm px-4 py-2 text-xs font-bold transition-all"
        >
          {isAddingTherapist ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {isAddingTherapist
            ? (language === 'ko' ? '취소' : 'Cancel')
            : (language === 'ko' ? '신규 마사지사 등록' : 'Add Therapist')}
        </button>
      </div>

      {/* 상태 메시지 */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold animate-in fade-in">
          {successMsg}
        </div>
      )}

      {/* 신규 마사지사 등록 폼 */}
      {isAddingTherapist && (
        <form onSubmit={triggerAdd} className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in">
          <h4 className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-amber-700" />
            {language === 'ko' ? '신규 마사지사 정보 입력' : 'New Therapist Details'}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-amber-900 mb-1">
                {language === 'ko' ? '마사지사 성함 *' : 'Name *'}
              </label>
              <input
                type="text"
                required
                value={newTherapistName}
                onChange={(e) => setNewTherapistName(e.target.value)}
                placeholder="예: Jenny"
                className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-amber-900 mb-1">
                {language === 'ko' ? '마사지 속성 (유형) *' : 'Service Type *'}
              </label>
              <select
                value={massageType}
                onChange={(e) => setMassageType(e.target.value as any)}
                className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-amber-500"
              >
                <option value="both">건식 + 습식 모두 가능 (Both)</option>
                <option value="dry">🧘‍♂️ 건식 전용 (Dry Only)</option>
                <option value="wet">🧴 습식 전용 (Wet Only)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-purple-900 mb-1 flex items-center justify-between">
                <span>{language === 'ko' ? '4자리 PIN 번호 *' : 'PIN Number *'}</span>
                <span className="text-[9px] text-purple-700">인증용</span>
              </label>
              <input
                type="text"
                maxLength={4}
                required
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="2001"
                className="w-full bg-white border border-purple-300 text-purple-950 font-mono font-black rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-amber-900 mb-1">
                {language === 'ko' ? '연락처' : 'Phone'}
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(formatUSPhone(e.target.value))}
                placeholder="(555) 000-0000"
                className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingTherapist(false)}
              className="px-4 py-2 rounded-xl bg-white border border-amber-200 text-stone-600 text-xs font-bold"
            >
              {language === 'ko' ? '취소' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-sm"
            >
              {loading ? (language === 'ko' ? '등록 중...' : 'Saving...') : (language === 'ko' ? '마사지사 등록' : 'Save Therapist')}
            </button>
          </div>
        </form>
      )}

      {/* 마사지사 목록 카드/테이블 */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-100/80 border-b border-stone-200 text-stone-700 font-extrabold">
                <th className="py-3 px-4">마사지사 성함</th>
                <th className="py-3 px-4">마사지 속성</th>
                <th className="py-3 px-4">PIN Number</th>
                <th className="py-3 px-4">연락처</th>
                <th className="py-3 px-4 text-center">근무 상태</th>
                <th className="py-3 px-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {therapists.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-400 font-bold">
                    {language === 'ko' ? '등록된 마사지사가 없습니다.' : 'No therapists registered.'}
                  </td>
                </tr>
              ) : (
                therapists.map(t => {
                  const mType = (t.massage_type as string) || 'both'
                  const pin = (t as any).pin_code || '2001'

                  return (
                    <tr key={t.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4 font-black text-stone-900">
                        {t.name}
                      </td>

                      <td className="py-3 px-4 font-bold">
                        {mType === 'dry' && (
                          <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-[10px] border border-amber-200">
                            🧘‍♂️ 건식 전용 (Dry)
                          </span>
                        )}
                        {mType === 'wet' && (
                          <span className="text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full text-[10px] border border-sky-200">
                            🧴 습식 전용 (Wet)
                          </span>
                        )}
                        {(mType === 'both' || !mType) && (
                          <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] border border-emerald-200">
                            ✨ 건+습식 모두 (Both)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-black text-purple-900">
                        <span className="bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg">
                          🔒 {pin}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-stone-600 font-mono">
                        {t.phone ? formatUSPhone(t.phone) : '-'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => triggerToggle(t)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border transition-all ${
                            t.is_active !== false
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-stone-200 text-stone-600 border-stone-300'
                          }`}
                        >
                          {t.is_active !== false
                            ? (language === 'ko' ? '근무 가능' : 'Active')
                            : (language === 'ko' ? '휴무/비활성' : 'Inactive')}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          onClick={() => openEditModal(t)}
                          className="p-1.5 rounded-lg text-stone-600 hover:text-amber-800 hover:bg-amber-50 transition-colors"
                          title="수정"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => triggerDelete(t)}
                          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 정보 수정 모달 */}
      {editingTherapist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/50 backdrop-blur-xs">
          <form onSubmit={triggerUpdate} className="w-full max-w-md bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h4 className="text-sm font-extrabold text-stone-900 flex items-center gap-1.5">
                <Edit className="w-4 h-4 text-amber-700" />
                {language === 'ko' ? '마사지사 정보 수정' : 'Edit Therapist Info'}
              </h4>
              <button
                type="button"
                onClick={() => setEditingTherapist(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">성함</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">마사지 속성 (유형)</label>
                <select
                  value={editMassageType}
                  onChange={(e) => setEditMassageType(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900"
                >
                  <option value="both">건식 + 습식 모두 가능 (Both)</option>
                  <option value="dry">🧘‍♂️ 건식 전용 (Dry Only)</option>
                  <option value="wet">🧴 습식 전용 (Wet Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-purple-900 mb-1">4자리 PIN Number</label>
                <input
                  type="text"
                  maxLength={4}
                  required
                  value={editPinCode}
                  onChange={(e) => setEditPinCode(e.target.value)}
                  className="w-full bg-purple-50 border border-purple-200 text-purple-950 font-mono font-black rounded-xl px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">연락처</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatUSPhone(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditingTherapist(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-600 text-xs font-bold"
              >
                {language === 'ko' ? '취소' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-amber-700 text-white text-xs font-bold shadow-sm"
              >
                {language === 'ko' ? '수정 완료' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PIN 인증 모달 */}
      <PinAuthModal
        isOpen={pinModalOpen}
        actionTitle={pendingAction?.title || 'PIN 번호 인증'}
        onSuccess={handlePinSuccess}
        onCancel={() => {
          setPinModalOpen(false)
          setPendingAction(null)
        }}
      />
    </div>
  )
}
