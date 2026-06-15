'use client'

import React, { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Therapist } from '../dashboard/CalendarView'
import { useUserSim } from '@/app/providers'
import { useLanguage } from '@/app/LanguageContext'
import { UserPlus, Trash2, CheckCircle2, XCircle, Star, Key, Edit, X } from 'lucide-react'

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
  const { refreshUsers } = useUserSim()
  const { language, t } = useLanguage()
  
  // 마사지사 등록 상태
  const [newTherapistName, setNewTherapistName] = useState('')
  const [isPremiumTarget, setIsPremiumTarget] = useState(false)
  
  // 로그인 연동 상태
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('password123')

  // 마사지사 정보 수정 상태
  const [editingTherapist, setEditingTherapist] = useState<Therapist | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 1. 새로운 마사지사 추가 핸들러 (직원과 동일하게 항상 로그인 계정 생성)
  const handleAddTherapist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTherapistName.trim() || !email.trim()) return

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      // Step A: Supabase Auth 회원가입 API 호출
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: newTherapistName
          }
        }
      })

      if (authError) throw authError
      if (!authData.user?.id) {
        throw new Error(language === 'ko' ? '계정 정보(UUID)를 발급받지 못했습니다.' : 'Failed to issue account UUID.')
      }

      const newUserId = authData.user.id

      // Step B: therapists 테이블에 마사지사 정보 주입
      const { error: dbError } = await supabase
        .from('therapists')
        .insert({
          name: newTherapistName.trim(),
          is_active: true,
          is_premium_target: isPremiumTarget,
          user_id: newUserId,
          email: email.trim(),
          phone: phone.trim() || null
        })

      if (dbError) throw dbError

      setSuccessMsg(
        language === 'ko' 
          ? `성공: '${newTherapistName}' 마사지사가 등록되고 로그인 계정이 발급되었습니다! (초기 비번: ${password})` 
          : `Success: Therapist '${newTherapistName}' registered and account created! (Initial PW: ${password})`
      )

      setNewTherapistName('')
      setIsPremiumTarget(false)
      setEmail('')
      setPhone('')
      setPassword('password123')

      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || (language === 'ko' ? '마사지사 등록에 실패했습니다.' : 'Failed to register therapist.'))
    } finally {
      setLoading(false)
    }
  }

  // 2. 활성/비활성 상태 변경 핸들러
  const handleToggleActive = async (id: number, currentActive: boolean) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('therapists')
        .update({ is_active: !currentActive })
        .eq('id', id)

      if (error) throw error
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      alert(err.message || (language === 'ko' ? '상태 변경에 실패했습니다.' : 'Failed to toggle status.'))
    } finally {
      setLoading(false)
    }
  }

  // 3. 오늘의 고급 마사지 전담 마사지사 설정/해제 핸들러
  const handleTogglePremiumTarget = async (id: number, currentTarget: boolean) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('therapists')
        .update({ is_premium_target: !currentTarget })
        .eq('id', id)

      if (error) throw error
      onRefresh()
    } catch (err: any) {
      console.error(err)
      alert(err.message || (language === 'ko' ? '우선순위 타겟 설정에 실패했습니다.' : 'Failed to configure premium designation.'))
    } finally {
      setLoading(false)
    }
  }

  // 4. 비밀번호 초기화 또는 로그인 계정 연동 핸들러
  const handleResetOrLinkPassword = async (therapist: Therapist) => {
    if (!therapist.user_id && !therapist.email) {
      alert(
        language === 'ko' 
          ? "비밀번호 설정(로그인 계정 생성)을 하려면 마사지사의 이메일 정보가 등록되어 있어야 합니다.\n\n먼저 수정(Edit) 버튼을 눌러 이메일을 등록해 주세요." 
          : "An email address is required to configure password / login account.\n\nPlease edit the therapist profile to register an email first."
      );
      return;
    }

    if (therapist.user_id) {
      // 이미 로그인 계정이 있는 경우 -> 비밀번호 초기화
      const promptText = language === 'ko' 
        ? `'${therapist.name}' 마사지사의 새 비밀번호를 입력해주세요.\n(미입력 시 'password123'으로 설정됩니다.)` 
        : `Enter new password for therapist '${therapist.name}'.\n(Defaults to 'password123' if empty.)`
      const newPassword = prompt(promptText)
      if (newPassword === null) return

      const finalPassword = newPassword.trim() || 'password123'

      setLoading(true)
      setErrorMsg(null)
      setSuccessMsg(null)

      try {
        const { error } = await supabase.rpc('reset_user_password', {
          user_uuid: therapist.user_id,
          new_password: finalPassword
        })

        if (error) throw error

        setSuccessMsg(
          language === 'ko' 
            ? `성공: '${therapist.name}' 마사지사의 비밀번호가 초기화되었습니다! (새 비밀번호: ${finalPassword})` 
            : `Success: Password reset for therapist '${therapist.name}'! (New PW: ${finalPassword})`
        )
      } catch (err: any) {
        console.error(err)
        setErrorMsg(err.message || (language === 'ko' ? '비밀번호 초기화 도중 오류가 발생했습니다.' : 'Failed to reset password.'))
      } finally {
        setLoading(false)
      }
    } else if (therapist.email) {
      // 이메일은 있지만 로그인 계정이 없는 경우 -> 신규 계정 생성 및 연동
      const promptText = language === 'ko' 
        ? `'${therapist.name}' 마사지사의 로그인 계정을 생성합니다.\n사용할 초기 비밀번호를 입력해주세요.\n(미입력 시 'password123'으로 설정됩니다.)` 
        : `Creating account for therapist '${therapist.name}'.\nEnter initial password.\n(Defaults to 'password123' if empty.)`
      const passwordInput = prompt(promptText)
      if (passwordInput === null) return

      const finalPassword = passwordInput.trim() || 'password123'

      setLoading(true)
      setErrorMsg(null)
      setSuccessMsg(null)

      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: therapist.email,
          password: finalPassword,
          options: {
            data: {
              name: therapist.name
            }
          }
        })

        if (authError) throw authError
        if (!authData.user?.id) throw new Error(language === 'ko' ? '인증 계정 생성에 실패했습니다.' : 'Failed to create auth account.')

        const { error: dbError } = await supabase
          .from('therapists')
          .update({ user_id: authData.user.id })
          .eq('id', therapist.id)

        if (dbError) throw dbError

        setSuccessMsg(
          language === 'ko' 
            ? `성공: '${therapist.name}' 마사지사의 로그인 계정(이메일: ${therapist.email})이 생성되었습니다! (초기 비번: ${finalPassword})` 
            : `Success: Login account created for '${therapist.name}' (Email: ${therapist.email})! (Initial PW: ${finalPassword})`
        )
        onRefresh()
        refreshUsers()
      } catch (err: any) {
        console.error(err)
        setErrorMsg(err.message || (language === 'ko' ? '로그인 계정 생성 도중 오류가 발생했습니다.' : 'An error occurred while creating login account.'))
      } finally {
        setLoading(false)
      }
    }
  }

  // 5. 마사지사 정보 수정 처리
  const handleUpdateTherapist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTherapist) return

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { error } = await supabase
        .from('therapists')
        .update({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          email: editEmail.trim() || null
        })
        .eq('id', editingTherapist.id)

      if (error) throw error

      setSuccessMsg(
        language === 'ko' 
          ? `성공: '${editName}' 마사지사의 정보가 수정되었습니다.` 
          : `Success: Therapist info updated for '${editName}'.`
      )
      setEditingTherapist(null)
      
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || (language === 'ko' ? '마사지사 정보 수정 도중 오류가 발생했습니다.' : 'An error occurred while updating therapist info.'))
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (therapist: Therapist) => {
    setEditingTherapist(therapist)
    setEditName(therapist.name || '')
    setEditPhone(therapist.phone || '')
    setEditEmail(therapist.email || '')
  }

  // 6. 마사지사 삭제 핸들러
  const handleDeleteTherapist = async (id: number, name: string) => {
    const confirmText = language === 'ko' 
      ? `마사지사 '${name}' 직원을 정말로 삭제하시겠습니까?\n(해당 직원의 과거 예약 내역은 배정 마사지사가 없음 처리로 전환됩니다.)` 
      : `Are you sure you want to delete therapist '${name}'?\n(Past bookings will be marked as unassigned.)`
    if (!confirm(confirmText)) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('therapists')
        .delete()
        .eq('id', id)

      if (error) throw error
      onRefresh()
      refreshUsers()
    } catch (err: any) {
      console.error(err)
      alert(err.message || (language === 'ko' ? '직원 삭제에 실패했습니다.' : 'Failed to delete employee.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 마사지사 추가 폼 */}
      <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 h-fit">
        <h3 className="text-sm font-bold tracking-tight text-slate-200 mb-4 flex items-center gap-1.5 uppercase">
          <UserPlus className="w-4 h-4 text-indigo-500" /> {t('therapist.add')}
        </h3>
        <form onSubmit={handleAddTherapist} className="space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs rounded-lg bg-rose-500/10 text-rose-450 border border-rose-500/20">
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 text-xs rounded-lg bg-emerald-500/10 text-emerald-450 border border-emerald-500/20">
              {successMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('employee.name')}</label>
            <input
              type="text"
              required
              value={newTherapistName}
              onChange={(e) => setNewTherapistName(e.target.value)}
              placeholder={language === 'ko' ? '예: 박안마' : 'e.g. John Doe'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-660 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('therapist.phone')}</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={language === 'ko' ? '예: 010-9876-5432' : 'e.g. 010-9876-5432'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-660 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              id="is_premium_target_chk"
              checked={isPremiumTarget}
              onChange={(e) => setIsPremiumTarget(e.target.checked)}
              className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500/30"
            />
            <label htmlFor="is_premium_target_chk" className="text-xs text-slate-300 font-medium cursor-pointer">
              {language === 'ko' ? '오늘의 고급 마사지 전담 우선 지정' : 'Premium Course Assignment Priority'}
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {language === 'ko' ? '이메일 계정 (ID)' : 'Email Account (ID)'}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={language === 'ko' ? '예: therapist1@jjimjil.com' : 'e.g. therapist1@spa.com'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-660 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('login.password')}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-650">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={language === 'ko' ? '비밀번호 설정' : 'Configure password'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-660 focus:outline-none focus:border-indigo-500/80 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 py-2.5 text-xs font-bold transition-all disabled:opacity-50"
          >
            {loading ? (language === 'ko' ? '등록 중...' : 'Registering...') : t('therapist.add')}
          </button>
        </form>
      </div>

      {/* 마사지사 목록 관리 */}
      <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-bold tracking-tight text-slate-200 mb-4">
          {language === 'ko' ? `근무 마사지사 관리 (${therapists.length}명)` : `Manage Active Therapists (${therapists.length})`}
        </h3>

        <div className="overflow-x-auto rounded-lg border border-slate-850 bg-slate-950/20">
          <table className="min-w-full divide-y divide-slate-850">
            <thead className="bg-slate-950/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
              <tr>
                <th className="px-4 py-3">{language === 'ko' ? '마사지사 정보' : 'Therapist Info'}</th>
                <th className="px-4 py-3">{t('therapist.email')}</th>
                <th className="px-4 py-3">{t('therapist.phone')}</th>
                <th className="px-4 py-3">{t('list.table.status')}</th>
                <th className="px-4 py-3 text-center">{language === 'ko' ? '고급 전담 지정' : 'Premium Course Assign'}</th>
                <th className="px-4 py-3 text-right">{t('list.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
              {therapists.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {t('calendar.no_therapists')}
                  </td>
                </tr>
              ) : (
                therapists.map((therapist) => (
                  <tr key={therapist.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5 flex-wrap">
                        <span>{therapist.name}</span>
                        {therapist.user_id ? (
                          <span className="inline-flex items-center rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400 border border-indigo-500/10" title="로그인 연동 완료">
                            {language === 'ko' ? '🔑 로그인 연동' : '🔑 Account Linked'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 border border-slate-750" title="수정에서 이메일 등록 후 열쇠 아이콘 클릭 시 연동 가능">
                            {language === 'ko' ? '로그인 미연동' : 'Not Linked'}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-slate-500 text-[9px] mt-0.5">ID: {therapist.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-medium">{therapist.email || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{therapist.phone || '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(therapist.id, therapist.is_active)}
                        className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded ${
                          therapist.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                            : 'bg-slate-800 text-slate-500 border border-slate-750'
                        }`}
                      >
                        {therapist.is_active ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> {t('schedule.on_duty')}
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> {t('schedule.off_duty')}
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePremiumTarget(therapist.id, therapist.is_premium_target)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-tight transition-all border ${
                          therapist.is_premium_target
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                            : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-450'
                        }`}
                      >
                        {therapist.is_premium_target ? (
                          <>
                            <Star className="w-3 h-3 fill-current text-amber-500" /> {language === 'ko' ? '★ 고급 전담' : '★ Premium'}
                          </>
                        ) : (
                          <>{language === 'ko' ? '고급 전담 지정' : 'Premium Course Assign'}</>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(therapist)}
                          className="p-1 rounded-lg hover:bg-indigo-500/10 text-slate-500 hover:text-indigo-400 transition-colors"
                          title={language === 'ko' ? '정보 수정' : 'Edit Info'}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetOrLinkPassword(therapist)}
                          className="p-1 rounded-lg hover:bg-amber-500/10 text-slate-500 hover:text-amber-400 transition-colors"
                          title={therapist.user_id ? (language === 'ko' ? "비밀번호 초기화" : "Reset Password") : (language === 'ko' ? "로그인 계정 생성 (연동)" : "Create & Link Account")}
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTherapist(therapist.id, therapist.name)}
                          className="p-1 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                          title={language === 'ko' ? '마사지사 삭제' : 'Delete Therapist'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 마사지사 정보 수정 모달 */}
      {editingTherapist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setEditingTherapist(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-1.5">
              <Edit className="w-4 h-4 text-indigo-400" /> {language === 'ko' ? '마사지사 정보 수정' : 'Edit Therapist Info'}
            </h3>

            <form onSubmit={handleUpdateTherapist} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('employee.name')}</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('therapist.email')}</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder={language === 'ko' ? '예: therapist1@jjimjil.com' : 'e.g. therapist1@spa.com'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('therapist.phone')}</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder={language === 'ko' ? '예: 010-9876-5432' : 'e.g. 010-9876-5432'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTherapist(null)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-all"
                >
                  {language === 'ko' ? '취소' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/20 py-2.5 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {loading ? (language === 'ko' ? '수정 중...' : 'Saving...') : t('therapist.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
