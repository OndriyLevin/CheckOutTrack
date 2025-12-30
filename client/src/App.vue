<script setup>
import { ref, onMounted, computed, watch } from 'vue'
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
const isLocked = ref(false)

// Auto-fetch Metadata
let metadataTimeout;
watch(() => form.value.url, (newVal) => {
    if (metadataTimeout) clearTimeout(metadataTimeout);
    if (newVal && newVal.length > 10) {
        // If user clears URL, maybe unlock? keep it simple.
        
        metadataTimeout = setTimeout(async () => {
            try {
                if (!newVal.startsWith('http')) return;
                
                showStatus('🔍 Searching info...', 'success');
                const res = await axios.post('/api/metadata', { url: newVal });
                
                if (res.data.artist || res.data.title) {
                    if (res.data.artist) form.value.artist = res.data.artist;
                    if (res.data.title) form.value.title = res.data.title;
                    isLocked.value = true; // Lock if found
                    showStatus('✅ Info found!', 'success');
                } else {
                    showStatus('⚠️ Info not found, please enter manually', 'error');
                    isLocked.value = false; // Unlock if failed
                }
            } catch (e) {
                console.error('Metadata auto-fetch failed', e);
                isLocked.value = false;
            }
        }, 800);
    }
})

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
    showStatus(e.response?.data?.error || 'Failed to submit track', 'error')
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
        showStatus('Error: ' + (e.response?.data?.error || e.message), 'error')
      }
    }
  }
  loading.value = false
})
</script>

<template>
  <div class="min-h-screen bg-brand-dark text-white p-4 font-sans pb-safe selection:bg-brand-yellow selection:text-brand-dark">
    <div v-if="loading" class="flex justify-center items-center h-screen">
      <div class="animate-spin rounded-full h-10 w-10 border-4 border-brand-gray border-t-brand-yellow"></div>
    </div>

    <!-- Admin View -->
    <div v-if="showAdmin && dbUser?.isAdmin">
      <div class="mb-4">
        <button @click="showAdmin = false" class="text-brand-yellow font-bold flex items-center text-lg active:opacity-60 transition-opacity">
          <span class="text-2xl mr-1">‹</span> Назад
        </button>
      </div>
      <AdminDashboard :user="dbUser" />
    </div>

    <!-- User View -->
    <div v-else-if="user" class="max-w-md mx-auto space-y-6 pb-20">
      
      <!-- Header -->
      <header class="text-center space-y-4 relative pt-8">
        <div class="flex justify-center mb-4">
             <img src="/images/logo.png" alt="Cassette Logo" class="w-32 h-auto drop-shadow-[0_0_15px_rgba(255,200,0,0.5)] transform -rotate-3" />
        </div>
        <h1 class="text-4xl font-black text-white tracking-tight uppercase italic block drop-shadow-lg">
          Зацени <span class="text-brand-yellow">Рознице</span> Трек
        </h1>
        <p class="text-gray-400 text-sm font-medium leading-relaxed max-w-[280px] mx-auto">
          Йо, <span class="text-white font-bold">{{ user.first_name }}</span>! <br>
          Закидывай свои любимые треки в наш общий плейлист.
        </p>

        <!-- Admin Toggle Button -->
        <button 
          v-if="dbUser?.isAdmin" 
          @click="showAdmin = true"
          class="absolute top-0 right-0 text-[10px] bg-brand-gray/50 px-3 py-1.5 rounded-full text-brand-yellow/80 uppercase font-black tracking-widest border border-brand-yellow/20 active:bg-brand-yellow active:text-brand-dark transition-all"
        >
          Админка
        </button>
        
        <!-- DEV: Toggle Admin Rights -->
        <button 
           @click="toggleTestAdmin"
           class="absolute top-0 left-0 text-[10px] opacity-10 active:opacity-100 text-gray-500 hover:text-white transition-opacity"
        >
          Dev
        </button>
      </header>

      <!-- Submission Form -->
      <div class="bg-brand-gray/40 backdrop-blur-md p-6 rounded-3xl border border-white/5 shadow-xl space-y-6">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-2 h-6 bg-brand-yellow rounded-full inline-block"></span>
            Новый трек
        </h2>
        
        <div class="space-y-4">
          <!-- URL Input (Now First) -->
          <div class="group">
            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Ссылка</label>
            <input 
              v-model="form.url" type="url" placeholder="https://..."
              class="w-full px-4 py-3.5 text-lg rounded-2xl bg-brand-dark border-2 border-transparent focus:border-brand-yellow/50 focus:bg-black/50 text-white placeholder-gray-600 outline-none transition-all shadow-inner"
            />
          </div>

          <!-- Artist (Read Only / Auto) -->
          <div class="group">
            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Исполнитель</label>
            <div class="relative">
                <input 
                  v-model="form.artist" type="text" placeholder="Заполнится автоматически" 
                  :readonly="isLocked"
                  class="w-full px-4 py-3.5 text-lg rounded-2xl bg-brand-dark border-2 border-transparent transition-all outline-none"
                  :class="isLocked ? 'text-gray-400 cursor-not-allowed bg-brand-dark/50' : 'text-white focus:border-brand-yellow/50 focus:bg-black/50'"
                />
                <button v-if="isLocked" @click="isLocked = false" class="absolute right-4 top-4 text-brand-yellow hover:text-white transition-colors" title="Разблокировать">
                    🔒
                </button>
            </div>
          </div>

          <!-- Title (Read Only / Auto) -->
          <div class="group">
             <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Название трека</label>
             <div class="relative">
                <input 
                  v-model="form.title" type="text" placeholder="Заполнится автоматически" 
                  :readonly="isLocked"
                   class="w-full px-4 py-3.5 text-lg rounded-2xl bg-brand-dark border-2 border-transparent transition-all outline-none"
                   :class="isLocked ? 'text-gray-400 cursor-not-allowed bg-brand-dark/50' : 'text-white focus:border-brand-yellow/50 focus:bg-black/50'"
                />
                <button v-if="isLocked" @click="isLocked = false" class="absolute right-4 top-4 text-brand-yellow hover:text-white transition-colors" title="Разблокировать">
                    🔒
                </button>
             </div>
          </div>
        </div>

        <button 
          @click="submitTrack"
          class="w-full py-4 bg-brand-yellow text-brand-dark text-lg font-black uppercase tracking-wide rounded-2xl active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(255,200,0,0.25)] hover:shadow-[0_6px_25px_rgba(255,200,0,0.35)] hover:-translate-y-0.5"
        >
          Отправить
        </button>

        <p v-if="statusMsg" :class="{'text-green-500': statusType==='success', 'text-red-500': statusType==='error'}" class="text-center text-base font-medium animate-pulse">
          {{ statusMsg }}
        </p>
      </div>

      <!-- Recent Submissions (User Tracks) -->
      <div v-if="tracks.length > 0" class="space-y-4">
        <h3 class="text-gray-500 text-xs font-bold uppercase tracking-widest ml-2 flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-brand-yellow"></span>
            Мои треки ({{ tracks.length }})
        </h3>
        <div class="space-y-3">
          
          <div v-for="track in tracks" :key="track.id" class="relative overflow-hidden rounded-2xl group touch-pan-y shadow-sm">
             
              <!-- Delete Background (Only for PENDING) -->
              <div v-if="track.status === 'PENDING'" class="absolute inset-0 bg-red-500/90 flex items-center justify-end px-7 backdrop-blur-sm">
                  <!-- Trash Icon -->
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6 text-white">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
              </div>

              <!-- Content -->
              <div class="bg-brand-gray p-5 relative z-10 transition-transform duration-200 border border-white/5 rounded-2xl"
                   :class="{'translate-x-[-80px]': swipedTrackId === track.id}"
                   @touchstart="onTouchStart($event, track.id)" @touchend="onTouchEnd($event, track.id)"
                   @click="startEdit(track)">
                 
                 <!-- View Mode -->
                 <div v-if="editingTrack?.id !== track.id">
                    <div class="flex justify-between items-start gap-4">
                       <!-- Icon/Status Indicator -->
                       <div class="shrink-0 mt-1">
                          <div class="w-10 h-10 rounded-full flex items-center justify-center bg-brand-dark border border-white/10 shadow-inner">
                              <span v-if="track.status === 'PROCESSED'" class="text-base">✅</span>
                              <span v-else class="text-lg animate-pulse">⏳</span>
                          </div>
                       </div>

                       <div class="flex-1 min-w-0">
                          <p class="font-bold text-lg text-white truncate leading-tight">{{ track.title }}</p>
                          <p class="text-sm text-gray-400 truncate mt-0.5">{{ track.artist }}</p>
                          <a :href="track.url" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-brand-yellow/80 hover:text-brand-yellow font-bold uppercase tracking-wider mt-2 px-2 py-1 bg-brand-yellow/10 rounded-md transition-colors" @click.stop>
                              <span>LINK ↗</span>
                          </a>
                       </div>
                    </div>
                 </div>

                 <!-- Edit Mode (Only for PENDING) -->
                 <div v-else class="space-y-3" @click.stop>
                    <div v-if="track.status === 'PROCESSED'" class="text-center text-gray-500 py-2 text-sm">
                       Этот трек уже в плейлисте
                       <button @click="editingTrack=null" class="block w-full mt-2 text-brand-yellow hover:underline">Закрыть</button>
                    </div>
                    <div v-else class="space-y-2">
                      <input v-model="editingTrack.artist" class="w-full p-3 rounded-xl bg-brand-dark border border-white/10 text-white placeholder-gray-600 focus:border-brand-yellow/50 outline-none text-sm" placeholder="Исполнитель">
                      <input v-model="editingTrack.title" class="w-full p-3 rounded-xl bg-brand-dark border border-white/10 text-white placeholder-gray-600 focus:border-brand-yellow/50 outline-none text-sm" placeholder="Название">
                      <input v-model="editingTrack.url" class="w-full p-3 rounded-xl bg-brand-dark border border-white/10 text-white placeholder-gray-600 focus:border-brand-yellow/50 outline-none text-sm" placeholder="Ссылка">
                      <div class="flex gap-2 pt-1">
                         <button @click="editingTrack=null" class="flex-1 py-3 text-xs font-bold bg-brand-dark rounded-xl text-gray-400 hover:text-white transition-colors">Отмена</button>
                         <button @click="saveEdit" class="flex-1 py-3 text-xs font-bold bg-brand-yellow text-brand-dark rounded-xl shadow-lg hover:bg-yellow-400 transition-colors">Сохранить</button>
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
        <p class="text-center text-[10px] text-gray-600 mt-8 font-medium tracking-widest uppercase">Свайпни влево для удаления</p>
      </div>

    </div>

    <!-- Error State -->
    <!-- Error State -->
    <div v-else class="flex flex-col items-center justify-center h-screen text-center p-6 text-white">
      <div class="text-6xl mb-4">⚠️</div>
      <p class="font-bold text-xl mb-2">Нет доступа</p>
      <p class="text-gray-400 text-sm max-w-[200px]">Откройте приложение через Telegram.</p>
    </div>
  </div>
</template>
