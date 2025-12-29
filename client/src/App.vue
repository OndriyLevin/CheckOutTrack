<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import AdminDashboard from './components/AdminDashboard.vue'

const user = ref(null)
const dbUser = ref(null)
const tracks = ref([])
const form = ref({
  artist: '',
  title: '',
  url: ''
})
const loading = ref(true)
const statusMsg = ref('')
const statusType = ref('') 

const showAdmin = ref(false)
const editingTrack = ref(null)
const swipedTrackId = ref(null)
const touchStartX = ref(0)

const showStatus = (msg, type = 'success') => {
  statusMsg.value = msg
  statusType.value = type
  if (type === 'success') {
    setTimeout(() => { statusMsg.value = '' }, 3000)
  }
}

const fetchMyTracks = async () => {
    if (!dbUser.value) return
    try {
        const res = await axios.get('/api/my-tracks', {
            headers: { 'x-user-id': dbUser.value.id }
        })
        tracks.value = res.data
    } catch (e) {
        console.error(e)
    }
}

const submitTrack = async () => {
  if (!dbUser.value) {
    showStatus('User not authenticated', 'error')
    return
  }
  if (!form.value.artist || !form.value.title || !form.value.url) {
    showStatus('Please fill in all fields', 'error')
    return
  }

  try {
    const res = await axios.post('/api/tracks', {
      ...form.value,
      userId: dbUser.value.id
    })
    tracks.value.unshift(res.data)
    form.value = { artist: '', title: '', url: '' }
    showStatus('Track submitted successfully!')
  } catch (e) {
    console.error(e)
    showStatus('Failed to submit track', 'error')
  }
}

const toggleTestAdmin = async () => {
  try {
    const res = await axios.post('/api/test/toggle-admin')
    dbUser.value = res.data 
    showStatus(`Admin mode: ${dbUser.value.isAdmin}`, 'success')
  } catch (e) {
    console.error(e)
    showStatus(e.response?.data?.error || 'Failed to toggle admin', 'error')
  }
}

// Track Management (User)
const onTouchStart = (e, id) => { touchStartX.value = e.touches[0].clientX }
const onTouchEnd = (e, id) => {
  const touchEndX = e.changedTouches[0].clientX
  if (touchStartX.value - touchEndX > 50) swipedTrackId.value = id
  else if (touchStartX.value - touchEndX < -50 && swipedTrackId.value === id) swipedTrackId.value = null
}

const startEdit = (track) => { 
  if (track.status === 'PROCESSED') return 
  editingTrack.value = { ...track }
  swipedTrackId.value = null
}

const saveEdit = async () => {
  if (!editingTrack.value) return
  try {
    const res = await axios.put(`/api/tracks/${editingTrack.value.id}`, editingTrack.value, {
        headers: { 'x-user-id': dbUser.value.id }
    })
    const idx = tracks.value.findIndex(t => t.id === editingTrack.value.id)
    if (idx !== -1) tracks.value[idx] = res.data
    editingTrack.value = null
    showStatus('Обновлено!')
  } catch (e) {
    console.error(e)
    showStatus('Ошибка обновления', 'error')
  }
}

const deleteTrack = async (id) => {
  if (!confirm('Удалить трек?')) return
  try {
    await axios.delete(`/api/tracks/${id}`, {
        headers: { 'x-user-id': dbUser.value.id }
    })
    tracks.value = tracks.value.filter(t => t.id !== id)
  } catch (e) {
    console.error(e)
    showStatus('Ошибка удаления', 'error')
  }
}

onMounted(async () => {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp
    tg.ready()
    tg.expand()
    user.value = tg.initDataUnsafe?.user
    
    // Fallback for local testing (Browser)
    if (!user.value) {
       console.log('No Telegram user found, using Test User')
       user.value = { id: 123456, first_name: 'Test', username: 'testuser' }
    }

    if (user.value) {
      try {
        const res = await axios.post('/api/auth', user.value)
        dbUser.value = res.data
        fetchMyTracks()
      } catch (e) {
        console.error("Auth failed", e)
        showStatus('Authentication failed. Please try again.', 'error')
      }
    }
  }
  loading.value = false
})
</script>

<template>
  <div class="min-h-screen bg-tg-bg text-tg-text p-4 font-sans pb-safe">
    <div v-if="loading" class="flex justify-center items-center h-screen">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-link"></div>
    </div>

    <!-- Admin View -->
    <div v-if="showAdmin && dbUser?.isAdmin">
      <div class="mb-4">
        <button @click="showAdmin = false" class="text-tg-link font-medium flex items-center text-lg active:opacity-60">
          <span class="text-2xl mr-1">‹</span> Назад
        </button>
      </div>
      <AdminDashboard :user="dbUser" />
    </div>

    <!-- User View -->
    <div v-else-if="user" class="max-w-md mx-auto space-y-6 pb-20">
      
      <!-- Header -->
      <header class="text-center space-y-2 relative pt-8">
        <h1 class="text-3xl font-bold text-tg-link">Музыка</h1>
        <p class="text-tg-hint text-base">Привет, {{ user.first_name }}! <br>Кидай треки в плейлист.</p>

        <!-- Admin Toggle Button -->
        <button 
          v-if="dbUser?.isAdmin" 
          @click="showAdmin = true"
          class="absolute top-0 right-0 text-xs bg-tg-secondary px-3 py-2 rounded-lg text-tg-hint uppercase font-bold tracking-wider active:bg-gray-200"
        >
          Админка
        </button>
        
        <!-- DEV: Toggle Admin Rights -->
        <button 
           @click="toggleTestAdmin"
           class="absolute top-0 left-0 text-[10px] opacity-30 active:opacity-100 bg-gray-200 p-2 rounded"
        >
          Dev
        </button>
      </header>

      <!-- Submission Form -->
      <div class="bg-tg-secondary p-5 rounded-2xl shadow-sm space-y-5">
        <h2 class="text-xl font-semibold mb-2">Новый трек</h2>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-tg-hint mb-1">Исполнитель</label>
            <input 
              v-model="form.artist" type="text" placeholder="например, Daft Punk"
              class="w-full px-4 py-3 text-lg rounded-xl bg-tg-bg border-none focus:ring-2 focus:ring-tg-link outline-none transition-all placeholder:text-gray-300"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-tg-hint mb-1">Название</label>
            <input 
              v-model="form.title" type="text" placeholder="например, Get Lucky"
              class="w-full px-4 py-3 text-lg rounded-xl bg-tg-bg border-none focus:ring-2 focus:ring-tg-link outline-none transition-all placeholder:text-gray-300"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-tg-hint mb-1">Ссылка</label>
            <input 
              v-model="form.url" type="url" placeholder="https://music.yandex..."
              class="w-full px-4 py-3 text-lg rounded-xl bg-tg-bg border-none focus:ring-2 focus:ring-tg-link outline-none transition-all placeholder:text-gray-300"
            />
          </div>
        </div>

        <button 
          @click="submitTrack"
          class="w-full py-4 mt-2 bg-tg-button text-white text-lg font-bold rounded-xl active:scale-95 transition-transform shadow-lg shadow-blue-500/20"
        >
          Отправить
        </button>

        <p v-if="statusMsg" :class="{'text-green-500': statusType==='success', 'text-red-500': statusType==='error'}" class="text-center text-base font-medium animate-pulse">
          {{ statusMsg }}
        </p>
      </div>

      <!-- Recent Submissions (User Tracks) -->
      <div v-if="tracks.length > 0" class="space-y-3">
        <h3 class="text-tg-hint text-sm font-medium uppercase tracking-wider ml-1">Мои треки ({{ tracks.length }})</h3>
        <div class="space-y-3">
          
          <div v-for="track in tracks" :key="track.id" class="relative overflow-hidden rounded-xl group touch-pan-y shadow-sm">
             
              <!-- Delete Background (Only for PENDING) -->
              <div v-if="track.status === 'PENDING'" class="absolute inset-0 bg-red-500 flex items-center justify-end px-6 rounded-xl">
                  <span class="text-white font-bold tracking-wider uppercase text-xs">Удалить</span>
              </div>

              <!-- Content -->
              <div class="bg-tg-secondary p-4 relative z-10 transition-transform duration-200"
                   :class="{'translate-x-[-80px]': swipedTrackId === track.id}"
                   @touchstart="onTouchStart($event, track.id)" @touchend="onTouchEnd($event, track.id)"
                   @click="startEdit(track)">
                 
                 <!-- View Mode -->
                 <div v-if="editingTrack?.id !== track.id">
                    <div class="flex justify-between items-start">
                       <div class="flex-1 min-w-0 pr-3">
                          <p class="font-bold text-lg truncate">{{ track.title }}</p>
                          <p class="text-base text-tg-hint truncate">{{ track.artist }}</p>
                          <a :href="track.url" target="_blank" class="text-xs text-tg-link truncate block mt-1 opacity-70" @click.stop>{{ track.url }}</a>
                       </div>
                       
                       <!-- Status Icon -->
                       <div class="shrink-0 flex flex-col items-center space-y-1">
                          <span v-if="track.status === 'PROCESSED'" title="Добавлен в плейлист" class="text-xl">✅</span>
                          <span v-else title="Ожидает" class="text-xl opacity-20">⏳</span>
                       </div>
                    </div>
                 </div>

                 <!-- Edit Mode (Only for PENDING) -->
                 <div v-else class="space-y-3" @click.stop>
                    <div v-if="track.status === 'PROCESSED'" class="text-center text-tg-hint py-2 text-sm">
                       Этот трек уже в плейлисте, редактирование недоступно.
                       <button @click="editingTrack=null" class="block w-full mt-2 text-tg-link">Закрыть</button>
                    </div>
                    <div v-else class="space-y-2">
                      <input v-model="editingTrack.artist" class="w-full p-2 rounded-lg bg-tg-bg border-none" placeholder="Исполнитель">
                      <input v-model="editingTrack.title" class="w-full p-2 rounded-lg bg-tg-bg border-none" placeholder="Название">
                      <input v-model="editingTrack.url" class="w-full p-2 rounded-lg bg-tg-bg border-none" placeholder="Ссылка">
                      <div class="flex gap-2 pt-1">
                         <button @click="editingTrack=null" class="flex-1 py-2 text-xs font-bold bg-gray-100 rounded-lg text-gray-500">Отмена</button>
                         <button @click="saveEdit" class="flex-1 py-2 text-xs font-bold bg-tg-button text-white rounded-lg">Сохранить</button>
                      </div>
                    </div>
                 </div>
              </div>

              <!-- Delete Button Trigger -->
              <button 
                v-if="swipedTrackId === track.id && track.status === 'PENDING'" 
                @click.stop="deleteTrack(track.id)" 
                class="absolute inset-y-0 right-0 w-[80px] z-20 opacity-0">
              </button>
          </div>

        </div>
        <p class="text-center text-xs text-tg-hint mt-6 opacity-40">Свайпни влево удалить • Нажми изменить</p>
      </div>

    </div>

    <!-- Error State -->
    <div v-else class="flex flex-col items-center justify-center h-screen text-center p-6 bg-red-50 rounded-lg">
      <p class="text-red-600 font-bold text-xl">Нет доступа</p>
      <p class="text-red-400 mt-2">Пожалуйста, откройте приложение через Telegram.</p>
    </div>
  </div>
</template>
