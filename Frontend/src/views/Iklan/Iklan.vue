<script setup lang="ts">
import ComponentCard from '@/components/common/ComponentCard.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
</script>

<template>
  <AdminLayout>
    <div>
      <PageBreadcrumb pageTitle="Iklan" />
      <ComponentCard title="Iklan" desc="Kelola iklan marketplace di sini.">
        <div
          class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-white/3"
        >
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Belum ada iklan</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Fitur iklan sedang disiapkan.
          </p>
        </div>
      </ComponentCard>
    </div>
  </AdminLayout>
</template>
