'use client'

import React from 'react'
import { createClient } from '@/utils/supabase/client'
import { useUserSim } from '../providers'
import StatsManager from '@/components/admin/StatsManager'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { useLanguage } from '../LanguageContext'

export default function StatsPage() {
  const supabase = createClient()
  const { currentUser } = useUserSim()
  const { t } = useLanguage()

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <h2 className="text-lg font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
            <span className="text-blue-700">📊</span> {t('stats.title')}
          </h2>
        </div>

        <StatsManager
          supabase={supabase}
          currentUserId={currentUser.id}
        />
      </div>
    </DashboardLayout>
  )
}

