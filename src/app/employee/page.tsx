'use client'

import React from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '../providers'
import EmployeeManager from '@/components/admin/EmployeeManager'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { useLanguage } from '../LanguageContext'

export default function EmployeePage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { t } = useLanguage()

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-900/60">
          <h2 className="text-sm font-bold text-slate-400">👥 {t('employee.title')}</h2>
        </div>

        <EmployeeManager
          supabase={supabase}
          currentUserId={currentUser.id}
          onRefresh={() => {}} // 개별 마운트 형식이므로 단순 더미 콜백 제공
        />
      </div>
    </DashboardLayout>
  )
}

