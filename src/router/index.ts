import { createRouter, createWebHistory } from 'vue-router'
import ForestExplorer from '@/components/ForestExplorer.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: ForestExplorer,
    },
  ],
})

export default router
